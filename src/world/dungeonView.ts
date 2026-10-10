import {
  AdditiveBlending,
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
  RingGeometry,
  type Scene,
  Vector3,
} from 'three';
import { applyCutout } from '../render/cutout';
import { Rng } from '../sim/math';
import type { DungeonLayout } from './dungeon';
import { CELL, type Gate } from './grid';

export const WALL_HEIGHT = 2.1;
const WALL_THICK = 0.45;
const BRICK_H = 0.35;

interface GateView {
  gate: Gate;
  group: Group;
  y: number;
}

/** Visuals for a dungeon layout: floor, ruined brick walls (see-through), gates, torches, terminal. */
export class DungeonView {
  readonly group = new Group();
  private readonly gates = new Map<Gate, GateView>();
  private readonly flames: { mesh: Mesh; seed: number }[] = [];
  private readonly lights: { light: PointLight; base: number; seed: number }[] = [];
  private readonly sun: DirectionalLight;
  private readonly terminal: Group;
  private readonly terminalRing: Mesh;
  private readonly terminalScreen: MeshBasicMaterial;

  constructor(
    private readonly scene: Scene,
    readonly layout: DungeonLayout,
    seed: number,
  ) {
    scene.add(this.group);
    const rng = new Rng(seed * 31 + 7);
    this.group.add(new HemisphereLight(0xe4f1ff, 0xb39c7c, 1.25));
    this.sun = new DirectionalLight(0xfff3e0, 2.1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const c = this.sun.shadow.camera;
    c.left = -13;
    c.right = 13;
    c.top = 11;
    c.bottom = -11;
    c.near = 1;
    c.far = 50;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.02;
    this.group.add(this.sun, this.sun.target);

    this.buildFloor(rng);
    this.buildWalls(rng);
    this.buildGates();
    this.buildTorches(rng);
    const t = this.buildTerminal();
    this.terminal = t.group;
    this.terminalRing = t.ring;
    this.terminalScreen = t.screen;
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      const m = o as Mesh;
      if (m.geometry) m.geometry.dispose();
    });
  }

  private buildFloor(rng: Rng) {
    const g = this.layout.grid;
    const cells: [number, number][] = [];
    for (let j = 0; j < g.d; j++) for (let i = 0; i < g.w; i++) if (g.isFloor(i, j)) cells.push([i, j]);
    const mesh = new InstancedMesh(
      new BoxGeometry(CELL * 0.96, 0.2, CELL * 0.96),
      new MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 0.95 }),
      cells.length,
    );
    const o = new Object3D();
    const col = new Color();
    cells.forEach(([i, j], k) => {
      const [x, z] = g.cellCenter(i, j);
      o.position.set(x, -0.1 + rng.range(-0.012, 0.004), z);
      o.rotation.set(rng.range(-0.008, 0.008), rng.range(-0.03, 0.03), rng.range(-0.008, 0.008));
      o.updateMatrix();
      mesh.setMatrixAt(k, o.matrix);
      const v = rng.range(0.6, 0.7);
      col.setRGB(v * 1.05, v * 0.98, v * 0.86);
      mesh.setColorAt(k, col);
    });
    mesh.receiveShadow = true;
    this.group.add(mesh);
    const under = new Mesh(new PlaneGeometry(400, 400), new MeshStandardMaterial({ color: 0xcdbf9f, roughness: 1 }));
    under.rotation.x = -Math.PI / 2;
    under.position.y = -0.12;
    under.receiveShadow = true;
    this.group.add(under);
  }

  private buildWalls(rng: Rng) {
    const blocks: { x: number; y: number; z: number; sx: number; sy: number; sz: number; v: number }[] = [];
    const rows = Math.round(WALL_HEIGHT / BRICK_H);
    for (const run of this.layout.grid.wallRuns()) {
      // Wall sits on the solid side of the edge, face flush with the floor boundary.
      const off = (run.solid * WALL_THICK) / 2;
      const len = run.length + WALL_THICK; // overlap corners
      for (let r = 0; r < rows; r++) {
        let t = r % 2 === 0 ? 0 : -0.3;
        while (t < len) {
          const w = rng.range(0.5, 0.85);
          const a = Math.max(0, t);
          const b = Math.min(len, t + w);
          t += w + 0.03;
          if (b - a < 0.1) continue;
          // Ruined, roofless tops: knock out some of the upper bricks.
          if (r >= rows - 2 && rng.chance(r === rows - 1 ? 0.45 : 0.15)) continue;
          const mid = (a + b) / 2 - len / 2;
          blocks.push({
            x: run.alongX ? run.cx + mid : run.cx + off,
            y: r * BRICK_H + BRICK_H / 2,
            z: run.alongX ? run.cz + off : run.cz + mid,
            sx: run.alongX ? b - a : WALL_THICK,
            sy: BRICK_H * 0.94,
            sz: run.alongX ? WALL_THICK : b - a,
            v: rng.range(0.66, 0.8),
          });
        }
      }
    }
    const mat = applyCutout(new MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 0.9 }));
    const mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), mat, blocks.length);
    const o = new Object3D();
    const col = new Color();
    blocks.forEach((b, i) => {
      o.position.set(b.x, b.y, b.z);
      o.scale.set(b.sx, b.sy, b.sz);
      o.rotation.set(0, rng.range(-0.015, 0.015), 0);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
      col.setRGB(b.v, b.v * 0.93, b.v * 0.82);
      mesh.setColorAt(i, col);
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  private buildGates() {
    // Chunky, readable portcullis: a few thick bars, rails and end posts.
    const iron = new MeshStandardMaterial({ color: 0x6d6a66, flatShading: true, roughness: 0.5, metalness: 0.45 });
    for (const gate of this.layout.grid.gates) {
      const group = new Group();
      const n = Math.max(3, Math.round(gate.width / 0.5));
      for (const end of [-0.5, 0.5]) {
        const post = new Mesh(new BoxGeometry(0.16, WALL_HEIGHT + 0.1, 0.16), iron);
        post.position.set(gate.alongX ? end * gate.width : 0, WALL_HEIGHT / 2, gate.alongX ? 0 : end * gate.width);
        post.castShadow = true;
        group.add(post);
      }
      for (let k = 0; k < n; k++) {
        const bar = new Mesh(new BoxGeometry(0.11, WALL_HEIGHT, 0.11), iron);
        const u = (k + 0.5) / n - 0.5;
        bar.position.set(gate.alongX ? u * gate.width : 0, WALL_HEIGHT / 2, gate.alongX ? 0 : u * gate.width);
        bar.castShadow = true;
        group.add(bar);
      }
      for (const h of [0.45, 1.25, 1.95]) {
        const rail = new Mesh(new BoxGeometry(gate.alongX ? gate.width : 0.12, 0.12, gate.alongX ? 0.12 : gate.width), iron);
        rail.position.y = h;
        group.add(rail);
      }
      group.position.set(gate.cx, -WALL_HEIGHT - 0.2, gate.cz);
      this.group.add(group);
      this.gates.set(gate, { gate, group, y: gate.open ? -WALL_HEIGHT - 0.2 : 0 });
    }
  }

  private buildTorches(rng: Rng) {
    const iron = new MeshStandardMaterial({ color: 0x2a2624, flatShading: true, roughness: 0.6, metalness: 0.4 });
    const flameMat = new MeshBasicMaterial({ color: 0xffa040 });
    const g = this.layout.grid;
    for (const room of this.layout.rooms) {
      // Two torches on the far (north) wall of each room, one warm light per room.
      const zWall = g.oz + room.rect.z0 * CELL;
      for (const fx of [0.25, 0.75]) {
        const x = g.ox + (room.rect.x0 + (room.rect.x1 - room.rect.x0) * fx) * CELL;
        const bowl = new Mesh(new CylinderGeometry(0.16, 0.08, 0.14, 6), iron);
        bowl.position.set(x, 1.65, zWall + 0.25);
        const flame = new Mesh(new ConeGeometry(0.11, 0.3, 5), flameMat);
        flame.position.set(x, 1.86, zWall + 0.25);
        this.group.add(bowl, flame);
        this.flames.push({ mesh: flame, seed: rng.range(0, 10) });
      }
      const light = new PointLight(0xff9a4a, 2.2, 9, 1.6);
      light.position.set(room.cx, 2.4, g.oz + room.rect.z0 * CELL + 1.2);
      this.group.add(light);
      this.lights.push({ light, base: 2.2, seed: rng.range(0, 10) });
    }
  }

  private buildTerminal() {
    const [x, z] = this.layout.terminal;
    const group = new Group();
    const stone = new MeshStandardMaterial({ color: 0xc2b39b, flatShading: true, roughness: 0.9 });
    const base = new Mesh(new BoxGeometry(0.7, 0.9, 0.5), stone);
    base.position.y = 0.45;
    base.castShadow = true;
    group.add(base);
    // A floating screen: the first explicit hint that this world runs on a computer.
    const screen = new MeshBasicMaterial({ color: 0x7fe8ff, toneMapped: false });
    const frame = new Mesh(new BoxGeometry(0.9, 0.62, 0.06), new MeshStandardMaterial({ color: 0x1b1f26, roughness: 0.4 }));
    frame.position.set(0, 1.55, 0);
    const glass = new Mesh(new PlaneGeometry(0.8, 0.52), screen);
    glass.position.set(0, 1.55, 0.035);
    group.add(frame, glass);
    const ring = new Mesh(
      new RingGeometry(0.75, 0.95, 40),
      new MeshBasicMaterial({ color: 0x7fe8ff, transparent: true, opacity: 0.6, blending: AdditiveBlending, depthWrite: false, toneMapped: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    group.add(ring);
    group.position.set(x, 0, z);
    group.rotation.y = -Math.PI / 2; // face back toward the dungeon (west)
    this.group.add(group);
    return { group, ring, screen };
  }

  update(time: number, dt: number, focus: Vector3) {
    for (const v of this.gates.values()) {
      const target = v.gate.open ? -WALL_HEIGHT - 0.2 : 0;
      // Gates slam shut quickly, grind open slowly.
      const speed = v.gate.open ? 2.2 : 9;
      v.y += Math.sign(target - v.y) * Math.min(Math.abs(target - v.y), speed * dt);
      v.group.position.y = v.y;
    }
    for (const f of this.flames) {
      const n = Math.sin(time * 9 + f.seed) * 0.5 + Math.sin(time * 23 + f.seed * 2) * 0.3;
      f.mesh.scale.set(1 + n * 0.08, 1 + n * 0.2, 1 + n * 0.08);
    }
    for (const l of this.lights) l.light.intensity = l.base * (0.88 + 0.12 * Math.sin(time * 7 + l.seed));
    const pulse = 0.5 + 0.5 * Math.sin(time * 2.4);
    this.terminalRing.scale.setScalar(0.9 + pulse * 0.15);
    (this.terminalRing.material as MeshBasicMaterial).opacity = 0.35 + 0.4 * pulse;
    this.terminalScreen.color.setRGB(0.45 + 0.1 * pulse, 0.85 + 0.1 * pulse, 1);
    this.terminal.children[1].position.y = 1.55 + Math.sin(time * 1.3) * 0.04;
    this.terminal.children[2].position.y = 1.55 + Math.sin(time * 1.3) * 0.04;
    // Shadows follow the action.
    this.sun.position.set(focus.x - 6, 14, focus.z + 7);
    this.sun.target.position.set(focus.x, 0, focus.z);
  }

  get terminalPos(): Vector3 {
    return this.terminal.position;
  }
}
