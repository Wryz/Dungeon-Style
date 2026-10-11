import { DEFAULT_STATS, type FighterStats } from '../sim/fighter';

export type Slot = 'helmet' | 'chest' | 'legs' | 'boots' | 'cuffs';
export const SLOTS: Slot[] = ['helmet', 'chest', 'legs', 'boots', 'cuffs'];
export const SLOT_NAMES: Record<Slot, string> = {
  helmet: 'Helmet',
  chest: 'Chestplate',
  legs: 'Leggings',
  boots: 'Boots',
  cuffs: 'Fist cuffs',
};

type StatMods = Partial<Pick<FighterStats, 'defense' | 'staggerResist' | 'damageMul' | 'reach' | 'knockbackMul' | 'walkSpeed' | 'maxHp'>>;

export interface GearItem {
  slot: Slot;
  tier: 1 | 2 | 3;
  name: string;
  price: number;
  /** Added to the fighter's base stats (multipliers add to 1.0). */
  mods: StatMods;
  /** Visual material for the gear meshes. */
  material: 'cloth' | 'leather' | 'iron' | 'steel' | 'gold';
}

export const CATALOG: GearItem[] = [
  { slot: 'helmet', tier: 1, name: 'Leather Cap', price: 40, mods: { defense: 0.04, staggerResist: 0.05 }, material: 'leather' },
  { slot: 'helmet', tier: 2, name: 'Iron Helm', price: 110, mods: { defense: 0.08, staggerResist: 0.12 }, material: 'iron' },
  { slot: 'helmet', tier: 3, name: 'Steel Visor', price: 240, mods: { defense: 0.12, staggerResist: 0.2 }, material: 'steel' },
  { slot: 'chest', tier: 1, name: 'Padded Vest', price: 50, mods: { defense: 0.06, maxHp: 10 }, material: 'cloth' },
  { slot: 'chest', tier: 2, name: 'Chain Shirt', price: 130, mods: { defense: 0.12, maxHp: 20 }, material: 'iron' },
  { slot: 'chest', tier: 3, name: 'Breastplate', price: 280, mods: { defense: 0.18, maxHp: 30, walkSpeed: -0.1 }, material: 'steel' },
  { slot: 'legs', tier: 1, name: 'Shin Wraps', price: 35, mods: { staggerResist: 0.06 }, material: 'cloth' },
  { slot: 'legs', tier: 2, name: 'Greaves', price: 100, mods: { staggerResist: 0.12, defense: 0.03 }, material: 'iron' },
  { slot: 'legs', tier: 3, name: 'Plated Legs', price: 220, mods: { staggerResist: 0.2, defense: 0.06 }, material: 'steel' },
  { slot: 'boots', tier: 1, name: 'Runners', price: 30, mods: { walkSpeed: 0.15 }, material: 'leather' },
  { slot: 'boots', tier: 2, name: 'Fight Boots', price: 90, mods: { walkSpeed: 0.25, staggerResist: 0.05 }, material: 'iron' },
  { slot: 'boots', tier: 3, name: 'Wind Steps', price: 200, mods: { walkSpeed: 0.35, staggerResist: 0.08 }, material: 'gold' },
  { slot: 'cuffs', tier: 1, name: 'Hard Wraps', price: 45, mods: { damageMul: 0.08 }, material: 'leather' },
  { slot: 'cuffs', tier: 2, name: 'Iron Cuffs', price: 120, mods: { damageMul: 0.15, reach: 0.03, knockbackMul: 0.15 }, material: 'iron' },
  { slot: 'cuffs', tier: 3, name: 'Spiked Cuffs', price: 260, mods: { damageMul: 0.25, reach: 0.05, knockbackMul: 0.3 }, material: 'gold' },
];

export function item(slot: Slot, tier: number): GearItem | undefined {
  return CATALOG.find((g) => g.slot === slot && g.tier === tier);
}

export interface SaveData {
  coins: number;
  /** Highest tier owned per slot (0 = none); the best owned piece is worn. */
  gear: Record<Slot, number>;
  /** Best gauntlet round reached. */
  bestRound: number;
  tutorialDone: boolean;
}

export const NEW_SAVE: SaveData = { coins: 0, gear: { helmet: 0, chest: 0, legs: 0, boots: 0, cuffs: 0 }, bestRound: 0, tutorialDone: false };
const KEY = 'brawler.save.v2';

export function loadSave(storage: Pick<Storage, 'getItem'> | null = safeStorage()): SaveData {
  try {
    const raw = storage?.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Partial<SaveData>;
      return {
        coins: Math.max(0, Number(s.coins) || 0),
        gear: { ...NEW_SAVE.gear, ...(s.gear ?? {}) },
        bestRound: Math.max(0, Number(s.bestRound) || 0),
        tutorialDone: !!s.tutorialDone,
      };
    }
  } catch {
    // Corrupt or unavailable storage: start fresh.
  }
  return structuredClone(NEW_SAVE);
}

export function writeSave(s: SaveData, storage: Pick<Storage, 'setItem'> | null = safeStorage()) {
  try {
    storage?.setItem(KEY, JSON.stringify(s));
  } catch {
    // Not persisted this session.
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/** The next piece on offer for a slot, or null when maxed. */
export function nextItem(s: SaveData, slot: Slot): GearItem | null {
  return item(slot, s.gear[slot] + 1) ?? null;
}

export function canBuy(s: SaveData, g: GearItem): boolean {
  return s.gear[g.slot] === g.tier - 1 && s.coins >= g.price;
}

export function buy(s: SaveData, g: GearItem): boolean {
  if (!canBuy(s, g)) return false;
  s.coins -= g.price;
  s.gear[g.slot] = g.tier;
  return true;
}

/** Player stats with all worn gear applied. */
export function statsWithGear(s: SaveData, base: FighterStats = DEFAULT_STATS): FighterStats {
  const out = { ...base };
  for (const slot of SLOTS) {
    const g = item(slot, s.gear[slot]);
    if (!g) continue;
    for (const [k, v] of Object.entries(g.mods) as [keyof StatMods, number][]) out[k] += v;
  }
  out.defense = Math.min(0.6, out.defense);
  out.staggerResist = Math.min(0.7, out.staggerResist);
  return out;
}
