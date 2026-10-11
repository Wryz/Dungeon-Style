import { describe, expect, it } from 'vitest';
import { type CombatEvent, CombatSim } from '../src/sim/combat';
import { createEnemy, type EnemyKind } from '../src/sim/enemies';
import { createPlayer } from '../src/sim/roster';
import { RectWalkable } from '../src/world/collision';

/** Player vs an enemy of some size, `gap` apart (enemy-scaled). */
function face(kind: EnemyKind, gap: number) {
  const sim = new CombatSim(8);
  sim.walkable = new RectWalkable(-50, 50, -50, 50);
  const player = createPlayer();
  player.autoDefense = false;
  const { fighter: enemy, ai } = createEnemy(kind, sim.rng);
  ai.cfg.passive = true;
  player.yaw = Math.PI / 2;
  enemy.pos.set(gap, 0, 0);
  enemy.yaw = -Math.PI / 2;
  sim.add(player);
  sim.add(enemy, ai);
  for (let i = 0; i < 40; i++) sim.step();
  return { sim, player, enemy };
}

const landed = (ev: CombatEvent[], by: unknown) => ev.some((e) => e.type === 'hit' && e.attacker === by);

describe('fighting opponents of different sizes', () => {
  it('a giant punches down onto a normal-sized head', () => {
    const { sim, player, enemy } = face('champion', 1.65);
    enemy.startMove(enemy.moves.straight, false, 'head');
    const ev: CombatEvent[] = [];
    for (let i = 0; i < 40; i++) ev.push(...sim.step());
    expect(landed(ev, enemy)).toBe(true);
    expect(player.hp).toBeLessThan(player.stats.maxHp);
  });

  it('against a giant you go for what you can reach, and reach up for it', () => {
    const { sim, player, enemy } = face('champion', 1.35);
    let hitsLanded = 0;
    let heads = 0;
    for (let k = 0; k < 8; k++) {
      enemy.pos.set(1.35, 0, 0);
      player.pos.set(0, 0, 0);
      player.press(k % 2 ? 'rpunch' : 'lpunch');
      for (let i = 0; i < 45; i++) {
        for (const e of sim.step()) {
          if (e.type === 'hit' && e.attacker === player) {
            hitsLanded++;
            if (e.zone === 'head') heads++;
          }
        }
      }
    }
    expect(hitsLanded).toBeGreaterThanOrEqual(5);
    // A 1.6x giant's head is out of reach for most of these.
    expect(heads).toBeLessThan(hitsLanded);
  });

  it('bends down to hit a small creature', () => {
    const { sim, player, enemy } = face('imp', 1.0);
    player.press('rpunch');
    let lowest = Infinity;
    const ev: CombatEvent[] = [];
    for (let i = 0; i < 30; i++) {
      ev.push(...sim.step());
      lowest = Math.min(lowest, player.rig.head.pos.y);
    }
    expect(landed(ev, player)).toBe(true);
    // Hips sink and the body folds forward to get down to it.
    expect(lowest).toBeLessThan(1.38);
    expect(enemy.hp).toBeLessThan(enemy.stats.maxHp);
  });
});
