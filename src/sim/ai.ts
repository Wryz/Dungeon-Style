import { Vector3 } from 'three';
import type { Walkable } from '../world/collision';
import type { Drop } from './combat';
import type { Fighter } from './fighter';
import type { Rng } from './math';
import { weaponPlan } from './weapons';

export interface AIConfig {
  /** Scales attack frequency. 1 = baseline. */
  aggression: number;
  /** Chance to block a player attack when free. */
  blockChance: number;
  /** Chance to follow a straight with a haymaker. */
  stringChance: number;
  /** Training dummy: never attacks or blocks. */
  passive: boolean;
}

export const DEFAULT_AI: AIConfig = { aggression: 1, blockChance: 0.3, stringChance: 0.35, passive: false };

/** What an enemy archetype throws and how it manages distance. */
export interface AIPlan {
  /** Attack ids with selection weights. */
  moves: [string, number][];
  /** Preferred fighting distance (m). */
  range: number;
  /** Starts attacks when closer than this (m). */
  attackRange: number;
  /** Quick attack used to punish a whiffed / blocked player move. */
  punish: string;
  /** Follow-ups: after `from`, cancel into `next` (chance scaled by stringChance). */
  chains: Record<string, string>;
}

export const BRAWLER_PLAN: AIPlan = {
  moves: [
    ['straight', 30],
    ['hook', 25],
    ['body', 25],
    ['sweep', 18],
  ],
  range: 1.05,
  attackRange: 1.25,
  punish: 'straight',
  chains: { straight: 'hookChain' },
};

/**
 * Shared between enemies: only one may start an attack within a short window, so a
 * group takes turns instead of swinging all at once (fair, and readable).
 */
export class AIDirector {
  frame = 0;
  private lastAttack = -999;
  gap = 38;

  canAttack() {
    return this.frame - this.lastAttack >= this.gap;
  }

  claim() {
    this.lastAttack = this.frame;
  }
}

/** Simple brawler: keeps punching range, throws telegraphed attacks, sometimes blocks. */
const _probe = new Vector3();

export class BrawlerAI {
  private cooldown = 70;
  private strafe = 0;
  private strafeTimer = 0;
  /** Going round something: which way (+1 left / -1 right), and for how much longer. */
  private detourSide: 1 | -1 = 1;
  private detourFrames = 0;
  private walkable: Walkable | null = null;
  private chain: string | null = null;
  private decidedSerial = -1;
  private willBlock = false;
  private punishDelay = -1;
  /** Weapons on the floor (shared with the sim). */
  drops: Drop[] = [];
  private armed: { key: string; plan: AIPlan } | null = null;

  constructor(
    public cfg: AIConfig,
    private readonly rng: Rng,
    public plan: AIPlan = BRAWLER_PLAN,
    public director: AIDirector | null = null,
  ) {}

  think(self: Fighter, target: Fighter | null, walkable: Walkable | null = null) {
    this.walkable = walkable;
    self.moveInput.set(0, 0, 0);
    if (!self.alive) return;
    if (!target || !target.alive || this.cfg.passive) return;

    const dist = self.distanceTo(target);
    const plan = this.planFor(self);

    // Attack strings: cancel straight -> haymaker.
    if (self.state === 'attack' && this.chain && self.inCancelWindow()) {
      const next = self.moveDef(this.chain);
      this.chain = null;
      if (next && self.canUse(next) && dist < plan.attackRange + 0.35 * self.scale) self.startMove(next);
      return;
    }

    // Decide once per player attack whether to block it.
    if (target.state === 'attack' && target.attackSerial !== this.decidedSerial) {
      this.decidedSerial = target.attackSerial;
      this.willBlock = this.rng.chance(this.cfg.blockChance * (self.framesSinceHit < 40 ? 1.6 : 1));
    }
    if (
      this.willBlock &&
      self.free &&
      target.state === 'attack' &&
      target.move &&
      target.framesToActive <= 4 &&
      target.framesToActive >= 0 &&
      dist <= target.move.reach + 0.4 &&
      // Only what a guard can stop, with arms to stop it.
      target.move.blockable &&
      (target.strikeHeight === 'high' || target.strikeHeight === 'mid') &&
      !(self.isSevered('foreArmL') && self.isSevered('foreArmR'))
    ) {
      self.startDefense('block', target.id * 100000 + target.attackSerial);
      this.willBlock = false;
      this.punishDelay = 0;
      return;
    }
    if (!self.free) return;

    // Unarmed with a weapon lying nearby: go and grab it (unless already toe to toe).
    if (this.seekWeapon(self, dist)) return;

    // Punish a whiffed / blocked player move.
    if (this.punishDelay >= 0) {
      this.punishDelay++;
      if (this.punishDelay > 2) {
        this.punishDelay = -1;
        if (dist < plan.attackRange + 0.1 && this.rng.chance(0.6)) {
          this.start(self, plan.punish);
          return;
        }
      }
    }

    // Spacing.
    const dx = target.pos.x - self.pos.x;
    const dz = target.pos.z - self.pos.z;
    const len = Math.hypot(dx, dz) || 1;
    const fx = dx / len;
    const fz = dz / len;
    const downed = target.state === 'knockdown' || target.state === 'getup';
    const want = downed ? 1.7 : plan.range;
    let mx = 0;
    let mz = 0;
    if (dist > want + 0.1) {
      mx += fx;
      mz += fz;
    } else if (dist < want - 0.25) {
      mx -= fx * 0.8;
      mz -= fz * 0.8;
    }
    if (--this.strafeTimer <= 0) {
      this.strafe = this.rng.pickWeighted<number>([
        [0, 3],
        [1, 1],
        [-1, 1],
      ]);
      this.strafeTimer = Math.floor(this.rng.range(40, 100));
    }
    mx += -fz * this.strafe * 0.35;
    mz += fx * this.strafe * 0.35;
    const ml = Math.hypot(mx, mz);
    if (ml > 1) {
      mx /= ml;
      mz /= ml;
    }
    self.moveInput.set(mx, 0, mz).multiplyScalar(0.75);
    this.steer(self);

    if (downed) return;

    // Punish a player stuck in recovery.
    if (target.state === 'attack' && target.move && target.stateFrame > target.move.startup + target.move.active + 2) {
      if (dist < plan.attackRange + 0.05 && this.rng.chance(0.05 * this.cfg.aggression)) {
        this.start(self, plan.punish);
        return;
      }
    }

    // Tired fighters throw less.
    this.cooldown -= this.cfg.aggression * (0.45 + 0.55 * self.stamina);
    // With a weapon, crowded is bad: only the haft can land. Make room first — push them
    // off with a teep, or keep backing out to weapon range.
    const crowded = !!self.weapon && dist < plan.range * 0.72;
    if (crowded) {
      self.moveInput.set(-fx, 0, -fz).multiplyScalar(0.85);
      const teep = self.moves.teep;
      if (teep && this.cooldown <= 0 && self.canUse(teep) && this.rng.chance(0.04 * this.cfg.aggression)) {
        self.startMove(teep);
        this.cooldown = this.rng.range(40, 80);
      }
      return;
    }
    if (this.cooldown <= 0 && dist < plan.attackRange && (!this.director || this.director.canAttack())) {
      this.start(self, this.rng.pickWeighted<string>(plan.moves));
    }
  }

