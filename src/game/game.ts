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
import { CameraRig } from '../render/cameraRig';
import { Effects } from '../render/particles';
import { BRAWLER_PALETTE, FighterView, PLAYER_PALETTE, type Palette } from '../render/fighterView';
import { DEFAULT_AI, type AIConfig } from '../sim/ai';
import { type CombatEvent, CombatSim, hurtSpheres, strikePoint } from '../sim/combat';
import type { Fighter } from '../sim/fighter';
import { DT } from '../sim/math';
import { createBrawler, createPlayer } from '../sim/roster';
import { Hud } from '../ui/hud';
import { SettingsMenu } from '../ui/settings';

export const GAME_TUNING = {
  timeScale: 1,
  paused: false,
  hitstopMul: 1,
  showHitboxes: false,
  volume: 0.7,
};

const TIME_SCALES = [1, 0.5, 0.25, 0.1];

export class Game {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camRig = new CameraRig();
  readonly arena: Arena;
  readonly effects: Effects;
  readonly sfx = new Sfx();
  readonly input: Input;
  readonly hud: Hud;
  readonly settings: SettingsMenu;
  private pausedBySettings = false;
  readonly world: RAPIER.World;
  readonly sim: CombatSim;
  readonly aiCfg: AIConfig = { ...DEFAULT_AI };
  readonly player: Fighter;
  enemy: Fighter | null = null;

  private readonly views = new Map<Fighter, FighterView>();
  private readonly ragdolls = new Map<Fighter, Ragdoll>();
  private hitstop = 0;
  private hitstopVictim: Fighter | null = null;
  private accum = 0;
  private stepOnce = false;
  private slowmo = 0;
  private respawnIn = -1;
  private playerDownIn = -1;
  private attacksThrown = 0;
  private lastEnemySerial = -1;
  private time = 0;
  wave = 1;
  kos = 0;
  /** Exposed for the debug panel and automated capture scripts. */
  readonly tuning = GAME_TUNING;
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
    this.arena = new Arena(this.scene);
    this.effects = new Effects(this.scene);
    this.scene.add(this.debugGroup);

    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = DT;
    this.buildColliders();

    this.sim = new CombatSim((Date.now() & 0xffff) + 1);
    this.sim.externalKnockdown = true;
    const { halfX, halfZ } = this.arena.size;
    this.sim.bounds = { minX: -halfX + 0.5, maxX: halfX - 0.5, minZ: -halfZ + 0.5, maxZ: halfZ - 0.5 };

    this.player = createPlayer();
    this.player.pos.set(-1.8, 0, 0.3);
    this.player.yaw = Math.PI / 2;
    this.sim.add(this.player);
    this.attach(this.player, PLAYER_PALETTE);
    this.spawnEnemy(true);
    this.camRig.snap(new Vector3(0, 0.9, 0.3));

