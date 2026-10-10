import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { buildDungeon, roomAt } from '../src/world/dungeon';
import type { Grid } from '../src/world/grid';

function reachable(g: Grid, from: [number, number]): Set<number> {
  const seen = new Set<number>();
  const [si, sj] = g.cellOf(from[0], from[1]);
  const q: [number, number][] = [[si, sj]];
  seen.add(g.idx(si, sj));
  while (q.length) {
    const [i, j] = q.pop()!;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di;
      const nj = j + dj;
      if (!g.open(ni, nj) || seen.has(g.idx(ni, nj))) continue;
      seen.add(g.idx(ni, nj));
      q.push([ni, nj]);
    }
  }
  return seen;
}

describe('dungeon generation', () => {
  for (const seed of [1, 2, 3, 7, 42, 99, 1234]) {
    it(`seed ${seed}: connected chain of rooms with working gates`, () => {
      const L = buildDungeon(seed, 0);
      const g = L.grid;
      expect(L.rooms[0].kind).toBe('start');
      expect(L.rooms[L.rooms.length - 1].kind).toBe('exit');
      expect(L.rooms.filter((r) => r.kind === 'combat').every((r) => r.enemies.length > 0)).toBe(true);
      expect(g.isWalkable(...L.start)).toBe(true);
      expect(g.isWalkable(...L.terminal)).toBe(true);
      // Every room reachable with all gates open.
      const all = reachable(g, L.start);
      for (const r of L.rooms) {
        const [i, j] = g.cellOf(r.cx, r.cz);
        expect(all.has(g.idx(i, j))).toBe(true);
        expect(roomAt(L, r.cx, r.cz)).toBe(r);
      }
      // Sealing the first combat room cuts off the rest of the dungeon.
      const fight = L.rooms[1];
      for (const gate of fight.gates) g.setGate(gate, false);
      const sealed = reachable(g, L.start);
      const [ti, tj] = g.cellOf(...L.terminal);
      expect(sealed.has(g.idx(ti, tj))).toBe(false);
      for (const gate of fight.gates) g.setGate(gate, true);
      expect(g.wallRuns().length).toBeGreaterThan(8);
    });
  }

  it('pushes bodies out of walls and closed gates', () => {
    const L = buildDungeon(5, 0);
    const g = L.grid;
    const r = L.rooms[0];
    // Walk far past the west wall of the start room: resolved back inside.
    const p = new Vector3(g.ox + r.rect.x0 - 0.2, 0, r.cz);
    g.resolve(p, 0.3);
    expect(p.x).toBeGreaterThanOrEqual(g.ox + r.rect.x0 + 0.3 - 1e-6);
    const gate = L.rooms[1].gates[0];
    g.setGate(gate, false);
    const q = new Vector3(gate.cx, 0, gate.cz);
    g.resolve(q, 0.3);
    expect(g.isWalkable(q.x, q.z)).toBe(true);
  });

  it('later loops get smaller enemy groups', () => {
    let early = 0;
    let late = 0;
    for (let seed = 1; seed <= 40; seed++) {
      early += buildDungeon(seed, 0).rooms.reduce((n, r) => n + r.enemies.length, 0);
      late += buildDungeon(seed, 4).rooms.reduce((n, r) => n + r.enemies.length, 0);
    }
    expect(late).toBeLessThan(early);
  });
});

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

  it('later loops pay more and soften enemies', () => {
    const rng = new Rng(1);
    expect(coinDrop('brawler', new Rng(1), 3)).toBeGreaterThan(coinDrop('brawler', rng, 0));
    expect(createEnemy('bruiser', new Rng(1), 4).fighter.stats.maxHp).toBeLessThan(createEnemy('bruiser', new Rng(1), 0).fighter.stats.maxHp);
  });
});
