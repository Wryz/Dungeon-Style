import { type WeaponId, WEAPONS } from './weapons';
import { type AIConfig, type AIPlan, BRAWLER_PLAN, BrawlerAI, DEFAULT_AI } from './ai';
import { Fighter, type FighterStats, type FighterStyle } from './fighter';
import type { Rng } from './math';
import { ENEMY_MOVES } from './moves';
import { BRAWLER_STYLE } from './roster';

export type EnemyKind = 'rookie' | 'brawler' | 'kicker' | 'bruiser' | 'imp' | 'demon' | 'champion' | 'minotaur' | 'cyclops';

export const BOSSES: EnemyKind[] = ['champion', 'minotaur', 'cyclops'];

export interface Archetype {
  kind: EnemyKind;
  name: string;
  stats: Partial<FighterStats>;
  style: FighterStyle;
  plan: AIPlan;
  ai: Partial<AIConfig>;
  /** Coins dropped on KO [min, max] before round bonuses. */
  coins: [number, number];
  /** Body size (giant bosses > 1, small creatures < 1). */
  scale?: number;
  boss?: boolean;
  /** Comes armed. */
  weapon?: WeaponId;
}

const LIGHT_STYLE: FighterStyle = {
  footwork: { stanceWidth: 0.95, stepFrames: 9, stepHeight: 0.045 },
  idle: {
    bounceHz: 2,
    bounceAmp: 0.03,
    swayAmp: 0.04,
    feintEvery: [2, 4],
    feintWeights: { jab: 3, shoulder: 1, level: 1, step: 2 },
    shuffleEvery: [0.7, 1.5],
    pawEvery: [1, 2],
    shoulderRoll: 0,
  },
};

const KICKER_STYLE: FighterStyle = {
  // Muay Thai: tall, square-ish stance, slow deliberate rhythm, lots of stepping.
  footwork: { stanceWidth: 1.05, stepFrames: 11, stepHeight: 0.06 },
  idle: {
    bounceHz: 1.3,
    bounceAmp: 0.02,
    swayAmp: 0.05,
    feintEvery: [1.6, 3.2],
    feintWeights: { jab: 1, shoulder: 1, level: 1, step: 4 },
    shuffleEvery: [0.6, 1.3],
    pawEvery: [0.9, 2],
    shoulderRoll: 0.03,
  },
};

const HEAVY_STYLE: FighterStyle = {
  footwork: { stanceWidth: 1.2, stepFrames: 14, stepHeight: 0.03 },
  idle: {
    bounceHz: 0.8,
    bounceAmp: 0.01,
    swayAmp: 0.05,
    feintEvery: [4, 7],
    feintWeights: { jab: 0, shoulder: 3, level: 0, step: 2 },
    shuffleEvery: [1.6, 3],
    pawEvery: [3, 5],
    shoulderRoll: 0.1,
  },
};

export const ARCHETYPES = {
  rookie: {
    kind: 'rookie',
    name: 'Rookie',
    stats: { maxHp: 45, walkSpeed: 2.1 },
    style: LIGHT_STYLE,
    plan: {
      moves: [
        ['rookieJab', 40],
        ['straight', 25],
        ['body', 20],
      ],
      range: 1.05,
      attackRange: 1.35,
      punish: 'rookieJab',
      chains: { rookieJab: 'straight' },
    },
    ai: { blockChance: 0.15, aggression: 1.1 },
    coins: [4, 7],
  },
  brawler: {
    kind: 'brawler',
    name: 'Brawler',
    stats: { maxHp: 70, walkSpeed: 1.9, staggerResist: 0.1 },
    style: BRAWLER_STYLE,
    plan: BRAWLER_PLAN,
    ai: {},
    coins: [7, 11],
  },
  kicker: {
    kind: 'kicker',
    name: 'Kicker',
    stats: { maxHp: 60, walkSpeed: 2.0 },
    style: KICKER_STYLE,
    plan: {
      moves: [
        ['teep', 30],
        ['kLowKick', 30],
        ['roundhouse', 25],
        ['straight', 15],
      ],
      range: 1.15,
      attackRange: 1.45,
      punish: 'teep',
      chains: { kLowKick: 'straight' },
    },
    ai: { blockChance: 0.25 },
    coins: [8, 12],
  },
  bruiser: {
    kind: 'bruiser',
    name: 'Bruiser',
    stats: { maxHp: 120, walkSpeed: 1.5, staggerResist: 0.4, defense: 0.15 },
    style: HEAVY_STYLE,
    plan: {
      moves: [
        ['bruiserHook', 35],
        ['bruiserBody', 35],
        ['sweep', 15],
      ],
      range: 1.0,
      attackRange: 1.25,
      punish: 'bruiserBody',
      chains: {},
    },
    ai: { blockChance: 0.4, aggression: 0.8, stringChance: 0 },
    coins: [16, 24],
  },
} as unknown as Record<EnemyKind, Archetype>; // creatures and bosses are added below

