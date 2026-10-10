import {
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  PointLight,
  Scene,
} from 'three';
import { Rng } from '../sim/math';

export interface ArenaSize {
  halfX: number;
  halfZ: number;
}

/**
 * Roofless test room: stone tile floor, low ruined walls on the far sides only
 * (see-through walls come in milestone 2), corner pillars with torches.
 */
export class Arena {
  readonly group = new Group();
  private readonly torches: { light: PointLight; flame: Mesh; base: number; seed: number }[] = [];

  constructor(
    scene: Scene,
    readonly size: ArenaSize = { halfX: 8, halfZ: 5 },
  ) {
    scene.add(this.group);
    const rng = new Rng(42);
    this.buildLights(scene);
    this.buildFloor(rng);
    this.buildWalls(rng);
    this.buildPillars();
  }

  private buildLights(scene: Scene) {
    scene.add(new HemisphereLight(0xe4f1ff, 0xb39c7c, 1.25));
    const sun = new DirectionalLight(0xfff3e0, 2.1);
    sun.position.set(-6, 14, 7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const c = sun.shadow.camera;
    c.left = -12;
    c.right = 12;
    c.top = 10;
    c.bottom = -10;
    c.near = 1;
    c.far = 40;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.02;
    scene.add(sun);
    scene.add(sun.target);
  }

  private buildFloor(rng: Rng) {
    const { halfX, halfZ } = this.size;
    const tile = 1;
    const nx = Math.round((halfX * 2) / tile);
    const nz = Math.round((halfZ * 2) / tile);
    const geo = new BoxGeometry(tile * 0.96, 0.2, tile * 0.96);
    const mat = new MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 0.95 });
    const mesh = new InstancedMesh(geo, mat, nx * nz);
    const o = new Object3D();
    const col = new Color();
    let i = 0;
    for (let x = 0; x < nx; x++) {
      for (let z = 0; z < nz; z++) {
        o.position.set(-halfX + tile * (x + 0.5), -0.1 + rng.range(-0.012, 0.004), -halfZ + tile * (z + 0.5));
        o.rotation.set(rng.range(-0.008, 0.008), rng.range(-0.03, 0.03), rng.range(-0.008, 0.008));
        o.updateMatrix();
        mesh.setMatrixAt(i, o.matrix);
        const v = rng.range(0.6, 0.7);
        col.setRGB(v * 1.05, v * 0.98, v * 0.86);
        mesh.setColorAt(i, col);
        i++;
      }
    }
    mesh.receiveShadow = true;
    this.group.add(mesh);
    // Grout / underlay.
    const under = new Mesh(
      new PlaneGeometry(halfX * 2 + 0.2, halfZ * 2 + 0.2),
      new MeshStandardMaterial({ color: 0x8c7a62, roughness: 1 }),
    );
    under.rotation.x = -Math.PI / 2;
    under.position.y = -0.09;
    under.receiveShadow = true;
    this.group.add(under);
    const outside = new Mesh(new PlaneGeometry(200, 200), new MeshStandardMaterial({ color: 0xcdbf9f, roughness: 1 }));
    outside.rotation.x = -Math.PI / 2;
    outside.position.y = -0.12;
    outside.receiveShadow = true;
    this.group.add(outside);
  }

  private buildWalls(rng: Rng) {
    const { halfX, halfZ } = this.size;
    const blocks: { x: number; y: number; z: number; sx: number; sy: number; sz: number }[] = [];
    const brickH = 0.32;
    const addWall = (x0: number, z0: number, x1: number, z1: number, height: number) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
      const rows = Math.round(height / brickH);
      for (let r = 0; r < rows; r++) {
        let t = r % 2 === 0 ? 0 : -0.35;
        while (t < len) {
          const w = rng.range(0.55, 0.85);
          const a = Math.max(0, t);
          const b = Math.min(len, t + w);
          t += w + 0.03;
          if (b - a < 0.1) continue;
          // Ruined top rows: drop some blocks.
          if (r >= rows - 2 && rng.chance(0.35)) continue;
          const mid = (a + b) / 2 / len;
          const x = x0 + (x1 - x0) * mid;
          const z = z0 + (z1 - z0) * mid;
          const thick = 0.42;
          blocks.push({
            x,
            y: r * brickH + brickH / 2,
            z,
            sx: alongX ? b - a : thick,
            sy: brickH * 0.94,
            sz: alongX ? thick : b - a,
          });
        }
      }
    };
    const wz = halfZ + 0.25;
    const wx = halfX + 0.25;
    addWall(-wx, -wz, wx, -wz, 1.9);
    addWall(-wx, -wz, -wx, wz, 1.3);
    addWall(wx, -wz, wx, wz, 1.3);
    const geo = new BoxGeometry(1, 1, 1);
    const mat = new MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 0.9 });
    const mesh = new InstancedMesh(geo, mat, blocks.length);
    const o = new Object3D();
    const col = new Color();
    blocks.forEach((b, i) => {
      o.position.set(b.x, b.y, b.z);
      o.scale.set(b.sx, b.sy, b.sz);
      o.rotation.set(0, rng.range(-0.02, 0.02), 0);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
      const v = rng.range(0.66, 0.8);
      col.setRGB(v, v * 0.93, v * 0.82);
      mesh.setColorAt(i, col);
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  private buildPillars() {
    const { halfX, halfZ } = this.size;
    const stone = new MeshStandardMaterial({ color: 0xc2b39b, flatShading: true, roughness: 0.9 });
    const iron = new MeshStandardMaterial({ color: 0x2a2624, flatShading: true, roughness: 0.6, metalness: 0.4 });
    const flameMat = new MeshBasicMaterial({ color: 0xffa040 });
    const spots: [number, number, boolean][] = [
      [-halfX - 0.25, -halfZ - 0.25, true],
      [halfX + 0.25, -halfZ - 0.25, true],
      [-halfX - 0.25, halfZ + 0.25, false],
      [halfX + 0.25, halfZ + 0.25, false],
    ];
    for (const [x, z, torch] of spots) {
      const h = torch ? 2.6 : 1.1;
      const p = new Mesh(new CylinderGeometry(0.34, 0.4, h, 6), stone);
      p.position.set(x, h / 2, z);
      p.castShadow = true;
      p.receiveShadow = true;
      this.group.add(p);
      const cap = new Mesh(new BoxGeometry(0.9, 0.16, 0.9), stone);
      cap.position.set(x, h + 0.08, z);
      cap.castShadow = true;
      this.group.add(cap);
      if (!torch) continue;
      const bowl = new Mesh(new CylinderGeometry(0.22, 0.12, 0.18, 6), iron);
      bowl.position.set(x, h + 0.25, z);
      this.group.add(bowl);
      const flame = new Mesh(new ConeGeometry(0.15, 0.4, 5), flameMat);
      flame.position.set(x, h + 0.5, z);
      this.group.add(flame);
      const light = new PointLight(0xff9a4a, 3, 7, 1.6);
      light.position.set(x, h + 0.7, z);
      this.group.add(light);
      this.torches.push({ light, flame, base: 3, seed: x * 3.1 + z });
    }
  }

  update(time: number) {
    for (const t of this.torches) {
      const n = Math.sin(time * 9 + t.seed) * 0.5 + Math.sin(time * 23 + t.seed * 2) * 0.3 + Math.sin(time * 4.3 + t.seed) * 0.2;
      t.light.intensity = t.base * (0.85 + n * 0.15);
      t.flame.scale.set(1 + n * 0.08, 1 + n * 0.18, 1 + n * 0.08);
    }
  }
}
