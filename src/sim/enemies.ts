import type { EnemyKind } from '../world/dungeon';
import { type AIConfig, type AIPlan, BRAWLER_PLAN, BrawlerAI, DEFAULT_AI } from './ai';
import { Fighter, type FighterStats, type FighterStyle } from './fighter';
import type { Rng } from './math';
import { ENEMY_MOVES } from './moves';
import { BRAWLER_STYLE } from './roster';

export interface Archetype {
  kind: EnemyKind;
  name: string;
  stats: Partial<FighterStats>;
  style: FighterStyle;
  plan: AIPlan;
  ai: Partial<AIConfig>;
  /** Coins dropped on KO [min, max] before loop bonuses. */
  coins: [number, number];
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

export const ARCHETYPES: Record<EnemyKind, Archetype> = {
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
};

/** Builds an enemy. Each memory erase (loop) makes enemies a little softer and calmer. */
export function createEnemy(kind: EnemyKind, rng: Rng, loop = 0, baseAi: Partial<AIConfig> = {}): { fighter: Fighter; ai: BrawlerAI } {
  const a = ARCHETYPES[kind];
  const ease = Math.max(0.6, 1 - 0.08 * loop);
  const stats = { ...a.stats, maxHp: Math.round((a.stats.maxHp ?? 70) * ease) };
  const fighter = new Fighter('enemy', a.name, ENEMY_MOVES, stats, a.style);
  const cfg = { ...DEFAULT_AI, ...baseAi, ...a.ai };
  cfg.aggression *= Math.max(0.7, 1 - 0.05 * loop);
  return { fighter, ai: new BrawlerAI(cfg, rng, a.plan) };
}

export function coinDrop(kind: EnemyKind, rng: Rng, loop: number): number {
  const [lo, hi] = ARCHETYPES[kind].coins;
  return Math.round(rng.range(lo, hi + 1) * (1 + 0.35 * loop));
}
