import { Vector3 } from 'three';
import { Animator, type TrackKey } from '../body/animator';
import { Footwork, type FootworkStyle } from '../body/footwork';
import { IdleBehavior, type IdleStyle } from '../body/idle';
import { makeProfile, type MotionMods, type MotionProfile, smoothProfile, targetProfile, type Zone, ZONE_RANGES } from '../body/motion';
import { getPose, GUARD, POSE_SPECS, type PoseName } from '../body/poses';
import {
  forwardKinematics,
  blendPose,
  copyPose,
  makePose,
  makeRig,
  type PoseSpec,
  resolvePose,
  type Rig,
  solveLegs,
} from '../body/skeleton';

export interface FighterStyle {
  footwork: FootworkStyle;
  idle: IdleStyle;
}

/** Light on the feet: quick low steps, bouncy rhythm, frequent feints. */
export const OUTFIGHTER_STYLE: FighterStyle = {
  footwork: { stanceWidth: 1, stepFrames: 9, stepHeight: 0.045 },
  idle: {
    bounceHz: 1.9,
    bounceAmp: 0.03,
    swayAmp: 0.055,
    feintEvery: [1.1, 2.4],
    feintWeights: { jab: 4, shoulder: 3, level: 2, step: 2 },
    shuffleEvery: [0.6, 1.4],
    pawEvery: [0.7, 1.6],
    shoulderRoll: 0,
  },
};
import { clamp, type Ease, Rng } from './math';
import { type Aim, DEFENSES, type DefenseDef, type DefenseKind, type Height, markerFrame, type MoveDef } from './moves';

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

