import { Vector3 } from 'three';
import { type BoneName, bonePoint, fistPoint, footPoint, SKELETON } from '../body/skeleton';
import type { PoseName } from '../body/poses';
import { AIDirector, BrawlerAI } from './ai';
import { type Fighter } from './fighter';
import { RectWalkable, type Walkable } from '../world/collision';
import { angleDelta, approachAngle, DT, Rng } from './math';
import { DEFENSES, type DefenseKind, type Height, type MoveDef, moveLength } from './moves';
import { chooseDefense, moveContext, selectPlayerMove } from './select';
import { bladePoints, LIMB_TOUGHNESS, limbBones, sampleOffsets, SEVER_AT, selectWeaponMove, WEAPON_MOVES, type WeaponDef, type Wound } from './weapons';

/** A weapon lying on the arena floor. */
export interface Drop {
  id: number;
  weapon: WeaponDef;
  pos: Vector3;
  yaw: number;
}

export type HurtZone = 'head' | 'chest' | 'abdomen' | 'legs';

export type CombatEvent =
  | { type: 'attackStart'; f: Fighter; move: MoveDef }
  | { type: 'swing'; f: Fighter; move: MoveDef }
  | {
      type: 'hit';
      attacker: Fighter;
      defender: Fighter;
      move: MoveDef;
      point: Vector3;
      dir: Vector3;
      zone: HurtZone;
      damage: number;
      counter: boolean;
      armored: boolean;
      knockdown: boolean;
      ko: boolean;
      combo: number;
      /** Body part struck. */
      bone: BoneName;
      /** Weapon used (null for fists and feet). */
      weapon: WeaponDef | null;
      /** A new cut, if the weapon has an edge. */
      wound: Wound | null;
      /** A limb (or the head) cut off. */
      sever: BoneName | null;
    }
  | { type: 'block'; attacker: Fighter; defender: Fighter; move: MoveDef; point: Vector3; dir: Vector3; guardBreak: boolean; wound: Wound | null }
  | { type: 'pickup'; f: Fighter; drop: Drop }
  | { type: 'drop'; drop: Drop }
  | { type: 'bleedout'; f: Fighter }
  | { type: 'bump'; attacker: Fighter; defender: Fighter; point: Vector3 }
  | { type: 'dodge'; attacker: Fighter; defender: Fighter; move: MoveDef; kind: DefenseKind | 'airborne'; point: Vector3 }
  | { type: 'defend'; f: Fighter; kind: DefenseKind }
  | { type: 'getup'; f: Fighter };

interface Contact {
  attacker: Fighter;
  defender: Fighter;
  point: Vector3;
  zone: HurtZone;
  bone: BoneName;
  /** Share of the swing's power behind the weapon at contact (1 for fists/feet). */
  power?: number;
  /** Caught with the handle / haft rather than the striking part. */
  haft?: boolean;
}

/** Below this much swing power a weapon just thuds against the body. */
const MIN_POWER = 0.45;

/** Hit points lost per second per unit of bleeding. */
export const BLEED_DPS = 1.1;

/** Lock-on tuning (rates in radians per frame). */
/** How much nearer (m) another opponent must be before the lock switches to it. */
const TARGET_SWITCH_MARGIN = 0.4;

export const FACING = {
  idleRate: 0.07,
  walkRate: 0.09,
  defendRate: 0.08,
  aimAssist: 0.07,
  /** Max lean of the body into a strafe (radians). */
  strafeLead: 0.35,
  /** Offsets smaller than this are tolerated while standing still. */
  idleDeadzone: 0.14,
  /** Closer than this, the fighter squares up to its target (soft lock-on)... */
  lockRange: 2.7,
  /** ...and stays locked until further than this (no flip-flopping at the edge). */
  unlockRange: 3.2,
  /** Turn rate while walking freely (rad/frame). */
  freeTurnRate: 0.2,
};

const _want = new Vector3();
const MIN_SEPARATION = 0.66;
/** Collision radius of a standing fighter against walls. */
export const BODY_RADIUS = 0.3;
const LUNGE_STOP = 0.74;
const _strike = new Vector3();
const _c = new Vector3();

/**
 * Fixed-step (60 Hz) combat simulation. Deterministic and renderer-free: it owns
 * gameplay truth (who hit whom), while the ragdoll only makes it look physical.
 */
export class CombatSim {
  readonly fighters: Fighter[] = [];
  readonly events: CombatEvent[] = [];
  readonly ais = new Map<Fighter, BrawlerAI>();
  /** Turn-taking between enemies (only one starts an attack per window). */
  readonly director = new AIDirector();
  /** Weapons lying around. */
  readonly drops: Drop[] = [];
  private dropSerial = 0;
  private readonly prevBlade = new Map<Fighter, Vector3[]>();
  frame = 0;
  /** Where fighters can stand (the arena floor minus its props). */
  walkable: Walkable = new RectWalkable(-7.5, 7.5, -4.5, 4.5);
  readonly rng: Rng;
  /** When set, knocked-down fighters' positions are driven externally (ragdoll). */
  externalKnockdown = false;
  private readonly speeds = new Map<Fighter, { speed: number; lx: number; lz: number; turn: number }>();

  constructor(seed = 7) {
    this.rng = new Rng(seed);
  }

