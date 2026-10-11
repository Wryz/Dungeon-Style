import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { toLocal } from '../src/body/footwork';
import { CombatSim } from '../src/sim/combat';
import { angleDelta } from '../src/sim/math';
import { createBrawler, createPlayer } from '../src/sim/roster';

function setup(enemyDist: number) {
  const sim = new CombatSim(13);
  const player = createPlayer();
  const { fighter: enemy, ai } = createBrawler(sim.rng, { passive: true, blockChance: 0 });
  player.pos.set(0, 0, 0);
  player.yaw = Math.PI / 2;
  enemy.pos.set(enemyDist, 0, 0);
  enemy.yaw = -Math.PI / 2;
  sim.add(player);
  sim.add(enemy, ai);
  for (let i = 0; i < 90; i++) sim.step();
  return { sim, player, enemy };
}

describe('walking outside a fight', () => {
  it('turns to face where it walks, even straight backwards', () => {
    const { sim, player } = setup(30);
    for (let i = 0; i < 60; i++) {
      player.moveInput.set(-1, 0, 0);
      sim.step();
    }
    expect(Math.abs(angleDelta(player.yaw, -Math.PI / 2))).toBeLessThan(0.2);
    for (let i = 0; i < 60; i++) {
      player.moveInput.set(0, 0, 1);
      sim.step();
    }
    expect(Math.abs(angleDelta(player.yaw, 0))).toBeLessThan(0.2);
  });

  it('alternates feet and lets them pass each other', () => {
    const { sim, player } = setup(30);
    const order: string[] = [];
    const was = { L: false, R: false };
    let passes = 0;
    let prevAhead: string | null = null;
    const l = new Vector3();
    const r = new Vector3();
    for (let i = 0; i < 150; i++) {
      player.moveInput.set(0, 0, -1);
      sim.step();
      for (const s of ['L', 'R'] as const) {
        const f = player.footwork.foot(s);
        if (f.stepping && !was[s]) order.push(s);
        was[s] = f.stepping;
      }
      toLocal(player.footwork.L.pos, player, l);
      toLocal(player.footwork.R.pos, player, r);
      const ahead = l.z > r.z ? 'L' : 'R';
      if (prevAhead && ahead !== prevAhead) passes++;
      prevAhead = ahead;
    }
    const steady = order.slice(2);
    expect(steady.length).toBeGreaterThan(6);
    for (let k = 1; k < steady.length; k++) expect(steady[k]).not.toBe(steady[k - 1]);
    expect(passes).toBeGreaterThan(4);
  });

  it('still squares up to an opponent in range while backing away', () => {
    const { sim, player, enemy } = setup(2.2);
    for (let i = 0; i < 40; i++) {
      player.moveInput.set(-1, 0, 0);
      sim.step();
    }
    const toEnemy = Math.atan2(enemy.pos.x - player.pos.x, enemy.pos.z - player.pos.z);
    expect(Math.abs(angleDelta(player.yaw, toEnemy))).toBeLessThan(0.3);
  });
});