    this.input = new Input(canvas);
    this.input.onAnyInput = () => this.sfx.unlock();
    this.hud = new Hud(hudRoot);
    this.hud.setBindings(this.input.bindings);
    this.settings = new SettingsMenu(document.body, this.input);
    this.settings.onChange = (b) => this.hud.setBindings(b);
    this.settings.onOpenChange = (open) => {
      // Pause while the menu is open (unless already paused for tuning).
      if (open && !GAME_TUNING.paused) {
        GAME_TUNING.paused = true;
        this.pausedBySettings = true;
      } else if (!open && this.pausedBySettings) {
        GAME_TUNING.paused = false;
        this.pausedBySettings = false;
      }
    };
    this.hud.gearButton.addEventListener('click', () => this.settings.toggle());

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  private buildColliders() {
    const env = groups(GROUP_ENV, 0xffff);
    const ground = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(40, 0.5, 40).setTranslation(0, -0.5, 0).setFriction(0.9).setCollisionGroups(env), ground);
    const { halfX, halfZ } = this.arena.size;
    const wall = (x: number, z: number, hx: number, hz: number) =>
      this.world.createCollider(RAPIER.ColliderDesc.cuboid(hx, 2, hz).setTranslation(x, 2, z).setCollisionGroups(env), ground);
    wall(0, -halfZ - 0.45, halfX + 1, 0.2);
    wall(0, halfZ + 0.45, halfX + 1, 0.2);
    wall(-halfX - 0.45, 0, 0.2, halfZ + 1);
    wall(halfX + 0.45, 0, 0.2, halfZ + 1);
  }

  private attach(f: Fighter, palette: Palette) {
    const view = new FighterView(palette);
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
  }

  spawnEnemy(first = false) {
    if (this.enemy) this.detach(this.enemy);
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
    this.enemy = fighter;
    this.lastEnemySerial = -1;
    if (!first) {
      this.effects.ring(fighter.pos, 1.2, '#ff5040', 0.6);
      this.effects.dust(fighter.pos, 14, 0.6);
    }
  }

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

  restart() {
    this.wave = 1;
    this.kos = 0;
    this.respawnIn = -1;
    this.playerDownIn = -1;
    this.revivePlayer();
    this.spawnEnemy();
    this.hud.hideBanner();
  }

  /** Debug/capture helper: place both fighters `dist` apart facing each other, at rest. */
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

  // ---------------------------------------------------------------------------

  private frame(realDt: number) {
    this.time += realDt;
    const inp = this.input.poll();
    for (const k of inp.keys) this.metaKey(k);

    const fwd = this.camRig.groundForward;
    const right = this.camRig.groundRight;
    this.player.moveInput.set(
      right.x * inp.moveX + fwd.x * inp.moveY,
      0,
      right.z * inp.moveX + fwd.z * inp.moveY,
    );
    for (const b of inp.presses) {
      if (!this.player.alive || this.settings.isOpen) continue;
      this.player.press(b);
      if (++this.attacksThrown === 8) this.hud.fadeHint();
    }

    // Timers in real time.
    if (this.slowmo > 0) this.slowmo -= realDt;
    if (this.respawnIn > 0) {
      this.respawnIn -= realDt;
      if (this.respawnIn <= 0) {
        this.wave++;
        this.spawnEnemy();
        this.hud.hideBanner();
      }
    }
    if (this.playerDownIn > 0) {
      this.playerDownIn -= realDt;
      if (this.playerDownIn <= 0) this.restart();
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
        this.settings.toggle();
        break;
      case 'F1':
      case 'Backquote':
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
        this.restart();
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

    for (const [f, rd] of this.ragdolls) {
      rd.drive(f);
      rd.capturePrev();
    }
    this.world.step();
    for (const [f, rd] of this.ragdolls) {
      rd.captureCur();
      if (f.state === 'knockdown' || f.state === 'ko') {
        const p = rd.pelvisPos();
        const B = this.sim.bounds;
        f.pos.set(Math.min(B.maxX, Math.max(B.minX, p.x)), 0, Math.min(B.maxZ, Math.max(B.minZ, p.z)));
      }
    }
  }

  private handleEvent(e: CombatEvent) {
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
    this.slowmo = 1.5;
    this.sfx.ko();
    this.camRig.addTrauma(0.5);
    if (f === this.player) {
      this.hud.showBanner('DOWN', 'erasing memory...', 'down');
      this.playerDownIn = 3.2;
    } else {
      this.kos++;
      this.hud.showBanner('K.O.', `round ${this.wave} clear`);
      this.respawnIn = 3.2;
    }
  }

  // ---------------------------------------------------------------------------

  private render(realDt: number, simDt: number, alpha: number) {
    for (const [f, view] of this.views) {
      const rd = this.ragdolls.get(f);
      if (rd) view.syncFromRagdoll(rd, alpha);
      else view.syncFromRig(f);
      view.updateCues(realDt, f);
    }

    // Telegraph ring when the enemy starts winding up.
    const e = this.enemy;
    if (e && e.state === 'attack' && e.move && e.attackSerial !== this.lastEnemySerial) {
      this.lastEnemySerial = e.attackSerial;
      this.effects.ring(e.pos, 0.85, e.move.armor ? '#ff7a20' : '#ff3828', (e.move.startup / 60) * 1.1, () => e.pos);
    }

    this.effects.update(simDt, realDt);
    this.arena.update(this.time);

    const focus = this.player.pos.clone();
    let spread = 0;
    if (e && e.alive && this.player.distanceTo(e) < 9) {
      focus.lerp(e.pos, 0.5);
      spread = this.player.distanceTo(e);
    }
    focus.y = 0.9;
    this.camRig.zoom = this.slowmo > 0 ? 1.12 : 1;
    this.camRig.update(realDt, focus, spread);

    this.updateDebug();
    this.hud.update(realDt, this.player, e && (e.alive || this.respawnIn > 0) ? e : null, this.wave, this.kos);
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
