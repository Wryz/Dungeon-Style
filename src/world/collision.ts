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
