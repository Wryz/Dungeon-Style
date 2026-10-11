import { Vector3 } from 'three';
import { type BoneName, fistPoint } from '../body/skeleton';
import type { AIPlan } from './ai';
import type { Button } from './fighter';
import type { PoseName } from '../body/poses';
import type { Aim, DefenseKind, Key, MoveDef } from './moves';

/**
 * Weapons lying around the arenas. One-handed weapons are held in the rear (right)
 * hand with the lead hand free; two-handed weapons are gripped with both hands. Edged
 * weapons leave lasting, bleeding cuts and heavy ones can take limbs off.
 */
export type WeaponId = 'cleaver' | 'machete' | 'gladius' | 'pan' | 'axe' | 'bat' | 'chair' | 'club';
export type WeaponStyle = 'oneHand' | 'twoHand';

export interface WeaponDef {
  id: WeaponId;
  name: string;
  style: WeaponStyle;
  /** 'blade' cuts; 'blunt' bruises and staggers harder. */
  edge: 'blade' | 'blunt';
  /** Grip to tip (m, authored scale). */
  length: number;
  /** Where the striking part begins, measured from the grip (m). */
  strikeFrom: number;
  /** Thickness of the striking part for hit detection (m). */
  radius: number;
  damageMul: number;
  /** How deep / bloody its cuts are (0 = none). */
  cut: number;
  /** Power to sever limbs (0 = never). */
  cleave: number;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  cleaver: { id: 'cleaver', name: 'Meat Cleaver', style: 'oneHand', edge: 'blade', length: 0.36, strikeFrom: 0.12, radius: 0.07, damageMul: 1.25, cut: 0.85, cleave: 0.6 },
  machete: { id: 'machete', name: 'Machete', style: 'oneHand', edge: 'blade', length: 0.6, strikeFrom: 0.14, radius: 0.06, damageMul: 1.2, cut: 0.9, cleave: 0.45 },
  gladius: { id: 'gladius', name: 'Gladius', style: 'oneHand', edge: 'blade', length: 0.64, strikeFrom: 0.14, radius: 0.06, damageMul: 1.3, cut: 0.85, cleave: 0.5 },
  pan: { id: 'pan', name: 'Frying Pan', style: 'oneHand', edge: 'blunt', length: 0.46, strikeFrom: 0.24, radius: 0.11, damageMul: 1.25, cut: 0, cleave: 0 },
  axe: { id: 'axe', name: 'Battle Axe', style: 'twoHand', edge: 'blade', length: 0.98, strikeFrom: 0.45, radius: 0.1, damageMul: 1.6, cut: 1, cleave: 1 },
  bat: { id: 'bat', name: 'Baseball Bat', style: 'twoHand', edge: 'blunt', length: 0.88, strikeFrom: 0.3, radius: 0.07, damageMul: 1.45, cut: 0, cleave: 0 },
  chair: { id: 'chair', name: 'Folding Chair', style: 'twoHand', edge: 'blunt', length: 0.66, strikeFrom: 0.2, radius: 0.16, damageMul: 1.35, cut: 0, cleave: 0 },
  club: { id: 'club', name: 'Spiked Club', style: 'twoHand', edge: 'blunt', length: 1.0, strikeFrom: 0.35, radius: 0.11, damageMul: 1.6, cut: 0.3, cleave: 0 },
};

/** Angle (rad) the blade leans away from the line of the forearm, toward the thumb. */
export const WRIST_ANGLE = 0.55;

const HEAD: Aim = { id: 'head', weight: 3 };
const BODY: Aim = { id: 'body', weight: 2, offset: [0.02, -0.32, -0.04], height: 'mid', add: { root: [0, -0.06, 0], abdomen: [0.12, 0, 0] } };
const LEGS: Aim = { id: 'legs', weight: 1, offset: [0.04, -0.62, -0.08], height: 'low', add: { root: [0, -0.12, 0], abdomen: [0.3, 0, 0] } };

const keys = (wind: PoseName, ext: PoseName, follow: PoseName, recover: PoseName, windAt = 0.55): Key[] => [
    { at: ['s', windAt], pose: wind, ease: 'out' },
    { at: ['a', 0], pose: ext, ease: 'linear' },
    { at: ['a', 1], pose: follow, ease: 'out' },
    { at: ['r', 0.6], pose: recover, ease: 'inOut' },
];

const weaponMove = (m: Omit<MoveDef, 'limb' | 'blockable' | 'weapon'> & { blockable?: boolean }): MoveDef => ({
  limb: 'handR',
  blockable: true,
  weapon: true,
  ...m,
});

/**
 * Weapon techniques. Damage is multiplied by the weapon. One-handed: a forehand slash
 * that chains into a backhand, and an overhead chop. Two-handed: wide horizontal
 * sweeps and a slow, armoured overhead that knocks people down.
 */
