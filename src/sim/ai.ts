import type { Fighter } from './fighter';
import type { Rng } from './math';

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
export class BrawlerAI {
  private cooldown = 70;
  private strafe = 0;
  private strafeTimer = 0;
  private chain: string | null = null;
  private decidedSerial = -1;
  private willBlock = false;
  private punishDelay = -1;

  constructor(
    public cfg: AIConfig,
    private readonly rng: Rng,
    public plan: AIPlan = BRAWLER_PLAN,
    public director: AIDirector | null = null,
  ) {}

  think(self: Fighter, target: Fighter | null) {
    self.moveInput.set(0, 0, 0);
    if (!self.alive) return;
    if (!target || !target.alive || this.cfg.passive) return;

    const dist = self.distanceTo(target);

    // Attack strings: cancel straight -> haymaker.
    if (self.state === 'attack' && this.chain && self.inCancelWindow()) {
      const next = self.moves[this.chain];
      this.chain = null;
      if (next && dist < 1.6) self.startMove(next);
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
      dist <= target.move.reach + 0.4
    ) {
      self.startDefense('block', target.id * 100000 + target.attackSerial);
      this.willBlock = false;
      this.punishDelay = 0;
      return;
    }
    if (!self.free) return;

    // Punish a whiffed / blocked player move.
    if (this.punishDelay >= 0) {
      this.punishDelay++;
      if (this.punishDelay > 2) {
        this.punishDelay = -1;
        if (dist < this.plan.attackRange + 0.1 && this.rng.chance(0.6)) {
          this.start(self, this.plan.punish);
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
    const want = downed ? 1.7 : this.plan.range;
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

    if (downed) return;

    // Punish a player stuck in recovery.
    if (target.state === 'attack' && target.move && target.stateFrame > target.move.startup + target.move.active + 2) {
      if (dist < this.plan.attackRange + 0.05 && this.rng.chance(0.05 * this.cfg.aggression)) {
        this.start(self, this.plan.punish);
        return;
      }
    }

    this.cooldown -= this.cfg.aggression;
    if (this.cooldown <= 0 && dist < this.plan.attackRange && (!this.director || this.director.canAttack())) {
      this.start(self, this.rng.pickWeighted<string>(this.plan.moves));
    }
  }

  private start(self: Fighter, id: string) {
    const m = self.moves[id];
    if (!m) return;
    self.startMove(m);
    this.director?.claim();
    const next = this.plan.chains[id];
    this.chain = next && this.rng.chance(this.cfg.stringChance) ? next : null;
    this.cooldown = this.rng.range(50, 110);
  }
}
