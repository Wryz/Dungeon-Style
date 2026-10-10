import type { Ease } from './math';
import type { PoseName } from '../body/poses';

export type Height = 'high' | 'mid' | 'low';
export type DefenseKind = 'block' | 'duck' | 'weave' | 'slide';
export type Limb = 'handL' | 'handR' | 'footL' | 'footR';
/** Strike shape, used by auto-defense to pick a reaction. */
export type StrikeKind = 'straight' | 'hook' | 'uppercut' | 'kick' | 'sweep';
export type Weight = 'light' | 'medium' | 'heavy';

/** Keyframe time marker: [phase, fraction] where phase is startup/active/recovery. */
export type Marker = ['s' | 'a' | 'r', number];

export interface Key {
  at: Marker;
  pose: PoseName;
  ease?: Ease;
}

export interface MoveDef {
  id: string;
  name: string;
  /** Frames (60 fps). */
  startup: number;
  active: number;
  recovery: number;
  limb: Limb;
  height: Height;
  kind: StrikeKind;
  weight: Weight;
  damage: number;
  guardDamage: number;
  /** Stagger build-up; enough of it knocks the target down. */
  poiseDamage: number;
  hitstun: number;
  blockstun: number;
  /** Knockback speed applied to the target's body (m/s). */
  knockback: number;
  knockdown?: boolean;
  /** Ragdoll impulse magnitude (N·s) at the contact point. */
  impulse: number;
  /** Upward share of the impulse direction (0..1). */
  lift?: number;
  hitstop: number;
  shake: number;
  /** Strike sphere radius (m). */
  radius: number;
  /** Rough reach from the attacker's centre, used by AI and auto-defense to judge threat. */
  reach: number;
  lunge?: { from: number; to: number; distance: number };
  /** Ignores interruption by light hits during these frames (relative to move start). */
  armor?: [number, number];
  /** Airborne/low-profile frames that make low/high attacks whiff (relative to move start). */
  evades?: { from: number; to: number; heights: Height[] };
  blockable: boolean;
  /** Moves this can cancel into, and the window (relative to move start) where that is allowed. */
  cancel?: { into: string[]; from: number; to: number };
  keys: Key[];
}

export const PUNCH_RANGE = 1.3;
export const GAZELLE_RANGE = 2.5;
export const FLYING_KICK_MIN = 1.8;
export const FLYING_KICK_MAX = 4.1;

const strike = (wind: PoseName, ext: PoseName, recover: PoseName = 'guard', follow?: PoseName): Key[] => {
  const keys: Key[] = [
    { at: ['s', 0.55], pose: wind, ease: 'out' },
    { at: ['a', 0], pose: ext, ease: 'snap' },
  ];
  if (follow) keys.push({ at: ['a', 1], pose: follow, ease: 'out' });
  else keys.push({ at: ['a', 1], pose: ext });
  keys.push({ at: ['r', 0.85], pose: recover, ease: 'inOut' });
  return keys;
};