  add(f: Fighter, ai?: BrawlerAI) {
    this.fighters.push(f);
    if (ai) {
      ai.director ??= this.director;
      ai.drops = this.drops;
      this.ais.set(f, ai);
    }
    f.updatePose(0, 0, 0);
  }

  remove(f: Fighter) {
    const i = this.fighters.indexOf(f);
    if (i >= 0) this.fighters.splice(i, 1);
    this.ais.delete(f);
    for (const o of this.fighters) if (o.target === f) o.target = null;
  }

  opponents(f: Fighter): Fighter[] {
    return this.fighters.filter((o) => o.team !== f.team);
  }

  step(): CombatEvent[] {
    this.events.length = 0;
    this.frame++;
    this.director.frame = this.frame;
    const fs = this.fighters;

    for (const f of fs) this.retarget(f);
    for (const f of fs) this.tickTimers(f);
    for (const f of fs) this.advance(f);
    for (const f of fs) this.ais.get(f)?.think(f, f.target);
    for (const f of fs) this.autoDefend(f);
    for (const f of fs) this.tryBufferedAttack(f);
    for (const f of fs) this.tryPickup(f);
    for (const f of fs) this.bleed(f);
    for (const f of fs) this.locomote(f);
    this.separate();
    for (const f of fs) {
      const s = this.speeds.get(f) ?? { speed: 0, lx: 0, lz: 0, turn: 0 };
      f.updatePose(s.speed, s.lx, s.lz, s.turn);
    }
    this.resolveHits();
    return this.events;
  }

  // ---------------------------------------------------------------------------

  /**
   * Lock onto the nearest opponent (measured to the edge of big bodies). A committed
   * strike keeps its target, and a new one has to be clearly nearer before the lock
   * switches, so two enemies at similar range don't make it flip back and forth.
   */
  private retarget(f: Fighter) {
    const cur = f.target && f.target.alive ? f.target : null;
    if (cur && f.state === 'attack') return;
    const reach = (o: Fighter) => f.distanceTo(o) - (o.scale - 1) * 0.35;
    let best: Fighter | null = null;
    let bestD = Infinity;
    for (const o of this.opponents(f)) {
      if (!o.alive) continue;
      const d = reach(o);
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    }
    if (cur && best !== cur && reach(cur) - bestD < TARGET_SWITCH_MARGIN) best = cur;
    f.target = best;
  }

  private tickTimers(f: Fighter) {
    if (f.counter && --f.counter.frames <= 0) f.counter = null;
    // Stamina: running burns it; easing off brings it back (slower when hurt).
    if (f.alive) {
      const run = f.footwork.run * f.motion.gait;
      const resting = f.free ? (run > 0.3 ? -0.035 * run : 0.085) : f.state === 'attack' ? 0 : 0.03;
      const hurt = 0.5 + 0.5 * (f.hp / f.stats.maxHp);
      f.stamina = Math.max(0, Math.min(1, f.stamina + (resting > 0 ? resting * hurt : resting) * DT));
    }
    for (const k of Object.keys(f.defenseCooldown) as DefenseKind[]) {
      if (f.defenseCooldown[k] > 0) f.defenseCooldown[k]--;
    }
    f.framesSinceBlock++;
    f.framesSinceHit++;
    f.framesSinceLanded++;
    if (f.framesSinceBlock > 60 && f.guard < f.stats.maxGuard) f.guard = Math.min(f.stats.maxGuard, f.guard + 0.35);
    if (f.framesSinceHit > 50 && f.poise < f.stats.maxPoise) f.poise = Math.min(f.stats.maxPoise, f.poise + 0.8);
    if (f.target && f.target.state !== 'hitstun' && f.target.state !== 'guardbreak' && f.target.state !== 'knockdown') {
      f.combo = 0;
    }
  }

  private advance(f: Fighter) {
    f.stateFrame++;
    switch (f.state) {
      case 'attack': {
        const m = f.move!;
        if (f.stateFrame === m.startup) this.events.push({ type: 'swing', f, move: m });
        if (m.lunge && !f.attackEnd && f.stateFrame >= m.lunge.from && f.stateFrame < m.lunge.to) {
          let step = (m.lunge.distance * f.scale) / (m.lunge.to - m.lunge.from);
          if (f.target && f.target.alive) step = Math.min(step, Math.max(0, f.distanceTo(f.target) - (LUNGE_STOP * (f.scale + f.target.scale)) / 2));
          f.pos.addScaledVector(f.forward, step);
        }
        if (f.stateFrame >= (f.attackEnd || moveLength(m))) f.enterLocomotion(5);
        break;
      }
      case 'defend': {
        const d = f.defense!;
        if (d.def.retreat) {
          const frames = d.def.startup + 8;
          if (f.stateFrame <= frames && d.phase !== 'recovery') f.pos.addScaledVector(f.forward, (-d.def.retreat * f.scale) / frames);
        }
        if (d.phase === 'startup' && f.stateFrame >= d.def.startup) d.phase = 'active';
        if (d.phase === 'active' || d.phase === 'startup') {
          if (this.threatOver(f)) {
            if (!d.success) this.markDodge(f, null);
            f.enterDefenseRecovery();
          }
        } else if (d.phase === 'recovery' && f.stateFrame >= d.def.recovery) {
          f.enterLocomotion(4);
        }
        break;
      }
      case 'hitstun':
      case 'blockstun':
      case 'guardbreak':
        if (f.stateFrame >= f.stunFrames) f.enterLocomotion(4);
        break;
      case 'knockdown':
        if (f.stateFrame >= f.stunFrames) {
          f.enterGetup();
          this.events.push({ type: 'getup', f });
        }
        break;
      case 'getup':
      case 'celebrate':
        if (f.stateFrame >= f.stunFrames) f.enterLocomotion(4);
        break;
      default:
        break;
    }
  }

