import RAPIER from '@dimforge/rapier3d-compat';
import {
  ACESFilmicToneMapping,
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
import { THEMES, type ThemeDef, type ThemeId } from '../arena/themes';
import { ThemeView } from '../arena/themeView';
import { GROUP_ENV, groups, Ragdoll } from '../body/ragdoll';
import { BONES } from '../body/skeleton';
import { Sfx } from '../feel/audio';
import { Input } from '../input/input';
import { CAMERA_TUNING, CameraRig } from '../render/cameraRig';
import { Blood } from '../render/blood';
import { Coins } from '../render/coins';
import { cutoutUniforms, updateCutout } from '../render/cutout';
import { Effects } from '../render/particles';
import { FighterView, type GearLook, PLAYER_PALETTE, type Palette } from '../render/fighterView';
import { lookFor } from '../render/looks';
import { DEFAULT_AI, type AIConfig } from '../sim/ai';
import { type CombatEvent, CombatSim, type HurtZone, hurtSpheres, strikePoint } from '../sim/combat';
import type { MoveDef } from '../sim/moves';
import { ARCHETYPES, coinDrop, createEnemy, type EnemyKind, type EnemyMods } from '../sim/enemies';
import { DEFAULT_STATS, type Fighter, type FighterStats } from '../sim/fighter';
import { DT, Rng } from '../sim/math';
import { createPlayer } from '../sim/roster';
import { Hud } from '../ui/hud';
import { SettingsMenu } from '../ui/settings';
import { Shop } from '../ui/shop';
import { ArenaWalkable } from '../world/collision';
import { item, loadSave, type SaveData, SLOTS, statsWithGear, writeSave } from './economy';
import { type RoundSpec, roundSpec } from './gauntlet';
import { Trauma } from './trauma';
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
/** Enemies stand still for this long while the round is announced (real seconds). */
const INTRO_HOLD = 1.6;

type Mode = 'gauntlet' | 'training';
type Phase = 'play' | 'clear' | 'shop' | 'down';

export class Game {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camRig = new CameraRig();
  readonly effects: Effects;
  readonly coins: Coins;
  readonly blood: Blood;
  readonly trauma = new Map<Fighter, Trauma>();
  readonly sfx = new Sfx();
  readonly input: Input;
  readonly hud: Hud;
  readonly settings: SettingsMenu;
  readonly shop: Shop;
  readonly world: RAPIER.World;
  readonly sim: CombatSim;
  readonly aiCfg: AIConfig = { ...DEFAULT_AI };
  readonly player: Fighter;
  readonly mode: Mode;
  readonly save: SaveData;
  /** All live (and recently KO'd) enemies. */
  readonly enemies: Fighter[] = [];
  private readonly enemyKind = new Map<Fighter, EnemyKind>();
  private readonly telegraphed = new Map<Fighter, number>();
  private readonly koAt = new Map<Fighter, number>();

  // Arena.
  theme: ThemeDef = THEMES.ring;
  private themeView: ThemeView | null = null;
  private envBody: RAPIER.RigidBody | null = null;

  // Gauntlet.
  /** Current round (0 = the tutorial sparring session). */
  round = 0;
  spec: RoundSpec | null = null;
  private readonly roundRng = new Rng((Date.now() & 0xffff) + 7);
  private holdIn = -1;
  private clearIn = -1;
  private nextRoundIn = -1;
  private tutorial: Tutorial | null = null;
  private tutorialPartner: Fighter | null = null;

  // Training.
  wave = 1;
  kos = 0;
  private respawnIn = -1;

  private phase: Phase = 'play';
  private readonly fxRng = new Rng(99);
  private readonly views = new Map<Fighter, FighterView>();
  private readonly ragdolls = new Map<Fighter, Ragdoll>();
  private hitstop = 0;
  private hitstopVictim: Fighter | null = null;
  private accum = 0;
  private stepOnce = false;
  private slowmo = 0;
  private downIn = -1;
  private shopIn = -1;
  private bannerIn = -1;
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
    this.effects = new Effects(this.scene);
    this.coins = new Coins(this.scene);
    this.blood = new Blood(this.scene);
    this.scene.add(this.debugGroup);
    const params = new URLSearchParams(location.search);
    this.mode = params.get('mode') === 'training' || params.get('mode') === 'arena' ? 'training' : 'gauntlet';
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
    this.sim.add(this.player);
    this.attach(this.player, PLAYER_PALETTE);

    this.input = new Input(canvas);
    this.input.onAnyInput = () => this.sfx.unlock();
    this.hud = new Hud(hudRoot);
    this.hud.setBindings(this.input.bindings);
    this.settings = new SettingsMenu(document.body, this.input);
    this.settings.onChange = (b) => this.hud.setBindings(b);
    this.blood.enabled = this.settings.prefs.blood;
    this.settings.onPrefs = (p) => {
      this.blood.enabled = p.blood;
      if (!p.blood) this.blood.clear();
    };
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
      this.setMenuPause(false);
      this.startRound(this.round + 1);
    };

    this.applyGear();
    if (this.mode === 'training') this.setupTraining();
    else if (!this.save.tutorialDone) this.startTutorial();
    else this.startRound(1);
    this.hud.setCoins(this.save.coins, false);
    this.hud.showCoins(this.mode === 'gauntlet');

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  get enemy(): Fighter | null {
    return this.enemies.find((e) => e.alive) ?? this.enemies[0] ?? null;
  }

  setMenuPause(open: boolean) {
    // Pause while a menu is open (unless already paused for tuning).
    if (open && !GAME_TUNING.paused) {
      GAME_TUNING.paused = true;
      this.pausedBySettings = true;
    } else if (!open && this.pausedBySettings) {
      GAME_TUNING.paused = false;
      this.pausedBySettings = false;
    }
  }

  applyGear() {
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
    view.setScale(f.scale);
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
    this.telegraphed.delete(f);
    this.koAt.delete(f);
    this.trauma.delete(f);
  }

  private spawn(kind: EnemyKind, x: number, z: number, mods: EnemyMods = {}, fx = true): Fighter {
    const training = this.mode === 'training';
    const { fighter, ai } = createEnemy(kind, this.sim.rng, mods, training ? this.aiCfg : {});
    if (training) ai.cfg = this.aiCfg;
    fighter.pos.set(x, 0, z);
    fighter.yaw = Math.atan2(this.player.pos.x - x, this.player.pos.z - z);
    fighter.updatePose(0, 0, 0);
    this.sim.add(fighter, ai);
    const look = lookFor(kind, this.theme.id);
    this.attach(fighter, look.palette, look.gear);
    this.ragdolls.get(fighter)?.snapTo(fighter);
    this.enemies.push(fighter);
    this.enemyKind.set(fighter, kind);
    if (fx) {
      this.effects.ring(fighter.pos, 1.2 * fighter.scale, '#ff5040', 0.6);
      this.effects.dust(fighter.pos, 14, 0.6 * fighter.scale);
    }
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
  // Arena
  // ---------------------------------------------------------------------------

  /** Swaps the arena: visuals, walkable area and the static colliders that keep ragdolls in. */
  private setTheme(id: ThemeId) {
    const def = THEMES[id];
    this.theme = def;
    this.themeView?.dispose();
    this.themeView = new ThemeView(this.scene, def, (Date.now() & 0xffff) + this.round * 131);
    this.scene.background = this.themeView.background;
    this.sim.walkable = new ArenaWalkable(def.shape, def.obstacles);

    if (this.envBody) this.world.removeRigidBody(this.envBody);
    const env = groups(GROUP_ENV, 0xffff);
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    this.envBody = body;
    const wall = (x: number, z: number, hx: number, hz: number, ry = 0) => {
      const d = RAPIER.ColliderDesc.cuboid(hx, 2, hz).setTranslation(x, 2, z).setCollisionGroups(env);
      if (ry) d.setRotation({ x: 0, y: Math.sin(ry / 2), z: 0, w: Math.cos(ry / 2) });
      this.world.createCollider(d, body);
    };
    const s = def.shape;
    if (s.kind === 'rect') {
      wall(0, -s.hz - 0.45, s.hx + 1, 0.2);
      wall(0, s.hz + 0.45, s.hx + 1, 0.2);
      wall(-s.hx - 0.45, 0, 0.2, s.hz + 1);
      wall(s.hx + 0.45, 0, 0.2, s.hz + 1);
    } else {
      const n = 28;
      const R = s.r + 0.45;
      const half = (Math.PI * R) / n + 0.1;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        wall(Math.sin(a) * R, Math.cos(a) * R, half, 0.2, a);
      }
    }
    for (const o of def.obstacles) {
      const d =
        o.kind === 'circle'
          ? RAPIER.ColliderDesc.cylinder(1.2, o.r).setTranslation(o.x, 1.2, o.z)
          : RAPIER.ColliderDesc.cuboid(o.hx, 0.8, o.hz).setTranslation(o.x, 0.8, o.z);
      this.world.createCollider(d.setCollisionGroups(env), body);
    }
    cutoutUniforms.uCutOn.value = 1;
  }

  /** Clears the floor of the last fight. */
  private resetArena() {
    this.clearEnemies();
    this.coins.clear();
    this.blood.clear();
    this.trauma.clear();
    this.views.get(this.player)?.setTrauma(0, false);
    this.tutorial = null;
    this.tutorialPartner = null;
    this.player.minHp = 0;
    this.holdIn = this.clearIn = this.nextRoundIn = this.downIn = this.shopIn = this.respawnIn = -1;
    this.slowmo = 0;
    this.hud.hideBanner();
    this.hud.prompt('');
    this.phase = 'play';
  }

  private placePlayer() {
    const [x, z] = this.theme.playerSpawn;
    this.applyGear();
    // Face the middle of the arena.
    this.resetPlayer(x, z, Math.atan2(-x, -z * 0.3));
    this.camRig.snap(new Vector3(x * 0.5, 0.9, z * 0.5));
  }

  private banner(text: string, sub: string, cls = '', secs = 2.2) {
    this.hud.showBanner(text, sub, cls);
    this.bannerIn = secs;
  }

  // ---------------------------------------------------------------------------
  // Gauntlet
  // ---------------------------------------------------------------------------

  /** Round n: new arena, new opponent. */
  startRound(n: number) {
    this.resetArena();
    this.round = n;
    const spec = roundSpec(n, this.roundRng);
    this.spec = spec;
    this.setTheme(spec.theme);
    this.placePlayer();
    const spots = this.theme.enemySpawns;
    spec.spawns.forEach((s, i) => {
      const [x, z] = spots[i % spots.length];
      const ring = Math.floor(i / spots.length) * 0.8;
      const f = this.spawn(s.kind, x + ring, z, s);
      this.sim.ais.get(f)!.cfg.passive = true;
    });
    this.holdIn = INTRO_HOLD;
    if (spec.boss) {
      this.banner(`BOSS · ${ARCHETYPES[spec.boss].name.toUpperCase()}`, `round ${n} · ${this.theme.name}`, 'down', 2.6);
      this.camRig.addTrauma(0.35);
      this.sfx.knockdown();
    } else {
      this.banner(`ROUND ${n}`, `${this.theme.name} · ${ARCHETYPES[spec.spawns[0].kind].name}`, 'intro');
    }
    this.setMenuPause(false);
  }

  private startTutorial() {
    this.resetArena();
    this.round = 0;
    this.spec = null;
    this.setTheme('ring');
    this.placePlayer();
    const [x, z] = this.theme.enemySpawns[0];
    const partner = this.spawn('rookie', x, z, {}, false);
    partner.name = 'Sparring partner';
    this.tutorial = new Tutorial(partner, this.sim.ais.get(partner)!, this.player);
    this.tutorialPartner = partner;
    this.banner('THE GAUNTLET', 'warm up first', 'intro');
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
    this.player.minHp = 0;
    this.save.tutorialDone = true;
    writeSave(this.save);
    this.hud.prompt('');
    this.sfx.chime();
    this.banner('READY', 'the gauntlet begins', 'intro', 1.6);
    this.nextRoundIn = 1.8;
  }

  private updateGauntlet() {
    if (this.tutorial) {
      this.tutorial.update();
      // Finished, or the partner went down anyway: on to the real fights.
      const partnerDown = !!this.tutorialPartner && !this.tutorialPartner.alive;
      if ((this.tutorial.finished || partnerDown) && this.nextRoundIn < 0) this.finishTutorial();
      return;
    }
    if (this.phase !== 'play' || !this.spec || this.clearIn >= 0) return;
    if (this.enemies.length > 0 && this.enemies.every((e) => !e.alive)) this.clearIn = 1.4;
  }

  private roundCleared() {
    const spec = this.spec!;
    this.phase = 'clear';
    this.save.bestRound = Math.max(this.save.bestRound, spec.round);
    const p = this.player.pos;
    this.coins.burst(new Vector3(p.x, 1.6, p.z), spec.reward);
    writeSave(this.save);
    this.sfx.chime();
    this.banner(spec.boss ? 'BOSS DOWN' : 'ROUND CLEAR', `+${spec.reward} coins`, 'intro', 2.4);
    this.shopIn = 2.6;
  }

  // ---------------------------------------------------------------------------
  // Training
  // ---------------------------------------------------------------------------

  private setupTraining() {
    this.resetArena();
    this.setTheme('ring');
    this.placePlayer();
    this.spawnEnemy(true);
  }

  /** Replace the opponent (training), or add a brawler (debug panel "Respawn enemy"). */
  spawnEnemy(first = false) {
    const p = this.player.pos;
    if (this.mode !== 'training') {
      this.spawn('brawler', p.x + 2.5, p.z);
      return;
    }
    this.clearEnemies();
    const [x, z] = first ? this.theme.enemySpawns[0] : [p.x > 0 ? -2.2 : 2.2, -p.z * 0.5];
    const f = this.spawn('brawler', x, z, { hpMul: 1 + 0.12 * (this.wave - 1) }, !first);
    f.name = 'Brawler';
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
    this.shop.close();
    if (this.mode === 'gauntlet') {
      if (this.tutorial) this.startTutorial();
      else this.startRound(Math.max(1, this.round));
      return;
    }
    this.wave = 1;
    this.kos = 0;
    this.resetArena();
    this.placePlayer();
    this.spawnEnemy(true);
  }

  /** Debug/capture helper: place the player and the first enemy `dist` apart, facing each other. */
  stage(dist: number) {
    const e = this.enemy;
    const p = this.player;
    p.pos.set(-dist / 2, 0, 0);
    p.yaw = Math.PI / 2;
    p.hp = p.stats.maxHp;
    p.enterLocomotion(1);
    p.updatePose(0, 0, 0);
    this.ragdolls.get(p)?.snapTo(p);
    if (e) {
      e.pos.set(dist / 2, 0, 0);
      e.yaw = -Math.PI / 2;
      e.hp = e.stats.maxHp;
      e.enterLocomotion(1);
      e.updatePose(0, 0, 0);
      this.ragdolls.get(e)?.snapTo(e);
    }
    this.hitstop = 0;
    this.camRig.snap(new Vector3(0, 0.9, 0));
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
    const blocked = this.phase === 'shop' || this.phase === 'down' || this.settings.isOpen;
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

    // Timers in real time (stopped while paused).
    if (!GAME_TUNING.paused) this.tickTimers(realDt);

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

  private tickTimers(dt: number) {
    const due = (t: number) => t > 0 && t - dt <= 0;
    if (this.slowmo > 0) this.slowmo -= dt;
    if (due(this.bannerIn)) this.hud.hideBanner();
    if (due(this.holdIn)) {
      for (const e of this.enemies) {
        const ai = this.sim.ais.get(e);
        if (ai) ai.cfg.passive = false;
      }
    }
    if (due(this.clearIn)) this.roundCleared();
    if (due(this.shopIn)) {
      this.phase = 'shop';
      this.setMenuPause(true);
      this.shop.open(this.round);
    }
    if (due(this.nextRoundIn)) this.startRound(this.round + 1);
    if (due(this.respawnIn)) {
      this.wave++;
      this.spawnEnemy();
      this.hud.hideBanner();
    }
    if (due(this.downIn)) {
      if (this.mode === 'gauntlet') this.startRound(1);
      else {
        this.revivePlayer();
        this.phase = 'play';
        this.hud.hideBanner();
      }
    }
    for (const k of ['bannerIn', 'holdIn', 'clearIn', 'shopIn', 'nextRoundIn', 'respawnIn', 'downIn'] as const) {
      if (this[k] > 0) this[k] -= dt;
    }
  }

  private metaKey(code: string) {
    switch (code) {
      case 'Escape':
        if (this.phase !== 'shop') this.settings.toggle();
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
      case 'Enter':
      case 'NumpadEnter':
        if (this.tutorial && this.nextRoundIn < 0) this.finishTutorial();
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
    if (this.mode === 'gauntlet') this.updateGauntlet();

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
        this.sim.walkable.resolve(f.pos, 0.2);
      }
    }
    // Clear away knocked-out enemies after a while (kept for the round clear check).
    for (const [f, t] of this.koAt) if (this.sim.frame - t > 60 * 6 && this.phase !== 'play') this.detach(f);
  }

  private handleEvent(e: CombatEvent) {
    this.tutorial?.onEvent(e);
    switch (e.type) {
      case 'hit': {
        const m = e.move;
        const heavy = m.weight === 'heavy';
        const byPlayer = e.attacker.team === 'player';
        const big = e.attacker.scale > 1.3;
        this.hitstop = Math.max(
          this.hitstop,
          Math.round(m.hitstop * GAME_TUNING.hitstopMul * (e.counter ? 1.35 : 1) * (e.ko ? 1.8 : 1) * (e.armored ? 0.5 : 1) * (big ? 1.25 : 1)),
        );
        this.hitstopVictim = e.defender;
        this.camRig.addTrauma(m.shake * (e.counter ? 1.3 : 1) * (e.ko ? 1.6 : 1) * (big ? 1.6 : 1));
        if (heavy || e.counter || big) this.camRig.zoomPunch(1);
        this.sfx.hit(m.weight, e.counter);
        const col = e.armored ? '#ff9a3c' : e.counter ? '#ffd36b' : '#fff0c8';
        this.effects.flash(e.point, heavy ? 0.42 : 0.26, e.counter ? '#ffd36b' : '#fff3d6');
        this.effects.sparks(e.point, e.dir, heavy ? 22 : 12, col, heavy ? 6.5 : 4.5);
        const rd = this.ragdolls.get(e.defender);
        rd?.applyHit(e.zone, e.point, e.dir, m, (e.armored ? 0.4 : 1) * Math.min(1.8, e.attacker.scale / e.defender.scale));
        if (e.knockdown || e.ko) {
          const k = Math.min(1.6, e.attacker.scale / e.defender.scale);
          rd?.launch(e.dir.clone().multiplyScalar((m.knockback * 0.9 + (e.ko ? 1 : 0)) * k).add(new Vector3(0, 1.2 + (m.lift ?? 0) * 3, 0)));
          this.sfx.knockdown();
        }
        this.views.get(e.defender)?.hitFlash();
        this.bleed(e.defender, e.zone, m, e.damage, e.counter, e.dir);
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
        this.effects.dust(e.f.pos, 10, 0.5 * e.f.scale);
        break;
      default:
        break;
    }
  }

  /** Accumulate trauma and spill blood where it makes sense (mouth, nose, brow). */
  private bleed(f: Fighter, zone: HurtZone, m: MoveDef, damage: number, counter: boolean, dir: Vector3) {
    let t = this.trauma.get(f);
    if (!t) this.trauma.set(f, (t = new Trauma()));
    const view = this.views.get(f);
    for (const b of t.onHit(zone, m, damage, counter)) {
      if (!view) break;
      const at = view.facePoint(b.source);
      // Along the blow and up; a cough spills forward (toward the attacker) and down.
      const d = b.style === 'hit' ? dir.clone().setY(0.35) : dir.clone().negate().setY(-0.4);
      this.blood.spray(at, d, b.amount * f.scale, b.style === 'hit' ? 2.8 : 1.4);
    }
    view?.setTrauma(t.bruise, t.cut);
  }

  private onKO(f: Fighter) {
    this.sfx.ko();
    this.camRig.addTrauma(0.5 * f.scale);
    if (f === this.player) {
      this.slowmo = 1.5;
      this.phase = 'down';
      this.clearIn = this.holdIn = -1;
      if (this.mode === 'gauntlet') {
        const best = Math.max(this.save.bestRound, this.round - 1);
        this.save.bestRound = best;
        writeSave(this.save);
        this.banner('DEFEATED', `fell in round ${this.round} · best ${best} · back to round 1`, 'down', 3.4);
      } else {
        this.banner('DOWN', 'get up', 'down', 3.2);
      }
      this.downIn = 3.4;
      return;
    }
    this.koAt.set(f, this.sim.frame);
    if (this.mode === 'training') {
      this.slowmo = 1.5;
      this.kos++;
      this.banner('K.O.', `round ${this.wave} clear`, '', 3.2);
      this.respawnIn = 3.2;
      return;
    }
    // Coins burst out; slow-mo only for the last enemy of a round.
    const kind = this.enemyKind.get(f) ?? 'brawler';
    const at = this.ragdolls.get(f)?.pelvisPos() ?? f.pos.clone();
    this.coins.burst(at, coinDrop(kind, this.sim.rng, this.round));
    if (this.enemies.every((e) => !e.alive)) this.slowmo = 1.2;
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
        this.effects.ring(e.pos, 0.85 * e.scale, e.move.armor ? '#ff7a20' : '#ff3828', (e.move.startup / 60) * 1.1, () => e.pos);
      }
    }

    this.effects.update(simDt, realDt);
    this.blood.update(simDt);
    if (simDt > 0) {
      for (const [f, t] of this.trauma) {
        if (!t.drip(simDt, this.fxRng)) continue;
        const view = this.views.get(f);
        if (view) this.blood.drip(view.facePoint(t.cut && Math.random() < 0.4 ? 'brow' : 'mouth'));
      }
    }
    const got = this.coins.update(simDt, this.player.pos);
    if (got > 0) {
      this.save.coins += got;
      this.hud.setCoins(this.save.coins);
      this.sfx.coin();
      writeSave(this.save);
    }
    this.themeView?.update(this.time);

    // Camera: frame the nearest fight, look ahead while moving freely.
    const p = this.player;
    const t = p.target && p.target.alive && p.distanceTo(p.target) < 9 ? p.target : null;
    const focus = p.pos.clone();
    let spread = 0;
    this.lookAhead.lerp(t ? new Vector3() : new Vector3(p.walkVel.x, 0, p.walkVel.z).multiplyScalar(0.35), 1 - Math.exp(-realDt * 3));
    if (t) {
      focus.lerp(t.pos, CAMERA_TUNING.focusMix);
      spread = p.distanceTo(t) + (t.scale - 1) * 2.2;
    }
    focus.add(this.lookAhead);
    focus.y = 0.9 + (t ? (t.scale - 1) * 0.5 : 0);
    this.camRig.zoom = this.slowmo > 0 ? 1.12 : 1;
    this.camRig.update(realDt, focus, spread);
    const cutFocus = p.pos.clone();
    if (t) cutFocus.lerp(t.pos, 0.5);
    cutFocus.y = 1;
    updateCutout(this.camRig.camera, cutFocus, 0.3 + Math.min(0.25, spread * 0.06), this.renderer.domElement.width / this.renderer.domElement.height);

    if (this.tutorial) {
      const head = new Vector3(p.pos.x, 2.25, p.pos.z);
      this.hud.prompt(this.tutorial.prompt(this.input.bindings), head, this.camRig.camera);
    }

    this.updateDebug();
    const shown = t ?? (this.phase === 'play' ? this.enemies.find((e) => e.alive) ?? null : null);
    this.hud.update(realDt, p, shown, this.label());
    this.renderer.render(this.scene, this.camRig.camera);
  }

  private label(): string {
    if (this.mode === 'training') return `TRAINING · ROUND ${this.wave}${this.kos ? `  ·  ${this.kos} KO` : ''}`;
    if (this.tutorial || this.round === 0) return 'WARM-UP';
    const best = this.save.bestRound > 0 ? `  ·  BEST ${this.save.bestRound}` : '';
    return `ROUND ${this.round}  ·  ${this.theme.name.toUpperCase()}${best}`;
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
      for (const b of BONES) use(this.debugMats.target, f.rig[b].pos, 0.018 * f.scale);
      if (f.move && f.inActiveFrames()) use(this.debugMats.strike, strikePoint(f, f.move, new Vector3()), (f.move.radius + f.stats.reach) * f.scale);
    }
    for (; i < this.debugPool.length; i++) this.debugPool[i].visible = false;
  }
}