export const PLAYER_MOVES: Record<string, MoveDef> = {
  jab: {
    id: 'jab', name: 'Jab',
    startup: 5, active: 3, recovery: 11,
    limb: 'handL', height: 'high', kind: 'straight', weight: 'light',
    damage: 4, guardDamage: 6, poiseDamage: 8, hitstun: 16, blockstun: 10,
    knockback: 0.8, impulse: 9, hitstop: 4, shake: 0.12, radius: 0.12, reach: 1.3,
    lunge: { from: 1, to: 6, distance: 0.18 },
    blockable: true,
    cancel: { into: ['cross', 'frontKick'], from: 6, to: 19 },
    keys: strike('jabWind', 'jabExt'),
  },
  cross: {
    id: 'cross', name: 'Cross',
    startup: 7, active: 3, recovery: 13,
    limb: 'handR', height: 'high', kind: 'straight', weight: 'medium',
    damage: 7, guardDamage: 10, poiseDamage: 16, hitstun: 20, blockstun: 12,
    knockback: 1.3, impulse: 14, hitstop: 6, shake: 0.2, radius: 0.12, reach: 1.35,
    lunge: { from: 1, to: 8, distance: 0.22 },
    blockable: true,
    cancel: { into: ['hook', 'frontKick'], from: 8, to: 23 },
    keys: strike('crossWind', 'crossExt'),
  },
  hook: {
    id: 'hook', name: 'Hook',
    startup: 9, active: 4, recovery: 18,
    limb: 'handL', height: 'high', kind: 'hook', weight: 'heavy',
    damage: 10, guardDamage: 18, poiseDamage: 40, hitstun: 28, blockstun: 14,
    knockback: 2.6, impulse: 24, lift: 0.1, hitstop: 9, shake: 0.38, radius: 0.15, reach: 1.1,
    lunge: { from: 2, to: 10, distance: 0.2 },
    blockable: true,
    keys: [
      { at: ['s', 0.45], pose: 'hookWind', ease: 'out' },
      { at: ['s', 0.85], pose: 'hookMid', ease: 'in' },
      { at: ['a', 0], pose: 'hookExt', ease: 'linear' },
      { at: ['a', 1], pose: 'hookFollow', ease: 'out' },
      { at: ['r', 0.85], pose: 'guard', ease: 'inOut' },
    ],
  },
  counterHook: {
    id: 'counterHook', name: 'Counter Hook',
    startup: 7, active: 4, recovery: 18,
    limb: 'handL', height: 'high', kind: 'hook', weight: 'heavy',
    damage: 13, guardDamage: 25, poiseDamage: 60, hitstun: 32, blockstun: 16,
    knockback: 3.0, impulse: 30, lift: 0.1, hitstop: 11, shake: 0.45, radius: 0.16, reach: 1.2,
    lunge: { from: 1, to: 8, distance: 0.3 },
    blockable: true,
    keys: [
      { at: ['s', 0.4], pose: 'hookWind', ease: 'out' },
      { at: ['s', 0.85], pose: 'hookMid', ease: 'in' },
      { at: ['a', 0], pose: 'hookExt', ease: 'linear' },
      { at: ['a', 1], pose: 'hookFollow', ease: 'out' },
      { at: ['r', 0.85], pose: 'guard', ease: 'inOut' },
    ],
  },
  counterCross: {
    id: 'counterCross', name: 'Counter Cross',
    startup: 4, active: 3, recovery: 13,
    limb: 'handR', height: 'high', kind: 'straight', weight: 'medium',
    damage: 8, guardDamage: 12, poiseDamage: 22, hitstun: 22, blockstun: 12,
    knockback: 1.5, impulse: 16, hitstop: 7, shake: 0.24, radius: 0.13, reach: 1.3,
    lunge: { from: 0, to: 5, distance: 0.25 },
    blockable: true,
    cancel: { into: ['hook', 'frontKick'], from: 5, to: 20 },
    keys: strike('crossWind', 'crossExt'),
  },
  uppercut: {
    id: 'uppercut', name: 'Uppercut',
    startup: 6, active: 4, recovery: 22,
    limb: 'handR', height: 'high', kind: 'uppercut', weight: 'heavy',
    damage: 14, guardDamage: 25, poiseDamage: 100, hitstun: 30, blockstun: 16,
    knockback: 2.2, knockdown: true, impulse: 34, lift: 0.75, hitstop: 12, shake: 0.55, radius: 0.16, reach: 1.2,
    lunge: { from: 0, to: 7, distance: 0.38 },
    blockable: true,
    keys: [
      { at: ['s', 0.3], pose: 'upperWind', ease: 'out' },
      { at: ['a', 0], pose: 'upperExt', ease: 'snap' },
      { at: ['a', 1], pose: 'upperExt' },
      { at: ['r', 0.85], pose: 'guard', ease: 'inOut' },
    ],
  },
  gazelle: {
    id: 'gazelle', name: 'Gazelle Punch',
    startup: 13, active: 4, recovery: 19,
    limb: 'handL', height: 'high', kind: 'uppercut', weight: 'heavy',
    damage: 11, guardDamage: 20, poiseDamage: 45, hitstun: 26, blockstun: 14,
    knockback: 3.0, impulse: 28, lift: 0.4, hitstop: 10, shake: 0.42, radius: 0.16, reach: 2.45,
    lunge: { from: 4, to: 15, distance: 1.45 },
    blockable: true,
    keys: [
      { at: ['s', 0.35], pose: 'gazelleWind', ease: 'out' },
      { at: ['s', 0.6], pose: 'gazelleWind' },
      { at: ['a', 0], pose: 'gazelleExt', ease: 'out' },
      { at: ['a', 1], pose: 'gazelleExt' },
      { at: ['r', 0.85], pose: 'guard', ease: 'inOut' },
    ],
  },
  frontKick: {
    id: 'frontKick', name: 'Push Kick',
    startup: 10, active: 4, recovery: 17,
    limb: 'footL', height: 'mid', kind: 'kick', weight: 'medium',
    damage: 6, guardDamage: 40, poiseDamage: 25, hitstun: 22, blockstun: 18,
    knockback: 4.6, impulse: 26, lift: 0.1, hitstop: 7, shake: 0.28, radius: 0.17, reach: 1.2,
    blockable: true,
    keys: [
      { at: ['s', 0.6], pose: 'kickChamber', ease: 'out' },
      { at: ['a', 0], pose: 'kickExt', ease: 'snap' },
      { at: ['a', 1], pose: 'kickExt' },
      { at: ['r', 0.4], pose: 'kickChamber', ease: 'inOut' },
      { at: ['r', 0.95], pose: 'guard', ease: 'inOut' },
    ],
  },
  flyingKick: {
    id: 'flyingKick', name: 'Flying Kick',
    startup: 18, active: 6, recovery: 22,
    limb: 'footL', height: 'mid', kind: 'kick', weight: 'heavy',
    damage: 12, guardDamage: 35, poiseDamage: 100, hitstun: 30, blockstun: 18,
    knockback: 3.8, knockdown: true, impulse: 40, lift: 0.3, hitstop: 11, shake: 0.6, radius: 0.2, reach: 4.05,
    lunge: { from: 5, to: 22, distance: 2.6 },
    evades: { from: 8, to: 24, heights: ['low'] },
    blockable: true,
    keys: [
      { at: ['s', 0.3], pose: 'flyCrouch', ease: 'out' },
      { at: ['s', 0.65], pose: 'flyAir', ease: 'out' },
      { at: ['a', 0], pose: 'flyExt', ease: 'snap' },
      { at: ['a', 1], pose: 'flyExt' },
      { at: ['r', 0.35], pose: 'flyLand', ease: 'in' },
      { at: ['r', 0.95], pose: 'guard', ease: 'inOut' },
    ],
  },
  slideKick: {
    id: 'slideKick', name: 'Sliding Strike',
    startup: 7, active: 8, recovery: 20,
    limb: 'footL', height: 'low', kind: 'sweep', weight: 'heavy',
    damage: 10, guardDamage: 20, poiseDamage: 100, hitstun: 30, blockstun: 16,
    knockback: 2.0, knockdown: true, impulse: 26, lift: 0.5, hitstop: 9, shake: 0.4, radius: 0.2, reach: 3.1,
    lunge: { from: 0, to: 14, distance: 1.7 },
    evades: { from: 2, to: 18, heights: ['high'] },
    blockable: false,
    keys: [
      { at: ['s', 0.6], pose: 'slideKickExt', ease: 'out' },
      { at: ['a', 0], pose: 'slideKickExt' },
      { at: ['a', 1], pose: 'slideKickExt' },
      { at: ['r', 0.5], pose: 'kneel', ease: 'inOut' },
      { at: ['r', 1], pose: 'guard', ease: 'inOut' },
    ],
  },
};