  /** The attack a defense was answering has finished its active frames (or stopped). */
  private threatOver(f: Fighter): boolean {
    const serial = f.defense!.threatSerial;
    for (const o of this.opponents(f)) {
      if (o.id * 100000 + o.attackSerial !== serial) continue;
      if (o.state !== 'attack' || !o.move) return true;
      return o.stateFrame >= o.move.startup + o.move.active;
    }
    return true;
  }

  private autoDefend(f: Fighter) {
    if (!f.autoDefense || !f.alive) return;
    const canReact =
      f.free ||
      f.state === 'blockstun' ||
      (f.state === 'defend' && (f.defense!.phase === 'recovery' || f.defense!.success));
    if (!canReact) return;

    for (const o of this.opponents(f)) {
      if (o.state !== 'attack' || !o.move || o.hitThisAttack) continue;
      const serial = o.id * 100000 + o.attackSerial;
      if (serial === f.lastDefendedSerial) continue;
      const fta = o.framesToActive;
      if (fta < -o.move.active) continue;
      if (f.distanceTo(o) > (o.move.reach + o.stats.reach) * o.scale + 0.45) continue;
      const kind = chooseDefense(f, o.move, fta, o.strikeHeight);
      if (!kind) continue;
      if (fta <= DEFENSES[kind].startup + 1) {
        f.startDefense(kind, serial);
        this.events.push({ type: 'defend', f, kind });
        return;
      }
    }
  }

  private tryBufferedAttack(f: Fighter) {
    const b = f.buffer;
    if (!b) return;
    if (b.frames-- <= 0 || !f.alive) {
      f.buffer = null;
      return;
    }
    const ctx = moveContext(f);
    const d = f.defense;
    const allowed =
      f.free ||
      (f.state === 'attack' && ctx.chainFrom !== null) ||
      (f.state === 'defend' && d !== null && (d.success || d.phase === 'recovery'));
    if (!allowed) return;
    let id: string | null | undefined;
    if (f.weapon) {
      id = selectWeaponMove(b.button, f.weapon, ctx.counter, ctx.chainFrom);
      // Kicks out of a weapon combo.
      if (id === undefined && ctx.chainFrom && WEAPON_MOVES[ctx.chainFrom]) id = b.button === 'lkick' ? 'frontKick' : 'lowKick';
    }
    if (id === undefined) id = selectPlayerMove(b.button, ctx);
    const move = id ? f.moveDef(id) : undefined;
    if (!move || !f.canUse(move)) return;
    if (f.state === 'attack' && ctx.chainFrom && !f.move!.cancel!.into.includes(move.id)) return;
    f.startMove(move, ctx.counter !== null);
    this.events.push({ type: 'attackStart', f, move });
  }

  private locomote(f: Fighter) {
    const lockT = f.target && f.target.alive ? f.target : null;
    const lockD = lockT ? f.distanceTo(lockT) : Infinity;
    // Squaring up to a giant happens further out.
    const big = lockT ? Math.max(f.scale, lockT.scale) : 1;
    f.lockedOn = lockD < (f.lockedOn ? FACING.unlockRange : FACING.lockRange) * big;
    const external = this.externalKnockdown && (f.state === 'knockdown' || f.state === 'ko');
    if (!external) {
      f.pos.x += f.vel.x * DT;
      f.pos.z += f.vel.z * DT;
    }
    const friction = f.state === 'knockdown' || f.state === 'ko' ? 0.93 : 0.86;
    f.vel.multiplyScalar(friction);

    // Footwork. Free fighters walk; hand strikes can keep stepping at reduced speed;
    // everything else keeps (and bleeds off) the momentum it had going in.
    const handStrike = f.state === 'attack' && f.move?.layer === 'upper';
    if (f.free || handStrike) {
      const mi = f.moveInput;
      const raw = Math.hypot(mi.x, mi.z);
      const len = Math.min(1, raw);
      _want.set(0, 0, 0);
      if (len > 0.1) {
        const fwd = f.forward;
        const dot = (mi.x * fwd.x + mi.z * fwd.z) / raw;
        // Speed comes from the contextual motion profile (stance footwork in range,
        // full walking stride far away, slower when hurt...).
        const locked = f.lockedOn;
        // Locked on: backpedalling is slower. Free walking: turn first, then go.
        const turnFirst = locked ? 1 : Math.max(0.3, (1 + dot) / 2);
        const sp =
          f.stats.walkSpeed * len * f.motion.speed * (locked && dot < -0.3 ? 0.72 : 1) * turnFirst * (handStrike ? 0.6 : 1);
        _want.set(mi.x / raw, 0, mi.z / raw).multiplyScalar(sp);
      }
      // Accelerate rather than snap, so starts/stops have weight.
      f.walkVel.lerp(_want, _want.lengthSq() > f.walkVel.lengthSq() ? 0.22 : 0.3);
      if (f.free) f.state = f.walkVel.lengthSq() > 0.04 || len > 0.1 ? 'walk' : 'idle';
    } else if (f.state === 'attack' || f.state === 'defend') {
      f.walkVel.multiplyScalar(0.88);
    } else {
      f.walkVel.multiplyScalar(0.6);
    }
    if (!external && f.walkVel.lengthSq() > 1e-6) {
      f.pos.x += f.walkVel.x * DT;
      f.pos.z += f.walkVel.z * DT;
    }

    const speed = Math.hypot(f.walkVel.x, f.walkVel.z);
    let lx = 0;
    let lz = 0;
    if (speed > 0.01) {
      // Footwork direction in fighter-local space (+X = fighter's left).
      const c = Math.cos(f.yaw);
      const s = Math.sin(f.yaw);
      const wx = f.walkVel.x / speed;
      const wz = f.walkVel.z / speed;
      lx = wx * c - wz * s;
      lz = wx * s + wz * c;
    }

    const before = f.yaw;
    this.updateFacing(f);
    this.speeds.set(f, { speed, lx, lz, turn: angleDelta(before, f.yaw) });
  }

