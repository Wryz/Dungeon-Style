import { Vector3 } from 'three';
import { Animator, type TrackKey } from '../body/animator';
import { getPose, GUARD, type PoseName } from '../body/poses';
import {
  ANKLE_HEIGHT,
  forwardKinematics,
  makePose,
  makeRig,
  type PoseSpec,
  resolvePose,
  type Rig,
} from '../body/skeleton';
import { clamp, type Ease } from './math';
import { DEFENSES, type DefenseDef, type DefenseKind, markerFrame, type MoveDef } from './moves';

export type FighterState =
  | 'idle'
  | 'walk'
  | 'attack'
  | 'defend'
  | 'hitstun'
  | 'blockstun'
  | 'guardbreak'
  | 'knockdown'
  | 'getup'
  | 'ko';

export type Button = 'punch' | 'kick';
export type Team = 'player' | 'enemy';

export interface FighterStats {
  maxHp: number;
  maxGuard: number;
  maxPoise: number;
  damageMul: number;
  /** Fraction of incoming damage ignored. */
  defense: number;
  /** Fraction of incoming poise damage ignored. */
  staggerResist: number;
  /** Added to strike radius / reach (fist cuffs). */
  reach: number;
  knockbackMul: number;
  walkSpeed: number;
}

export const DEFAULT_STATS: FighterStats = {
  maxHp: 100,
  maxGuard: 100,
  maxPoise: 100,
  damageMul: 1,
  defense: 0,
  staggerResist: 0,
  reach: 0,
  knockbackMul: 1,
  walkSpeed: 2.6,
};

export interface ActiveDefense {
  def: DefenseDef;
  /** Attack instance this defense is answering. */
  threatSerial: number;
  phase: 'startup' | 'active' | 'recovery';
  /** The attack actually reached us and was evaded / blocked. */
  success: boolean;
  side: 1 | -1;
}

export interface Counter {
  kind: DefenseKind;
  frames: number;
}

export const GETUP_FRAMES = 40;
export const KNOCKDOWN_FRAMES = 70;

let nextId = 1;

export class Fighter {
  readonly id = nextId++;
  readonly pos = new Vector3();
  /** Knockback / slide velocity on the ground plane (m/s). */
  readonly vel = new Vector3();
  /** Desired walk direction in world space (length 0..1). Set by input or AI. */
  readonly moveInput = new Vector3();
  yaw = 0;

  hp: number;
  guard: number;
  poise: number;

  state: FighterState = 'idle';
  stateFrame = 0;
  stunFrames = 0;

  move: MoveDef | null = null;
  attackSerial = 0;
  hitThisAttack = false;
  /** The attack was a counter (thrown from a counter window). */
  isCounterAttack = false;

  defense: ActiveDefense | null = null;
  counter: Counter | null = null;
  lastDefendedSerial = -1;
  defenseCooldown: Record<DefenseKind, number> = { block: 0, duck: 0, weave: 0, slide: 0 };
  weaveSide: 1 | -1 = 1;

  buffer: { button: Button; frames: number } | null = null;
  target: Fighter | null = null;
  combo = 0;
  framesSinceBlock = 999;
  framesSinceHit = 999;
  hitReaction: PoseName = 'hitHigh';

  /** Player gets automatic defense; enemies defend through their AI. */
  autoDefense: boolean;
  stats: FighterStats;

  readonly anim = new Animator();
  /** World-space joint transforms of the current target pose. */
  readonly rig: Rig = makeRig();
  private walkPhase = 0;
  private readonly locoPose = makePose();
  private breath = Math.random() * 10;

  constructor(
    readonly team: Team,
    readonly name: string,
    readonly moves: Record<string, MoveDef>,
    stats: Partial<FighterStats> = {},
  ) {
    this.stats = { ...DEFAULT_STATS, ...stats };
    this.hp = this.stats.maxHp;
    this.guard = this.stats.maxGuard;
    this.poise = this.stats.maxPoise;
    this.autoDefense = team === 'player';
    this.anim.procedural(1);
  }

  get alive() {
    return this.state !== 'ko';
  }

  /** Can act freely (walk / start an attack / start a defense). */
  get free() {
    return this.state === 'idle' || this.state === 'walk';
  }

