import { BrawlerAI, DEFAULT_AI, type AIConfig } from './ai';
import { Fighter } from './fighter';
import type { Rng } from './math';
import { ENEMY_MOVES, PLAYER_MOVES } from './moves';

export function createPlayer(): Fighter {
  return new Fighter('player', 'You', PLAYER_MOVES, { maxHp: 100, walkSpeed: 2.6 });
}

export function createBrawler(rng: Rng, cfg: Partial<AIConfig> = {}): { fighter: Fighter; ai: BrawlerAI } {
  const fighter = new Fighter('enemy', 'Brawler', ENEMY_MOVES, { maxHp: 70, walkSpeed: 1.9, staggerResist: 0.1 });
  return { fighter, ai: new BrawlerAI({ ...DEFAULT_AI, ...cfg }, rng) };
}
