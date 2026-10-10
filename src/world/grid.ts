import type { Vector3 } from 'three';
import type { Walkable } from './collision';

export const CELL = 1;
const NEIGHBOURS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

export interface Gate {
  id: string;
  cells: [number, number][];
  open: boolean;
  /** World-space centre and orientation (true: bars run along X). */
  cx: number;
  cz: number;
  alongX: boolean;
  width: number;
}

export interface WallRun {
  /** Centre, length and orientation of a straight wall segment (world units). */
  cx: number;
  cz: number;
  length: number;
  alongX: boolean;
  /** Direction (along the edge normal) from the edge toward the solid side: ±1. */
  solid: 1 | -1;
}

/**
 * Tile grid for a dungeon: floor cells are walkable, everything else is solid. Walls
 * are generated along floor/solid edges and merged into straight runs. Gates are floor
 * cells that become solid while closed.
 */
export class Grid implements Walkable {
  readonly floor: Uint8Array;
  readonly blocked: Uint8Array;
  readonly gates: Gate[] = [];

  constructor(
    readonly w: number,
    readonly d: number,
    /** World position of cell (0, 0)'s minimum corner. */
    readonly ox: number,
    readonly oz: number,
  ) {
    this.floor = new Uint8Array(w * d);
    this.blocked = new Uint8Array(w * d);
  }

  idx(i: number, j: number) {
    return j * this.w + i;
  }

  inside(i: number, j: number) {
    return i >= 0 && j >= 0 && i < this.w && j < this.d;
  }

  isFloor(i: number, j: number) {
    return this.inside(i, j) && this.floor[this.idx(i, j)] === 1;
  }

  /** Floor and not blocked by a closed gate. */
  open(i: number, j: number) {
    return this.isFloor(i, j) && this.blocked[this.idx(i, j)] === 0;
  }

  cellOf(x: number, z: number): [number, number] {
    return [Math.floor((x - this.ox) / CELL), Math.floor((z - this.oz) / CELL)];
  }

  cellCenter(i: number, j: number): [number, number] {
    return [this.ox + (i + 0.5) * CELL, this.oz + (j + 0.5) * CELL];
  }

  /** Carve a floor rectangle given in cell coordinates (inclusive-exclusive). */
  carve(r: Rect) {
    for (let j = r.z0; j < r.z1; j++) for (let i = r.x0; i < r.x1; i++) if (this.inside(i, j)) this.floor[this.idx(i, j)] = 1;
  }

  addGate(id: string, cells: [number, number][], alongX: boolean): Gate {
    let cx = 0;
    let cz = 0;
    for (const [i, j] of cells) {
      const [x, z] = this.cellCenter(i, j);
      cx += x;
      cz += z;
    }
    const g: Gate = { id, cells, open: true, cx: cx / cells.length, cz: cz / cells.length, alongX, width: cells.length * CELL };
    this.gates.push(g);
    return g;
  }

  setGate(g: Gate, open: boolean) {
    g.open = open;
    for (const [i, j] of g.cells) this.blocked[this.idx(i, j)] = open ? 0 : 1;
  }

  isWalkable(x: number, z: number) {
    const [i, j] = this.cellOf(x, z);
    return this.open(i, j);
  }

  /** Circle vs solid cells: push the circle out of every overlapping solid cell. */
  resolve(p: Vector3, r: number) {
    for (let pass = 0; pass < 2; pass++) {
      const [ci, cj] = this.cellOf(p.x, p.z);
      for (let j = cj - 1; j <= cj + 1; j++) {
        for (let i = ci - 1; i <= ci + 1; i++) {
          if (this.open(i, j)) continue;
          const minX = this.ox + i * CELL;
          const minZ = this.oz + j * CELL;
          const nx = Math.max(minX, Math.min(p.x, minX + CELL));
          const nz = Math.max(minZ, Math.min(p.z, minZ + CELL));
          let dx = p.x - nx;
          let dz = p.z - nz;
          const d2 = dx * dx + dz * dz;
          if (d2 >= r * r) continue;
          if (d2 < 1e-10) {
            // Centre inside a solid cell (e.g. a gate closed on top of us): move to the
            // nearest open neighbouring cell.
            let best: [number, number] | null = null;
            let bestD = Infinity;
            for (const [di, dj] of NEIGHBOURS) {
              if (!this.open(i + di, j + dj)) continue;
              const [nx2, nz2] = this.cellCenter(i + di, j + dj);
              const dd = (nx2 - p.x) ** 2 + (nz2 - p.z) ** 2;
              if (dd < bestD) {
                bestD = dd;
                best = [nx2, nz2];
              }
            }
            if (best) {
              p.x = best[0];
              p.z = best[1];
            }
            continue;
          }
          const d = Math.sqrt(d2);
          p.x = nx + (dx / d) * r;
          p.z = nz + (dz / d) * r;
        }
      }
    }
  }

  /** Straight wall runs along every floor/solid boundary, split where the solid side flips. */
  wallRuns(): WallRun[] {
    const runs: WallRun[] = [];
    // Horizontal edges (between rows j-1 and j), scanned along X.
    for (let j = 0; j <= this.d; j++) {
      let start = -1;
      let side: 1 | -1 = 1;
      for (let i = 0; i <= this.w; i++) {
        const a = this.isFloor(i, j);
        const b = this.isFloor(i, j - 1);
        const edge = i < this.w && a !== b;
        const s: 1 | -1 = a ? -1 : 1; // floor above (row j) → solid below (−z)
        if (start >= 0 && (!edge || s !== side)) {
          const len = i - start;
          runs.push({ cx: this.ox + (start + len / 2) * CELL, cz: this.oz + j * CELL, length: len * CELL, alongX: true, solid: side });
          start = -1;
        }
        if (edge && start < 0) {
          start = i;
          side = s;
        }
      }
    }
    // Vertical edges (between columns i-1 and i), scanned along Z.
    for (let i = 0; i <= this.w; i++) {
      let start = -1;
      let side: 1 | -1 = 1;
      for (let j = 0; j <= this.d; j++) {
        const a = this.isFloor(i, j);
        const b = this.isFloor(i - 1, j);
        const edge = j < this.d && a !== b;
        const s: 1 | -1 = a ? -1 : 1;
        if (start >= 0 && (!edge || s !== side)) {
          const len = j - start;
          runs.push({ cx: this.ox + i * CELL, cz: this.oz + (start + len / 2) * CELL, length: len * CELL, alongX: false, solid: side });
          start = -1;
        }
        if (edge && start < 0) {
          start = j;
          side = s;
        }
      }
    }
    return runs;
  }
}
