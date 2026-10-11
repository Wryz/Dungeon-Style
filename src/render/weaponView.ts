import {
  BoxGeometry,
  type BufferGeometry,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  RingGeometry,
} from 'three';
import type { WeaponDef } from '../sim/weapons';

const MATS: Record<string, { color: string; metalness?: number; roughness?: number }> = {
  steel: { color: '#eef2f5', metalness: 0.3, roughness: 0.25 },
  iron: { color: '#7e858b', metalness: 0.6, roughness: 0.45 },
  wood: { color: '#7a5232', roughness: 0.85 },
  darkWood: { color: '#4a2f1c', roughness: 0.85 },
  black: { color: '#1d1d20', roughness: 0.6 },
  brass: { color: '#c79a3c', metalness: 0.7, roughness: 0.35 },
  ash: { color: '#d7b98a', roughness: 0.8 },
  grey: { color: '#9aa0a8', metalness: 0.4, roughness: 0.5 },
  bone: { color: '#e6dcc4', roughness: 0.7 },
  glass: { color: '#2f6b3a', metalness: 0.1, roughness: 0.12 },
  red: { color: '#b3261e', roughness: 0.5 },
  cue: { color: '#c89a5c', roughness: 0.55 },
  white: { color: '#f2f2f2', roughness: 0.5 },
  darkSteel: { color: '#5d6166', metalness: 0.6, roughness: 0.4 },
  wrap: { color: '#2a2230', roughness: 0.9 },
};

const mat = (k: string) => {
  const m = MATS[k];
  return new MeshStandardMaterial({ color: m.color, metalness: m.metalness ?? 0, roughness: m.roughness ?? 0.7, flatShading: true });
};

/**
 * Blocky weapon models in weapon space: grip at the origin, the weapon running up +Y to
 * its tip, the flat of the blade facing ±X (the edge leads along +Z).
 */
