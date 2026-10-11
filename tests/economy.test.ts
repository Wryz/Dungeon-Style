import { describe, expect, it } from 'vitest';
import { buy, buyWeapon, canBuy, CATALOG, deathReward, loadSave, NEW_SAVE, nextItem, nextWeapon, SLOTS, statsWithGear, WEAPON_SHOP, writeSave } from '../src/game/economy';
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
    s.bestRound = 2;
    s.gear.boots = 1;
    writeSave(s, store);
    expect(loadSave(store)).toEqual(s);
    mem.set('brawler.save.v2', '{broken');
    expect(loadSave(store)).toEqual(NEW_SAVE);
  });
});

describe('progression', () => {
  it('six tiers in every slot, each better than the last, and a weapon to carry in', () => {
    for (const slot of SLOTS) {
      const tiers = CATALOG.filter((g) => g.slot === slot).sort((a, b) => a.tier - b.tier);
      expect(tiers.map((g) => g.tier)).toEqual([1, 2, 3, 4, 5, 6]);
      for (let i = 1; i < tiers.length; i++) {
        expect(tiers[i].price).toBeGreaterThan(tiers[i - 1].price);
        const sum = (g: (typeof tiers)[number]) => Object.values(g.mods).reduce((a, v) => a + Math.abs(v as number), 0);
        expect(sum(tiers[i])).toBeGreaterThan(sum(tiers[i - 1]));
      }
    }
    const s = structuredClone(NEW_SAVE);
    s.coins = 10000;
    expect(nextWeapon(s)?.weapon).toBe('bat');
    expect(buyWeapon(s, WEAPON_SHOP[2])).toBe(false); // in order
    for (const w of WEAPON_SHOP) expect(buyWeapon(s, w)).toBe(true);
    expect(s.weapon).toBe(6);
    expect(nextWeapon(s)).toBeNull();
  });

  it('fully geared, you are much harder to hurt — but never untouchable', () => {
    const s = structuredClone(NEW_SAVE);
    for (const slot of SLOTS) s.gear[slot] = 6;
    const st = statsWithGear(s);
    expect(st.defense).toBeLessThanOrEqual(0.7);
    expect(st.staggerResist).toBeLessThanOrEqual(0.8);
    expect(st.maxHp).toBeGreaterThan(statsWithGear(NEW_SAVE).maxHp + 100);
  });

  it('a run that ends in death still pays — more the further it got, a bonus for a new best', () => {
    expect(deathReward(1, 0)).toBeGreaterThan(0);
    expect(deathReward(6, 10)).toBeGreaterThan(deathReward(3, 10));
    expect(deathReward(8, 4)).toBeGreaterThan(deathReward(8, 10));
  });
});
