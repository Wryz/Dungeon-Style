import { describe, expect, it } from 'vitest';
import { buy, canBuy, CATALOG, loadSave, NEW_SAVE, nextItem, statsWithGear, writeSave } from '../src/game/economy';
import { DEFAULT_STATS } from '../src/sim/fighter';

describe('economy', () => {
  it('buys tiers in order and applies stats', () => {
    const s = structuredClone(NEW_SAVE);
    s.coins = 1000;
    const cuffs2 = CATALOG.find((g) => g.slot === 'cuffs' && g.tier === 2)!;
    expect(canBuy(s, cuffs2)).toBe(false); // must own tier 1 first
    expect(buy(s, nextItem(s, 'cuffs')!)).toBe(true);
    expect(buy(s, nextItem(s, 'cuffs')!)).toBe(true);
    expect(s.gear.cuffs).toBe(2);
    expect(s.coins).toBe(1000 - 45 - 120);
    const st = statsWithGear(s);
    expect(st.damageMul).toBeCloseTo(DEFAULT_STATS.damageMul + 0.15);
    expect(st.reach).toBeCloseTo(0.03);
  });

  it('refuses purchases without enough coins', () => {
    const s = structuredClone(NEW_SAVE);
    s.coins = 10;
    expect(buy(s, nextItem(s, 'helmet')!)).toBe(false);
    expect(s.gear.helmet).toBe(0);
  });

  it('saves and loads', () => {
    const mem = new Map<string, string>();
    const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    const s = structuredClone(NEW_SAVE);
    s.coins = 77;
    s.loop = 2;
    s.gear.boots = 1;
    writeSave(s, store);
    expect(loadSave(store)).toEqual(s);
    mem.set('brawler.save.v1', '{broken');
    expect(loadSave(store)).toEqual(NEW_SAVE);
  });
});
