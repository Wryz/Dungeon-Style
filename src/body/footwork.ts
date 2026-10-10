import { Vector3 } from 'three';
import { ANKLE_HEIGHT, bonePoint, type Rig, SKELETON, type Side } from './skeleton';

export interface FootworkStyle {
  /** Scales the stance (distance between the feet). */
  stanceWidth: number;
  /** Frames per step at a standstill; steps get quicker at speed. */
  stepFrames: number;
  /** Peak foot lift (m). Boxers glide low. */
  stepHeight: number;
}

export interface Foot {
  side: Side;
  /** Planted ankle position on the ground (world, y = 0). */
  readonly pos: Vector3;
  readonly from: Vector3;
  readonly to: Vector3;
  stepping: boolean;
  /** Step progress 0..1. */
  t: number;
  dur: number;
  height: number;
}

interface Body {
  pos: Vector3;
  yaw: number;
  walkVel: Vector3;
}

/** Fighter-local stance home for each ankle (orthodox: left foot leads). */
const BASE_HOME: Record<Side, [number, number]> = { L: [0.13, 0.27], R: [-0.15, -0.24] };

const MOVING_THRESHOLD = 0.045;
const IDLE_THRESHOLD = 0.07;
/** Beyond this the foot steps regardless of footwork order (e.g. after being shoved). */
const FORCE_THRESHOLD = 0.45;
/** Beyond this the foot just snaps (teleports, respawns). */
const SNAP_THRESHOLD = 0.9;
/** Seconds the stance home leads the body while moving. */
const STEP_LEAD = 0.05;

const _home = new Vector3();
const _v = new Vector3();

function makeFoot(side: Side): Foot {
  return { side, pos: new Vector3(), from: new Vector3(), to: new Vector3(), stepping: false, t: 0, dur: 1, height: 0 };
}

export function toLocal(world: Vector3, body: Body, out: Vector3): Vector3 {
  const dx = world.x - body.pos.x;
  const dz = world.z - body.pos.z;
  const c = Math.cos(body.yaw);
  const s = Math.sin(body.yaw);
  // Inverse of the yaw rotation used by forwardKinematics.
  return out.set(dx * c - dz * s, world.y, dx * s + dz * c);
}

export function toWorld(lx: number, lz: number, body: Body, out: Vector3): Vector3 {
  const c = Math.cos(body.yaw);
  const s = Math.sin(body.yaw);
  return out.set(body.pos.x + lx * c + lz * s, 0, body.pos.z - lx * s + lz * c);
}

/**
 * Procedural boxing footwork. Feet stay planted in the world and take discrete steps
 * toward stance "homes" that travel with the body:
 * - moving forward the lead foot steps first, backward the rear foot, sideways the foot
 *   on that side — the other foot follows (step-and-drag), so the feet never cross;
 * - turning on the spot becomes pivot steps;
 * - the hips shift over the planted foot during each step (weight transfer).
 */
export class Footwork {
  readonly L = makeFoot('L');
  readonly R = makeFoot('R');
  /** Total steps taken (useful for tests / debugging). */
  steps = 0;
  firstStepper: Side | null = null;
  private lastStepper: Side | null = null;
  /** Live multipliers from the contextual motion profile. */
  readonly mods = { stance: 1, stepFrames: 1, stepHeight: 1, stride: 1 };
  private initialized = false;

  constructor(public style: FootworkStyle) {}

  foot(side: Side) {
    return side === 'L' ? this.L : this.R;
  }

  /** Home position (fighter-local x/z) for a foot given an extra stance offset. */
  homeLocal(side: Side, offX: number, offZ: number): [number, number] {
    const w = this.style.stanceWidth * this.mods.stance;
    const [x, z] = BASE_HOME[side];
    return [x * w + offX, z * w + offZ];
  }

  /** Plant both feet where the current pose has them (after authored-leg animations). */
  syncToRig(rig: Rig) {
    for (const f of [this.L, this.R]) {
      const shin = f.side === 'L' ? 'shinL' : 'shinR';
      bonePoint(rig, shin, SKELETON[shin].length, _v);
      f.pos.set(_v.x, 0, _v.z);
      f.stepping = false;
    }
    this.initialized = true;
  }