  /** The base plan, or how this fighter uses the weapon in its hands. */
  private planFor(self: Fighter): AIPlan {
    if (!self.weapon) return this.plan;
    const key = `${self.weapon.id}:${self.scale}`;
    if (this.armed?.key !== key) {
      const p = weaponPlan(self.weapon);
      this.armed = { key, plan: { ...p, range: p.range * self.scale, attackRange: p.attackRange * self.scale } };
    }
    return this.armed.plan;
  }

  private seekWeapon(self: Fighter, dist: number): boolean {
    if (self.weapon || !this.drops.length || self.isSevered('foreArmR')) return false;
    let best: Drop | null = null;
    let bd = 4.5 * self.scale;
    for (const d of this.drops) {
      if (d.weapon.style === 'twoHand' && self.isSevered('foreArmL')) continue;
      const dd = Math.hypot(d.pos.x - self.pos.x, d.pos.z - self.pos.z);
      if (dd < bd) {
        bd = dd;
        best = d;
      }
    }
    if (!best || (dist < 1.3 * self.scale && bd > 0.8 * self.scale)) return false;
    if (bd < 0.7 * self.scale) {
      self.pickupRequest = 6;
      return true;
    }
    const dx = best.pos.x - self.pos.x;
    const dz = best.pos.z - self.pos.z;
    self.moveInput.set(dx / bd, 0, dz / bd);
    this.steer(self);
    return true;
  }

  /**
   * Walk round props rather than into them: look a stride ahead along where we want to
   * go; if a crate, car or shelf is there, fan out to one side until the way is clear,
   * and keep to that side until we're past it (no dithering at the corner).
   */
  private steer(self: Fighter) {
    const w = this.walkable;
    const mi = self.moveInput;
    const mag = Math.hypot(mi.x, mi.z);
    if (!w || mag < 0.05) return;
    const ux = mi.x / mag;
    const uz = mi.z / mag;
    const clear = (x: number, z: number) => {
      for (const d of [0.45, 0.9]) {
        const px = self.pos.x + x * d * self.scale;
        const pz = self.pos.z + z * d * self.scale;
        if (!w.isWalkable(px, pz)) return false;
        _probe.set(px, 0.3, pz);
        if (w.solidAt?.(_probe, 0.3 * self.scale)) return false;
      }
      return true;
    };
    if (this.detourFrames > 0) this.detourFrames--;
    if (clear(ux, uz)) return;
    for (const side of [this.detourSide, -this.detourSide] as (1 | -1)[]) {
      for (const deg of [30, 55, 80, 105, 130]) {
        const a = (deg * Math.PI) / 180 * side;
        const c = Math.cos(a);
        const sn = Math.sin(a);
        const x = ux * c - uz * sn;
        const z = ux * sn + uz * c;
        if (clear(x, z)) {
          this.detourSide = side;
          this.detourFrames = 45;
          mi.set(x * mag, 0, z * mag);
          return;
        }
      }
      // Committed to a side: only try the other one once the commitment runs out.
      if (this.detourFrames > 0) break;
    }
  }

  private start(self: Fighter, id: string) {
    let m = self.moveDef(id);
    if (!m || !self.canUse(m)) {
      // That arm (or leg) is gone: throw something it still has — from the plan, or
      // failing that, a kick.
      const plan = this.planFor(self);
      const usable = plan.moves.filter(([mid]) => {
        const d = self.moveDef(mid);
        return d && self.canUse(d);
      });
      const fallback = ['teep', 'kLowKick', 'frontKick', 'lowKick'].find((k) => {
        const d = self.moveDef(k);
        return d && self.canUse(d);
      });
      const pick = usable.length ? this.rng.pickWeighted<string>(usable) : fallback;
      m = pick ? self.moveDef(pick) : undefined;
      if (!m || !self.canUse(m)) {
        this.cooldown = this.rng.range(30, 60);
        return;
      }
      id = pick!;
    }
    self.startMove(m);
    this.director?.claim();
    const next = this.planFor(self).chains[id];
    this.chain = next && this.rng.chance(this.cfg.stringChance) ? next : null;
    this.cooldown = this.rng.range(50, 110);
  }
}
