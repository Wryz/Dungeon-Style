import type { Vector3 } from 'three';

/** Where fighters may stand. The sim pushes bodies back inside every step. */
export interface Walkable {
  /** Push a circle of radius `r` (on the ground plane) out of anything solid. */
  resolve(p: Vector3, r: number): void;
  /** Is this point standable (centre only)? */
  isWalkable(x: number, z: number): boolean;
}

/** Simple axis-aligned box (the training arena). */
export class RectWalkable implements Walkable {
  constructor(
    public minX: number,
    public maxX: number,
    public minZ: number,
    public maxZ: number,
  ) {}

  resolve(p: Vector3, r: number) {
    p.x = Math.min(this.maxX - r, Math.max(this.minX + r, p.x));
    p.z = Math.min(this.maxZ - r, Math.max(this.minZ + r, p.z));
  }

  isWalkable(x: number, z: number) {
    return x >= this.minX && x <= this.maxX && z >= this.minZ && z <= this.maxZ;
  }
}

export type Obstacle = { kind: 'circle'; x: number; z: number; r: number } | { kind: 'box'; x: number; z: number; hx: number; hz: number };
export type ArenaShape = { kind: 'rect'; hx: number; hz: number } | { kind: 'circle'; r: number };

/** Arena floor: a rectangular or circular boundary plus solid props (posts, shelves, cars...). */
export class ArenaWalkable implements Walkable {
  constructor(
    readonly shape: ArenaShape,
    readonly obstacles: Obstacle[] = [],
  ) {}

  resolve(p: Vector3, r: number) {
    for (const o of this.obstacles) {
      if (o.kind === 'circle') {
        const dx = p.x - o.x;
        const dz = p.z - o.z;
        const d = Math.hypot(dx, dz);
        const min = o.r + r;
        if (d < min) {
          const nx = d > 1e-6 ? dx / d : 1;
          const nz = d > 1e-6 ? dz / d : 0;
          p.x = o.x + nx * min;
          p.z = o.z + nz * min;
        }
      } else {
        const cx = Math.max(o.x - o.hx, Math.min(p.x, o.x + o.hx));
        const cz = Math.max(o.z - o.hz, Math.min(p.z, o.z + o.hz));
        const dx = p.x - cx;
        const dz = p.z - cz;
        const d = Math.hypot(dx, dz);
        if (d >= r) continue;
        if (d > 1e-6) {
          p.x = cx + (dx / d) * r;
          p.z = cz + (dz / d) * r;
        } else {
          // Inside the box: leave along the shallowest side.
          const ox = o.hx - Math.abs(p.x - o.x);
          const oz = o.hz - Math.abs(p.z - o.z);
          if (ox < oz) p.x = o.x + Math.sign(p.x - o.x || 1) * (o.hx + r);
          else p.z = o.z + Math.sign(p.z - o.z || 1) * (o.hz + r);
        }
      }
    }
    const s = this.shape;
    if (s.kind === 'rect') {
      p.x = Math.min(s.hx - r, Math.max(-s.hx + r, p.x));
      p.z = Math.min(s.hz - r, Math.max(-s.hz + r, p.z));
    } else {
      const d = Math.hypot(p.x, p.z);
      const max = s.r - r;
      if (d > max) {
        p.x *= max / d;
        p.z *= max / d;
      }
    }
  }

  isWalkable(x: number, z: number) {
    const s = this.shape;
    if (s.kind === 'rect' ? Math.abs(x) > s.hx || Math.abs(z) > s.hz : Math.hypot(x, z) > s.r) return false;
    for (const o of this.obstacles) {
      if (o.kind === 'circle' ? Math.hypot(x - o.x, z - o.z) < o.r : Math.abs(x - o.x) < o.hx && Math.abs(z - o.z) < o.hz) return false;
    }
    return true;
  }
}