export const WEAPON_MOVES: Record<string, MoveDef> = {
  slash: weaponMove({
    id: 'slash', name: 'Slash',
    layer: 'upper',
    startup: 10, active: 5, recovery: 17,
    height: 'high', kind: 'hook', weight: 'medium',
    damage: 8, guardDamage: 14, poiseDamage: 22, hitstun: 22, blockstun: 14,
    knockback: 1.4, impulse: 16, hitstop: 7, shake: 0.24, radius: 0, reach: 1.8,
    lunge: { from: 2, to: 10, distance: 0.2 },
    cancel: { into: ['backslash', 'chop', 'frontKick', 'lowKick'], from: 13, to: 30 },
    aims: [HEAD, BODY],
    keys: keys('wSlashWind', 'wSlashExt', 'wSlashFollow', 'wGuard1'),
  }),
  backslash: weaponMove({
    id: 'backslash', name: 'Backhand Slash',
    layer: 'upper',
    startup: 8, active: 5, recovery: 17,
    height: 'high', kind: 'hook', weight: 'medium',
    damage: 7, guardDamage: 12, poiseDamage: 20, hitstun: 22, blockstun: 12,
    knockback: 1.4, impulse: 15, hitstop: 7, shake: 0.22, radius: 0, reach: 1.65,
    lunge: { from: 1, to: 8, distance: 0.16 },
    cancel: { into: ['chop', 'frontKick', 'lowKick'], from: 11, to: 28 },
    aims: [HEAD, BODY],
    keys: keys('wBackWind', 'wBackExt', 'wBackFollow', 'wGuard1', 0.4),
  }),
  chop: weaponMove({
    id: 'chop', name: 'Overhead Chop',
    startup: 15, active: 5, recovery: 22,
    height: 'high', kind: 'straight', weight: 'heavy',
    damage: 12, guardDamage: 26, poiseDamage: 45, hitstun: 30, blockstun: 18,
    knockback: 2.2, impulse: 26, lift: 0.05, hitstop: 10, shake: 0.4, radius: 0, reach: 2.0,
    lunge: { from: 4, to: 15, distance: 0.3 },
    aims: [HEAD, { ...BODY, weight: 1 }],
    keys: keys('wChopWind', 'wChopExt', 'wChopFollow', 'wGuard1', 0.6),
  }),
  sweep: weaponMove({
    id: 'sweep', name: 'Sweeping Swing',
    startup: 14, active: 6, recovery: 24,
    height: 'high', kind: 'hook', weight: 'heavy',
    damage: 11, guardDamage: 24, poiseDamage: 42, hitstun: 28, blockstun: 18,
    knockback: 2.6, impulse: 30, lift: 0.08, hitstop: 10, shake: 0.42, radius: 0, reach: 2.05,
    lunge: { from: 3, to: 14, distance: 0.25 },
    cancel: { into: ['sweepBack', 'overhead', 'frontKick'], from: 18, to: 34 },
    aims: [HEAD, BODY, LEGS],
    keys: keys('wSweepWind', 'wSweepExt', 'wSweepFollow', 'wGuard2', 0.6),
  }),
  sweepBack: weaponMove({
    id: 'sweepBack', name: 'Backswing',
    startup: 12, active: 6, recovery: 24,
    height: 'high', kind: 'hook', weight: 'heavy',
    damage: 9, guardDamage: 20, poiseDamage: 36, hitstun: 26, blockstun: 16,
    knockback: 2.4, impulse: 26, lift: 0.06, hitstop: 9, shake: 0.38, radius: 0, reach: 1.9,
    lunge: { from: 2, to: 12, distance: 0.2 },
    aims: [HEAD, BODY],
    keys: keys('wSweepBackWind', 'wSweepBackExt', 'wSweepBackFollow', 'wGuard2', 0.4),
  }),
  overhead: weaponMove({
    id: 'overhead', name: 'Overhead Smash',
    startup: 21, active: 5, recovery: 30,
    height: 'high', kind: 'straight', weight: 'heavy',
    damage: 17, guardDamage: 45, poiseDamage: 70, hitstun: 34, blockstun: 22,
    knockback: 3.2, knockdown: true, impulse: 40, lift: 0.1, hitstop: 13, shake: 0.6, radius: 0, reach: 1.9,
    lunge: { from: 6, to: 21, distance: 0.35 },
    armor: [6, 22],
    aims: [HEAD],
    keys: keys('wOverheadWind', 'wOverheadExt', 'wOverheadFollow', 'wGuard2', 0.65),
  }),
};

