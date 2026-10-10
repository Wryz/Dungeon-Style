import { describe, expect, it } from 'vitest';
import { CombatSim, type CombatEvent } from '../src/sim/combat';
import type { Fighter } from '../src/sim/fighter';
import { createBrawler, createPlayer } from '../src/sim/roster';
import { selectPlayerMove } from '../src/sim/select';

function setup(dist = 1.0, aiCfg = { passive: true, blockChance: 0 }) {
  const sim = new CombatSim(3);
  const player = createPlayer();
  const { fighter: enemy, ai } = createBrawler(sim.rng, aiCfg);
  player.pos.set(0, 0, 0);
  player.yaw = Math.PI / 2; // facing +X
  enemy.pos.set(dist, 0, 0);
  enemy.yaw = -Math.PI / 2;
  sim.add(player);
  sim.add(enemy, ai);
  return { sim, player, enemy };
}

function run(sim: CombatSim, frames: number, onFrame?: (ev: CombatEvent[], i: number) => void): CombatEvent[] {
  const all: CombatEvent[] = [];
  for (let i = 0; i < frames; i++) {
    const ev = sim.step();
    all.push(...ev);
    onFrame?.(ev, i);
  }
  return all;
}

const hits = (ev: CombatEvent[], defender: Fighter) =>
  ev.filter((e): e is Extract<CombatEvent, { type: 'hit' }> => e.type === 'hit' && e.defender === defender);

describe('move selection', () => {
  it('picks moves from context', () => {
    expect(selectPlayerMove('punch', { dist: 1.0, counter: null, chainFrom: null })).toBe('jab');
    expect(selectPlayerMove('punch', { dist: 2.0, counter: null, chainFrom: null })).toBe('gazelle');
    expect(selectPlayerMove('kick', { dist: 3.0, counter: null, chainFrom: null })).toBe('flyingKick');
    expect(selectPlayerMove('kick', { dist: 1.0, counter: null, chainFrom: null })).toBe('frontKick');
    expect(selectPlayerMove('punch', { dist: 1.0, counter: 'duck', chainFrom: null })).toBe('uppercut');
    expect(selectPlayerMove('punch', { dist: 1.0, counter: 'weave', chainFrom: null })).toBe('counterHook');
    expect(selectPlayerMove('kick', { dist: 1.0, counter: 'slide', chainFrom: null })).toBe('slideKick');
    expect(selectPlayerMove('punch', { dist: 1.0, counter: null, chainFrom: 'jab' })).toBe('cross');
    expect(selectPlayerMove('punch', { dist: 1.0, counter: null, chainFrom: 'cross' })).toBe('hook');
  });
});

describe('offense', () => {
  it('jab lands on an idle dummy in range', () => {
    const { sim, player, enemy } = setup(1.0);
    run(sim, 2);
    player.press('punch');
    const ev = run(sim, 25);
    const h = hits(ev, enemy);
    expect(h.length).toBe(1);
    expect(h[0].move.id).toBe('jab');
    expect(enemy.hp).toBeLessThan(enemy.stats.maxHp);
  });

  it('jab whiffs out of range', () => {
    const { sim, player, enemy } = setup(1.45);
    // Force a jab rather than letting context pick the gazelle punch.
    run(sim, 1);
    player.startMove(player.moves.jab);
    const ev = run(sim, 25);
    expect(hits(ev, enemy).length).toBe(0);
  });

  it('chains jab -> cross -> hook with repeated presses', () => {
    const { sim, player } = setup(0.95);
    run(sim, 2);
    const used: string[] = [];
    player.press('punch');
    run(sim, 80, (ev, i) => {
      for (const e of ev) if (e.type === 'attackStart' && e.f === player) used.push(e.move.id);
      if (i % 7 === 0 && used.length < 3) player.press('punch');
    });
    expect(used.slice(0, 3)).toEqual(['jab', 'cross', 'hook']);
  });

  it('gazelle punch closes distance and lands', () => {
    const { sim, player, enemy } = setup(2.1);
    run(sim, 1);
    player.press('punch');
    const ev = run(sim, 40);
    const h = hits(ev, enemy);
    expect(h.map((e) => e.move.id)).toEqual(['gazelle']);
  });

  it('flying kick from far knocks down', () => {
    const { sim, player, enemy } = setup(3.2);
    run(sim, 1);
    player.press('kick');
    const ev = run(sim, 50);
    const h = hits(ev, enemy);
    expect(h.map((e) => e.move.id)).toEqual(['flyingKick']);
    expect(h[0].knockdown).toBe(true);
  });
});

