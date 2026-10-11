import type { WeaponId } from '../sim/weapons';
import type { ArenaShape, Obstacle } from '../world/collision';

export type ThemeId = 'ring' | 'street' | 'grocery' | 'colosseum';

export interface ThemeDef {
  id: ThemeId;
  name: string;
  shape: ArenaShape;
  /** Solid props inside the fighting area. */
  obstacles: Obstacle[];
  playerSpawn: [number, number];
  /** Enemy spawn points (used in order; wraps around). */
  enemySpawns: [number, number][];
  /** Weapons lying around this arena, and where they can be. */
  weapons: WeaponId[];
  weaponSpots: [number, number][];
}

export const THEMES: Record<ThemeId, ThemeDef> = {
  ring: {
    id: 'ring',
    name: 'The Ring',
    shape: { kind: 'rect', hx: 3.4, hz: 3.4 },
    obstacles: [],
    playerSpawn: [-2.2, 0.6],
    enemySpawns: [
      [2.2, -0.4],
      [2.4, 1.8],
      [2.4, -2.4],
      [0.6, -2.6],
    ],
    // Somebody always leaves a folding chair in the ring.
    weapons: ['chair'],
    weaponSpots: [[-2.5, -2.4], [2.5, 2.5], [-2.5, 2.5]],
  },
  street: {
    id: 'street',
    name: 'The Street',
    shape: { kind: 'rect', hx: 7, hz: 4.2 },
    obstacles: [
      { kind: 'box', x: 4.6, z: -3.2, hx: 1.05, hz: 0.5 }, // parked car
      { kind: 'circle', x: -5.6, z: -3.6, r: 0.3 }, // trash can
      { kind: 'circle', x: -1.4, z: 3.6, r: 0.18 }, // hydrant
    ],
    playerSpawn: [-4, 0.5],
    enemySpawns: [
      [3.5, 0.6],
      [4.5, 2.6],
      [2, -2.2],
      [5.8, 0],
    ],
    weapons: ['bat', 'machete'],
    weaponSpots: [[-1.6, -2.9], [1.2, 3.0], [-5.4, 2.6], [5.6, 2.8]],
  },
  grocery: {
    id: 'grocery',
    name: 'Grocery Store',
    shape: { kind: 'rect', hx: 6.5, hz: 4.3 },
    obstacles: [
      { kind: 'box', x: -1.6, z: -0.6, hx: 1.6, hz: 0.35 }, // aisle island
      { kind: 'box', x: 2.6, z: 1.6, hx: 1.2, hz: 0.35 }, // aisle island
      { kind: 'circle', x: -4.8, z: 2.8, r: 0.45 }, // cart
    ],
    playerSpawn: [-4.2, 1],
    enemySpawns: [
      [3.8, -1.4],
      [4.8, 2.8],
      [0.8, -3],
      [5.2, -3.2],
    ],
    weapons: ['cleaver', 'pan'],
    weaponSpots: [[-1.4, -1.5], [2.4, 0.7], [-4.6, -2.9], [0.4, 3.4]],
  },
  colosseum: {
    id: 'colosseum',
    name: 'The Colosseum',
    shape: { kind: 'circle', r: 8.2 },
    obstacles: [
      { kind: 'circle', x: -3.8, z: -4.2, r: 0.5 }, // broken column
      { kind: 'circle', x: 4.4, z: 3.6, r: 0.5 },
    ],
    playerSpawn: [-3.5, 0.8],
    enemySpawns: [
      [3.5, -0.4],
      [3.2, 2.6],
      [2.6, -3],
      [5.4, 0.8],
    ],
    weapons: ['gladius', 'axe'],
    weaponSpots: [[-1.6, 3.4], [0.6, -4.2], [-5.6, -1.6], [2.4, 5.4]],
  },
};
