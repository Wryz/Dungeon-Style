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
        if (dist < 1.35 && this.rng.chance(0.6)) {
          this.start(self, 'straight');
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
    const want = downed ? 1.7 : 1.05;
    let mx = 0;
    let mz = 0;
    if (dist > want + 0.2) {
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
      if (dist < 1.3 && this.rng.chance(0.05 * this.cfg.aggression)) {
        this.start(self, 'straight');
        return;
      }
    }

    this.cooldown -= this.cfg.aggression;
    if (this.cooldown <= 0 && dist < 1.25) {
      const pick = this.rng.pickWeighted<string>([
        ['straight', 30],
        ['hook', 25],
        ['body', 25],
        ['sweep', 18],
      ]);
      this.start(self, pick);
    }
  }

  private start(self: Fighter, id: string) {
    const m = self.moves[id];
    if (!m) return;
    self.startMove(m);
    this.chain = id === 'straight' && this.rng.chance(this.cfg.stringChance) ? 'hookChain' : null;
    this.cooldown = this.rng.range(50, 110);
  }
}