  /**
   * Soft lock-on: fighters turn toward their target, but not instantly. Strafing leads
   * the body into the strafe, small offsets are left alone, and committed moves only get
   * a little aim assist early in their wind-up — so angles and positioning matter.
   */
  private updateFacing(f: Fighter) {
    const t = f.target && f.target.alive ? f.target : null;
    const mi = f.moveInput;
    const moving = Math.hypot(mi.x, mi.z) > 0.1;
    let rate = 0;
    if (f.free) rate = moving ? FACING.walkRate : FACING.idleRate;
    else if (f.state === 'defend' || f.state === 'blockstun') rate = FACING.defendRate;
    else if (f.state === 'attack' && f.move && f.stateFrame < f.move.startup * 0.7) rate = FACING.aimAssist;
    else if (f.state === 'getup') rate = 0.06;
    if (rate <= 0) return;

    let desired: number | null = null;
    let deadzone = 0;
    if (t && f.lockedOn) {
      const toT = Math.atan2(t.pos.x - f.pos.x, t.pos.z - f.pos.z);
      desired = toT;
      if (moving && f.free) {
        // Strafing: lead with the body, keep the head and guard roughly on target.
        const rel = angleDelta(toT, Math.atan2(mi.x, mi.z));
        desired = toT + Math.sin(rel) * FACING.strafeLead;
      } else if (f.free) {
        deadzone = FACING.idleDeadzone;
      }
    } else if (moving) {
      // Not in a fight: turn to face where you're going and walk there.
      desired = Math.atan2(mi.x, mi.z);
      if (f.free) rate = FACING.freeTurnRate;
    }
    if (desired === null) return;
    const d = angleDelta(f.yaw, desired);
    if (Math.abs(d) <= deadzone) return;
    f.yaw = approachAngle(f.yaw, desired - Math.sign(d) * deadzone, rate);
  }

  private separate() {
    const fs = this.fighters;
    for (let i = 0; i < fs.length; i++) {
      for (let j = i + 1; j < fs.length; j++) {
        const a = fs[i];
        const b = fs[j];
        if (!a.alive || !b.alive || a.state === 'knockdown' || b.state === 'knockdown') continue;
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const d = Math.hypot(dx, dz);
        const minSep = (MIN_SEPARATION * (a.scale + b.scale)) / 2;
        if (d < minSep) {
          const push = (minSep - d) / 2;
          const nx = d > 1e-4 ? dx / d : 1;
          const nz = d > 1e-4 ? dz / d : 0;
          a.pos.x -= nx * push;
          a.pos.z -= nz * push;
          b.pos.x += nx * push;
          b.pos.z += nz * push;
        }
      }
    }
    for (const f of fs) {
      if (f.state !== 'knockdown' && f.state !== 'ko') this.walkable.resolve(f.pos, BODY_RADIUS * f.scale);
      f.pos.y = 0;
    }
  }

  // ---------------------------------------------------------------------------
  // Hits
  // ---------------------------------------------------------------------------

  private resolveHits() {
    const contacts: Contact[] = [];
    for (const a of this.fighters) {
      if (a.hitThisAttack) continue;
      const swinging = a.inWeaponContact();
      if (!swinging && !a.inActiveFrames()) continue;
      const m = a.move!;
      if (swinging && a.weapon) {
        // The whole weapon is solid for the whole swing: along it, and between this
        // frame's and last frame's position so a fast swing can't skip through someone.
        const w = a.weapon;
        const pts = bladePoints(a, w);
        const offs = sampleOffsets(w);
        const prev = this.prevBlade.get(a);
        const samples = [...pts];
        const at = [...offs];
        if (prev && prev.length === pts.length) {
          for (let i = 0; i < pts.length; i++) {
            samples.push(pts[i].clone().lerp(prev[i], 0.5));
            at.push(offs[i]);
          }
        }
        const r = (w.radius + a.stats.reach) * a.scale;
        for (const d of this.opponents(a)) {
          if (!d.alive || d.state === 'knockdown' || d.state === 'getup') continue;
          const c = overlapBody(samples, r, d, at);
          if (c) {
            contacts.push({ attacker: a, defender: d, point: c.point, zone: c.zone, bone: c.bone, power: a.swingPower(), haft: at[c.index] < w.strikeFrom - 0.02 });
            break;
          }
        }
        continue;
      }
      strikePoint(a, m, _strike);
      for (const d of this.opponents(a)) {
        if (!d.alive || d.state === 'knockdown' || d.state === 'getup') continue;
        const c = overlap(_strike, (m.radius + a.stats.reach) * a.scale, d, a.strikeHeight);
        if (c) {
          contacts.push({ attacker: a, defender: d, ...c });
          break;
        }
      }
    }
    for (const f of this.fighters) {
      if (f.weapon && f.inWeaponContact()) this.prevBlade.set(f, bladePoints(f, f.weapon));
      else this.prevBlade.delete(f);
    }
    // Apply after detection so simultaneous strikes trade.
    for (const c of contacts) c.attacker.hitThisAttack = true;
    for (const c of contacts) this.applyStrike(c);
  }

