import {
  BoxGeometry,
  Color,
  DoubleSide,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Scene,
  Shape,
} from 'three';
import { Rng } from '../sim/math';
import type { DungeonLayout } from '../world/dungeon';
import { WALL_HEIGHT } from '../world/dungeonView';
import type { Leak } from './story';

/** Environmental hints that the world is a program: missing textures, windows, a cursor, a desktop. */
export class Leaks {
  readonly group = new Group();
  private readonly windows: { mesh: Group; base: number; seed: number }[] = [];
  private cursor: Group | null = null;
  private readonly glitchEl: HTMLDivElement;
  private nextGlitch = 0;
  onGlitch: (() => void) | null = null;

  constructor(
    private readonly scene: Scene,
    layout: DungeonLayout,
    readonly leak: Leak,
    seed: number,
  ) {
    scene.add(this.group);
    const rng = new Rng(seed * 13 + 5);
    this.missingTextures(layout, rng);
    this.uiWindows(layout, rng);
    if (leak.cursor) this.cursor = this.makeCursor(layout);
    if (leak.desktop) this.desktop(layout);
    this.glitchEl = document.createElement('div');
    this.glitchEl.className = 'glitch';
    document.body.appendChild(this.glitchEl);
    this.nextGlitch = this.interval(rng);
  }

  dispose() {
    this.scene.remove(this.group);
    this.glitchEl.remove();
  }

  private interval(rng: Rng) {
    return (60 / Math.max(0.1, this.leak.glitchesPerMinute)) * rng.range(0.5, 1.5);
  }

  private missingTextures(layout: DungeonLayout, rng: Rng) {
    // A 2×2 checker cube in the classic "missing texture" magenta/black.
    const geo = new BoxGeometry(0.46, 0.35, 0.46, 2, 2, 2).toNonIndexed();
    const colors: number[] = [];
    const pos = geo.getAttribute('position');
    const a = new Color('#ff00dc');
    const b = new Color('#111111');
    for (let i = 0; i < pos.count; i += 3) {
      const c = (Math.floor(i / 6) % 2 === 0 ? a : b).clone();
      for (let k = 0; k < 3; k++) colors.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new Float32BufferAttribute(colors, 3));
    const mat = new MeshBasicMaterial({ vertexColors: true });
    const runs = layout.grid.wallRuns();
    for (let k = 0; k < this.leak.missingBlocks && runs.length; k++) {
      const run = runs[Math.floor(rng.next() * runs.length)];
      const along = (rng.next() - 0.5) * run.length * 0.8;
      const m = new Mesh(geo, mat);
      const off = run.solid * 0.23;
      m.position.set(run.alongX ? run.cx + along : run.cx + off, 0.35 * (1 + Math.floor(rng.range(0, 4))) + 0.17, run.alongX ? run.cz + off : run.cz + along);
      this.group.add(m);
    }
  }

