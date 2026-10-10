import { Rng } from '../sim/math';
import { type Gate, Grid, type Rect } from './grid';

export type EnemyKind = 'rookie' | 'brawler' | 'kicker' | 'bruiser';
export type RoomKind = 'start' | 'combat' | 'exit';

export interface Room {
  id: string;
  kind: RoomKind;
  /** Cell rectangle. */
  rect: Rect;
  /** World-space centre. */
  cx: number;
  cz: number;
  /** Enemies spawned when the player walks in (combat rooms). */
  enemies: EnemyKind[];
  /** Gates sealed while this room's fight is on. */
  gates: Gate[];
}

export interface DungeonLayout {
  grid: Grid;
  rooms: Room[];
  /** Player start (world). */
  start: [number, number];
  /** Memory terminal at the end of the dungeon (world). */
  terminal: [number, number];
}

/** Enemy groups per combat room, by run depth; later loops get easier mixes. */
function encounter(rng: Rng, roomIndex: number, loop: number): EnemyKind[] {
  const pools: EnemyKind[][][] = [
    [['rookie'], ['rookie', 'rookie'], ['brawler']],
    [['brawler', 'rookie'], ['kicker'], ['kicker', 'rookie']],
    [['bruiser'], ['brawler', 'kicker'], ['kicker', 'kicker', 'rookie']],
    [['bruiser', 'rookie'], ['brawler', 'brawler'], ['bruiser', 'kicker']],
  ];
  const tier = Math.min(pools.length - 1, roomIndex);
  const options = pools[tier];
  // Each memory erase makes the run easier: bias toward the smaller groups.
  const easy = Math.min(0.75, loop * 0.2);
  const pick = rng.chance(easy) ? options.reduce((a, b) => (a.length <= b.length ? a : b)) : options[Math.floor(rng.next() * options.length)];
  return [...pick];
}

/**
 * Builds a short roofless dungeon: a start room, a chain of combat rooms joined by
 * corridors that turn, and an exit room with the memory terminal. Room sizes, corridor
 * lengths, turns and enemy groups vary with the seed.
 */
