import type { Button, Fighter } from './fighter';
import {
  DEFENSES,
  type DefenseKind,
  FLYING_KICK_MAX,
  FLYING_KICK_MIN,
  GAZELLE_RANGE,
  type MoveDef,
  PUNCH_RANGE,
} from './moves';

export interface MoveContext {
  /** Distance to the target, or Infinity when there is none. */
  dist: number;
  /** Open counter window after a successful defense. */
  counter: DefenseKind | null;
  /** Current move id when inside its cancel window. */
  chainFrom: string | null;
}

const PUNCH_COUNTERS: Record<DefenseKind, string> = {
  duck: 'uppercut',
  weave: 'counterHook',
  slide: 'gazelle',
  block: 'counterCross',
};

const KICK_COUNTERS: Record<DefenseKind, string> = {
  duck: 'frontKick',
  weave: 'frontKick',
  slide: 'slideKick',
  block: 'frontKick',
};

const PUNCH_CHAINS: Record<string, string> = { jab: 'cross', cross: 'hook', counterCross: 'hook' };
const KICK_CHAINS: Record<string, string> = { jab: 'frontKick', cross: 'frontKick', counterCross: 'frontKick' };

/**
 * Two buttons, many moves: the specific technique depends on the situation.
 * Returns null when the input can't do anything right now (e.g. mid-move, no chain).
 */
export function selectPlayerMove(button: Button, ctx: MoveContext): string | null {
  if (ctx.counter) return (button === 'punch' ? PUNCH_COUNTERS : KICK_COUNTERS)[ctx.counter];
  if (ctx.chainFrom) return (button === 'punch' ? PUNCH_CHAINS : KICK_CHAINS)[ctx.chainFrom] ?? null;
  if (button === 'punch') {
    return ctx.dist > PUNCH_RANGE && ctx.dist <= GAZELLE_RANGE ? 'gazelle' : 'jab';
  }
  return ctx.dist >= FLYING_KICK_MIN && ctx.dist <= FLYING_KICK_MAX ? 'flyingKick' : 'frontKick';
}

export function moveContext(f: Fighter): MoveContext {
  const t = f.target && f.target.alive ? f.target : null;
  return {
    dist: t ? f.distanceTo(t) : Infinity,
    counter: f.counter && f.counter.frames > 0 ? f.counter.kind : null,
    chainFrom: f.inCancelWindow() ? f.move!.id : null,
  };
}

/**
 * Picks the automatic defensive reaction for an incoming attack based on its height,
 * shape and how many frames are left before it lands. Returns null when nothing fits
 * (too late, or the only option is on cooldown) — the hit will land.
 */
export function chooseDefense(f: Fighter, move: MoveDef, framesToActive: number): DefenseKind | null {
  let prefs: DefenseKind[];
  if (move.height === 'low') prefs = ['slide'];
  else if (!move.blockable) prefs = ['slide'];
  else if (move.height === 'mid') prefs = f.guard < 25 ? ['slide', 'block'] : ['block', 'slide'];
  else if (move.kind === 'hook' || move.kind === 'uppercut') prefs = ['duck', 'weave', 'block'];
  else prefs = ['weave', 'duck', 'block'];

  for (const kind of prefs) {
    const def = DEFENSES[kind];
    if (f.defenseCooldown[kind] > 0) continue;
    // Can we get into position before the strike lands? (one frame of grace)
    if (def.startup > Math.max(framesToActive, 0) + 1) continue;
    return kind;
  }
  return null;
}