  private applyStrike({ attacker: a, defender: d, point, zone, bone, power = 1, haft = false }: Contact) {
    const m = a.move!;
    const height = a.strikeHeight;
    const dir = new Vector3(d.pos.x - a.pos.x, 0, d.pos.z - a.pos.z);
    if (dir.lengthSq() < 1e-6) dir.copy(a.forward);
    dir.normalize();

    if (d.state === 'defend' && d.defense) {
      const def = d.defense.def;
      const inPosition = d.defense.phase !== 'startup' || d.stateFrame >= def.startup - 1;
      if (inPosition && def.evades.includes(height)) {
        this.markDodge(d, a, point);
        return;
      }
      if (inPosition && m.blockable && def.blocks.includes(height)) {
        this.block(a, d, m, point, dir);
        return;
      }
    }
    if (d.state === 'attack' && d.move?.evades) {
      const e = d.move.evades;
      if (d.stateFrame >= e.from && d.stateFrame < e.to && e.heights.includes(height)) {
        this.events.push({ type: 'dodge', attacker: a, defender: d, move: m, kind: 'airborne', point });
        return;
      }
    }
    if (d.state === 'blockstun' && m.blockable && height !== 'low') {
      this.block(a, d, m, point, dir);
      return;
    }
    // Not enough behind it (still accelerating, or the follow-through is spent): the
    // weapon just thuds against the body and stops.
    if (m.weapon && power < MIN_POWER) {
      a.impact('rebound', 2, 10);
      d.vel.addScaledVector(dir, 0.4);
      this.events.push({ type: 'bump', attacker: a, defender: d, point: point.clone() });
      return;
    }
    this.hit(a, d, m, point, dir, zone, bone, power, haft);
  }

  private markDodge(d: Fighter, a: Fighter | null, point?: Vector3) {
    const def = d.defense!;
    def.success = true;
    d.counter = { kind: def.def.kind, frames: def.def.counterWindow };
    const attacker = a ?? this.opponents(d).find((o) => o.id * 100000 + o.attackSerial === def.threatSerial) ?? null;
    if (!attacker || !attacker.move) return;
    const p = point ?? bonePoint(d.rig, 'head', 0.12, new Vector3());
    this.events.push({ type: 'dodge', attacker, defender: d, move: attacker.move, kind: def.def.kind, point: p.clone() });
  }

  private block(a: Fighter, d: Fighter, m: MoveDef, point: Vector3, dir: Vector3) {
    d.guard -= m.guardDamage;
    d.framesSinceBlock = 0;
    const kb = m.knockback * a.stats.knockbackMul;
    let guardBreak = false;
    if (d.guard <= 0) {
      guardBreak = true;
      d.guard = d.stats.maxGuard * 0.5;
      d.enterGuardBreak(48);
      d.vel.addScaledVector(dir, kb * 0.9);
    } else {
      d.enterBlockstun(m.blockstun);
      d.vel.addScaledVector(dir, kb * 0.6);
      if (d.autoDefense) d.counter = { kind: 'block', frames: DEFENSES.block.counterWindow + m.blockstun };
    }
    // Blocking an edge with your arms still costs you: a cut on the forearm.
    let wound: Wound | null = null;
    const w = m.weapon ? a.weapon : null;
    if (w && w.cut > 0) {
      const side = d.rig.foreArmL.pos.distanceToSquared(point) < d.rig.foreArmR.pos.distanceToSquared(point) ? 'foreArmL' : 'foreArmR';
      if (!d.isSevered(side)) {
        d.hp = Math.max(d.minHp, Math.max(1, d.hp - m.damage * w.damageMul * 0.15));
        wound = this.addWound(d, side, point, m.damage * w.damageMul * 0.4, w.cut);
      }
    }
    this.events.push({ type: 'block', attacker: a, defender: d, move: m, point: point.clone(), dir: dir.clone(), guardBreak, wound });
    // Stopped by the guard: a blade bites into the forearm, anything else bounces off.
    if (wound) a.impact('stick', 6, 11);
    else a.impact('rebound', 2, m.weapon ? 11 : 8);
  }