  private uiWindows(layout: DungeonLayout, rng: Rng) {
    const frameMat = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, side: DoubleSide, depthWrite: false });
    const barMat = new MeshBasicMaterial({ color: 0x3d7bd9, transparent: true, opacity: 0.45, side: DoubleSide, depthWrite: false });
    for (let k = 0; k < this.leak.windows; k++) {
      const room = layout.rooms[Math.floor(rng.next() * layout.rooms.length)];
      const w = rng.range(2.5, 5);
      const h = w * rng.range(0.55, 0.75);
      const g = new Group();
      const t = 0.06;
      for (const [sx, sy, px, py] of [
        [w, t, 0, h / 2],
        [w, t, 0, -h / 2],
        [t, h, -w / 2, 0],
        [t, h, w / 2, 0],
      ]) {
        const m = new Mesh(new BoxGeometry(sx, sy, 0.02), frameMat);
        m.position.set(px, py, 0);
        g.add(m);
      }
      const bar = new Mesh(new BoxGeometry(w, h * 0.12, 0.02), barMat);
      bar.position.set(0, h / 2 - h * 0.06, 0);
      g.add(bar);
      for (let d = 0; d < 3; d++) {
        const dot = new Mesh(new BoxGeometry(0.12, 0.12, 0.03), frameMat);
        dot.position.set(w / 2 - 0.2 - d * 0.2, h / 2 - h * 0.06, 0.01);
        g.add(dot);
      }
      // Float translucent above head height in the far half of a room, inside the view.
      const base = rng.range(2.6, 3.3) + h / 4;
      const north = layout.grid.oz + room.rect.z0 + rng.range(1.2, 2.4);
      g.scale.setScalar(0.55);
      g.position.set(room.cx + rng.range(-3, 3), base, north);
      g.rotation.y = rng.range(-0.3, 0.3);
      this.group.add(g);
      this.windows.push({ mesh: g, base, seed: rng.range(0, 10) });
    }
  }

  private makeCursor(layout: DungeonLayout) {
    const s = new Shape();
    // Classic arrow pointer outline.
    s.moveTo(0, 0);
    s.lineTo(0, -3.2);
    s.lineTo(0.8, -2.4);
    s.lineTo(1.4, -3.8);
    s.lineTo(1.9, -3.6);
    s.lineTo(1.3, -2.2);
    s.lineTo(2.4, -2.2);
    s.lineTo(0, 0);
    const geo = new ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: false });
    const g = new Group();
    const body = new Mesh(geo, new MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, flatShading: true }));
    const outline = new Mesh(geo, new MeshBasicMaterial({ color: 0x111111, side: DoubleSide, wireframe: true }));
    g.add(body, outline);
    const mid = layout.rooms[Math.floor(layout.rooms.length / 2)];
    g.position.set(mid.cx + 2.5, 3.6, layout.grid.oz + mid.rect.z0 + 1.6);
    g.scale.setScalar(0.45);
    g.rotation.set(-0.2, 0.25, 0.15);
    this.group.add(g);
    return g;
  }

  private desktop(layout: DungeonLayout) {
    // A taskbar behind every room's far wall, peeking over the bricks.
    const barMat = new MeshStandardMaterial({ color: 0x1d2633, roughness: 0.5 });
    const icons = ['#3d7bd9', '#e8b53a', '#3aa76d', '#d9533d', '#8e5bd9', '#45b5c9'];
    for (const room of layout.rooms) {
      const w = room.rect.x1 - room.rect.x0;
      // Sits on top of the far wall like a desktop taskbar.
      const z = layout.grid.oz + room.rect.z0 - 0.25;
      const bar = new Mesh(new BoxGeometry(w, 0.6, 0.3), barMat);
      bar.position.set(room.cx, WALL_HEIGHT + 0.35, z);
      this.group.add(bar);
      icons.forEach((c, i) => {
        if (i * 0.55 > w - 1) return;
        const icon = new Mesh(new BoxGeometry(0.38, 0.38, 0.1), new MeshBasicMaterial({ color: c }));
        icon.position.set(room.cx - w / 2 + 0.5 + i * 0.55, WALL_HEIGHT + 0.35, z + 0.17);
        this.group.add(icon);
      });
    }
  }

  update(time: number, dt: number, rng: Rng) {
    for (const w of this.windows) {
      w.mesh.position.y = w.base + Math.sin(time * 0.5 + w.seed) * 0.3;
      // Windows occasionally "minimize" and come back.
      const s = Math.sin(time * 0.27 + w.seed * 3) > 0.94 ? 0.15 : 1;
      w.mesh.scale.x += (s - w.mesh.scale.x) * 0.08;
      w.mesh.scale.y += (s - w.mesh.scale.y) * 0.08;
    }
    if (this.cursor) {
      this.cursor.position.x += Math.sin(time * 0.21) * dt * 0.8;
      this.cursor.position.z += Math.cos(time * 0.17) * dt * 0.5;
      const click = Math.sin(time * 0.6) > 0.985 ? 0.85 : 1;
      this.cursor.scale.setScalar(this.cursor.scale.x + (click - this.cursor.scale.x) * 0.3);
    }
    this.nextGlitch -= dt;
    if (this.nextGlitch <= 0) {
      this.nextGlitch = this.interval(rng);
      this.glitchEl.classList.remove('on');
      void this.glitchEl.offsetWidth;
      this.glitchEl.classList.add('on');
      this.onGlitch?.();
    }
  }
}
