import { describe, expect, it } from 'vitest';
import { roundSpec, THEME_ORDER } from '../src/game/gauntlet';
import { ARCHETYPES, BOSSES } from '../src/sim/enemies';
import { Rng } from '../src/sim/math';

const totalHp = (round: number) =>
  roundSpec(round, new Rng(round)).spawns.reduce((n, s) => n + (ARCHETYPES[s.kind].stats.maxHp ?? 70) * (s.hpMul ?? 1), 0);

describe('gauntlet rounds', () => {
  it('rotates arena themes every round', () => {
    for (let r = 1; r <= 8; r++) expect(roundSpec(r, new Rng(1)).theme).toBe(THEME_ORDER[(r - 1) % 4]);
  });

  it('gets harder: more total health, more opponents, tougher modifiers', () => {
    expect(totalHp(9)).toBeGreaterThan(totalHp(1) * 2);
    expect(roundSpec(10, new Rng(3)).spawns.length).toBeGreaterThan(roundSpec(1, new Rng(3)).spawns.length);
    expect(roundSpec(12, new Rng(1)).spawns[0].dmgMul!).toBeGreaterThan(roundSpec(1, new Rng(1)).spawns[0].dmgMul!);
  });

  it('every fourth round is a giant boss in the colosseum', () => {
    for (const r of [4, 8, 12]) {
      const s = roundSpec(r, new Rng(1));
      expect(s.boss && BOSSES.includes(s.boss)).toBe(true);
      expect(s.theme).toBe('colosseum');
      expect(ARCHETYPES[s.boss!].scale).toBeGreaterThan(1.5);
    }
    expect(roundSpec(3, new Rng(1)).boss).toBeNull();
  });

  it('brings in mythical creatures later on', () => {
    const early = new Set<string>();
    const late = new Set<string>();
    for (let seed = 1; seed < 30; seed++) {
      for (let r = 1; r <= 3; r++) roundSpec(r, new Rng(seed)).spawns.forEach((s) => early.add(s.kind));
      for (let r = 9; r <= 11; r++) roundSpec(r, new Rng(seed)).spawns.forEach((s) => late.add(s.kind));
    }
    expect(early.has('demon') || early.has('imp')).toBe(false);
    expect(late.has('demon') && late.has('imp')).toBe(true);
  });
});