/** Attack inputs: left/right punch, left/right kick. */
export type Button = 'lpunch' | 'rpunch' | 'lkick' | 'rkick';
export const BUTTONS: Button[] = ['lpunch', 'rpunch', 'lkick', 'rkick'];
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
  /** Actual footwork velocity (m/s): walking, or momentum carried into a move. */
  readonly walkVel = new Vector3();
  yaw = 0;
  /** Uniform size (giant bosses ~1.7, imps ~0.75). Poses are authored at 1. */
  scale = 1;

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
  /** Target chosen for the current attack, and the height class it lands at. */
  aim: Aim | null = null;
  strikeHeight: Height = 'high';

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
  framesSinceLanded = 999;
  /** Squared up to a target (soft lock-on, with hysteresis; maintained by the sim). */
  lockedOn = false;
  /** Health never drops below this (sparring partners can't be knocked out). */
  minHp = 0;
  hitReaction: PoseName = 'hitHigh';

  /** Player gets automatic defense; enemies defend through their AI. */
  autoDefense: boolean;
  stats: FighterStats;

  readonly anim = new Animator();
  /** Final animated target pose (what hit detection and the ragdoll follow). */
  readonly pose = makePose();
  /** World-space joint transforms of `pose`. */
  readonly rig: Rig = makeRig();
  /** 0 = planted, 1 = stepping at full walk speed. Smoothed. */
  private moveBlend = 0;
  private readonly locoPose = makePose();
  private readonly layered = makePose();
  private breath = 0;
  readonly footwork: Footwork;
  readonly idle: IdleBehavior;
  /** Live, context-blended movement profile (see body/motion.ts). */
  readonly motion: MotionProfile = makeProfile();
  private readonly motionTarget: MotionProfile = makeProfile();
  /** Human-readable snapshot of the current motion context (debug panel). */
  readonly motionInfo = { zone: '', context: '', speed: 0, stride: 0, bounce: 0, guard: 0 };
  private readonly rng: Rng;

  constructor(
    readonly team: Team,
    public name: string,
    readonly moves: Record<string, MoveDef>,
    stats: Partial<FighterStats> = {},
    style: FighterStyle = OUTFIGHTER_STYLE,
  ) {
    this.stats = { ...DEFAULT_STATS, ...stats };
    this.rng = new Rng(this.id * 7919 + 13);
    this.footwork = new Footwork({ ...style.footwork });
    this.idle = new IdleBehavior({ ...style.idle }, this.rng);
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

  /** @param aimId force a specific aim (tests, scripted moves); otherwise one is picked. */
  startMove(move: MoveDef, isCounter = false, aimId?: string) {
    this.setState('attack');
    this.move = move;
    this.attackSerial++;
    this.hitThisAttack = false;
    this.isCounterAttack = isCounter;
    this.counter = null;
    this.buffer = null;
    this.idle.interrupt();
    this.aim = this.pickAim(move, aimId);
    this.strikeHeight = this.aim?.height ?? move.height;
    // Natural scatter: no two strikes land on exactly the same spot.
    const jitter: [number, number, number] = aimId ? [0, 0, 0] : [this.rng.range(-0.04, 0.04), this.rng.range(-0.035, 0.035), 0];
    this.anim.play(moveKeys(move, this.aim, jitter));
  }

  private pickAim(move: MoveDef, aimId?: string): Aim | null {
    const aims = move.aims;
    if (!aims?.length) return null;
    if (aimId) return aims.find((a) => a.id === aimId) ?? aims[0];
    // Against a covered-up opponent, go around the guard: favour body / leg targets.
    const t = this.target;
    const covering = !!t && (t.state === 'blockstun' || (t.state === 'defend' && t.defense?.def.kind === 'block'));
    return this.rng.pickWeighted(aims.map((a) => [a, a.weight * (covering && (a.height === 'mid' || a.height === 'low') ? 3 : 1)]));
  }

  startDefense(kind: DefenseKind, threatSerial: number) {
    const def = DEFENSES[kind];
    this.setState('defend');
    if (kind === 'weave') this.weaveSide = this.weaveSide === 1 ? -1 : 1;
    this.defense = { def, threatSerial, phase: 'startup', success: false, side: this.weaveSide };
    this.lastDefendedSerial = threatSerial;
    this.defenseCooldown[kind] = def.cooldown;
    this.idle.interrupt();
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

  /**
   * Updates the animated target pose and its world-space FK.
   * `speed`/`localDir*` describe the actual footwork velocity; `turnRate` (rad/frame)
   * is used to keep stepping while pivoting.
   */
  updatePose(speed: number, localDirX: number, localDirZ: number, turnRate = 0) {
    this.breath += 1 / 60;
    const speedFrac = clamp(speed / Math.max(0.1, this.stats.walkSpeed), 0, 1);
    const want = clamp((speed + Math.abs(turnRate) * 20) / Math.max(0.1, this.stats.walkSpeed * 0.6), 0, 1);
    this.moveBlend += (want - this.moveBlend) * 0.25;

    const t = this.target && this.target.alive ? this.target : null;
    const dist = t ? this.distanceTo(t) : Infinity;
    this.updateMotion(t, dist);
    const engaged = dist < 3.2;
    const still = this.state === 'idle' && speed < 0.25;
    this.idle.tick(engaged, still);

    const handStrike = this.state === 'attack' && this.move?.layer === 'upper';
    const driven = this.anim.isProcedural || (handStrike && this.moveBlend > 0.25);
    const [offX, offZ] = this.anim.isProcedural ? this.idle.stanceOffset() : [0, 0];
    if (driven) this.footwork.update(this, offX, offZ, localDirX, localDirZ, speedFrac);

    let proc;
    if (this.anim.isProcedural) proc = this.locomotionPose(localDirX, localDirZ, offX, offZ);
    this.anim.update(this.stateFrame, proc);
    copyPose(this.anim.out, this.pose);

    // Hand strikes thrown on the move: keep the legs stepping under the punching torso.
    if (handStrike && driven) {
      const L = this.layered;
      copyPose(this.anim.out, L);
      const [wx, wz] = this.footwork.weightShift(this, 0, 0);
      L.root.x = this.anim.out.root.x + wx * 0.5;
      L.root.z = this.anim.out.root.z + wz * 0.5;
      solveLegs(L, { at: this.footwork.localTarget('L', this, 0), hint: KNEE_HINT.L }, { at: this.footwork.localTarget('R', this, 0), hint: KNEE_HINT.R });
      blendPose(this.anim.out, L, this.moveBlend, this.pose);
    }
    forwardKinematics(this.pose, this.rig, this.pos, this.yaw, this.scale);
    // Authored-leg animations (kicks, defense, reactions): feet are wherever the pose put them.
    if (!driven) this.footwork.syncToRig(this.rig);
  }

  /** Re-evaluates the fight context and eases the movement profile toward it. */
  private updateMotion(t: Fighter | null, dist: number) {
    const threat =
      !!t && t.state === 'attack' && !!t.move && t.stateFrame < t.move.startup + t.move.active && dist <= t.move.reach + 0.5;
    const { weights, mods } = targetProfile(
      {
        // Locked on, you never break into a run: fighting footwork whatever the range.
        dist: this.lockedOn ? Math.min(dist, ZONE_RANGES.outside) : dist,
        hpFrac: this.hp / this.stats.maxHp,
        guardFrac: this.guard / this.stats.maxGuard,
        framesSinceHit: this.framesSinceHit,
        threat,
        opponentDown: !!this.target && (this.target.state === 'knockdown' || this.target.state === 'getup'),
        pressing: !!t && (t.hp / t.stats.maxHp < 0.4 || t.state === 'hitstun' || this.framesSinceLanded < 60),
      },
      this.motionTarget,
    );
    // Threats are reacted to quickly; everything else drifts in over ~a second.
    smoothProfile(this.motion, this.motionTarget, threat ? 0.25 : 0.06);
    const M = this.motion;
    Object.assign(this.footwork.mods, { stance: M.stance, stepFrames: M.stepFrames, stepHeight: M.stepHeight, stride: M.stride, gait: M.gait });
    Object.assign(this.idle.mods, { bounce: M.bounce, bounceHz: M.bounceHz, sway: M.sway, head: M.head, feints: M.feints, paws: M.paws });

    const info = this.motionInfo;
    info.zone = (Object.entries(weights) as [Zone, number][])
      .filter(([, w]) => w > 0.05)
      .sort((a, b) => b[1] - a[1])
      .map(([z, w]) => `${z} ${Math.round(w * 100)}%`)
      .join(' / ');
    info.context = (Object.entries(mods) as [MotionMods, number][])
      .filter(([, v]) => v > 0.05)
      .map(([k, v]) => (v > 0.95 ? k : `${k} ${Math.round(v * 100)}%`))
      .join(', ') || 'neutral';
    info.speed = +M.speed.toFixed(2);
    info.stride = +M.stride.toFixed(2);
    info.bounce = +M.bounce.toFixed(2);
    info.guard = +M.guardY.toFixed(3);
  }

  private locomotionPose(dx: number, dz: number, offX: number, offZ: number) {
    const m = this.moveBlend;
    const M = this.motion;
    // 0 = fighting stance, 1 = walking like a person (square hips, arm swing, hands down).
    const g = M.gait;
    const f = 1 - g;
    const raise = this.idle.toeRaise() * (1 - m) * f;
    const [wx, wz] = this.footwork.weightShift(this, offX, offZ);
    // Lean into forward/lateral travel; when retreating keep the head over the lead knee
    // (never lean away from the opponent) and bring the hands up a touch.
    const fwd = Math.max(0, dz);
    const back = Math.max(0, -dz) * f;
    const footL = this.footwork.localTarget('L', this, raise);
    const footR = this.footwork.localTarget('R', this, raise);
    // Walking arm swing: each hand swings with the opposite foot.
    const swing = Math.max(-0.35, Math.min(0.35, footR[2] - footL[2])) * g;
    // Running: elbows locked near 90°, arms pumping hard from the shoulder.
    const run = this.footwork.run * g;
    const pump = Math.max(-1, Math.min(1, (footR[2] - footL[2]) / 0.55));
    const guardL = guardHand(GUARD.handL!, M.guardY + back * 0.02 * m, M.guardZ);
    const guardR = guardHand(GUARD.handR!, M.guardY + back * 0.02 * m, M.guardZ * 0.6);
    const lerp3 = (a: V3, b: V3, k: number): V3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
    const runHand = (side: 1 | -1): V3 => {
      const th = 0.32 + 0.68 * pump * side;
      return [side * (0.2 - 0.07 * Math.max(0, pump * side)), 1.4 - 0.39 * Math.cos(th), 0.17 + 0.39 * Math.sin(th)];
    };
    const relaxedL = lerp3([0.21, 0.94 + Math.max(0, swing) * 0.15, 0.03 + swing * 0.55], runHand(1), run);
    const relaxedR = lerp3([-0.21, 0.94 + Math.max(0, -swing) * 0.15, 0.03 - swing * 0.55], runHand(-1), run);
    const hintL = lerp3([0.2, -0.25, -1], [0.3, -0.35, -1], run);
    const hintR = lerp3([-0.2, -0.25, -1], [-0.3, -0.35, -1], run);
    // Running bob: lowest as the body passes over the planted foot, highest in flight.
    let compress = 0;
    for (const [foot, at] of [[this.footwork.L, footL], [this.footwork.R, footR]] as const) {
      if (!foot.stepping) compress = Math.max(compress, 1 - Math.min(1, Math.abs(at[2] - 0.03) / 0.35));
    }
    const bob = run * (0.022 - 0.05 * compress);
    const mix = (a: V3, b: V3): V3 => [a[0] * f + b[0] * g, a[1] * f + b[1] * g, a[2] * f + b[2] * g];
    const kneeR = mix(KNEE_HINT.R, [-0.15, 0, 1]);
    const spec: PoseSpec = {
      ...GUARD,
      // Hips ride over the support foot; walking stands a little taller.
      root: [wx * 0.6 + dx * 0.03 * m, 0.86 + M.crouch + 0.03 * g - 0.012 * m - 0.04 * run + bob, 0.01 + wz * 0.6 + fwd * 0.03 * m],
      // Bladed stance → square hips when walking; the chest counter-rotates with the arm swing.
      pelvis: [0, -0.3 * f + swing * 0.25 * (1 - run) + pump * 0.16 * run, 0],
      // Running leans the whole body into the stride.
      abdomen: [(0.1 + M.lean) * f + 0.04 * g + 0.13 * run + fwd * 0.05 * m + back * 0.03 * m, 0, -dx * 0.05 * m * f],
      chest: [0.08 * f + 0.02 * g + 0.04 * run + Math.sin(this.breath * 2.2) * 0.01, -0.1 * f - swing * 0.45 * (1 - run) - pump * 0.3 * run, 0],
      head: [-0.04 * f - 0.15 * run, 0.4 * f, 0],
      handL: { at: mix(guardL.at, relaxedL), hint: mix(guardL.hint ?? [0.35, -1, 0], hintL) },
      handR: { at: mix(guardR.at, relaxedR), hint: mix(guardR.hint ?? [-0.35, -1, 0], hintR) },
      footL: { at: footL, hint: KNEE_HINT.L },
      footR: { at: footR, hint: kneeR },
    };
    this.idle.apply(spec, (1 - m * 0.7) * f);
    return resolvePose(spec, this.locoPose);
  }
}

const guardHand = (h: { at: [number, number, number]; hint?: [number, number, number] }, dy: number, dz: number) => ({
  at: [h.at[0], h.at[1] + dy, h.at[2] + dz] as [number, number, number],
  hint: h.hint,
});

/** Knees track over the toes: lead foot points slightly in, rear foot turned out. */
export const KNEE_HINT: Record<'L' | 'R', [number, number, number]> = {
  L: [0.15, 0, 1],
  R: [-0.55, 0, 0.85],
};

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

type V3 = [number, number, number];
const addV = (a: V3 | undefined, b: V3 | undefined): V3 | undefined =>
  b ? [(a?.[0] ?? 0) + b[0], (a?.[1] ?? 0) + b[1], (a?.[2] ?? 0) + b[2]] : a;

/** Key poses for one throw of a move; active-phase poses are re-aimed at the chosen target. */
export function moveKeys(m: MoveDef, aim: Aim | null = null, jitter: V3 = [0, 0, 0]): TrackKey[] {
  const scatter = jitter[0] !== 0 || jitter[1] !== 0 || jitter[2] !== 0;
  return m.keys.map((k) => {
    let pose = getPose(k.pose);
    if (k.at[0] === 'a' && (aim?.offset || aim?.add || scatter)) {
      const spec: PoseSpec = { ...POSE_SPECS[k.pose] };
      const limb = spec[m.limb];
      if (limb) spec[m.limb] = { at: addV(addV(limb.at, aim?.offset), jitter)!, hint: limb.hint };
      for (const part of ['root', 'pelvis', 'abdomen', 'chest', 'head'] as const) {
        const d = aim?.add?.[part];
        if (d) spec[part] = addV(spec[part], d);
      }
      pose = resolvePose(spec);
    }
    return { f: Math.round(markerFrame(m, k.at)), pose, ease: k.ease as Ease | undefined };
  });
}