  private hit(a: Fighter, d: Fighter, m: MoveDef, point: Vector3, dir: Vector3, zone: HurtZone, bone: BoneName, power = 1, haft = false) {
    // Caught on the haft: a blunt knock, not a cut.
    const w = m.weapon && !haft ? a.weapon : null;
    const caughtInStartup = d.state === 'attack' && !!d.move && d.stateFrame < d.move.startup;
    const counter = caughtInStartup || a.isCounterAttack;
    const armor = d.state === 'attack' && d.move?.armor;
    const armored = !!armor && d.stateFrame >= armor[0] && d.stateFrame < armor[1] && m.weight === 'light';

    let dmg = m.damage * a.stats.damageMul * (counter ? 1.25 : 1) * (1 - d.stats.defense);
    if (armored) dmg *= 0.5;
    if (w) dmg *= w.damageMul;
    if (m.weapon) dmg *= Math.min(1, power) * (haft ? 0.45 : 1);
    d.hp = Math.max(d.minHp, d.hp - dmg);
    // Body shots empty the tank.
    d.stamina = Math.max(0, d.stamina - (zone === 'abdomen' ? 0.09 : zone === 'chest' ? 0.04 : 0.02) * Math.min(2, dmg / 8));
    d.framesSinceHit = 0;
    a.framesSinceLanded = 0;
    const comboing = d.state === 'hitstun' || d.state === 'guardbreak';
    a.combo = comboing ? a.combo + 1 : 1;
    d.poise -= m.poiseDamage * (1 - d.stats.staggerResist) * (counter ? 1.3 : 1) * (w?.edge === 'blunt' ? 1.35 : 1) * (m.weapon ? Math.min(1, power) * (haft ? 0.5 : 1) : 1);
    d.buffer = null;
    d.counter = null;

    const kb = m.knockback * a.stats.knockbackMul;
    let ko = false;
    let knockdown = false;
    if (d.hp <= 0) {
      d.hp = 0;
      ko = true;
      d.enterKO();
      d.vel.addScaledVector(dir, kb + 1.5);
    } else if (armored) {
      d.vel.addScaledVector(dir, 0.3);
    } else if ((m.knockdown && !haft && power > 0.8) || d.poise <= 0) {
      knockdown = true;
      d.enterKnockdown();
      d.vel.addScaledVector(dir, kb);
    } else {
      // How far it rocks them: the force of the blow, and who is hitting whom.
      const rock = (0.25 + dmg / 12) * Math.max(0.5, Math.min(1.5, a.scale / d.scale)) * (counter ? 1.15 : 1);
      d.enterHitstun(Math.round(m.hitstun * (counter ? 1.2 : 1)), reactionFor(m, zone, a.aim?.id), rock);
      d.vel.addScaledVector(dir, kb);
    }
    // Edges cut (and keep bleeding); heavy edges can take a limb off.
    const wound = w && w.cut > 0 && !d.isSevered(bone) ? this.addWound(d, bone, point, dmg, w.cut) : null;
    let sever: BoneName | null = null;
    const at = SEVER_AT[bone];
    if (w && w.cleave > 0 && at && d.minHp <= 0 && !d.isSevered(at)) {
      const dealt = (d.limbDamage[at] ?? 0) + dmg * w.cleave * (m.weight === 'heavy' ? 1.3 : 1);
      d.limbDamage[at] = dealt;
      // Your own limbs only come off with the blow that finishes you.
      const allowed = d.team !== 'player' || ko;
      const tough = (LIMB_TOUGHNESS[at] ?? 30) * d.scale ** 1.5;
      if (allowed && (dealt >= tough || (ko && w.cleave >= 0.45 && this.rng.chance(0.65)))) sever = at;
    }
    if (sever) {
      this.sever(d, sever);
      // Losing the head or a leg ends the fight.
      if (!ko && (sever === 'head' || sever.startsWith('thigh') || sever.startsWith('shin'))) {
        d.hp = 0;
        ko = true;
        knockdown = false;
        d.enterKO();
        d.vel.addScaledVector(dir, 1);
      }
    }
    if (ko) this.dropWeapon(d);
    // The strike stops at the body — unless it cleaved clean through, or the blow
    // carried them off their feet. Edges bite in and have to be wrenched free; fists,
    // feet and blunt weapons rebound.
    if (!sever) {
      if (w && w.cut > 0) {
        const hold = Math.round(w.bite * (m.kind === 'hook' ? 0.6 : 1) * (ko ? 0.6 : 1));
        a.impact('stick', Math.max(4, hold), m.weight === 'heavy' ? 16 : 12);
        // The blade holds them: they don't fly off it.
        d.vel.multiplyScalar(0.4);
      } else if (!knockdown && !ko) {
        a.impact('rebound', m.weapon ? 3 : 2, m.weapon ? 11 : m.limb.startsWith('foot') ? 10 : 8);
      }
    }
    this.events.push({
      type: 'hit',
      attacker: a,
      defender: d,
      move: m,
      point: point.clone(),
      dir: dir.clone(),
      zone,
      damage: dmg,
      counter,
      armored,
      knockdown,
      ko,
      combo: a.combo,
      bone,
      weapon: w,
      wound,
      sever,
    });
  }

  // ---------------------------------------------------------------------------
  // Weapons, wounds, dismemberment
  // ---------------------------------------------------------------------------