export function buildWeapon(def: WeaponDef): Group {
  const g = new Group();
  const part = (geo: BufferGeometry, m: string, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
    const mesh = new Mesh(geo, mat(m));
    // Metal and bare-wood striking surfaces take blood.
    mesh.userData.bloodies = ['steel', 'iron', 'ash', 'bone', 'darkSteel', 'cue', 'glass'].includes(m);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    mesh.castShadow = true;
    g.add(mesh);
    return mesh;
  };
  const box = (w: number, h: number, d: number) => new BoxGeometry(w, h, d);
  const L = def.length;
  switch (def.id) {
    case 'cleaver':
      part(box(0.035, 0.16, 0.035), 'darkWood', 0, -0.02, 0);
      part(box(0.012, 0.25, 0.11), 'steel', 0, 0.2, 0.035);
      break;
    case 'machete':
      part(box(0.035, 0.15, 0.035), 'black', 0, -0.02, 0);
      part(box(0.012, L - 0.1, 0.068), 'steel', 0, 0.06 + (L - 0.1) / 2, 0.01);
      part(box(0.014, L - 0.12, 0.012), 'iron', 0, 0.06 + (L - 0.12) / 2, -0.026);
      part(box(0.012, 0.09, 0.045), 'steel', 0, L - 0.02, 0.02, 0.45, 0, 0);
      break;
    case 'gladius':
      part(box(0.035, 0.13, 0.035), 'wood', 0, -0.02, 0);
      part(box(0.045, 0.03, 0.045), 'brass', 0, -0.1, 0);
      part(box(0.04, 0.025, 0.13), 'brass', 0, 0.06, 0);
      part(box(0.014, L - 0.16, 0.065), 'steel', 0, 0.07 + (L - 0.16) / 2, 0);
      part(box(0.014, 0.08, 0.046), 'steel', 0, L - 0.05, 0, Math.PI / 4, 0, 0);
      break;
    case 'pan':
      part(box(0.03, 0.26, 0.02), 'black', 0, 0.08, 0);
      part(new CylinderGeometry(0.13, 0.12, 0.035, 10), 'iron', 0, 0.33, 0, 0, 0, Math.PI / 2);
      break;
    case 'axe':
      part(box(0.04, L + 0.15, 0.04), 'wood', 0, (L - 0.15) / 2, 0);
      part(box(0.03, 0.12, 0.06), 'iron', 0, L - 0.14, 0);
      part(box(0.018, 0.2, 0.2), 'steel', 0, L - 0.14, 0.13);
      part(box(0.018, 0.26, 0.04), 'steel', 0, L - 0.14, 0.235);
      part(box(0.02, 0.05, 0.1), 'iron', 0, L - 0.14, -0.08);
      break;
    case 'bat':
      part(new CylinderGeometry(0.028, 0.022, 0.1, 8), 'black', 0, -0.07, 0);
      part(new CylinderGeometry(0.045, 0.024, L - 0.05, 8), 'ash', 0, (L - 0.05) / 2, 0);
      part(new CylinderGeometry(0.036, 0.036, 0.02, 8), 'ash', 0, -0.13, 0);
      break;
    case 'club':
      part(new CylinderGeometry(0.08, 0.035, L + 0.1, 7), 'darkWood', 0, (L - 0.1) / 2, 0);
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const y = L * (0.55 + 0.4 * ((i * 0.37) % 1));
        part(box(0.025, 0.025, 0.06), 'bone', Math.sin(a) * 0.07, y, Math.cos(a) * 0.07, 0, a, 0);
      }
      break;
    case 'crowbar':
      // Hex bar with a hooked claw at the business end.
      part(box(0.03, L, 0.03), 'darkSteel', 0, L / 2 - 0.08, 0);
      part(box(0.03, 0.12, 0.03), 'darkSteel', 0, L - 0.06, 0.05, 0.9, 0, 0);
      part(box(0.03, 0.05, 0.03), 'red', 0, -0.04, 0);
      break;
    case 'pipe':
      part(new CylinderGeometry(0.026, 0.026, L + 0.08, 8), 'darkSteel', 0, L / 2 - 0.04, 0);
      part(new CylinderGeometry(0.034, 0.034, 0.05, 8), 'darkSteel', 0, L - 0.02, 0);
      break;
    case 'sledgehammer':
      part(box(0.04, L + 0.15, 0.04), 'wood', 0, (L - 0.15) / 2, 0);
      part(box(0.12, 0.12, 0.26), 'darkSteel', 0, L - 0.05, 0);
      break;
    case 'cue':
      // Tapered: thick butt in the hands, thin tip out front.
      part(new CylinderGeometry(0.009, 0.02, L + 0.2, 8), 'cue', 0, (L - 0.2) / 2, 0);
      part(new CylinderGeometry(0.022, 0.024, 0.3, 8), 'black', 0, -0.12, 0);
      part(new CylinderGeometry(0.009, 0.009, 0.02, 8), 'white', 0, L - 0.1, 0);
      break;
    case 'bottle':
      // Held by the neck, the heavy body out front.
      part(new CylinderGeometry(0.014, 0.016, 0.12, 8), 'glass', 0, 0.02, 0);
      part(new CylinderGeometry(0.035, 0.035, 0.16, 8), 'glass', 0, 0.17, 0);
      part(new CylinderGeometry(0.036, 0.036, 0.06, 8), 'white', 0, 0.17, 0);
      break;
    case 'katana':
      part(box(0.035, 0.26, 0.032), 'wrap', 0, -0.06, 0);
      part(new CylinderGeometry(0.05, 0.05, 0.012, 10), 'brass', 0, 0.075, 0);
      part(box(0.008, L - 0.1, 0.034), 'steel', 0, 0.08 + (L - 0.1) / 2, 0.004, 0.02, 0, 0);
      part(box(0.008, 0.06, 0.022), 'steel', 0, L - 0.01, 0.012, 0.5, 0, 0);
      break;
    case 'bokken':
      part(box(0.035, 0.26, 0.032), 'wood', 0, -0.06, 0);
      part(box(0.02, L - 0.1, 0.034), 'wood', 0, 0.08 + (L - 0.1) / 2, 0, 0.02, 0, 0);
      break;
    case 'fireaxe':
      part(box(0.035, L + 0.12, 0.035), 'red', 0, (L - 0.12) / 2, 0);
      part(box(0.03, 0.1, 0.05), 'darkSteel', 0, L - 0.1, 0);
      part(box(0.016, 0.16, 0.16), 'red', 0, L - 0.1, 0.1);
      part(box(0.016, 0.2, 0.025), 'steel', 0, L - 0.1, 0.19);
      part(box(0.02, 0.04, 0.12), 'darkSteel', 0, L - 0.1, -0.09, 0, 0, 0.2);
      break;
    case 'chair': {
      // Held by the back legs: legs, seat and backrest of a folding chair.
      for (const s of [1, -1]) part(box(0.022, L + 0.1, 0.022), 'grey', s * 0.17, (L - 0.1) / 2, 0);
      part(box(0.38, 0.28, 0.02), 'grey', 0, L - 0.12, 0);
      part(box(0.38, 0.02, 0.34), 'grey', 0, L * 0.45, 0.17);
      for (const s of [1, -1]) part(box(0.022, 0.4, 0.022), 'grey', s * 0.17, L * 0.45 - 0.2, 0.32, -0.5, 0, 0);
      break;
    }
  }
  return g;
}

/** A weapon lying on the floor, with a soft glow ring so it reads as a pickup. */
export class DropView {
  readonly root = new Group();
  private readonly ring: Mesh;
  private readonly ringMat: MeshStandardMaterial;

  constructor(def: WeaponDef, x: number, z: number, yaw: number) {
    const w = buildWeapon(def);
    // Lie it on its flat, along `yaw`, centred on the drop point.
    w.rotation.set(Math.PI / 2, 0, 0);
    w.position.set(0, def.id === 'chair' ? 0.03 : 0.035, -def.length / 2);
    const holder = new Group();
    holder.add(w);
    holder.rotation.y = yaw;
    this.root.add(holder);
    this.ringMat = new MeshStandardMaterial({ color: '#ffe08a', emissive: new Color('#ffcf4a'), emissiveIntensity: 0.8, transparent: true, opacity: 0.5, depthWrite: false });
    this.ring = new Mesh(new RingGeometry(0.42, 0.5, 28), this.ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.012;
    this.root.add(this.ring);
    this.root.position.set(x, 0, z);
  }

  update(time: number, near: boolean) {
    const p = 0.5 + 0.5 * Math.sin(time * 3);
    this.ringMat.opacity = near ? 0.85 : 0.25 + 0.2 * p;
    this.ring.scale.setScalar(near ? 1.05 : 0.95 + 0.05 * p);
  }

  dispose() {
    this.root.parent?.remove(this.root);
    this.root.traverse((o) => {
      if (o instanceof Mesh) {
        o.geometry.dispose();
        (o.material as MeshStandardMaterial).dispose();
      }
    });
  }
}
