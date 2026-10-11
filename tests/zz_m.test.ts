import { it } from 'vitest';
import { CombatSim } from '../src/sim/combat';
import { createEnemy } from '../src/sim/enemies';
import { createPlayer } from '../src/sim/roster';
import { WEAPON_MOVES } from '../src/sim/weapons';
import { RectWalkable } from '../src/world/collision';
it('m', () => {
  for (const mid of ['sweep', 'sweepBack', 'overhead']) {
    const r: string[] = [];
    for (const d of [1.4, 1.8, 2.2, 2.6, 3.0, 3.4]) {
      const sim = new CombatSim(4);
      sim.walkable = new RectWalkable(-50, 50, -50, 50);
      const p = createPlayer(); p.autoDefense = false;
      const { fighter: e, ai } = createEnemy('minotaur', sim.rng); ai.cfg.passive = true;
      p.yaw = Math.PI / 2; e.pos.set(d, 0, 0); e.yaw = -Math.PI / 2;
      sim.add(p); sim.add(e, ai);
      for (let i = 0; i < 30; i++) sim.step();
      p.pos.set(0, 0, 0); e.pos.set(d, 0, 0);
      e.startMove(WEAPON_MOVES[mid], false, 'head');
      let out = '-';
      for (let i = 0; i < 70; i++) for (const x of sim.step()) {
        if (x.type === 'hit' && x.attacker === e) out = `${x.bone}${x.weapon ? '' : '(HAFT)'}@${e.stateFrame}`;
        if (x.type === 'bump') out = 'bump';
      }
      r.push(`${d}:${out}`);
    }
    console.log(`minotaur/${mid}: ${r.join(' | ')}`);
  }
});
