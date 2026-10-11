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
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  PointLight,
  type Scene,
  SpotLight,
} from 'three';
import { applyCutout } from '../render/cutout';
import { Rng } from '../sim/math';
import type { ThemeDef } from './themes';

const _o = new Object3D();
const _c = new Color();

interface Crowd {
  mesh: InstancedMesh;
  heads: InstancedMesh;
  base: { x: number; y: number; z: number; ry: number; seed: number }[];
}

/** Visuals for an arena theme: floor, boundary, props, lights, crowd. */
export class ThemeView {
  readonly group = new Group();
  readonly background: Color;
  private readonly crowds: Crowd[] = [];
  private readonly flicker: { light: PointLight | SpotLight; base: number; seed: number }[] = [];
  private readonly sun: DirectionalLight;

  constructor(
    private readonly scene: Scene,
    readonly def: ThemeDef,
    seed: number,
  ) {
    scene.add(this.group);
    const rng = new Rng(seed);
    this.sun = new DirectionalLight(0xffffff, 2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const c = this.sun.shadow.camera;
    c.left = -12;
    c.right = 12;
    c.top = 11;
    c.bottom = -11;
    c.near = 1;
    c.far = 50;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.02;
    this.sun.position.set(-6, 14, 7);
    this.group.add(this.sun, this.sun.target);
    this.background = new Color();
    switch (def.id) {
      case 'ring':
        this.buildRing(rng);
        break;
      case 'street':
        this.buildStreet(rng);
        break;
      case 'grocery':
        this.buildGrocery(rng);
        break;
      case 'colosseum':
        this.buildColosseum(rng);
        break;
    }
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      const m = o as Mesh;
      m.geometry?.dispose();
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private mat(color: number | string, opts: { cut?: boolean; rough?: number; metal?: number; emissive?: number | string } = {}): MeshStandardMaterial {
    const m = new MeshStandardMaterial({
      color,
      flatShading: true,
      roughness: opts.rough ?? 0.85,
      metalness: opts.metal ?? 0,
      emissive: opts.emissive ?? 0x000000,
    });
    return opts.cut === false ? m : applyCutout(m);
  }

  private box(w: number, h: number, d: number, material: Material, x: number, y: number, z: number, ry = 0, shadow = true) {
    const m = new Mesh(new BoxGeometry(w, h, d), material);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.castShadow = shadow;
    m.receiveShadow = true;
    this.group.add(m);
    return m;
  }

  private light(skyColor: number, groundColor: number, hemi: number, sunColor: number, sun: number, sunPos: [number, number, number]) {
    this.group.add(new HemisphereLight(skyColor, groundColor, hemi));
    this.sun.color.set(sunColor);
    this.sun.intensity = sun;
    this.sun.position.set(...sunPos);
  }

  private ground(color: number, size = 120, y = -0.02) {
    const g = new Mesh(new PlaneGeometry(size, size), new MeshStandardMaterial({ color, roughness: 1 }));
    g.rotation.x = -Math.PI / 2;
    g.position.y = y;
    g.receiveShadow = true;
    this.group.add(g);
  }

  /** Rows of spectators along a ring or rectangle, rising with distance. */
  private crowd(rng: Rng, spots: { x: number; y: number; z: number; ry: number }[], palette: string[]) {
    const n = spots.length;
    const body = new InstancedMesh(new BoxGeometry(0.42, 0.6, 0.3), new MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 0.9 }), n);
    const heads = new InstancedMesh(new BoxGeometry(0.22, 0.24, 0.22), new MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 0.8 }), n);
    const skins = ['#f0c49a', '#d6a27c', '#a8705a', '#7a4e36', '#e2b08a'];
    const base = spots.map((s, i) => {
      body.setColorAt(i, _c.set(palette[Math.floor(rng.next() * palette.length)]));
      heads.setColorAt(i, _c.set(skins[Math.floor(rng.next() * skins.length)]));
      return { ...s, seed: rng.range(0, 10) };
    });
    body.castShadow = false;
    this.group.add(body, heads);
    const crowd = { mesh: body, heads, base };
    this.crowds.push(crowd);
    this.updateCrowd(crowd, 0);
  }

  private updateCrowd(c: Crowd, time: number) {
    c.base.forEach((b, i) => {
      // Cheering bob, some jumping.
      const hop = Math.max(0, Math.sin(time * (3 + (b.seed % 2)) + b.seed)) * 0.08;
      _o.position.set(b.x, b.y + 0.3 + hop, b.z);
      _o.rotation.set(0, b.ry, 0);
      _o.scale.set(1, 1, 1);
      _o.updateMatrix();
      c.mesh.setMatrixAt(i, _o.matrix);
      _o.position.y = b.y + 0.72 + hop;
      _o.updateMatrix();
      c.heads.setMatrixAt(i, _o.matrix);
    });
    c.mesh.instanceMatrix.needsUpdate = true;
    c.heads.instanceMatrix.needsUpdate = true;
  }

  private rectSeats(hx: number, hz: number, rows: number, gap: number, rise: number, density = 0.75, rng: Rng, skipSouth = true) {
    const out: { x: number; y: number; z: number; ry: number }[] = [];
    for (let r = 0; r < rows; r++) {
      const ex = hx + 1 + r * gap;
      const ez = hz + 1 + r * gap;
      const y = r * rise;
      for (let x = -ex; x <= ex; x += 0.55) {
        if (rng.chance(density)) out.push({ x: x + rng.range(-0.1, 0.1), y, z: -ez, ry: 0 });
        if (!skipSouth && rng.chance(density)) out.push({ x, y, z: ez, ry: Math.PI });
      }
      for (let z = -ez; z <= ez; z += 0.55) {
        if (rng.chance(density)) out.push({ x: -ex, y, z, ry: Math.PI / 2 });
        if (rng.chance(density)) out.push({ x: ex, y, z, ry: -Math.PI / 2 });
      }
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // Themes
  // ---------------------------------------------------------------------------

  private buildRing(rng: Rng) {
    this.background.set('#16171d');
    this.light(0x8d95b3, 0x2a2730, 0.7, 0xfff4e6, 1.2, [-3, 16, 5]);
    this.ground(0x24242c, 120, -0.9);
    const R = 3.6;
    // Raised platform and canvas.
    this.box(8.2, 0.9, 8.2, this.mat(0x1e3a6e, { cut: false }), 0, -0.45, 0, 0, false);
    const canvas = new Mesh(new PlaneGeometry(7.6, 7.6), new MeshStandardMaterial({ color: 0xe9e6dc, roughness: 0.95 }));
    canvas.rotation.x = -Math.PI / 2;
    canvas.position.y = 0.001;
    canvas.receiveShadow = true;
    this.group.add(canvas);
    const logo = new Mesh(new CylinderGeometry(1.1, 1.1, 0.004, 24), new MeshStandardMaterial({ color: 0xb8322a, roughness: 0.9 }));
    logo.position.y = 0.004;
    logo.receiveShadow = true;
    this.group.add(logo);
    // Corner posts and pads.
    const pads = [0xc0392b, 0xffffff, 0x2a62c9, 0xffffff];
    [
      [-R, -R],
      [R, -R],
      [R, R],
      [-R, R],
    ].forEach(([x, z], i) => {
      const post = new Mesh(new CylinderGeometry(0.08, 0.08, 1.6, 8), this.mat(0xb8b8bc, { metal: 0.6, rough: 0.35 }));
      post.position.set(x, 0.8, z);
      post.castShadow = true;
      this.group.add(post);
      this.box(0.22, 1.1, 0.22, this.mat(pads[i]), x * 0.97, 0.75, z * 0.97, Math.PI / 4);
    });
    // Ropes.
    const ropes = [0xc0392b, 0xf2f2f2, 0x2a62c9];
    [0.45, 0.85, 1.25].forEach((h, k) => {
      const m = this.mat(ropes[k], { rough: 0.5 });
      for (const [x, z, len, alongX] of [
        [0, -R, 2 * R, true],
        [0, R, 2 * R, true],
        [-R, 0, 2 * R, false],
        [R, 0, 2 * R, false],
      ] as [number, number, number, boolean][]) {
        this.box(alongX ? len : 0.05, 0.05, alongX ? 0.05 : len, m, x, h, z, 0, false);
      }
    });
    // Spotlights from the rig, with visible beams.
    for (const [x, z] of [
      [-5, -5],
      [5, -5],
      [0, 6],
    ]) {
      const spot = new SpotLight(0xfff2dc, 40, 22, 0.42, 0.5, 1.2);
      spot.position.set(x, 9, z);
      spot.target.position.set(0, 0, 0);
      this.group.add(spot, spot.target);
      const beam = new Mesh(
        new ConeGeometry(2.4, 9, 16, 1, true),
        new MeshBasicMaterial({ color: 0xfff2dc, transparent: true, opacity: 0.05, blending: AdditiveBlending, depthWrite: false }),
      );
      beam.position.set(x * 0.5, 4.5, z * 0.5);
      beam.lookAt(0, 0, 0);
      beam.rotateX(Math.PI / 2);
      this.group.add(beam);
    }
    this.crowd(rng, this.rectSeats(4.5, 4.5, 6, 0.7, 0.45, 0.7, rng).map((s) => ({ ...s, y: s.y - 0.9 })), ['#3b3f4c', '#5a2e2e', '#2e4a5a', '#4a4a2e', '#2a2a2a', '#6b6b6b']);
  }

  private buildStreet(rng: Rng) {
    this.background.set('#e9a679');
    this.light(0xffc9a0, 0x4a3d52, 1.1, 0xffb77a, 2, [-10, 9, 6]);
    this.ground(0x6b6660);
    const { hx, hz } = this.def.shape as { hx: number; hz: number };
    // Asphalt road and markings.
    this.box(hx * 2 + 8, 0.04, hz * 2, this.mat(0x3c3e43, { cut: false }), 0, -0.01, 0, 0, false);
    for (let x = -hx - 3; x < hx + 3; x += 1.6) this.box(0.8, 0.045, 0.12, this.mat(0xf2d04a, { cut: false }), x, 0, 0, 0, false);
    // Sidewalks.
    for (const s of [-1, 1]) this.box(hx * 2 + 8, 0.16, 2.2, this.mat(0xa29c94, { cut: false }), 0, 0.05, s * (hz + 1.1), 0, false);
    // Buildings on the far side.
    const colors = [0x8e4b3a, 0xc2a37a, 0x4f7c7a, 0x9b8a78, 0x6a5a8c];
    let x = -hx - 4;
    while (x < hx + 4) {
      const w = rng.range(2.4, 4);
      const h = rng.range(4, 8);
      const col = colors[Math.floor(rng.next() * colors.length)];
      this.box(w, h, 3, this.mat(col), x + w / 2, h / 2, -hz - 3.8);
      for (let wy = 1.4; wy < h - 0.6; wy += 1.3) {
        for (let wx = x + 0.5; wx < x + w - 0.4; wx += 0.9) {
          const lit = rng.chance(0.4);
          this.box(0.5, 0.65, 0.05, this.mat(lit ? 0xffe2a0 : 0x2d3440, { emissive: lit ? 0x8a6a2a : 0 }), wx + 0.25, wy, -hz - 2.28, 0, false);
        }
      }
      x += w + 0.1;
    }
    // Street lamps.
    for (const lx of [-hx + 1, 0, hx - 1]) {
      this.box(0.1, 3.6, 0.1, this.mat(0x2b2b2e, { metal: 0.5 }), lx, 1.8, -hz - 0.6);
      this.box(0.7, 0.08, 0.1, this.mat(0x2b2b2e), lx + 0.3, 3.6, -hz - 0.6);
      this.box(0.3, 0.12, 0.25, this.mat(0xfff0c0, { emissive: 0xffd080 }), lx + 0.6, 3.5, -hz - 0.6, 0, false);
      const l = new PointLight(0xffc070, 4, 9, 1.5);
      l.position.set(lx + 0.6, 3.3, -hz - 0.5);
      this.group.add(l);
      this.flicker.push({ light: l, base: 4, seed: rng.range(0, 9) });
    }
    // Parked car (obstacle), trash can, hydrant.
    const car = this.def.obstacles[0];
    if (car.kind === 'box') {
      const paint = this.mat(0x2f6fa8, { metal: 0.3, rough: 0.4 });
      this.box(car.hx * 2, 0.55, car.hz * 2, paint, car.x, 0.45, car.z);
      this.box(car.hx * 1.1, 0.45, car.hz * 1.8, this.mat(0x9fc2d9, { metal: 0.2, rough: 0.2 }), car.x - 0.1, 0.95, car.z);
      for (const [dx, dz] of [
        [-0.65, -0.45],
        [0.65, -0.45],
        [-0.65, 0.45],
        [0.65, 0.45],
      ]) {
        const w = new Mesh(new CylinderGeometry(0.2, 0.2, 0.14, 10), this.mat(0x1a1a1a));
        w.rotation.x = Math.PI / 2;
        w.position.set(car.x + dx, 0.2, car.z + dz);
        this.group.add(w);
      }
    }
    for (const o of this.def.obstacles.slice(1)) {
      if (o.kind !== 'circle') continue;
      const big = o.r > 0.25;
      const m = new Mesh(new CylinderGeometry(o.r, o.r * 0.9, big ? 0.9 : 0.55, 10), this.mat(big ? 0x4a5a4a : 0xc0392b, { metal: 0.3 }));
      m.position.set(o.x, big ? 0.45 : 0.28, o.z);
      m.castShadow = true;
      this.group.add(m);
    }
    // Onlookers on the sidewalks.
    const spots: { x: number; y: number; z: number; ry: number }[] = [];
    for (let i = 0; i < 26; i++) spots.push({ x: rng.range(-hx - 2, hx + 2), y: 0.13, z: -hz - rng.range(0.6, 1.8), ry: 0 });
    for (const s of [-1, 1]) for (let i = 0; i < 8; i++) spots.push({ x: s * (hx + rng.range(0.8, 2)), y: 0, z: rng.range(-hz, hz), ry: -s * Math.PI / 2 });
    this.crowd(rng, spots, ['#3b3f4c', '#7a3a3a', '#2e5a3a', '#c9a227', '#222222', '#5a4a6a']);
  }

  private buildGrocery(rng: Rng) {
    this.background.set('#dfe6ea');
    this.light(0xf4f8ff, 0xc9c2b4, 1.5, 0xffffff, 1.4, [-4, 16, 6]);
    this.ground(0xb9b4ac);
    const { hx, hz } = this.def.shape as { hx: number; hz: number };
    // Checker tile floor.
    const tiles = new InstancedMesh(new BoxGeometry(0.98, 0.04, 0.98), new MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }), Math.ceil(hx * 2 + 4) * Math.ceil(hz * 2 + 4));
    let k = 0;
    for (let x = -hx - 2; x < hx + 2; x++) {
      for (let z = -hz - 2; z < hz + 2; z++) {
        _o.position.set(x + 0.5, -0.02, z + 0.5);
        _o.rotation.set(0, 0, 0);
        _o.scale.set(1, 1, 1);
        _o.updateMatrix();
        tiles.setMatrixAt(k, _o.matrix);
        tiles.setColorAt(k, _c.set((x + z) % 2 === 0 ? '#f2f2ef' : '#c9cfd4'));
        k++;
      }
    }
    tiles.count = k;
    tiles.receiveShadow = true;
    this.group.add(tiles);
    const productColors = ['#d9533d', '#e8b53a', '#3aa76d', '#3d7bd9', '#8e5bd9', '#f2f2f2', '#c96a2b'];
    const shelf = (x: number, z: number, len: number, alongX: boolean, h: number) => {
      const frame = this.mat(0xd9d9d6, { metal: 0.3, rough: 0.5 });
      this.box(alongX ? len : 0.7, h, alongX ? 0.7 : len, frame, x, h / 2, z);
      for (let level = 0.35; level < h - 0.2; level += 0.45) {
        for (let t = -len / 2 + 0.2; t < len / 2 - 0.15; t += rng.range(0.22, 0.34)) {
          const c = productColors[Math.floor(rng.next() * productColors.length)];
          const ph = rng.range(0.18, 0.32);
          const m = this.mat(c);
          for (const side of [-1, 1]) {
            this.box(alongX ? 0.18 : 0.12, ph, alongX ? 0.12 : 0.18, m, alongX ? x + t : x + side * 0.4, level + ph / 2, alongX ? z + side * 0.4 : z + t, 0, false);
          }
        }
      }
    };
    // Perimeter shelving (far and sides), low freezers on the near side.
    shelf(0, -hz - 0.5, hx * 2 + 1, true, 2.2);
    shelf(-hx - 0.5, 0, hz * 2, false, 2.2);
    shelf(hx + 0.5, 0, hz * 2, false, 2.2);
    for (let x = -hx + 1; x < hx; x += 2.2) {
      this.box(2, 0.9, 0.9, this.mat(0xf4f6f8), x, 0.45, hz + 0.55);
      this.box(1.9, 0.05, 0.8, this.mat(0x9fd4f0, { metal: 0.2, rough: 0.1 }), x, 0.92, hz + 0.55, 0, false);
    }
    // Aisle islands (obstacles) and a cart.
    for (const o of this.def.obstacles) {
      if (o.kind === 'box') shelf(o.x, o.z, o.hx * 2, true, 1.4);
      else {
        const wire = this.mat(0xb8bcc2, { metal: 0.7, rough: 0.3 });
        this.box(0.6, 0.45, 0.85, wire, o.x, 0.65, o.z, 0.4);
        this.box(0.05, 0.5, 0.05, wire, o.x - 0.2, 0.25, o.z - 0.3, 0.4);
        this.box(0.05, 0.5, 0.05, wire, o.x + 0.2, 0.25, o.z + 0.3, 0.4);
      }
    }
    // Hanging sale signs.
    for (const sx of [-3, 3]) this.box(1.2, 0.45, 0.05, this.mat(0xe8402b, { emissive: 0x5a1000 }), sx, 2.8, -hz + 0.3, 0, false);
    // A few shoppers watching from the ends of the aisles.
    const spots: { x: number; y: number; z: number; ry: number }[] = [];
    for (let i = 0; i < 6; i++) spots.push({ x: rng.range(-hx + 0.5, hx - 0.5), y: 0, z: -hz + 0.4, ry: 0 });
    this.crowd(rng, spots, ['#3a7d44', '#d9533d', '#3d7bd9', '#e8b53a']);
  }

  private buildColosseum(rng: Rng) {
    this.background.set('#9fd0f0');
    this.light(0xdcefff, 0xc9a77a, 1.2, 0xfff1d6, 2.3, [-8, 16, 4]);
    this.ground(0xc7ae7c);
    const R = (this.def.shape as { r: number }).r;
    // Sand floor with darker patches.
    const sand = new Mesh(new CylinderGeometry(R + 0.6, R + 0.6, 0.04, 48), new MeshStandardMaterial({ color: 0xdcc28c, roughness: 1, flatShading: true }));
    sand.position.y = -0.02;
    sand.receiveShadow = true;
    this.group.add(sand);
    for (let i = 0; i < 14; i++) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(0, R - 1);
      const p = new Mesh(new CylinderGeometry(rng.range(0.4, 1.2), rng.range(0.4, 1.2), 0.01, 9), new MeshStandardMaterial({ color: 0xc9ac74, roughness: 1 }));
      p.position.set(Math.cos(a) * d, 0.002, Math.sin(a) * d);
      p.receiveShadow = true;
      this.group.add(p);
    }
    // Arena wall with arches.
    const segs = 40;
    const stone = this.mat(0xc8b48e);
    const dark = this.mat(0x6b5a44);
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const x = Math.cos(a) * (R + 0.9);
      const z = Math.sin(a) * (R + 0.9);
      const w = ((Math.PI * 2 * (R + 0.9)) / segs) * 1.02;
      this.box(w, 2.6, 0.6, stone, x, 1.3, z, -a + Math.PI / 2);
      if (i % 2 === 0) this.box(w * 0.55, 1.5, 0.05, dark, Math.cos(a) * (R + 0.58), 0.75, Math.sin(a) * (R + 0.58), -a + Math.PI / 2, false);
    }
    // Tiered stands and crowd behind the wall.
    const spots: { x: number; y: number; z: number; ry: number }[] = [];
    for (let row = 0; row < 6; row++) {
      const rr = R + 1.8 + row * 0.8;
      const y = 2.6 + row * 0.55;
      const n = Math.floor((Math.PI * 2 * rr) / 0.55);
      const tier = new Mesh(new CylinderGeometry(rr + 0.4, rr + 0.4, 0.55, 48, 1, true), this.mat(0xbfa983, { cut: false }));
      tier.position.y = y - 0.3;
      this.group.add(tier);
      for (let k2 = 0; k2 < n; k2++) {
        const a = (k2 / n) * Math.PI * 2;
        // Leave the near (camera) side empty so the view stays open.
        if (Math.sin(a) > 0.55) continue;
        if (!rng.chance(0.75)) continue;
        spots.push({ x: Math.cos(a) * rr, y, z: Math.sin(a) * rr, ry: -a - Math.PI / 2 });
      }
    }
    this.crowd(rng, spots, ['#f2e6d0', '#c0392b', '#e8d6a0', '#8a5a3a', '#ffffff', '#6a4a8a']);
    // Banners and the emperor's box.
    for (const a of [-2.2, -1.6, -1.0]) {
      const x = Math.cos(a) * (R + 0.95);
      const z = Math.sin(a) * (R + 0.95);
      this.box(0.08, 3.6, 0.08, this.mat(0x5a4632), x, 1.8, z);
      this.box(0.7, 1.4, 0.03, this.mat(0xa8231c), x, 2.9, z + 0.05, -a + Math.PI / 2, false);
    }
    this.box(3, 0.2, 1.6, this.mat(0x7a1f1a), 0, 4.4, -R - 2.2);
    // Broken columns (obstacles).
    for (const o of this.def.obstacles) {
      if (o.kind !== 'circle') continue;
      const col = new Mesh(new CylinderGeometry(o.r * 0.85, o.r, rng.range(1.2, 2.2), 10), this.mat(0xe0d2b4));
      col.position.set(o.x, 0.8, o.z);
      col.castShadow = true;
      this.group.add(col);
    }
  }

  update(time: number) {
    for (const c of this.crowds) this.updateCrowd(c, time);
    for (const f of this.flicker) f.light.intensity = f.base * (0.9 + 0.1 * Math.sin(time * 9 + f.seed));
  }
}
