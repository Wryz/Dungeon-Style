import { Vector3 } from 'three';
import { bonePoint, fistPoint, footPoint } from '../body/skeleton';
import type { PoseName } from '../body/poses';
import { AIDirector, BrawlerAI } from './ai';
import { type Fighter } from './fighter';
import { RectWalkable, type Walkable } from '../world/collision';
import { angleDelta, approachAngle, DT, Rng } from './math';
import { DEFENSES, type DefenseKind, type Height, type MoveDef, moveLength } from './moves';
import { chooseDefense, moveContext, selectPlayerMove } from './select';

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
    }
  | { type: 'block'; attacker: Fighter; defender: Fighter; move: MoveDef; point: Vector3; dir: Vector3; guardBreak: boolean }
  | { type: 'dodge'; attacker: Fighter; defender: Fighter; move: MoveDef; kind: DefenseKind | 'airborne'; point: Vector3 }
  | { type: 'defend'; f: Fighter; kind: DefenseKind }
  | { type: 'getup'; f: Fighter };

interface Contact {
  attacker: Fighter;
  defender: Fighter;
  point: Vector3;
  zone: HurtZone;
}

/** Lock-on tuning (rates in radians per frame). */
export const FACING = {
  idleRate: 0.07,
  walkRate: 0.09,
  defendRate: 0.08,
  aimAssist: 0.07,
  /** Max lean of the body into a strafe (radians). */
  strafeLead: 0.35,
  /** Offsets smaller than this are tolerated while standing still. */
  idleDeadzone: 0.14,
  /** Beyond this, the fighter is not locked onto anyone and walks like a person. */
  lockRange: 4.6,
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

  private retarget(f: Fighter) {
    if (f.target && f.target.alive) return;
    let best: Fighter | null = null;
    let bestD = Infinity;
    for (const o of this.opponents(f)) {
      if (!o.alive) continue;
      const d = f.distanceTo(o);
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    }
    f.target = best;
  }

  private tickTimers(f: Fighter) {
    if (f.counter && --f.counter.frames <= 0) f.counter = null;
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
        if (m.lunge && f.stateFrame >= m.lunge.from && f.stateFrame < m.lunge.to) {
          let step = (m.lunge.distance * f.scale) / (m.lunge.to - m.lunge.from);
          if (f.target && f.target.alive) step = Math.min(step, Math.max(0, f.distanceTo(f.target) - (LUNGE_STOP * (f.scale + f.target.scale)) / 2));
          f.pos.addScaledVector(f.forward, step);
        }
        if (f.stateFrame >= moveLength(m)) f.enterLocomotion(5);
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
    const id = selectPlayerMove(b.button, ctx);
    const move = id ? f.moves[id] : undefined;
    if (!move) return;
    if (f.state === 'attack' && ctx.chainFrom && !f.move!.cancel!.into.includes(move.id)) return;
    f.startMove(move, ctx.counter !== null);
    this.events.push({ type: 'attackStart', f, move });
  }

  private locomote(f: Fighter) {
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
        const t2 = f.target && f.target.alive ? f.target : null;
        const locked = !!t2 && f.distanceTo(t2) < FACING.lockRange;
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
    const dist = t ? f.distanceTo(t) : Infinity;
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
    if (t && dist < FACING.lockRange) {
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
      if (!a.inActiveFrames() || a.hitThisAttack) continue;
      const m = a.move!;
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
    // Apply after detection so simultaneous strikes trade.
    for (const c of contacts) c.attacker.hitThisAttack = true;
    for (const c of contacts) this.applyStrike(c);
  }

  private applyStrike({ attacker: a, defender: d, point, zone }: Contact) {
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
    this.hit(a, d, m, point, dir, zone);
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
    this.events.push({ type: 'block', attacker: a, defender: d, move: m, point: point.clone(), dir: dir.clone(), guardBreak });
  }

  private hit(a: Fighter, d: Fighter, m: MoveDef, point: Vector3, dir: Vector3, zone: HurtZone) {
    const caughtInStartup = d.state === 'attack' && !!d.move && d.stateFrame < d.move.startup;
    const counter = caughtInStartup || a.isCounterAttack;
    const armor = d.state === 'attack' && d.move?.armor;
    const armored = !!armor && d.stateFrame >= armor[0] && d.stateFrame < armor[1] && m.weight === 'light';

    let dmg = m.damage * a.stats.damageMul * (counter ? 1.25 : 1) * (1 - d.stats.defense);
    if (armored) dmg *= 0.5;
    d.hp -= dmg;
    d.framesSinceHit = 0;
    a.framesSinceLanded = 0;
    const comboing = d.state === 'hitstun' || d.state === 'guardbreak';
    a.combo = comboing ? a.combo + 1 : 1;
    d.poise -= m.poiseDamage * (1 - d.stats.staggerResist) * (counter ? 1.3 : 1);
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
    } else if (m.knockdown || d.poise <= 0) {
      knockdown = true;
      d.enterKnockdown();
      d.vel.addScaledVector(dir, kb);
    } else {
      d.enterHitstun(Math.round(m.hitstun * (counter ? 1.2 : 1)), reactionFor(m, zone));
      d.vel.addScaledVector(dir, kb);
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
    });
  }
}

function reactionFor(m: MoveDef, zone: HurtZone): PoseName {
  if (zone === 'legs') return 'hitLow';
  if (zone === 'abdomen' || (zone === 'chest' && m.height === 'mid')) return 'hitBody';
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
}

export function hurtSpheres(d: Fighter, height: Height): HurtSphere[] {
  const spheres = hurtSpheresUnscaled(d, height);
  if (d.scale !== 1) for (const h of spheres) h.r *= d.scale;
  return spheres;
}

function hurtSpheresUnscaled(d: Fighter, height: Height): HurtSphere[] {
  const rig = d.rig;
  if (height === 'high') {
    return [
      { zone: 'head', center: bonePoint(rig, 'head', 0.13, new Vector3()), r: 0.16 },
      { zone: 'chest', center: bonePoint(rig, 'chest', 0.2, new Vector3()), r: 0.17 },
    ];
  }
  if (height === 'mid') {
    return [
      { zone: 'chest', center: bonePoint(rig, 'chest', 0.12, new Vector3()), r: 0.2 },
      { zone: 'abdomen', center: bonePoint(rig, 'abdomen', 0.1, new Vector3()), r: 0.19 },
    ];
  }
  return [
    { zone: 'legs', center: bonePoint(rig, 'shinL', 0.22, new Vector3()), r: 0.11 },
    { zone: 'legs', center: bonePoint(rig, 'shinR', 0.22, new Vector3()), r: 0.11 },
    { zone: 'legs', center: bonePoint(rig, 'thighL', 0.25, new Vector3()), r: 0.12 },
    { zone: 'legs', center: bonePoint(rig, 'thighR', 0.25, new Vector3()), r: 0.12 },
  ];
}

function overlap(strike: Vector3, radius: number, d: Fighter, height: Height): { point: Vector3; zone: HurtZone } | null {
  for (const s of hurtSpheres(d, height)) {
    const dist = strike.distanceTo(s.center);
    if (dist < radius + s.r) {
      _c.subVectors(strike, s.center);
      if (_c.lengthSq() < 1e-8) _c.set(0, 0, 1);
      const point = s.center.clone().addScaledVector(_c.normalize(), s.r);
      return { point, zone: s.zone };
    }
  }
  return null;
}
