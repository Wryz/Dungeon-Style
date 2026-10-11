import { describe, expect, it } from 'vitest';
import { CombatSim } from '../src/sim/combat';
import { ARCHETYPES, coinDrop, createEnemy } from '../src/sim/enemies';
import { createPlayer } from '../src/sim/roster';
import { Rng } from '../src/sim/math';

describe('enemy archetypes', () => {
  for (const kind of Object.keys(ARCHETYPES) as (keyof typeof ARCHETYPES)[]) {
    it(`${kind} fights without errors and uses its own moves`, () => {
      const sim = new CombatSim(17);
      const player = createPlayer();
      player.pos.set(0, 0, 0);
      const { fighter, ai } = createEnemy(kind, sim.rng);
      fighter.pos.set(2, 0, 0);
      sim.add(player);
      sim.add(fighter, ai);
      const used = new Set<string>();
      for (let i = 0; i < 60 * 30; i++) {
        sim.step();
        if (fighter.state === 'attack' && fighter.move) used.add(fighter.move.id);
        if (!player.alive) break;
      }
      const plan = new Set(ARCHETYPES[kind].plan.moves.map(([m]) => m));
      expect([...used].some((m) => plan.has(m))).toBe(true);
      expect(Number.isFinite(fighter.pos.x)).toBe(true);
    });
  }

  it('groups take turns attacking', () => {
    const sim = new CombatSim(3);
    const player = createPlayer();
    sim.add(player);
    const enemies = [0, 1, 2].map((k) => {
      const { fighter, ai } = createEnemy('rookie', sim.rng);
      fighter.pos.set(1.2 * Math.cos(k * 2.1), 0, 1.2 * Math.sin(k * 2.1));
      sim.add(fighter, ai);
      return fighter;
    });
    let maxSimultaneousStarts = 0;
    for (let i = 0; i < 60 * 20; i++) {
      sim.step();
      const starting = enemies.filter((e) => e.state === 'attack' && e.stateFrame === 0).length;
      maxSimultaneousStarts = Math.max(maxSimultaneousStarts, starting);
    }
    expect(maxSimultaneousStarts).toBeLessThanOrEqual(1);
  });

  it('later rounds pay more and toughen enemies', () => {
    expect(coinDrop('brawler', new Rng(1), 8)).toBeGreaterThan(coinDrop('brawler', new Rng(1), 1));
    expect(createEnemy('bruiser', new Rng(1), { hpMul: 1.5 }).fighter.stats.maxHp).toBeGreaterThan(createEnemy('bruiser', new Rng(1)).fighter.stats.maxHp);
  });

  it('bosses are giants with long reach', () => {
    const { fighter, ai } = createEnemy('minotaur', new Rng(1));
    expect(fighter.scale).toBeGreaterThan(1.5);
    expect(ai.plan.attackRange).toBeGreaterThan(2);
  });
});