export function buildDungeon(seed: number, loop: number, combatRooms = 4): DungeonLayout {
  const rng = new Rng(seed);
  const W = 150;
  const D = 80;
  const grid = new Grid(W, D, -10, -40);
  const rooms: Room[] = [];

  // Cursor in cell space: the next room's west edge sits at (x, centred on z).
  let x = 2;
  let zc = 40;
  let dir: 'east' | 'north' | 'south' = 'east';
  const total = combatRooms + 2;
  for (let n = 0; n < total; n++) {
    const kind: RoomKind = n === 0 ? 'start' : n === total - 1 ? 'exit' : 'combat';
    const w = kind === 'combat' ? 11 + Math.floor(rng.range(0, 4)) : kind === 'start' ? 11 : 9;
    const d = kind === 'combat' ? 9 + Math.floor(rng.range(0, 3)) : kind === 'start' ? 9 : 8;
    let rect: Rect;
    if (dir === 'east') rect = { x0: x, z0: zc - Math.floor(d / 2), x1: x + w, z1: zc - Math.floor(d / 2) + d };
    else if (dir === 'north') rect = { x0: x - Math.floor(w / 2), z0: zc - d, x1: x - Math.floor(w / 2) + w, z1: zc };
    else rect = { x0: x - Math.floor(w / 2), z0: zc, x1: x - Math.floor(w / 2) + w, z1: zc + d };
    // Keep inside the grid.
    const dz = Math.max(0, 1 - rect.z0) - Math.max(0, rect.z1 - (D - 1));
    rect.z0 += dz;
    rect.z1 += dz;
    grid.carve(rect);
    const [cx0, cz0] = grid.cellCenter(rect.x0, rect.z0);
    const [cx1, cz1] = grid.cellCenter(rect.x1 - 1, rect.z1 - 1);
    rooms.push({ id: `room${n}`, kind, rect, cx: (cx0 + cx1) / 2, cz: (cz0 + cz1) / 2, enemies: kind === 'combat' ? encounter(rng, n - 1, loop) : [], gates: [] });

    if (n === total - 1) break;
    // Corridor to the next room: mostly east, sometimes turning north/south for variety.
    const roll = rng.next();
    // Never double back (north then south) so rooms can't overlap.
    const canNorth: boolean = dir !== 'south' && rect.z0 > 20;
    const canSouth: boolean = dir !== 'north' && rect.z1 < D - 20;
    const next: 'east' | 'north' | 'south' =
      n === 0 || roll < 0.55 ? 'east' : roll < 0.78 && canNorth ? 'north' : canSouth ? 'south' : canNorth ? 'north' : 'east';
    const len = 4 + Math.floor(rng.range(0, 3));
    const half = 1; // corridors are 3 cells wide
    if (next === 'east') {
      const cz = Math.floor((rect.z0 + rect.z1) / 2);
      const c: Rect = { x0: rect.x1, z0: cz - half, x1: rect.x1 + len, z1: cz + half + 1 };
      grid.carve(c);
      rooms[rooms.length - 1].gates.push(gateAcross(grid, `g${n}e`, c.x1 - 1, c.z0, c.z1, false));
      x = c.x1;
      zc = cz;
    } else {
      const cxCell = Math.floor((rect.x0 + rect.x1) / 2);
      const c: Rect =
        next === 'north'
          ? { x0: cxCell - half, z0: rect.z0 - len, x1: cxCell + half + 1, z1: rect.z0 }
          : { x0: cxCell - half, z0: rect.z1, x1: cxCell + half + 1, z1: rect.z1 + len };
      grid.carve(c);
      const gz = next === 'north' ? c.z0 : c.z1 - 1;
      rooms[rooms.length - 1].gates.push(gateAlong(grid, `g${n}${next[0]}`, c.x0, c.x1, gz));
      x = cxCell;
      zc = next === 'north' ? c.z0 : c.z1;
    }
    dir = next;
  }

  // Combat rooms are sealed from both sides: also close the gate of the corridor leading in.
  for (let n = 1; n < rooms.length; n++) {
    const prev = rooms[n - 1];
    if (rooms[n].kind === 'combat' && prev.gates.length) rooms[n].gates.unshift(prev.gates[prev.gates.length - 1]);
  }
  // Gates belong to the room they seal; the start room's exit gate stays open.
  rooms[0].gates = [];

  const s = rooms[0];
  const e = rooms[rooms.length - 1];
  return { grid, rooms, start: [s.cx - 2, s.cz], terminal: [e.cx + 1, e.cz] };
}

function gateAcross(grid: Grid, id: string, i: number, z0: number, z1: number, alongX: boolean): Gate {
  const cells: [number, number][] = [];
  for (let j = z0; j < z1; j++) cells.push([i, j]);
  return grid.addGate(id, cells, alongX);
}

function gateAlong(grid: Grid, id: string, x0: number, x1: number, j: number): Gate {
  const cells: [number, number][] = [];
  for (let i = x0; i < x1; i++) cells.push([i, j]);
  return grid.addGate(id, cells, true);
}

/** Room containing a world point (inset so the trigger fires once you are properly inside). */
export function roomAt(layout: DungeonLayout, x: number, z: number, inset = 1.2): Room | null {
  const g = layout.grid;
  for (const r of layout.rooms) {
    const x0 = g.ox + r.rect.x0 + inset;
    const x1 = g.ox + r.rect.x1 - inset;
    const z0 = g.oz + r.rect.z0 + inset;
    const z1 = g.oz + r.rect.z1 - inset;
    if (x >= x0 && x <= x1 && z >= z0 && z <= z1) return r;
  }
  return null;
}