  /** Opens a lasting cut where the blow landed. */
  private addWound(d: Fighter, bone: BoneName, point: Vector3, dmg: number, cut: number): Wound {
    const x = d.rig[bone];
    const local = point.clone().sub(x.pos).applyQuaternion(x.rot.clone().invert()).divideScalar(d.scale);
    const bleed = Math.min(1, Math.max(0.15, cut * dmg * 0.06));
    const wound: Wound = {
      bone,
      local: [local.x, local.y, local.z],
      angle: this.rng.range(-0.9, 0.9),
      length: Math.min(0.2, 0.05 + dmg * 0.006) * (0.7 + cut * 0.4),
      bleed,
      floor: bleed * 0.25,
    };
    d.wounds.push(wound);
    if (d.wounds.length > 16) d.wounds.splice(d.wounds.findIndex((w) => !w.stump), 1);
    return wound;
  }

  /** Cuts a limb off at `bone` (the ragdoll lets it go; the stump bleeds hard). */
  private sever(d: Fighter, bone: BoneName) {
    for (const b of limbBones(bone)) d.severed.add(b);
    const parent: BoneName =
      bone === 'head' ? 'chest' : bone === 'foreArmL' ? 'upperArmL' : bone === 'foreArmR' ? 'upperArmR' : bone === 'shinL' ? 'thighL' : bone === 'shinR' ? 'thighR' : bone.startsWith('thigh') ? 'pelvis' : 'chest';
    // The joint, in the parent's frame (authored scale).
    const o = SKELETON[bone].offset;
    const stump: Wound = { bone: parent, local: [o[0], o[1], o[2]], angle: 0, length: 0, bleed: 1, floor: 0.3, stump: bone };
    d.wounds.push(stump);
    for (const w of d.wounds) if (limbBones(bone).includes(w.bone)) w.bleed = w.floor = 0;
    if (bone === 'foreArmR' || bone === 'upperArmR') this.dropWeapon(d);
  }

  /** Bleeding: every open cut drains a little health; enough of it and they go down. */
  private bleed(f: Fighter) {
    if (!f.wounds.length) return;
    let rate = 0;
    for (const w of f.wounds) {
      w.bleed = Math.max(w.floor, w.bleed * 0.9993);
      rate += w.bleed;
    }
    if (!f.alive || rate <= 0) return;
    f.hp = Math.max(f.minHp, f.hp - rate * BLEED_DPS * DT);
    if (f.hp <= 0) {
      f.hp = 0;
      f.enterKO();
      this.dropWeapon(f);
      this.events.push({ type: 'bleedout', f });
    }
  }

  /** Puts a weapon on the floor. */
  addDrop(weapon: WeaponDef, x: number, z: number, yaw = 0): Drop {
    const p = new Vector3(x, 0, z);
    this.walkable.resolve(p, 0.25);
    const drop: Drop = { id: ++this.dropSerial, weapon, pos: p, yaw };
    this.drops.push(drop);
    this.events.push({ type: 'drop', drop });
    return drop;
  }

  /** Lets go of the weapon in hand (it lands by the rear hand). */
  dropWeapon(f: Fighter) {
    if (!f.weapon) return;
    const at = fistPoint(f.rig, 'R', new Vector3());
    const w = f.weapon;
    f.weapon = null;
    this.addDrop(w, at.x, at.z, f.yaw + 1.2);
  }

  /** Grab (or swap for) the nearest weapon in reach; with none in reach, drop yours. */
  private tryPickup(f: Fighter) {
    if (f.pickupRequest <= 0) return;
    f.pickupRequest--;
    if (!f.free || !f.alive || f.isSevered('foreArmR')) return;
    f.pickupRequest = 0;
    let best: Drop | null = null;
    let bestD = 1.15 * f.scale;
    for (const d of this.drops) {
      const dist = Math.hypot(d.pos.x - f.pos.x, d.pos.z - f.pos.z);
      if (dist < bestD) {
        bestD = dist;
        best = d;
      }
    }
    if (!best) {
      if (f.team === 'player') this.dropWeapon(f);
      return;
    }
    // Two-handed weapons need both hands.
    if (best.weapon.style === 'twoHand' && f.isSevered('foreArmL')) return;
    this.drops.splice(this.drops.indexOf(best), 1);
    const old = f.weapon;
    f.weapon = best.weapon;
    this.events.push({ type: 'pickup', f, drop: best });
    if (old) this.addDrop(old, best.pos.x, best.pos.z, best.yaw + 0.8);
  }
}

/** Which side of the defender a strike arrives from: +1 their right, -1 their left. */
function arrivesFrom(m: MoveDef): number {
  if (m.weapon) return m.id === 'backslash' || m.id === 'sweepBack' ? 1 : m.id === 'slash' || m.id === 'sweep' ? -1 : 0;
  // Facing each other, the attacker's left side is the defender's right.
  return m.limb === 'handL' || m.limb === 'footL' ? 1 : -1;
}

/**
 * How the body reacts to where and how it was hit, like it does in real fights: a
 * straight snaps the head back, a hook whips it round away from the blow, an uppercut
 * throws the chin up, a body shot folds you, a liver shot caves in the right side.
 */
function reactionFor(m: MoveDef, zone: HurtZone, aimId?: string): PoseName {
  if (zone === 'legs') return 'hitLow';
  if (aimId === 'liver') return 'hitLiver';
  if (zone === 'abdomen' || (zone === 'chest' && m.height === 'mid')) return 'hitBody';
  if (zone === 'head') {
    if (m.kind === 'uppercut') return 'hitUpper';
    const side = arrivesFrom(m);
    if ((m.kind === 'hook' || m.kind === 'kick') && side !== 0) return side > 0 ? 'hitHookL' : 'hitHookR';
  }
  return m.weight === 'heavy' ? 'stagger' : 'hitHigh';
}