  get forward(): Vector3 {
    return new Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  /** Frames remaining until the current attack becomes active (negative once active). */
  get framesToActive(): number {
    return this.move ? this.move.startup - this.stateFrame : Infinity;
  }

  inActiveFrames(): boolean {
    if (this.state !== 'attack' || !this.move) return false;
    const f = this.stateFrame;
    return f >= this.move.startup && f < this.move.startup + this.move.active;
  }

  inCancelWindow(): boolean {
    const m = this.move;
    if (this.state !== 'attack' || !m?.cancel) return false;
    return this.stateFrame >= m.cancel.from && this.stateFrame <= m.cancel.to;
  }

  distanceTo(o: Fighter): number {
    return Math.hypot(o.pos.x - this.pos.x, o.pos.z - this.pos.z);
  }

  press(button: Button, frames = 12) {
    this.buffer = { button, frames };
  }

  // ---------------------------------------------------------------------------
  // State transitions
  // ---------------------------------------------------------------------------

  setState(s: FighterState) {
    this.state = s;
    this.stateFrame = 0;
    if (s !== 'attack') this.move = null;
    if (s !== 'defend') this.defense = null;
  }

  startMove(move: MoveDef, isCounter = false) {
    this.setState('attack');
    this.move = move;
    this.attackSerial++;
    this.hitThisAttack = false;
    this.isCounterAttack = isCounter;
    this.counter = null;
    this.buffer = null;
    this.anim.play(moveKeys(move));
  }

  startDefense(kind: DefenseKind, threatSerial: number) {
    const def = DEFENSES[kind];
    this.setState('defend');
    if (kind === 'weave') this.weaveSide = this.weaveSide === 1 ? -1 : 1;
    this.defense = { def, threatSerial, phase: 'startup', success: false, side: this.weaveSide };
    this.lastDefendedSerial = threatSerial;
    this.defenseCooldown[kind] = def.cooldown;
    this.anim.play([{ f: def.startup, pose: getPose(defensePose(kind, this.weaveSide)), ease: 'out' }]);
  }

  enterDefenseRecovery() {
    if (!this.defense) return;
    this.defense.phase = 'recovery';
    this.stateFrame = 0;
    this.anim.play([{ f: this.defense.def.recovery, pose: getPose('guard'), ease: 'inOut' }]);
  }

  enterHitstun(frames: number, reaction: PoseName) {
    this.setState('hitstun');
    this.stunFrames = frames;
    this.hitReaction = reaction;
    this.anim.play([
      { f: 2, pose: getPose(reaction), ease: 'out' },
      { f: Math.max(3, Math.floor(frames * 0.55)), pose: getPose(reaction) },
      { f: frames, pose: getPose('guard'), ease: 'inOut' },
    ]);
  }

  enterBlockstun(frames: number) {
    this.setState('blockstun');
    this.stunFrames = frames;
    this.anim.play([
      { f: 2, pose: getPose('block'), ease: 'out' },
      { f: Math.max(3, frames - 3), pose: getPose('block') },
      { f: frames + 4, pose: getPose('guard'), ease: 'inOut' },
    ]);
  }

  enterGuardBreak(frames: number) {
    this.setState('guardbreak');
    this.stunFrames = frames;
    this.anim.play([
      { f: 4, pose: getPose('guardBreak'), ease: 'out' },
      { f: Math.floor(frames * 0.7), pose: getPose('guardBreak') },
      { f: frames, pose: getPose('guard'), ease: 'inOut' },
    ]);
  }

  enterKnockdown() {
    this.setState('knockdown');
    this.stunFrames = KNOCKDOWN_FRAMES;
    this.anim.play([{ f: 6, pose: getPose('limp'), ease: 'out' }]);
  }

  enterGetup() {
    this.setState('getup');
    this.stunFrames = GETUP_FRAMES;
    this.poise = this.stats.maxPoise;
    this.anim.play([
      { f: 1, pose: getPose('kneel') },
      { f: Math.floor(GETUP_FRAMES * 0.55), pose: getPose('kneel') },
      { f: GETUP_FRAMES, pose: getPose('guard'), ease: 'inOut' },
    ]);
  }

  enterKO() {
    this.setState('ko');
    this.anim.play([{ f: 6, pose: getPose('limp'), ease: 'out' }]);
  }

  enterLocomotion(fade = 6) {
    this.setState('idle');
    this.anim.procedural(fade);
  }

  // ---------------------------------------------------------------------------
  // Animation
  // ---------------------------------------------------------------------------

  /** Updates the animated target pose and its world-space FK. */
  updatePose(speed: number, localDirX: number, localDirZ: number) {
    let proc;
    if (this.anim.isProcedural) {
      proc = this.locomotionPose(speed, localDirX, localDirZ);
    }
    this.anim.update(this.stateFrame, proc);
    forwardKinematics(this.anim.out, this.rig, this.pos, this.yaw);
  }

  private locomotionPose(speed: number, dx: number, dz: number) {
    this.breath += 1 / 60;
    const moving = clamp(speed / Math.max(0.1, this.stats.walkSpeed), 0, 1);
    this.walkPhase += speed * (1 / 60) * 7.5;
    const ph = this.walkPhase;
    const stride = 0.13 * moving;
    const lift = 0.07 * moving;
    const g = GUARD;
    const bob = Math.sin(this.breath * 2.2) * 0.008 - Math.abs(Math.sin(ph)) * 0.025 * moving;
    const sL = Math.sin(ph);
    const sR = Math.sin(ph + Math.PI);
    const spec: PoseSpec = {
      ...g,
      root: [dx * 0.03 * moving, 0.9 + bob, dz * 0.03 * moving],
      chest: [0.06 + Math.sin(this.breath * 2.2) * 0.012, -0.1 + Math.sin(ph) * 0.05 * moving, 0],
      footL: {
        at: [0.13 + dx * stride * sL, ANKLE_HEIGHT + Math.max(0, Math.cos(ph)) * lift, 0.27 + dz * stride * sL],
      },
      footR: {
        at: [-0.15 + dx * stride * sR, ANKLE_HEIGHT + Math.max(0, -Math.cos(ph)) * lift, -0.24 + dz * stride * sR],
      },
      handL: { at: [0.07, 1.47 + bob * 0.6, 0.33], hint: [0.5, -1, 0] },
      handR: { at: [-0.1, 1.44 + bob * 0.6, 0.2], hint: [-0.5, -1, 0] },
    };
    return resolvePose(spec, this.locoPose);
  }
}

export function defensePose(kind: DefenseKind, side: 1 | -1): PoseName {
  switch (kind) {
    case 'block':
      return 'block';
    case 'duck':
      return 'duck';
    case 'weave':
      return side === 1 ? 'weaveL' : 'weaveR';
    case 'slide':
      return 'slide';
  }
}

export function moveKeys(m: MoveDef): TrackKey[] {
  return m.keys.map((k) => ({ f: Math.round(markerFrame(m, k.at)), pose: getPose(k.pose), ease: k.ease as Ease | undefined }));
}