describe('automatic defense', () => {
  function enemyAttack(id: string, dist = 1.05) {
    const s = setup(dist);
    run(s.sim, 2);
    s.enemy.startMove(s.enemy.moves[id]);
    return s;
  }

  it('ducks a haymaker, then the counter punch is an uppercut that knocks down', () => {
    const { sim, player, enemy } = enemyAttack('hook');
    const defended: string[] = [];
    const ev = run(sim, 34, (e) => {
      for (const x of e) if (x.type === 'defend') defended.push(x.kind);
    });
    expect(defended).toEqual(['duck']);
    expect(hits(ev, player).length).toBe(0);
    expect(player.counter?.kind).toBe('duck');
    player.press('punch');
    const ev2 = run(sim, 25);
    const h = hits(ev2, enemy);
    expect(h.map((e) => e.move.id)).toEqual(['uppercut']);
    expect(h[0].knockdown).toBe(true);
  });

  it('weaves a straight', () => {
    const { sim, player } = enemyAttack('straight');
    const ev = run(sim, 30);
    expect(ev.some((e) => e.type === 'defend' && e.kind === 'weave')).toBe(true);
    expect(hits(ev, player).length).toBe(0);
    expect(ev.some((e) => e.type === 'dodge')).toBe(true);
  });

  it('blocks a body blow and loses guard', () => {
    const { sim, player } = enemyAttack('body');
    const ev = run(sim, 30);
    expect(ev.some((e) => e.type === 'block')).toBe(true);
    expect(hits(ev, player).length).toBe(0);
    expect(player.guard).toBeLessThan(player.stats.maxGuard);
  });

  it('slides away from a sweep', () => {
    const { sim, player } = enemyAttack('sweep');
    const ev = run(sim, 40);
    expect(ev.some((e) => e.type === 'defend' && e.kind === 'slide')).toBe(true);
    expect(hits(ev, player).length).toBe(0);
  });

  it('a committed player gets hit', () => {
    const { sim, player } = enemyAttack('straight');
    // Wait until the straight is about to land, then throw a slow kick.
    run(sim, 14);
    player.startMove(player.moves.frontKick);
    const ev = run(sim, 20);
    expect(hits(ev, player).length).toBe(1);
  });

  it('jab does not interrupt an armored haymaker', () => {
    const { sim, player, enemy } = enemyAttack('hook', 0.95);
    run(sim, 10);
    player.startMove(player.moves.jab);
    const ev = run(sim, 30);
    const onEnemy = hits(ev, enemy);
    expect(onEnemy.length).toBe(1);
    expect(onEnemy[0].armored).toBe(true);
    expect(hits(ev, player).length).toBe(1);
  });
});

describe('full fight smoke test', () => {
  it('runs a long AI fight without NaNs', () => {
    const { sim, player, enemy } = setup(2, { passive: false, blockChance: 0.3 });
    let presses = 0;
    run(sim, 60 * 40, (_e, i) => {
      if (i % 23 === 0) {
        player.press(i % 3 === 0 ? 'kick' : 'punch');
        presses++;
      }
      player.moveInput.set(enemy.pos.x - player.pos.x, 0, enemy.pos.z - player.pos.z).normalize().multiplyScalar(0.5);
    });
    expect(presses).toBeGreaterThan(50);
    for (const f of [player, enemy]) {
      expect(Number.isFinite(f.pos.x)).toBe(true);
      expect(Number.isFinite(f.hp)).toBe(true);
    }
  });
});