export const ENEMY_MOVES: Record<string, MoveDef> = {
  straight: {
    id: 'straight', name: 'Straight',
    startup: 20, active: 3, recovery: 20,
    limb: 'handR', height: 'high', kind: 'straight', weight: 'medium',
    damage: 8, guardDamage: 14, poiseDamage: 25, hitstun: 22, blockstun: 12,
    knockback: 1.6, impulse: 16, hitstop: 7, shake: 0.3, radius: 0.13, reach: 1.45,
    lunge: { from: 12, to: 22, distance: 0.3 },
    blockable: true,
    cancel: { into: ['hookChain'], from: 23, to: 34 },
    keys: [
      { at: ['s', 0.7], pose: 'straightWind', ease: 'out' },
      { at: ['a', 0], pose: 'straightExt', ease: 'snap' },
      { at: ['a', 1], pose: 'straightExt' },
      { at: ['r', 0.85], pose: 'guard', ease: 'inOut' },
    ],
  },
  hook: {
    id: 'hook', name: 'Haymaker',
    startup: 26, active: 4, recovery: 24,
    limb: 'handL', height: 'high', kind: 'hook', weight: 'heavy',
    damage: 13, guardDamage: 28, poiseDamage: 50, hitstun: 28, blockstun: 16,
    knockback: 2.8, impulse: 28, lift: 0.1, hitstop: 10, shake: 0.5, radius: 0.16, reach: 1.2,
    lunge: { from: 14, to: 28, distance: 0.35 },
    armor: [8, 26],
    blockable: true,
    keys: [
      { at: ['s', 0.7], pose: 'ehookWind', ease: 'out' },
      { at: ['a', 0], pose: 'ehookExt', ease: 'linear' },
      { at: ['a', 1], pose: 'ehookFollow', ease: 'out' },
      { at: ['r', 0.85], pose: 'guard', ease: 'inOut' },
    ],
  },
  body: {
    id: 'body', name: 'Body Blow',
    startup: 22, active: 4, recovery: 20,
    limb: 'handR', height: 'mid', kind: 'straight', weight: 'medium',
    damage: 9, guardDamage: 26, poiseDamage: 30, hitstun: 24, blockstun: 16,
    knockback: 1.8, impulse: 18, hitstop: 7, shake: 0.3, radius: 0.15, reach: 1.45,
    lunge: { from: 12, to: 24, distance: 0.3 },
    blockable: true,
    keys: [
      { at: ['s', 0.7], pose: 'bodyWind', ease: 'out' },
      { at: ['a', 0], pose: 'bodyExt', ease: 'snap' },
      { at: ['a', 1], pose: 'bodyExt' },
      { at: ['r', 0.85], pose: 'guard', ease: 'inOut' },
    ],
  },
  sweep: {
    id: 'sweep', name: 'Leg Sweep',
    startup: 28, active: 5, recovery: 26,
    limb: 'footR', height: 'low', kind: 'sweep', weight: 'heavy',
    damage: 10, guardDamage: 20, poiseDamage: 100, hitstun: 28, blockstun: 16,
    knockback: 1.6, knockdown: true, impulse: 24, lift: 0.6, hitstop: 9, shake: 0.4, radius: 0.2, reach: 1.6,
    lunge: { from: 16, to: 30, distance: 0.35 },
    armor: [10, 28],
    blockable: false,
    keys: [
      { at: ['s', 0.7], pose: 'sweepWind', ease: 'out' },
      { at: ['a', 0], pose: 'sweepExt', ease: 'linear' },
      { at: ['a', 1], pose: 'sweepExt' },
      { at: ['r', 0.85], pose: 'guard', ease: 'inOut' },
    ],
  },
};