const ATTACKS: Record<WeaponStyle, { light: string; heavy: string; chain: Record<string, string> }> = {
  oneHand: { light: 'slash', heavy: 'chop', chain: { slash: 'backslash', backslash: 'chop' } },
  twoHand: { light: 'sweep', heavy: 'overhead', chain: { sweep: 'sweepBack' } },
};

/**
 * Armed button mapping: Q is the quick strike (chaining into its follow-up), E the big
 * committed one; kicks stay kicks. Returns undefined to fall back to the unarmed table.
 */
export function selectWeaponMove(button: Button, w: WeaponDef, counter: DefenseKind | null, chainFrom: string | null): string | null | undefined {
  const A = ATTACKS[w.style];
  if (button === 'lkick' || button === 'rkick') return undefined;
  if (counter) return button === 'lpunch' ? A.light : A.heavy;
  if (chainFrom) return button === 'lpunch' ? (A.chain[chainFrom] ?? null) : A.heavy;
  return button === 'lpunch' ? A.light : A.heavy;
}

/** How an armed enemy fights (distances scale with its size). */
export function weaponPlan(w: WeaponDef): AIPlan {
  return w.style === 'oneHand'
    ? { moves: [['slash', 4], ['chop', 2]], range: 1.45, attackRange: 1.7, punish: 'slash', chains: { slash: 'backslash' } }
    : { moves: [['sweep', 4], ['overhead', 2]], range: 1.6, attackRange: 1.95, punish: 'sweep', chains: { sweep: 'sweepBack' } };
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

const _along = new Vector3();
const _thumb = new Vector3();

interface Rigged {
  rig: import('../body/skeleton').Rig;
  scale: number;
}

/**
 * The weapon in hand: grip (right fist) and the direction from grip to tip, from the
 * right forearm's pose — the blade sits in the forearm's bend plane, leaning out from
 * the line of the arm toward the thumb like a hammer grip.
 */
export function bladeFrame(f: Rigged, grip: Vector3, dir: Vector3) {
  fistPoint(f.rig, 'R', grip);
  const q = f.rig.foreArmR.rot;
  _along.set(0, -1, 0).applyQuaternion(q);
  _thumb.set(0, 0, -1).applyQuaternion(q);
  dir.copy(_along).multiplyScalar(Math.cos(WRIST_ANGLE)).addScaledVector(_thumb, Math.sin(WRIST_ANGLE)).normalize();
}

/** Sample points along the striking part of the weapon (world). */
export function bladePoints(f: Rigged, w: WeaponDef, out: Vector3[] = []): Vector3[] {
  const grip = new Vector3();
  const dir = new Vector3();
  bladeFrame(f, grip, dir);
  const n = Math.max(2, Math.ceil((w.length - w.strikeFrom) / 0.1) + 1);
  out.length = 0;
  for (let i = 0; i < n; i++) {
    const t = w.strikeFrom + ((w.length - w.strikeFrom) * i) / (n - 1);
    out.push(grip.clone().addScaledVector(dir, t * f.scale));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Wounds and dismemberment
// ---------------------------------------------------------------------------

/** A lasting cut: where it is on the body, and how hard it still bleeds. */
export interface Wound {
  bone: BoneName;
  /** Position in the bone's local frame (authored scale). */
  local: [number, number, number];
  /** Orientation of the cut around the surface (rad) and its length (m). */
  angle: number;
  length: number;
  /** Bleeding rate 0..1; eases down but never fully stops. */
  bleed: number;
  floor: number;
  /** Set on the stump left where this limb was cut off. */
  stump?: BoneName;
}

/** Where a limb comes off, by the bone that was struck. */
export const SEVER_AT: Partial<Record<BoneName, BoneName>> = {
  head: 'head',
  upperArmL: 'upperArmL',
  foreArmL: 'foreArmL',
  upperArmR: 'upperArmR',
  foreArmR: 'foreArmR',
  thighL: 'thighL',
  shinL: 'shinL',
  thighR: 'thighR',
  shinR: 'shinR',
};

/** Accumulated cleaving damage a limb takes before it comes off (× body scale). */
export const LIMB_TOUGHNESS: Partial<Record<BoneName, number>> = {
  head: 42,
  upperArmL: 24,
  upperArmR: 24,
  foreArmL: 17,
  foreArmR: 17,
  thighL: 50,
  thighR: 50,
  shinL: 38,
  shinR: 38,
};

/** Bones below `bone` in the skeleton (inclusive). */
export function limbBones(bone: BoneName): BoneName[] {
  switch (bone) {
    case 'upperArmL':
      return ['upperArmL', 'foreArmL'];
    case 'upperArmR':
      return ['upperArmR', 'foreArmR'];
    case 'thighL':
      return ['thighL', 'shinL'];
    case 'thighR':
      return ['thighR', 'shinR'];
    default:
      return [bone];
  }
}