export function strikePoint(f: Fighter, m: MoveDef, out: Vector3): Vector3 {
  switch (m.limb) {
    case 'handL':
      return fistPoint(f.rig, 'L', out);
    case 'handR':
      return fistPoint(f.rig, 'R', out);
    case 'footL':
      return footPoint(f.rig, 'L', out);
    case 'footR':
      return footPoint(f.rig, 'R', out);
  }
}

export interface HurtSphere {
  zone: HurtZone;
  center: Vector3;
  r: number;
  bone?: BoneName;
}

export function hurtSpheres(d: Fighter, height: Height): HurtSphere[] {
  const spheres = hurtSpheresUnscaled(d, height).filter((h) => !h.bone || !d.isSevered(h.bone));
  if (d.scale !== 1) for (const h of spheres) h.r *= d.scale;
  return spheres;
}

function hurtSpheresUnscaled(d: Fighter, height: Height): HurtSphere[] {
  const rig = d.rig;
  if (height === 'high') {
    return [
      { zone: 'head', bone: 'head', center: bonePoint(rig, 'head', 0.13, new Vector3()), r: 0.16 },
      { zone: 'chest', bone: 'chest', center: bonePoint(rig, 'chest', 0.2, new Vector3()), r: 0.17 },
    ];
  }
  if (height === 'mid') {
    return [
      { zone: 'chest', bone: 'chest', center: bonePoint(rig, 'chest', 0.12, new Vector3()), r: 0.2 },
      { zone: 'abdomen', bone: 'abdomen', center: bonePoint(rig, 'abdomen', 0.1, new Vector3()), r: 0.19 },
    ];
  }
  return [
    { zone: 'legs', bone: 'shinL', center: bonePoint(rig, 'shinL', 0.22, new Vector3()), r: 0.11 },
    { zone: 'legs', bone: 'shinR', center: bonePoint(rig, 'shinR', 0.22, new Vector3()), r: 0.11 },
    { zone: 'legs', bone: 'thighL', center: bonePoint(rig, 'thighL', 0.25, new Vector3()), r: 0.12 },
    { zone: 'legs', bone: 'thighR', center: bonePoint(rig, 'thighR', 0.25, new Vector3()), r: 0.12 },
  ];
}

/** The whole body, limb by limb (what a weapon can catch). */
export function bodySpheres(d: Fighter): HurtSphere[] {
  const rig = d.rig;
  const s = (zone: HurtZone, bone: BoneName, t: number, r: number): HurtSphere => ({ zone, bone, center: bonePoint(rig, bone, t, new Vector3()), r: r * d.scale });
  const out = [
    s('head', 'head', 0.13, 0.15),
    s('chest', 'chest', 0.16, 0.19),
    s('abdomen', 'abdomen', 0.1, 0.17),
    s('abdomen', 'pelvis', 0.02, 0.15),
    s('chest', 'upperArmL', 0.15, 0.075),
    s('chest', 'upperArmR', 0.15, 0.075),
    s('chest', 'foreArmL', 0.14, 0.07),
    s('chest', 'foreArmR', 0.14, 0.07),
    s('legs', 'thighL', 0.22, 0.1),
    s('legs', 'thighR', 0.22, 0.1),
    s('legs', 'shinL', 0.22, 0.085),
    s('legs', 'shinR', 0.22, 0.085),
  ];
  return out.filter((h) => !d.isSevered(h.bone!));
}

/** Deepest contact between any of `points` (radius r) and the defender's body. */
/**
 * Contact between a weapon (sample points; `reach` = distance of each from the grip) and
 * the defender's body. The part furthest out along the weapon that touches wins — in a
 * swing or a thrust the head / point arrives first.
 */
function overlapBody(points: Vector3[], r: number, d: Fighter, reach?: number[]): { point: Vector3; zone: HurtZone; bone: BoneName; index: number } | null {
  let best: { point: Vector3; zone: HurtZone; bone: BoneName; index: number } | null = null;
  let bestKey = -Infinity;
  const spheres = bodySpheres(d);
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    for (const s of spheres) {
      const depth = r + s.r - p.distanceTo(s.center);
      if (depth <= 0) continue;
      const key = (reach?.[i] ?? 0) * 100 + depth;
      if (key <= bestKey) continue;
      bestKey = key;
      _c.subVectors(p, s.center);
      if (_c.lengthSq() < 1e-8) _c.set(0, 0, 1);
      best = { point: s.center.clone().addScaledVector(_c.normalize(), s.r), zone: s.zone, bone: s.bone!, index: i };
    }
  }
  return best;
}

function overlap(strike: Vector3, radius: number, d: Fighter, height: Height): { point: Vector3; zone: HurtZone; bone: BoneName } | null {
  for (const s of hurtSpheres(d, height)) {
    const dist = strike.distanceTo(s.center);
    if (dist < radius + s.r) {
      _c.subVectors(strike, s.center);
      if (_c.lengthSq() < 1e-8) _c.set(0, 0, 1);
      const point = s.center.clone().addScaledVector(_c.normalize(), s.r);
      return { point, zone: s.zone, bone: s.bone ?? 'chest' };
    }
  }
  return null;
}