const BOSS_STYLE: FighterStyle = {
  footwork: { stanceWidth: 1.15, stepFrames: 15, stepHeight: 0.035 },
  idle: {
    bounceHz: 0.7,
    bounceAmp: 0.012,
    swayAmp: 0.06,
    feintEvery: [3, 6],
    feintWeights: { jab: 1, shoulder: 3, level: 0, step: 3 },
    shuffleEvery: [1.4, 2.8],
    pawEvery: [2.5, 4.5],
    shoulderRoll: 0.12,
  },
};

Object.assign(ARCHETYPES, {
  imp: {
    kind: 'imp',
    name: 'Imp',
    stats: { maxHp: 34, walkSpeed: 2.7 },
    style: LIGHT_STYLE,
    plan: { moves: [['rookieJab', 40], ['body', 25], ['teep', 20]], range: 1.05, attackRange: 1.35, punish: 'rookieJab', chains: { rookieJab: 'body' } },
    ai: { blockChance: 0.1, aggression: 1.35 },
    coins: [5, 8],
    scale: 0.72,
  },
  demon: {
    kind: 'demon',
    name: 'Demon',
    stats: { maxHp: 95, walkSpeed: 2.2, staggerResist: 0.25 },
    style: KICKER_STYLE,
    plan: { moves: [['hook', 30], ['straight', 20], ['roundhouse', 25], ['bruiserBody', 20]], range: 1.1, attackRange: 1.4, punish: 'straight', chains: { straight: 'hookChain' } },
    ai: { blockChance: 0.3, aggression: 1.15 },
    coins: [14, 20],
    scale: 1.12,
  },
  champion: {
    kind: 'champion',
    name: 'The Champion',
    stats: { maxHp: 260, walkSpeed: 1.7, staggerResist: 0.6, defense: 0.15 },
    style: BRAWLER_STYLE,
    plan: { moves: [['straight', 30], ['hook', 30], ['body', 25], ['bruiserHook', 15]], range: 1.05, attackRange: 1.3, punish: 'straight', chains: { straight: 'hookChain' } },
    ai: { blockChance: 0.45, aggression: 1 },
    coins: [60, 80],
    scale: 1.6,
    boss: true,
  },
  minotaur: {
    kind: 'minotaur',
    name: 'The Minotaur',
    weapon: 'axe',
    stats: { maxHp: 320, walkSpeed: 1.6, staggerResist: 0.7, defense: 0.2 },
    style: BOSS_STYLE,
    plan: { moves: [['bruiserHook', 30], ['bruiserBody', 30], ['sweep', 20], ['teep', 20]], range: 1.0, attackRange: 1.3, punish: 'bruiserBody', chains: {} },
    ai: { blockChance: 0.25, aggression: 1.05, stringChance: 0 },
    coins: [80, 110],
    scale: 1.75,
    boss: true,
  },
  cyclops: {
    kind: 'cyclops',
    name: 'The Cyclops',
    weapon: 'club',
    stats: { maxHp: 380, walkSpeed: 1.35, staggerResist: 0.75, defense: 0.25 },
    style: BOSS_STYLE,
    plan: { moves: [['bruiserHook', 35], ['sweep', 25], ['bruiserBody', 25], ['roundhouse', 15]], range: 1.0, attackRange: 1.3, punish: 'bruiserBody', chains: {} },
    ai: { blockChance: 0.2, aggression: 0.95, stringChance: 0 },
    coins: [100, 140],
    scale: 1.85,
    boss: true,
  },
} satisfies Partial<Record<EnemyKind, Archetype>>);

export interface EnemyMods {
  hpMul?: number;
  dmgMul?: number;
  aggression?: number;
}

/** Builds an enemy; round modifiers make later rounds tougher. */
export function createEnemy(kind: EnemyKind, rng: Rng, mods: EnemyMods = {}, baseAi: Partial<AIConfig> = {}): { fighter: Fighter; ai: BrawlerAI } {
  const a = ARCHETYPES[kind];
  const sc = a.scale ?? 1;
  const stats = { ...a.stats, maxHp: Math.round((a.stats.maxHp ?? 70) * (mods.hpMul ?? 1)) };
  stats.damageMul = (stats.damageMul ?? 1) * (mods.dmgMul ?? 1);
  // Bigger bodies stride further per step.
  if (stats.walkSpeed) stats.walkSpeed *= Math.sqrt(sc);
  const fighter = new Fighter('enemy', a.name, ENEMY_MOVES, stats, a.style);
  fighter.scale = sc;
  if (a.weapon) fighter.weapon = WEAPONS[a.weapon];
  const cfg = { ...DEFAULT_AI, ...baseAi, ...a.ai };
  cfg.aggression *= mods.aggression ?? 1;
  // Spacing scales with size.
  const plan = { ...a.plan, range: a.plan.range * sc, attackRange: a.plan.attackRange * sc };
  return { fighter, ai: new BrawlerAI(cfg, rng, plan) };
}

export function coinDrop(kind: EnemyKind, rng: Rng, round: number): number {
  const [lo, hi] = ARCHETYPES[kind].coins;
  return Math.round(rng.range(lo, hi + 1) * (1 + 0.08 * Math.max(0, round - 1)));
}
