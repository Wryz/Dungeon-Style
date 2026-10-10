import { describe, expect, it } from 'vitest';
import { Tutorial } from '../src/game/tutorial';
import { CombatSim } from '../src/sim/combat';
import { createEnemy } from '../src/sim/enemies';
import { createPlayer } from '../src/sim/roster';

describe('tutorial', () => {
  it('can be completed by a player following the prompts', () => {
    const sim = new CombatSim(21);
    const player = createPlayer();
    player.pos.set(0, 0, 0);
    player.yaw = Math.PI / 2;
    const { fighter: partner, ai } = createEnemy('rookie', sim.rng);
    partner.pos.set(1.1, 0, 0);
    partner.yaw = -Math.PI / 2;
    sim.add(player);
    sim.add(partner, ai);
    const t = new Tutorial(partner, ai, player);
    const seen: string[] = [];
    for (let f = 0; f < 60 * 120 && !t.finished; f++) {
      if (!seen.includes(t.step)) seen.push(t.step);
      // Stay in range.
      const d = player.distanceTo(partner);
      player.moveInput.set(partner.pos.x - player.pos.x, 0, partner.pos.z - player.pos.z).normalize().multiplyScalar(d > 1.2 ? 1 : 0);
      switch (t.step) {
        case 'punch':
          if (f % 30 === 0) player.press('lpunch');
          break;
        case 'combo': {
          const seq = ['lpunch', 'rpunch', 'lpunch'] as const;
          if (f % 9 === 0) player.press(seq[Math.floor(f / 9) % 3]);
          break;
        }
        case 'counter':
          if (player.counter) player.press('rpunch');
          break;
        case 'kick':
          if (f % 40 === 0) player.press(f % 80 === 0 ? 'lkick' : 'rkick');
          break;
        default:
          break;
      }
      for (const e of sim.step()) t.onEvent(e);
      t.update();
    }
    expect(seen).toEqual(['punch', 'combo', 'defense', 'counter', 'kick', 'done']);
    expect(t.finished).toBe(true);
    expect(player.alive && partner.alive).toBe(true);
  });
});