  /**
   * Advance one frame. `offX/offZ` shift the stance (idle repositioning, step feints).
   * `lx/lz` is the local direction of travel, `speedFrac` 0..1 of walk speed.
   */
  update(body: Body, offX: number, offZ: number, lx: number, lz: number, speedFrac: number) {
    if (!this.initialized) {
      for (const f of [this.L, this.R]) {
        const [hx, hz] = this.homeLocal(f.side, offX, offZ);
        toWorld(hx, hz, body, f.pos);
      }
      this.initialized = true;
    }

    const moving = speedFrac > 0.08;
    const speed = Math.hypot(body.walkVel.x, body.walkVel.z);
    const dur = Math.max(5, Math.round(this.style.stepFrames * this.mods.stepFrames - 3.5 * speedFrac));
    const errors = { L: 0, R: 0 };
    const homes = { L: new Vector3(), R: new Vector3() };
    for (const f of [this.L, this.R]) {
      const [hx, hz] = this.homeLocal(f.side, offX, offZ);
      toWorld(hx, hz, body, _home);
      // Homes lead the body a little when moving, so feet land ahead and stay planted.
      _home.addScaledVector(body.walkVel, STEP_LEAD);
      homes[f.side].copy(_home);
      errors[f.side] = Math.hypot(_home.x - f.pos.x, _home.z - f.pos.z);
      if (errors[f.side] > SNAP_THRESHOLD) {
        f.pos.copy(_home);
        f.stepping = false;
        errors[f.side] = 0;
      }
    }

    // Progress active steps, re-aiming at the moving home (the body keeps turning/moving).
    for (const f of [this.L, this.R]) {
      if (!f.stepping) continue;
      f.t = Math.min(1, f.t + 1 / f.dur);
      f.to.copy(homes[f.side]).addScaledVector(body.walkVel, ((1 - f.t) * f.dur) / 60);
      const u = f.t * f.t * (3 - 2 * f.t);
      f.pos.lerpVectors(f.from, f.to, u);
      if (f.t >= 1) {
        f.stepping = false;
        f.pos.copy(f.to);
        errors[f.side] = 0;
      }
    }

    // Crossing guard: if the feet are lining up (fast turns), force a corrective step.
    const lL = toLocal(this.L.pos, body, new Vector3());
    const lR = toLocal(this.R.pos, body, new Vector3());
    if (lL.x - lR.x < 0.12) {
      const worse: Side = errors.L >= errors.R ? 'L' : 'R';
      errors[worse] = Math.max(errors[worse], FORCE_THRESHOLD + 0.01);
    }

    // Who should step first?
    let leader: Side;
    if (speed > 0.05) {
      // Step-and-drag: the foot on the side of travel goes first.
      leader = Math.abs(lz) >= Math.abs(lx) ? (lz >= 0 ? 'L' : 'R') : lx >= 0 ? 'L' : 'R';
    } else {
      // Turning on the spot: pivot on the lead foot, swing the rear foot.
      leader = errors.R > IDLE_THRESHOLD || errors.L <= IDLE_THRESHOLD ? 'R' : 'L';
    }
    const follower: Side = leader === 'L' ? 'R' : 'L';
    // Stride grows with speed: longer planted phases instead of frantic stepping.
    // Retreating: shorter, gliding steps (never reach back with a long stride).
    const retreat = moving && lz < -0.4;
    const stride = this.mods.stride * (retreat ? 0.75 : 1);
    const thr = ((moving ? MOVING_THRESHOLD : IDLE_THRESHOLD) + speed * 0.06) * stride;

    const tryStep = (side: Side) => {
      const f = this.foot(side);
      const other = this.foot(side === 'L' ? 'R' : 'L');
      if (f.stepping) return false;
      const forced = errors[side] > FORCE_THRESHOLD;
      if (errors[side] <= thr) return false;
      if (other.stepping && other.t < 0.55 && !forced) return false;
      f.from.copy(f.pos);
      // Aim where the home will be when the foot lands.
      f.to.copy(homes[side]).addScaledVector(body.walkVel, dur / 60);
      f.t = 0;
      f.dur = forced ? Math.max(4, dur - 2) : dur;
      f.height = this.style.stepHeight * this.mods.stepHeight * (retreat ? 0.6 : 1) * (0.6 + 0.6 * speedFrac) * Math.min(1, errors[side] / (0.15 * stride));
      f.stepping = true;
      if (this.steps === 0) this.firstStepper = side;
      this.steps++;
      this.lastStepper = side;
      return true;
    };

    // Moving: if the trailing foot wants to go but the leading foot hasn't moved yet,
    // the leading foot takes a (small) step first — never lead with the wrong foot.
    if (moving && this.lastStepper !== leader && errors[follower] > thr && errors[leader] > 0.02 && errors[leader] <= thr) {
      errors[leader] = thr + 0.001;
    }
    if (!tryStep(leader)) {
      // The follower drags in after the leader has moved (once it has mostly landed),
      // or on its own only if it is badly out of place.
      const lead = this.foot(leader);
      const due = this.lastStepper === leader && (!lead.stepping || lead.t > 0.55);
      if (due || errors[follower] > Math.max(thr * 1.8, 0.12) || errors[follower] > FORCE_THRESHOLD) tryStep(follower);
    }
  }

  /** Ankle IK target in fighter-local space, including step lift and an extra raise (toes). */
  localTarget(side: Side, body: Body, raise: number): [number, number, number] {
    const f = this.foot(side);
    toLocal(f.pos, body, _v);
    const lift = f.stepping ? Math.sin(Math.PI * f.t) * f.height : 0;
    return [_v.x, ANKLE_HEIGHT + lift + raise, _v.z];
  }

  /**
   * Fighter-local offset of the hips implied by where the weight is: centred between the
   * feet, leaning over the planted foot while the other one is in the air.
   */
  weightShift(body: Body, offX: number, offZ: number): [number, number] {
    const l = toLocal(this.L.pos, body, new Vector3());
    const r = toLocal(this.R.pos, body, new Vector3());
    let cx = (l.x + r.x) / 2;
    let cz = (l.z + r.z) / 2;
    for (const [f, planted] of [
      [this.L, r],
      [this.R, l],
    ] as const) {
      if (!f.stepping) continue;
      const k = 0.35 * Math.sin(Math.PI * f.t);
      cx += (planted.x - cx) * k;
      cz += (planted.z - cz) * k;
    }
    const [hlx, hlz] = this.homeLocal('L', offX, offZ);
    const [hrx, hrz] = this.homeLocal('R', offX, offZ);
    return [cx - (hlx + hrx) / 2 + offX, cz - (hlz + hrz) / 2 + offZ];
  }
}