// Haymaker thrown as the second hit of a string: shorter wind-up.
ENEMY_MOVES.hookChain = { ...ENEMY_MOVES.hook, id: 'hookChain', startup: 17, armor: [4, 17], lunge: { from: 6, to: 19, distance: 0.35 } };

export function moveLength(m: MoveDef): number {
  return m.startup + m.active + m.recovery;
}

export function markerFrame(m: Pick<MoveDef, 'startup' | 'active' | 'recovery'>, [phase, f]: Marker): number {
  if (phase === 's') return m.startup * f;
  if (phase === 'a') return m.startup + m.active * f;
  return m.startup + m.active + m.recovery * f;
}

// ---------------------------------------------------------------------------
// Defensive reactions (automatic)
// ---------------------------------------------------------------------------

export interface DefenseDef {
  kind: DefenseKind;
  /** Frames to get into position. */
  startup: number;
  recovery: number;
  /** Heights fully evaded once in position. */
  evades: Height[];
  /** Heights blocked once in position. */
  blocks: Height[];
  /** Frames after success during which a counter can be thrown. */
  counterWindow: number;
  /** Frames before this reaction can be used again. */
  cooldown: number;
  /** Displacement (m, backwards) applied over startup+some frames. */
  retreat?: number;
}

export const DEFENSES: Record<DefenseKind, DefenseDef> = {
  block: { kind: 'block', startup: 3, recovery: 8, evades: [], blocks: ['high', 'mid'], counterWindow: 20, cooldown: 0 },
  duck: { kind: 'duck', startup: 5, recovery: 9, evades: ['high'], blocks: [], counterWindow: 28, cooldown: 0 },
  weave: { kind: 'weave', startup: 4, recovery: 8, evades: ['high'], blocks: [], counterWindow: 26, cooldown: 0 },
  slide: { kind: 'slide', startup: 4, recovery: 12, evades: ['high', 'mid', 'low'], blocks: [], counterWindow: 30, cooldown: 40, retreat: 1.25 },
};
