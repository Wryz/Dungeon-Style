import RAPIER from '@dimforge/rapier3d-compat';
import {
  ACESFilmicToneMapping,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  PCFShadowMap,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import { GROUP_ENV, groups, Ragdoll } from '../body/ragdoll';
import { BONES } from '../body/skeleton';
import { Sfx } from '../feel/audio';
import { Input } from '../input/input';
import { Arena } from '../render/arena';
import { CAMERA_TUNING, CameraRig } from '../render/cameraRig';
import { Coins } from '../render/coins';
import { cutoutUniforms, updateCutout } from '../render/cutout';
import { Effects } from '../render/particles';
import { BRAWLER_PALETTE, ENEMY_PALETTES, FighterView, type GearLook, PLAYER_PALETTE, type Palette } from '../render/fighterView';
import { DEFAULT_AI, type AIConfig } from '../sim/ai';
import { type CombatEvent, CombatSim, hurtSpheres, strikePoint } from '../sim/combat';
import { coinDrop, createEnemy } from '../sim/enemies';
import { DEFAULT_STATS, type Fighter, type FighterStats } from '../sim/fighter';
import { DT, Rng } from '../sim/math';
import { createBrawler, createPlayer } from '../sim/roster';
import { Leaks } from '../story/leaks';
import { leakFor } from '../story/story';
import { Choice } from '../ui/choice';
import { Hud } from '../ui/hud';
import { SettingsMenu } from '../ui/settings';
import { Shop } from '../ui/shop';
import { RectWalkable } from '../world/collision';
import { buildDungeon, type DungeonLayout, type EnemyKind, type Room, roomAt } from '../world/dungeon';
import { DungeonView, WALL_HEIGHT } from '../world/dungeonView';
import type { Gate } from '../world/grid';
import { item, loadSave, loopRewardMul, type SaveData, SLOTS, statsWithGear, writeSave } from './economy';
import { Tutorial } from './tutorial';

export const GAME_TUNING = {
  timeScale: 1,
  paused: false,
  hitstopMul: 1,
  showHitboxes: false,
  volume: 0.7,
};

const TIME_SCALES = [1, 0.5, 0.25, 0.1];
const PLAYER_BASE: FighterStats = { ...DEFAULT_STATS, maxHp: 100, walkSpeed: 2.6 };
const BRUISER_LOOK: GearLook = { helmet: { material: 'iron', tier: 2 }, chest: { material: 'iron', tier: 2 } };

type Mode = 'run' | 'arena';
type Phase = 'play' | 'choice' | 'shop' | 'down';

export class Game {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camRig = new CameraRig();
  readonly effects: Effects;
  readonly coins: Coins;
  readonly sfx = new Sfx();
  readonly input: Input;
  readonly hud: Hud;
  readonly settings: SettingsMenu;
  readonly shop: Shop;
  readonly choice: Choice;
  readonly world: RAPIER.World;
  readonly sim: CombatSim;
  readonly aiCfg: AIConfig = { ...DEFAULT_AI };
  readonly player: Fighter;
  readonly mode: Mode;
  readonly save: SaveData;
  /** All live (and recently KO'd) enemies. */
  readonly enemies: Fighter[] = [];
  private readonly enemyKind = new Map<Fighter, EnemyKind>();
  private readonly enemyRoom = new Map<Fighter, Room>();
  private readonly telegraphed = new Map<Fighter, number>();
  private readonly koAt = new Map<Fighter, number>();

  // Arena mode.
  private arena: Arena | null = null;
  wave = 1;
  kos = 0;
  private respawnIn = -1;

  // Run mode.
  layout: DungeonLayout | null = null;
  private dungeonView: DungeonView | null = null;
  private leaks: Leaks | null = null;
  private envBody: RAPIER.RigidBody | null = null;
  private readonly gateColliders = new Map<Gate, RAPIER.Collider>();
  private activeRoom: Room | null = null;
  private readonly cleared = new Set<string>();
  private clearIn = -1;
  private coinsThisRun = 0;
  private terminalArmed = true;
  private tutorial: Tutorial | null = null;
  private tutorialPartner: Fighter | null = null;
  private phase: Phase = 'play';
  private readonly storyRng = new Rng(99);

  private readonly views = new Map<Fighter, FighterView>();
  private readonly ragdolls = new Map<Fighter, Ragdoll>();
  private hitstop = 0;
  private hitstopVictim: Fighter | null = null;
  private accum = 0;
  private stepOnce = false;
  private slowmo = 0;
  private downIn = -1;
  private shopIn = -1;
  private attacksThrown = 0;
  private time = 0;
  private pausedBySettings = false;
  private readonly lookAhead = new Vector3();
  /** Exposed for the debug panel and automated capture scripts. */
  readonly tuning = GAME_TUNING;
  readonly cameraTuning = CAMERA_TUNING;
  readonly cutout = cutoutUniforms;
  onTogglePanel: (() => void) | null = null;

  private readonly debugGroup = new Group();
  private readonly debugPool: Mesh[] = [];
  private readonly debugMats = {
    hurt: new MeshBasicMaterial({ color: 0x40ff80, wireframe: true, transparent: true, opacity: 0.5 }),
    strike: new MeshBasicMaterial({ color: 0xff3030, wireframe: true }),
    target: new MeshBasicMaterial({ color: 0x40d0ff }),
  };
  private readonly sphereGeo = new SphereGeometry(1, 10, 8);

  static async create(canvas: HTMLCanvasElement, hudRoot: HTMLElement): Promise<Game> {
    await RAPIER.init();
    return new Game(canvas, hudRoot);
  }

  private constructor(
    private readonly canvas: HTMLCanvasElement,
    hudRoot: HTMLElement,
  ) {
    const r = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = PCFShadowMap;
    r.toneMapping = ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.outputColorSpace = SRGBColorSpace;
    this.renderer = r;
    this.scene.background = new Color('#b9d3e4');
    this.effects = new Effects(this.scene);
    this.coins = new Coins(this.scene);
    this.scene.add(this.debugGroup);
    this.mode = new URLSearchParams(location.search).get('mode') === 'arena' ? 'arena' : 'run';
    this.save = loadSave();

    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = DT;
    const ground = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(200, 0.5, 200).setTranslation(0, -0.5, 0).setFriction(0.9).setCollisionGroups(groups(GROUP_ENV, 0xffff)),
      ground,
    );

    this.sim = new CombatSim((Date.now() & 0xffff) + 1);
    this.sim.externalKnockdown = true;

    this.player = createPlayer();
    this.player.pos.set(-1.8, 0, 0.3);
    this.player.yaw = Math.PI / 2;
    this.sim.add(this.player);
    this.attach(this.player, PLAYER_PALETTE);

    this.input = new Input(canvas);
    this.input.onAnyInput = () => this.sfx.unlock();
    this.hud = new Hud(hudRoot);
    this.hud.setBindings(this.input.bindings);
    this.settings = new SettingsMenu(document.body, this.input);
    this.settings.onChange = (b) => this.hud.setBindings(b);
    this.settings.onOpenChange = (open) => this.setMenuPause(open);
    this.hud.gearButton.addEventListener('click', () => this.settings.toggle());
    this.shop = new Shop(document.body, this.save);
    this.shop.onBuy = () => {
      writeSave(this.save);
      this.applyGear();
      this.hud.setCoins(this.save.coins, false);
      this.sfx.coin();
    };
    this.shop.onDone = () => {
      this.shop.close();
      this.startRun();
    };
    this.choice = new Choice(document.body);
    this.choice.onErase = () => this.eraseMemories();
    this.choice.onCancel = () => {
      this.phase = 'play';
      this.terminalArmed = false;
      this.setMenuPause(false);
    };

    if (this.mode === 'arena') this.setupArena();
    else this.startRun();
    this.applyGear();
    this.hud.setCoins(this.save.coins, false);
    this.hud.showCoins(this.mode === 'run');

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  get enemy(): Fighter | null {
    return this.enemies.find((e) => e.alive) ?? this.enemies[0] ?? null;
  }

  private setMenuPause(open: boolean) {
    // Pause while a menu is open (unless already paused for tuning).
    if (open && !GAME_TUNING.paused) {
      GAME_TUNING.paused = true;
      this.pausedBySettings = true;
    } else if (!open && this.pausedBySettings) {
      GAME_TUNING.paused = false;
      this.pausedBySettings = false;
    }
  }

  private applyGear() {
    const p = this.player;
    const hpFrac = p.hp / p.stats.maxHp;
    p.stats = statsWithGear(this.save, PLAYER_BASE);
    p.hp = Math.min(p.stats.maxHp, Math.max(1, hpFrac * p.stats.maxHp));
    const look: GearLook = {};
    for (const slot of SLOTS) {
      const g = item(slot, this.save.gear[slot]);
      if (g) look[slot] = { material: g.material, tier: g.tier };
    }
    this.views.get(p)?.setGear(look);
  }

  // ---------------------------------------------------------------------------
  // Fighters
  // ---------------------------------------------------------------------------

  private attach(f: Fighter, palette: Palette, look?: GearLook) {
    const view = new FighterView(palette);
    if (look) view.setGear(look);
    this.scene.add(view.root);
    this.views.set(f, view);
    this.ragdolls.set(f, new Ragdoll(RAPIER, this.world, f));
  }

  private detach(f: Fighter) {
    const v = this.views.get(f);
    if (v) this.scene.remove(v.root);
    this.ragdolls.get(f)?.dispose();
    this.views.delete(f);
    this.ragdolls.delete(f);
    this.sim.remove(f);
    const i = this.enemies.indexOf(f);
    if (i >= 0) this.enemies.splice(i, 1);
    this.enemyKind.delete(f);
    this.enemyRoom.delete(f);
    this.telegraphed.delete(f);
    this.koAt.delete(f);
  }

  private spawn(kind: EnemyKind, x: number, z: number, room: Room | null): Fighter {
    const { fighter, ai } = createEnemy(kind, this.sim.rng, this.save.loop, this.mode === 'arena' ? this.aiCfg : {});
    if (this.mode === 'arena') ai.cfg = this.aiCfg;
    fighter.pos.set(x, 0, z);
    fighter.yaw = Math.atan2(this.player.pos.x - x, this.player.pos.z - z);
    fighter.updatePose(0, 0, 0);
    this.sim.add(fighter, ai);
    this.attach(fighter, ENEMY_PALETTES[kind] ?? BRAWLER_PALETTE, kind === 'bruiser' ? BRUISER_LOOK : undefined);
    this.enemies.push(fighter);
    this.enemyKind.set(fighter, kind);
    if (room) this.enemyRoom.set(fighter, room);
    this.effects.ring(fighter.pos, 1.2, '#ff5040', 0.6);
    this.effects.dust(fighter.pos, 14, 0.6);
    return fighter;
  }

  private clearEnemies() {
    for (const e of [...this.enemies]) this.detach(e);
  }

  private resetPlayer(x: number, z: number, yaw: number) {
    const p = this.player;
    p.pos.set(x, 0, z);
    p.yaw = yaw;
    p.vel.set(0, 0, 0);
    p.walkVel.set(0, 0, 0);
    p.hp = p.stats.maxHp;
    p.guard = p.stats.maxGuard;
    p.poise = p.stats.maxPoise;
    p.counter = null;
    p.buffer = null;
    p.enterLocomotion(1);
    p.updatePose(0, 0, 0);
    this.ragdolls.get(p)?.snapTo(p);
  }

  // ---------------------------------------------------------------------------
  // Training arena
  // ---------------------------------------------------------------------------

  private setupArena() {
    this.arena = new Arena(this.scene);
    const { halfX, halfZ } = this.arena.size;
    this.sim.walkable = new RectWalkable(-halfX + 0.2, halfX - 0.2, -halfZ + 0.2, halfZ - 0.2);
    const env = groups(GROUP_ENV, 0xffff);
    this.envBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const wall = (x: number, z: number, hx: number, hz: number) =>
      this.world.createCollider(RAPIER.ColliderDesc.cuboid(hx, 2, hz).setTranslation(x, 2, z).setCollisionGroups(env), this.envBody!);
    wall(0, -halfZ - 0.45, halfX + 1, 0.2);
    wall(0, halfZ + 0.45, halfX + 1, 0.2);
    wall(-halfX - 0.45, 0, 0.2, halfZ + 1);
    wall(halfX + 0.45, 0, 0.2, halfZ + 1);
    cutoutUniforms.uCutOn.value = 0;
    this.spawnEnemy(true);
    this.camRig.snap(new Vector3(0, 0.9, 0.3));
  }

  /** Arena: replace the opponent (also the debug panel's "Respawn enemy"). */
  spawnEnemy(first = false) {
    if (this.mode !== 'arena') {
      const p = this.player.pos;
      this.spawn('brawler', p.x + 2.5, p.z, this.activeRoom);
      return;
    }
    this.clearEnemies();
    const { fighter, ai } = createBrawler(this.sim.rng);
    ai.cfg = this.aiCfg;
    fighter.stats.maxHp = Math.round(70 * (1 + 0.12 * (this.wave - 1)));
    fighter.hp = fighter.stats.maxHp;
    const p = this.player.pos;
    const side = first ? 1 : p.x > 0 ? -1 : 1;
    fighter.pos.set(Math.max(-6.5, Math.min(6.5, p.x + side * 3.4)), 0, Math.max(-3.5, Math.min(3.5, p.z * 0.5)));
    fighter.yaw = Math.atan2(p.x - fighter.pos.x, p.z - fighter.pos.z);
    this.sim.add(fighter, ai);
    this.attach(fighter, BRAWLER_PALETTE);
    this.enemies.push(fighter);
    this.enemyKind.set(fighter, 'brawler');
    if (!first) {
      this.effects.ring(fighter.pos, 1.2, '#ff5040', 0.6);
      this.effects.dust(fighter.pos, 14, 0.6);
    }
  }

  // ---------------------------------------------------------------------------
  // Dungeon run
  // ---------------------------------------------------------------------------

  /** Builds a fresh dungeon instance for the current memory loop. */
  startRun() {
    this.clearEnemies();
    this.coins.clear();
    this.dungeonView?.dispose();
    this.leaks?.dispose();
    if (this.envBody) this.world.removeRigidBody(this.envBody);
    this.gateColliders.clear();
    this.cleared.clear();
    this.activeRoom = null;
    this.clearIn = -1;
    this.coinsThisRun = 0;
    this.terminalArmed = true;
    this.tutorial = null;
    this.tutorialPartner = null;
    this.downIn = -1;
    this.slowmo = 0;
    this.hud.hideBanner();

    const loop = this.save.loop;
    const seed = (Date.now() & 0xfffff) + loop * 7919;
    const layout = buildDungeon(seed, loop);
    this.layout = layout;
    this.dungeonView = new DungeonView(this.scene, layout, seed);
    this.leaks = new Leaks(this.scene, layout, leakFor(loop), seed);
    this.leaks.onGlitch = () => this.sfx.glitch();
    this.sim.walkable = layout.grid;
    cutoutUniforms.uCutOn.value = 1;

    // Static colliders so ragdolls stay inside the walls.
    const env = groups(GROUP_ENV, 0xffff);
    this.envBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const T = 0.45;
    for (const run of layout.grid.wallRuns()) {
      const off = (run.solid * T) / 2;
      const desc = run.alongX
        ? RAPIER.ColliderDesc.cuboid(run.length / 2 + T / 2, WALL_HEIGHT / 2, T / 2).setTranslation(run.cx, WALL_HEIGHT / 2, run.cz + off)
        : RAPIER.ColliderDesc.cuboid(T / 2, WALL_HEIGHT / 2, run.length / 2 + T / 2).setTranslation(run.cx + off, WALL_HEIGHT / 2, run.cz);
      this.world.createCollider(desc.setCollisionGroups(env), this.envBody);
    }
    for (const g of layout.grid.gates) this.setGate(g, true, false);

    this.applyGear();
    this.resetPlayer(layout.start[0], layout.start[1], Math.PI / 2);
    this.camRig.snap(new Vector3(layout.start[0], 0.9, layout.start[1]));
    this.phase = 'play';
    this.setMenuPause(false);

    if (!this.save.tutorialDone) this.startTutorial();
    else this.hud.showBanner(loop === 0 ? 'THE DUNGEON' : `LOOP ${loop}`, loop === 0 ? 'find the way out' : 'you have been here before', 'intro');
    this.introBannerIn = 2.5;
  }

  private introBannerIn = -1;

  private startTutorial() {
    const L = this.layout!;
    const [sx, sz] = L.start;
    const partner = this.spawn('rookie', sx + 2.4, sz, null);
    partner.name = 'Sparring partner';
    const ai = this.sim.ais.get(partner)!;
    this.tutorial = new Tutorial(partner, ai, this.player);
    this.tutorialPartner = partner;
    // Keep the way on sealed until the lesson is over.
    const gate = L.rooms[1]?.gates[0];
    if (gate) this.setGate(gate, false, false);
  }

  private finishTutorial() {
    const partner = this.tutorialPartner;
    if (partner) {
      this.effects.dust(partner.pos, 20, 0.6);
      this.effects.ring(partner.pos, 1, '#ffd36b', 0.6);
      this.detach(partner);
    }
    this.tutorial = null;
    this.tutorialPartner = null;
    this.save.tutorialDone = true;
    writeSave(this.save);
    const gate = this.layout?.rooms[1]?.gates[0];
    if (gate) this.setGate(gate, true);
    this.hud.prompt('');
    this.sfx.chime();
  }

  private setGate(g: Gate, open: boolean, sound = true) {
    const grid = this.layout!.grid;
    grid.setGate(g, open);
    const existing = this.gateColliders.get(g);
    if (open && existing) {
      this.world.removeCollider(existing, false);
      this.gateColliders.delete(g);
    } else if (!open && !existing && this.envBody) {
      const desc = g.alongX
        ? RAPIER.ColliderDesc.cuboid(g.width / 2, WALL_HEIGHT / 2, 0.15)
        : RAPIER.ColliderDesc.cuboid(0.15, WALL_HEIGHT / 2, g.width / 2);
      desc.setTranslation(g.cx, WALL_HEIGHT / 2, g.cz).setCollisionGroups(groups(GROUP_ENV, 0xffff));
      this.gateColliders.set(g, this.world.createCollider(desc, this.envBody));
    }
    if (sound) this.sfx.gate(!open);
  }

  private activateRoom(room: Room) {
    this.activeRoom = room;
    for (const g of room.gates) this.setGate(g, false);
    this.camRig.addTrauma(0.15);
    const grid = this.layout!.grid;
    const p = this.player.pos;
    const spots: [number, number][] = [];
    const rng = this.sim.rng;
    for (let tries = 0; tries < 200 && spots.length < room.enemies.length; tries++) {
      const i = room.rect.x0 + 1 + Math.floor(rng.next() * (room.rect.x1 - room.rect.x0 - 2));
      const j = room.rect.z0 + 1 + Math.floor(rng.next() * (room.rect.z1 - room.rect.z0 - 2));
      const [x, z] = grid.cellCenter(i, j);
      if (Math.hypot(x - p.x, z - p.z) < 3.5) continue;
      if (spots.some(([sx, sz]) => Math.hypot(sx - x, sz - z) < 1.6)) continue;
      spots.push([x, z]);
    }
    room.enemies.forEach((kind, k) => {
      const [x, z] = spots[k] ?? [room.cx + k, room.cz];
      this.spawn(kind, x, z, room);
    });
  }

  private updateRun() {
    const L = this.layout;
    if (!L || this.phase !== 'play') return;
    const p = this.player;
    if (this.tutorial) {
      this.tutorial.update();
      if (this.tutorial.finished) this.finishTutorial();
      return;
    }
    if (!this.activeRoom) {
      const room = roomAt(L, p.pos.x, p.pos.z);
      if (room && room.kind === 'combat' && !this.cleared.has(room.id)) this.activateRoom(room);
    } else if (this.clearIn < 0) {
      const left = this.enemies.filter((e) => this.enemyRoom.get(e) === this.activeRoom && e.alive);
      if (left.length === 0) this.clearIn = 70;
    } else if (--this.clearIn <= 0) {
      const room = this.activeRoom;
      for (const g of room.gates) this.setGate(g, true);
      this.cleared.add(room.id);
      this.activeRoom = null;
      this.clearIn = -1;
      this.sfx.chime();
      this.hud.popup('ROOM CLEAR', new Vector3(p.pos.x, 2.2, p.pos.z), this.camRig.camera, 'counter');
      writeSave(this.save);
    }
    // Memory terminal.
    const [tx, tz] = L.terminal;
    const d = Math.hypot(p.pos.x - tx, p.pos.z - tz);
    if (d > 1.8) this.terminalArmed = true;
    if (d < 1.1 && this.terminalArmed && p.alive) {
      this.terminalArmed = false;
      this.phase = 'choice';
      this.setMenuPause(true);
      this.choice.open(this.save.loop, this.coinsThisRun, loopRewardMul(this.save.loop + 1));
    }
  }

  private eraseMemories() {
    this.save.loop++;
    writeSave(this.save);
    this.hud.flash();
    this.sfx.chime();
    this.phase = 'shop';
    this.shopIn = 0.9;
  }

  // ---------------------------------------------------------------------------
  // Loop
  // ---------------------------------------------------------------------------

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.camRig.resize(w, h);
  }

  start() {
    let last = performance.now();
    const loop = (now: number) => {
      requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      this.frame(dt);
    };
    requestAnimationFrame(loop);
  }

  requestStep() {
    this.stepOnce = true;
  }

  /** Debug/capture helper: run `n` fixed steps immediately (rendered on the next frame). */
  advance(n: number) {
    for (let i = 0; i < n; i++) this.fixedStep();
  }

  restart() {
    if (this.mode === 'run') {
      this.startRun();
      return;
    }
    this.wave = 1;
    this.kos = 0;
    this.respawnIn = -1;
    this.downIn = -1;
    this.revivePlayer();
    this.spawnEnemy();
    this.hud.hideBanner();
  }

  /** Debug/capture helper: place the player and the first enemy `dist` apart, facing each other. */
  stage(dist: number) {
    const e = this.enemy;
    const p = this.player;
    const [cx, cz] = this.mode === 'run' && this.layout ? this.layout.start : [0, 0];
    p.pos.set(cx - dist / 2, 0, cz);
    p.yaw = Math.PI / 2;
    p.hp = p.stats.maxHp;
    p.enterLocomotion(1);
    p.updatePose(0, 0, 0);
    this.ragdolls.get(p)?.snapTo(p);
    if (e) {
      e.pos.set(cx + dist / 2, 0, cz);
      e.yaw = -Math.PI / 2;
      e.hp = e.stats.maxHp;
      e.enterLocomotion(1);
      e.updatePose(0, 0, 0);
      this.ragdolls.get(e)?.snapTo(e);
    }
    this.hitstop = 0;
    this.camRig.snap(new Vector3(cx, 0.9, cz));
  }

  private revivePlayer() {
    const p = this.player;
    p.hp = p.stats.maxHp;
    p.guard = p.stats.maxGuard;
    p.poise = p.stats.maxPoise;
    p.counter = null;
    p.vel.set(0, 0, 0);
    if (p.state === 'ko' || p.state === 'knockdown') p.enterGetup();
  }

  private frame(realDt: number) {
    this.time += realDt;
    const inp = this.input.poll();
    for (const k of inp.keys) this.metaKey(k);

    const fwd = this.camRig.groundForward;
    const right = this.camRig.groundRight;
    const blocked = this.phase !== 'play' || this.settings.isOpen;
    this.player.moveInput.set(
      blocked ? 0 : right.x * inp.moveX + fwd.x * inp.moveY,
      0,
      blocked ? 0 : right.z * inp.moveX + fwd.z * inp.moveY,
    );
    for (const b of inp.presses) {
      if (!this.player.alive || blocked) continue;
      this.player.press(b);
      if (++this.attacksThrown === 8) this.hud.fadeHint();
    }

    // Timers in real time.
    if (this.slowmo > 0) this.slowmo -= realDt;
    if (this.introBannerIn > 0 && (this.introBannerIn -= realDt) <= 0) this.hud.hideBanner();
    if (this.respawnIn > 0 && (this.respawnIn -= realDt) <= 0) {
      this.wave++;
      this.spawnEnemy();
      this.hud.hideBanner();
    }
    if (this.downIn > 0 && (this.downIn -= realDt) <= 0) this.restart();
    if (this.shopIn > 0 && (this.shopIn -= realDt) <= 0) {
      this.setMenuPause(true);
      this.shop.open(this.save.loop);
    }

    let scale = GAME_TUNING.timeScale * (this.slowmo > 0 ? 0.25 : 1);
    if (GAME_TUNING.paused) scale = 0;
    if (this.stepOnce) {
      this.stepOnce = false;
      this.fixedStep();
    }
    this.accum += realDt * scale;
    let steps = 0;
    while (this.accum >= DT && steps < 6) {
      this.fixedStep();
      this.accum -= DT;
      steps++;
    }
    if (steps === 6) this.accum = 0;
    const frozen = this.hitstop > 0 || scale === 0;
    const alpha = frozen ? 1 : this.accum / DT;
    this.render(realDt, frozen ? 0 : realDt * scale, alpha);
  }

  private metaKey(code: string) {
    switch (code) {
      case 'Escape':
        if (this.phase === 'play') this.settings.toggle();
        break;
      case 'KeyL':
        this.onTogglePanel?.();
        break;
      case 'KeyP':
        GAME_TUNING.paused = !GAME_TUNING.paused;
        break;
      case 'Period':
        GAME_TUNING.paused = true;
        this.stepOnce = true;
        break;
      case 'KeyT': {
        const i = TIME_SCALES.indexOf(GAME_TUNING.timeScale);
        GAME_TUNING.timeScale = TIME_SCALES[(i + 1) % TIME_SCALES.length];
        break;
      }
      case 'KeyH':
        GAME_TUNING.showHitboxes = !GAME_TUNING.showHitboxes;
        break;
      case 'Backspace':
        if (this.phase === 'play') this.restart();
        break;
      case 'KeyM':
        this.sfx.setVolume(this.sfx.volume > 0 ? 0 : GAME_TUNING.volume);
        break;
    }
  }

  private fixedStep() {
    if (this.hitstop > 0) {
      this.hitstop--;
      const v = this.hitstopVictim ? this.views.get(this.hitstopVictim) : null;
      if (v) {
        const a = 0.022 * Math.min(1, this.hitstop / 3 + 0.3);
        v.shiver.set((Math.random() - 0.5) * a, (Math.random() - 0.5) * a * 0.5, (Math.random() - 0.5) * a);
      }
      for (const rd of this.ragdolls.values()) rd.freezeInterpolation();
      return;
    }
    for (const v of this.views.values()) v.shiver.set(0, 0, 0);

    const events = this.sim.step();
    for (const e of events) this.handleEvent(e);
    if (this.mode === 'run') this.updateRun();

    for (const [f, rd] of this.ragdolls) {
      rd.drive(f);
      rd.capturePrev();
    }
    this.world.step();
    for (const [f, rd] of this.ragdolls) {
      rd.captureCur();
      if (f.state === 'knockdown' || f.state === 'ko') {
        const p = rd.pelvisPos();
        f.pos.set(p.x, 0, p.z);
      }
    }
    // Clear away knocked-out enemies after a while.
    for (const [f, t] of this.koAt) if (this.sim.frame - t > 60 * 6) this.detach(f);
  }

  private handleEvent(e: CombatEvent) {
    this.tutorial?.onEvent(e);
    switch (e.type) {
      case 'hit': {
        const m = e.move;
        const heavy = m.weight === 'heavy';
        const byPlayer = e.attacker.team === 'player';
        this.hitstop = Math.max(
          this.hitstop,
          Math.round(m.hitstop * GAME_TUNING.hitstopMul * (e.counter ? 1.35 : 1) * (e.ko ? 1.8 : 1) * (e.armored ? 0.5 : 1)),
        );
        this.hitstopVictim = e.defender;
        this.camRig.addTrauma(m.shake * (e.counter ? 1.3 : 1) * (e.ko ? 1.6 : 1));
        if (heavy || e.counter) this.camRig.zoomPunch(1);
        this.sfx.hit(m.weight, e.counter);
        const col = e.armored ? '#ff9a3c' : e.counter ? '#ffd36b' : '#fff0c8';
        this.effects.flash(e.point, heavy ? 0.42 : 0.26, e.counter ? '#ffd36b' : '#fff3d6');
        this.effects.sparks(e.point, e.dir, heavy ? 22 : 12, col, heavy ? 6.5 : 4.5);
        const rd = this.ragdolls.get(e.defender);
        rd?.applyHit(e.zone, e.point, e.dir, m, e.armored ? 0.4 : 1);
        if (e.knockdown || e.ko) {
          rd?.launch(e.dir.clone().multiplyScalar(m.knockback * 0.9 + (e.ko ? 1 : 0)).add(new Vector3(0, 1.2 + (m.lift ?? 0) * 3, 0)));
          this.sfx.knockdown();
        }
        this.views.get(e.defender)?.hitFlash();
        if (byPlayer && e.combo >= 2) this.hud.showCombo(e.combo);
        if (byPlayer && e.counter) this.hud.popup('COUNTER', e.point, this.camRig.camera, 'counter');
        if (byPlayer && e.armored) this.hud.popup('ARMORED', e.point, this.camRig.camera, 'armor');
        if (e.ko) this.onKO(e.defender);
        break;
      }
      case 'block': {
        this.hitstop = Math.max(this.hitstop, Math.round((e.guardBreak ? 8 : 3) * GAME_TUNING.hitstopMul));
        this.hitstopVictim = e.defender;
        this.camRig.addTrauma(e.guardBreak ? 0.35 : 0.1);
        this.sfx.block(e.move.weight === 'heavy');
        this.effects.sparks(e.point, e.dir, e.guardBreak ? 18 : 8, '#8fd0ff', 3.5, 0.03);
        this.effects.flash(e.point, 0.2, '#9fd8ff');
        this.ragdolls.get(e.defender)?.applyBlock(e.dir, e.move);
        if (e.guardBreak) this.hud.popup('GUARD BREAK', e.point, this.camRig.camera, 'armor');
        break;
      }
      case 'dodge': {
        this.sfx.dodge();
        if (e.defender === this.player && e.kind !== 'airborne') {
          this.sfx.counterReady();
          this.effects.ring(this.player.pos, 0.9, '#ffd36b', 0.45, () => this.player.pos);
        }
        break;
      }
      case 'defend':
        if (e.kind === 'slide') this.effects.dust(e.f.pos, 10, 0.4);
        break;
      case 'swing':
        this.sfx.whoosh(e.move.weight);
        if (e.move.id === 'slideKick' || e.move.id === 'flyingKick') this.effects.dust(e.f.pos, 8, 0.4);
        break;
      case 'getup':
        this.effects.dust(e.f.pos, 10, 0.5);
        break;
      default:
        break;
    }
  }

  private onKO(f: Fighter) {
    this.sfx.ko();
    this.camRig.addTrauma(0.5);
    if (f === this.player) {
      this.slowmo = 1.5;
      this.phase = 'down';
      this.hud.showBanner('DOWN', this.mode === 'run' ? 'memory corrupted — starting over' : 'get up', 'down');
      this.downIn = 3.2;
      return;
    }
    this.koAt.set(f, this.sim.frame);
    if (this.mode === 'arena') {
      this.slowmo = 1.5;
      this.kos++;
      this.hud.showBanner('K.O.', `round ${this.wave} clear`);
      this.respawnIn = 3.2;
      return;
    }
    // Run: coins burst out; slow-mo only for the last enemy of a fight.
    const kind = this.enemyKind.get(f) ?? 'brawler';
    const at = this.ragdolls.get(f)?.pelvisPos() ?? f.pos.clone();
    this.coins.burst(at, coinDrop(kind, this.sim.rng, this.save.loop));
    const left = this.enemies.filter((e) => e.alive && this.enemyRoom.get(e) === this.enemyRoom.get(f));
    if (left.length === 0) this.slowmo = 1.2;
  }

  // ---------------------------------------------------------------------------

  private render(realDt: number, simDt: number, alpha: number) {
    for (const [f, view] of this.views) {
      const rd = this.ragdolls.get(f);
      if (rd) view.syncFromRagdoll(rd, alpha);
      else view.syncFromRig(f);
      view.updateCues(realDt, f);
    }

    // Telegraph ring when an enemy starts winding up.
    for (const e of this.enemies) {
      if (e.state === 'attack' && e.move && e.attackSerial !== this.telegraphed.get(e)) {
        this.telegraphed.set(e, e.attackSerial);
        this.effects.ring(e.pos, 0.85, e.move.armor ? '#ff7a20' : '#ff3828', (e.move.startup / 60) * 1.1, () => e.pos);
      }
    }

    this.effects.update(simDt, realDt);
    const got = this.coins.update(simDt, this.player.pos);
    if (got > 0) {
      this.save.coins += got;
      this.coinsThisRun += got;
      this.hud.setCoins(this.save.coins);
      this.sfx.coin();
    }
    this.arena?.update(this.time);

    // Camera: frame the fight when engaged, look ahead while exploring.
    const p = this.player;
    const t = p.target && p.target.alive && p.distanceTo(p.target) < 9 ? p.target : null;
    const focus = p.pos.clone();
    let spread = 0;
    this.lookAhead.lerp(t ? new Vector3() : new Vector3(p.walkVel.x, 0, p.walkVel.z).multiplyScalar(0.45), 1 - Math.exp(-realDt * 3));
    if (t) {
      focus.lerp(t.pos, CAMERA_TUNING.focusMix);
      spread = p.distanceTo(t);
    }
    focus.add(this.lookAhead);
    focus.y = 0.9;
    this.camRig.zoom = this.slowmo > 0 ? 1.12 : 1;
    this.camRig.update(realDt, focus, spread);
    if (this.dungeonView) {
      this.dungeonView.update(this.time, realDt, focus);
      this.leaks?.update(this.time, realDt, this.storyRng);
      const cutFocus = p.pos.clone();
      if (t) cutFocus.lerp(t.pos, 0.5);
      cutFocus.y = 1;
      updateCutout(this.camRig.camera, cutFocus, 0.3 + Math.min(0.25, spread * 0.06), this.renderer.domElement.width / this.renderer.domElement.height);
    }

    if (this.tutorial) {
      const head = new Vector3(p.pos.x, 2.25, p.pos.z);
      this.hud.prompt(this.tutorial.prompt(this.input.bindings), head, this.camRig.camera);
    }

    this.updateDebug();
    const shown = t ?? (this.mode === 'arena' && this.respawnIn > 0 ? this.enemy : null);
    const label =
      this.mode === 'arena'
        ? `TRAINING · ROUND ${this.wave}${this.kos ? `  ·  ${this.kos} KO` : ''}`
        : this.tutorial
          ? 'PRACTICE'
          : `LOOP ${this.save.loop}  ·  ${this.cleared.size}/${this.layout?.rooms.filter((r) => r.kind === 'combat').length ?? 0} ROOMS`;
    this.hud.update(realDt, p, shown, label);
    this.renderer.render(this.scene, this.camRig.camera);
  }

  private updateDebug() {
    this.debugGroup.visible = GAME_TUNING.showHitboxes;
    if (!GAME_TUNING.showHitboxes) return;
    let i = 0;
    const use = (mat: MeshBasicMaterial, at: Vector3, r: number) => {
      let m = this.debugPool[i];
      if (!m) {
        m = new Mesh(this.sphereGeo, mat);
        this.debugPool.push(m);
        this.debugGroup.add(m);
      }
      m.material = mat;
      m.visible = true;
      m.position.copy(at);
      m.scale.setScalar(r);
      i++;
    };
    for (const f of this.sim.fighters) {
      for (const h of ['high', 'mid', 'low'] as const) for (const s of hurtSpheres(f, h)) use(this.debugMats.hurt, s.center, s.r);
      for (const b of BONES) use(this.debugMats.target, f.rig[b].pos, 0.018);
      if (f.move && f.inActiveFrames()) use(this.debugMats.strike, strikePoint(f, f.move, new Vector3()), f.move.radius + f.stats.reach);
    }
    for (; i < this.debugPool.length; i++) this.debugPool[i].visible = false;
  }
}
