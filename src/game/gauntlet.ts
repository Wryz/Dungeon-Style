import type { ThemeId } from '../arena/themes';
import type { EnemyKind, EnemyMods } from '../sim/enemies';
import type { Rng } from '../sim/math';

export const THEME_ORDER: ThemeId[] = ['ring', 'street', 'grocery', 'colosseum'];
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
  if (round >= 6) p.push(['imp', 3]);
  if (round >= 7) p.push(['demon', 2 + Math.min(3, (round - 7) * 0.5)]);
  // The rookies fade out as the gauntlet goes on.
  if (round >= 6) p[0][1] = 1;
  return p;
}

/**
 * Round n of the gauntlet: the arena theme rotates every round, every fourth round is
 * a boss fight in the colosseum, groups grow, mythical creatures join from round 6, and
 * everything gets tougher.
 */
export function roundSpec(round: number, rng: Rng): RoundSpec {
  const theme = THEME_ORDER[(round - 1) % THEME_ORDER.length];
  const tier = round - 1;
  const mods = (count: number): EnemyMods => ({
    // Groups are individually a little softer so the fight stays fair.
    hpMul: (1 + 0.07 * tier) * (1 - 0.12 * (count - 1)),
    dmgMul: 1 + 0.04 * tier,
    aggression: Math.min(1.6, 0.9 + 0.04 * round),
  });
  let spawns: Spawn[];
  let boss: EnemyKind | null = null;
  if (round % 4 === 0) {
    boss = BOSS_ORDER[(round / 4 - 1) % BOSS_ORDER.length];
    const cycle = Math.floor((round / 4 - 1) / BOSS_ORDER.length);
    spawns = [{ kind: boss, ...mods(1), hpMul: 1 + 0.25 * cycle + 0.04 * tier }];
    // Later bosses bring minions.
    if (round >= 8) spawns.push({ kind: 'imp', ...mods(2) });
    if (round >= 16) spawns.push({ kind: 'imp', ...mods(3) });
  } else {
    const count = round <= 2 ? 1 : round <= 5 ? (rng.chance(0.5) ? 1 : 2) : round <= 9 ? 2 : round <= 15 ? 3 : 4;
    spawns = [];
    for (let i = 0; i < count; i++) spawns.push({ kind: rng.pickWeighted(pool(round)), ...mods(count) });
  }
  const reward = 15 + 6 * round + (boss ? 40 + 10 * round : 0);
  return { round, theme, spawns, boss, reward };
}
