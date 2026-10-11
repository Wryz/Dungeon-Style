import type { ThemeId } from '../arena/themes';
import type { EnemyKind, EnemyMods } from '../sim/enemies';
import type { Rng } from '../sim/math';

/** Regular rounds cycle through these; every boss is fought in the colosseum. */
export const ARENA_ORDER: ThemeId[] = ['ring', 'street', 'grocery', 'warehouse', 'bar', 'dojo', 'rooftop'];

/** The arena for round n. */
export function themeFor(round: number): ThemeId {
  if (round % 4 === 0) return 'colosseum';
  const regular = round - Math.floor(round / 4) - 1;
  return ARENA_ORDER[regular % ARENA_ORDER.length];
}
const BOSS_ORDER: EnemyKind[] = ['champion', 'minotaur', 'cyclops'];

export interface Spawn extends EnemyMods {
  kind: EnemyKind;
}

export interface RoundSpec {
  round: number;
  theme: ThemeId;
  spawns: Spawn[];
  boss: EnemyKind | null;
  /** Coins for clearing the round. */
  reward: number;
}

/** Which opponents can appear by round (newer ones weighted higher once unlocked). */
function pool(round: number): [EnemyKind, number][] {
  const p: [EnemyKind, number][] = [['rookie', 3]];
  if (round >= 2) p.push(['brawler', 3]);
  if (round >= 3) p.push(['kicker', 3]);
  if (round >= 5) p.push(['bruiser', 2]);
  if (round >= 5) p.push(['samurai', 2.5]);
  if (round >= 6) p.push(['ninja', 2.5]);
  if (round >= 6) p.push(['imp', 3]);
  if (round >= 7) p.push(['demon', 2 + Math.min(3, (round - 7) * 0.5)]);
  // The rookies fade out as the gauntlet goes on.
  if (round >= 6) p[0][1] = 1;
  return p;
}

/**
 * Round n of the gauntlet: one opponent at a time. The arena theme rotates every round,
 * every fourth round is a giant boss in the colosseum, mythical creatures join from
 * round 6, and everyone gets tougher as the rounds go on.
 */
export function roundSpec(round: number, rng: Rng): RoundSpec {
  const theme = themeFor(round);
  const tier = round - 1;
  const mods: EnemyMods = {
    hpMul: 1 + 0.1 * tier,
    dmgMul: 1 + 0.05 * tier,
    aggression: Math.min(1.6, 0.9 + 0.04 * round),
  };
  let boss: EnemyKind | null = null;
  let kind: EnemyKind;
  if (round % 4 === 0) {
    boss = BOSS_ORDER[(round / 4 - 1) % BOSS_ORDER.length];
    const cycle = Math.floor((round / 4 - 1) / BOSS_ORDER.length);
    kind = boss;
    mods.hpMul = 1 + 0.25 * cycle + 0.04 * tier;
  } else {
    kind = rng.pickWeighted(pool(round));
  }
  const reward = 15 + 6 * round + (boss ? 40 + 10 * round : 0);
  return { round, theme, spawns: [{ kind, ...mods }], boss, reward };
}
