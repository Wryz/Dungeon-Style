import { BoxGeometry, BufferGeometry, Color, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import type { Ragdoll } from '../body/ragdoll';
import { type BoneName, BONES, SKELETON } from '../body/skeleton';
import type { Fighter } from '../sim/fighter';

export interface Palette {
  skin: string;
  shirt: string;
  pants: string;
  gloves: string;
  boots: string;
  hair: string;
  /** Upper-arm block colour: bare arms or sleeves. */
  sleeves: 'skin' | 'shirt';
  bald?: boolean;
  /** Shin colour (defaults to pants; skin for shorts). */
  shins?: string;
}

export const PLAYER_PALETTE: Palette = {
  skin: '#f0bf93',
  shirt: '#2aa7a0',
  pants: '#34476e',
  gloves: '#f6f1e4',
  boots: '#3a2f2a',
  hair: '#4a3020',
  sleeves: 'skin',
};

export const BRAWLER_PALETTE: Palette = {
  skin: '#c4875f',
  shirt: '#d1453b',
  pants: '#5b4232',
  gloves: '#2e2e33',
  boots: '#2a221c',
  hair: '#24201d',
  sleeves: 'skin',
  bald: true,
};

export const ENEMY_PALETTES: Record<string, Palette> = {
  rookie: { skin: '#e2b08a', shirt: '#6f7f90', pants: '#3b4252', gloves: '#d04848', boots: '#22252b', hair: '#2b211a', sleeves: 'shirt' },
  brawler: BRAWLER_PALETTE,
  kicker: { skin: '#b97f58', shirt: '#b97f58', pants: '#d8a71c', gloves: '#b8322a', boots: '#b07650', hair: '#151515', sleeves: 'skin', shins: '#b97f58' },
  bruiser: { skin: '#9c6a52', shirt: '#46523f', pants: '#2d2a26', gloves: '#5a4632', boots: '#1f1a16', hair: '#1a1714', sleeves: 'skin', bald: true },
};

export const GEAR_COLORS: Record<string, { color: string; metalness: number; roughness: number }> = {
  cloth: { color: '#8f806a', metalness: 0, roughness: 0.9 },
  leather: { color: '#7a4e2e', metalness: 0, roughness: 0.7 },
  iron: { color: '#8d9399', metalness: 0.5, roughness: 0.45 },
  steel: { color: '#cfd6dd', metalness: 0.7, roughness: 0.3 },
  gold: { color: '#d8b04a', metalness: 0.7, roughness: 0.35 },
};

export type GearLook = Partial<Record<'helmet' | 'chest' | 'legs' | 'boots' | 'cuffs', { material: string; tier: number }>>;

type Slot = keyof Omit<Palette, 'sleeves' | 'bald' | 'shins'>;


/** Low-poly body built from simple faceted shapes, one group per physics bone. */
export class FighterView {
  readonly root = new Group();
  readonly bones = {} as Record<BoneName, Group>;
  private readonly mats = {} as Record<BoneName, MeshStandardMaterial[]>;
  private flash = 0;
  readonly shiver = new Vector3();

  constructor(readonly palette: Palette) {
    for (const b of BONES) {
      const g = new Group();
      this.bones[b] = g;
      this.mats[b] = [];
      this.root.add(g);
    }
    this.build();
  }

  private mat(bone: BoneName, slot: Slot): MeshStandardMaterial {
    const m = new MeshStandardMaterial({ color: this.palette[slot], flatShading: true, roughness: 0.7, metalness: 0 });
    this.mats[bone].push(m);
    return m;
  }

  private add(bone: BoneName, geo: BufferGeometry, slot: Slot, pos: [number, number, number], scale?: [number, number, number]) {
    const mesh = new Mesh(geo, this.mat(bone, slot));
    mesh.position.set(...pos);
    if (scale) mesh.scale.set(...scale);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.bones[bone].add(mesh);
    return mesh;
  }

  /**
   * Stylised blocky body: one chunky block per bone (upper arm, forearm, thigh, shin),
   * gloves and boots fused onto the forearm / shin so limbs read as exactly two parts.
   */
  private build() {
    const P = this.palette;
    const box = (w: number, h: number, d: number) => new BoxGeometry(w, h, d);
    this.add('pelvis', box(0.34, 0.2, 0.22), 'pants', [0, 0.03, 0]);
    this.add('abdomen', box(0.33, 0.24, 0.21), 'shirt', [0, 0.1, 0]);
    this.add('chest', box(0.46, 0.3, 0.25), 'shirt', [0, 0.14, 0]);
    // Head: a cube with a hair cap and two eyes (shows facing at a glance).
    this.headSkin = this.add('head', box(0.25, 0.27, 0.25), 'skin', [0, 0.16, 0.01]).material as MeshStandardMaterial;
    if (!P.bald) {
      this.add('head', box(0.27, 0.08, 0.27), 'hair', [0, 0.31, 0]);
      this.add('head', box(0.27, 0.16, 0.06), 'hair', [0, 0.24, -0.11]);
    } else {
      this.add('head', box(0.2, 0.07, 0.04), 'hair', [0, 0.06, 0.13]); // beard
    }
    for (const s of [1, -1]) this.add('head', box(0.045, 0.05, 0.02), 'hair', [s * 0.06, 0.18, 0.135]);

    for (const side of ['L', 'R'] as const) {
      const ua = `upperArm${side}` as const;
      const fa = `foreArm${side}` as const;
      this.add(ua, box(0.13, 0.31, 0.13), P.sleeves === 'skin' ? 'skin' : 'shirt', [0, -0.135, 0]);
      this.add(fa, box(0.115, 0.24, 0.115), 'skin', [0, -0.11, 0]);
      this.add(fa, box(0.15, 0.15, 0.16), 'gloves', [0, -(SKELETON[fa].length + 0.04), 0.005]);
      const th = `thigh${side}` as const;
      const sh = `shin${side}` as const;
      this.add(th, box(0.16, 0.47, 0.17), 'pants', [0, -0.22, 0]);
      const shin = this.add(sh, box(0.14, 0.4, 0.15), 'pants', [0, -0.19, 0]);
      if (P.shins) (shin.material as MeshStandardMaterial).color.set(P.shins);
      this.add(sh, box(0.16, 0.11, 0.27), 'boots', [0, -0.425, 0.045]);
    }
  }

  private readonly gearMeshes: Mesh[] = [];
  private headSkin!: MeshStandardMaterial;
  private cutMesh: Mesh | null = null;
  private static readonly BRUISE = new Color('#7d3b4c');

  /** World position of a spot on the face (mouth, nose, brow) of the current visual pose. */
  facePoint(where: 'mouth' | 'nose' | 'brow', out = new Vector3()): Vector3 {
    const head = this.bones.head;
    head.updateMatrixWorld();
    const local = where === 'mouth' ? [0, 0.075, 0.135] : where === 'nose' ? [0, 0.14, 0.145] : [0.065, 0.215, 0.135];
    return head.localToWorld(out.set(local[0], local[1], local[2]));
  }

  /** Facial damage: bruising tint and a cut over the brow. */
  setTrauma(bruise: number, cut: boolean) {
    this.headSkin.color.set(this.palette.skin).lerp(FighterView.BRUISE, bruise * 0.45);
    if (cut && !this.cutMesh) {
      const mat = new MeshStandardMaterial({ color: '#8a0d0d', roughness: 0.3, flatShading: true });
      this.cutMesh = new Mesh(new BoxGeometry(0.07, 0.02, 0.012), mat);
      this.cutMesh.position.set(0.06, 0.215, 0.137);
      this.cutMesh.rotation.z = -0.3;
      this.bones.head.add(this.cutMesh);
      this.mats.head.push(mat);
    }
  }

  /** Shows worn gear as blocky armour pieces on the body. */
  setGear(look: GearLook) {
    for (const m of this.gearMeshes) {
      m.parent?.remove(m);
      const mat = m.material as MeshStandardMaterial;
      for (const list of Object.values(this.mats)) {
        const i = list.indexOf(mat);
        if (i >= 0) list.splice(i, 1);
      }
    }
    this.gearMeshes.length = 0;
    const piece = (bone: BoneName, kind: string, size: [number, number, number], pos: [number, number, number]) => {
      const c = GEAR_COLORS[kind] ?? GEAR_COLORS.iron;
      const mat = new MeshStandardMaterial({ color: c.color, metalness: c.metalness, roughness: c.roughness, flatShading: true });
      const mesh = new Mesh(new BoxGeometry(...size), mat);
      mesh.position.set(...pos);
      mesh.castShadow = true;
      this.bones[bone].add(mesh);
      this.mats[bone].push(mat);
      this.gearMeshes.push(mesh);
      return mesh;
    };
    const h = look.helmet;
    if (h) {
      piece('head', h.material, [0.29, 0.13, 0.29], [0, 0.3, 0]);
      piece('head', h.material, [0.29, 0.14, 0.05], [0, 0.22, -0.13]);
      if (h.tier >= 3) piece('head', h.material, [0.27, 0.03, 0.05], [0, 0.2, 0.14]); // visor bar
    }
    const c = look.chest;
    if (c) {
      piece('chest', c.material, [0.5, 0.3, 0.06], [0, 0.15, 0.14]);
      if (c.tier >= 2) piece('chest', c.material, [0.5, 0.3, 0.06], [0, 0.15, -0.14]);
      if (c.tier >= 3) for (const s of [1, -1]) piece('chest', c.material, [0.14, 0.08, 0.16], [s * 0.21, 0.29, 0]); // pauldrons
    }
    const l = look.legs;
    if (l) {
      for (const side of ['L', 'R'] as const) {
        piece(`shin${side}`, l.material, [0.16, 0.26, 0.05], [0, -0.2, 0.08]);
        if (l.tier >= 2) piece(`thigh${side}`, l.material, [0.18, 0.28, 0.05], [0, -0.22, 0.09]);
      }
    }
    const b = look.boots;
    if (b) for (const side of ['L', 'R'] as const) piece(`shin${side}`, b.material, [0.18, 0.13, 0.29], [0, -0.42, 0.045]);
    const k = look.cuffs;
    if (k) {
      for (const side of ['L', 'R'] as const) {
        piece(`foreArm${side}`, k.material, [0.15, 0.1, 0.15], [0, -0.21, 0]);
        if (k.tier >= 3) for (const sx of [1, -1]) piece(`foreArm${side}`, 'steel', [0.03, 0.03, 0.06], [sx * 0.05, -0.3, 0.1]);
      }
    }
  }

  /** Copies interpolated physics transforms onto the meshes. */
  syncFromRagdoll(rd: Ragdoll, alpha: number) {
    for (const b of BONES) {
      const g = this.bones[b];
      g.position.lerpVectors(rd.prev[b].p, rd.cur[b].p, alpha).add(this.shiver);
      g.quaternion.slerpQuaternions(rd.prev[b].q, rd.cur[b].q, alpha);
    }
  }

  /** Fallback when there is no ragdoll: render the target pose directly. */
  syncFromRig(f: Fighter) {
    for (const b of BONES) {
      this.bones[b].position.copy(f.rig[b].pos);
      this.bones[b].quaternion.copy(f.rig[b].rot);
    }
  }

  hitFlash() {
    this.flash = 1;
  }

  /**
   * Per-frame emissive cues: white hit flash, red telegraph on the attacking limb,
   * gold fists while a counter window is open.
   */
  updateCues(dt: number, f: Fighter) {
    this.flash = Math.max(0, this.flash - dt * 9);
    let tele = 0;
    let teleBones: BoneName[] = [];
    let armored = false;
    if (f.team === 'enemy' && f.state === 'attack' && f.move && f.stateFrame < f.move.startup + f.move.active) {
      tele = Math.min(1, f.stateFrame / f.move.startup);
      armored = !!f.move.armor;
      teleBones =
        f.move.limb === 'handL'
          ? ['upperArmL', 'foreArmL']
          : f.move.limb === 'handR'
            ? ['upperArmR', 'foreArmR']
            : f.move.limb === 'footL'
              ? ['thighL', 'shinL']
              : ['thighR', 'shinR'];
    }
    const counter = f.team === 'player' && f.counter ? Math.min(1, f.counter.frames / 8) : 0;
    const pulse = 0.65 + 0.35 * Math.sin(performance.now() * 0.03);
    for (const b of BONES) {
      const isTele = teleBones.includes(b);
      const isFist = b === 'foreArmL' || b === 'foreArmR';
      for (const m of this.mats[b]) {
        const e = m.emissive;
        e.setRGB(this.flash, this.flash, this.flash);
        if (isTele) e.add(TMP.setRGB(0.9 * tele * tele, 0.05 * tele, 0.02 * tele));
        else if (armored && tele > 0.3) e.add(TMP.setRGB(0.07 * tele, 0.02 * tele, 0));
        if (isFist && counter > 0) e.add(TMP.setRGB(1.2 * counter * pulse, 0.85 * counter * pulse, 0.25 * counter * pulse));
      }
    }
  }
}

const TMP = new Color();
