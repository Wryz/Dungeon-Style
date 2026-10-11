import { BoxGeometry, BufferGeometry, Color, Group, Matrix4, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import type { Ragdoll } from '../body/ragdoll';
import { type BoneName, BONES, SKELETON } from '../body/skeleton';
import type { Fighter } from '../sim/fighter';
import type { WeaponDef, Wound } from '../sim/weapons';
import { buildWeapon } from './weaponView';
import { FIST_OFFSET } from '../body/skeleton';

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
  /** Creature features. */
  addons?: {
    horns?: 'small' | 'big' | 'bull';
    /** Glowing eye colour. */
    eyes?: string;
    cyclops?: boolean;
    snout?: boolean;
    tail?: boolean;
  };
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

type Slot = keyof Omit<Palette, 'sleeves' | 'bald' | 'shins' | 'addons'>;


/** Low-poly body built from simple faceted shapes, one group per physics bone. */
export class FighterView {
  readonly root = new Group();
  readonly bones = {} as Record<BoneName, Group>;
  private readonly mats = {} as Record<BoneName, MeshStandardMaterial[]>;
  private flash = 0;
  private cuesShown = true;
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
    const A = P.addons ?? {};
    const eyeMat = (bone: BoneName) => {
      // Kept out of `mats` so hit flashes / cues never overwrite the glow.
      void bone;
      return new MeshStandardMaterial({ color: A.eyes ?? P.hair, emissive: A.eyes ?? '#000000', emissiveIntensity: A.eyes ? 1.6 : 0, flatShading: true });
    };
    const addMesh = (bone: BoneName, geo: BufferGeometry, mat: MeshStandardMaterial, pos: [number, number, number], rot?: [number, number, number]) => {
      const mesh = new Mesh(geo, mat);
      mesh.position.set(...pos);
      if (rot) mesh.rotation.set(...rot);
      mesh.castShadow = true;
      this.bones[bone].add(mesh);
      return mesh;
    };
    if (A.cyclops) addMesh('head', box(0.1, 0.08, 0.02), eyeMat('head'), [0, 0.19, 0.136]);
    else for (const s of [1, -1]) addMesh('head', box(0.045, 0.05, 0.02), eyeMat('head'), [s * 0.06, 0.18, 0.135]);
    if (A.snout) this.add('head', box(0.16, 0.1, 0.1), 'skin', [0, 0.1, 0.16]);
    if (A.horns) {
      const hm = new MeshStandardMaterial({ color: A.horns === 'bull' ? '#e8dcc0' : '#1c1414', flatShading: true, roughness: 0.5 });
      this.mats.head.push(hm);
      const size = A.horns === 'small' ? 0.08 : A.horns === 'big' ? 0.14 : 0.18;
      for (const s of [1, -1]) {
        if (A.horns === 'bull') addMesh('head', box(size, 0.04, 0.04), hm, [s * 0.18, 0.27, 0.02], [0, 0, s * 0.5]);
        else addMesh('head', box(0.04, size, 0.04), hm, [s * 0.08, 0.31 + size / 2, 0.02], [0.3, 0, -s * 0.35]);
      }
    }
    if (A.tail) this.add('pelvis', box(0.05, 0.05, 0.4), 'skin', [0, 0.0, -0.25]).rotation.set(-0.6, 0, 0);

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

  private readonly woundMeshes: Mesh[] = [];
  private readonly woundGroups: Group[] = [];
  private weaponMesh: Group | null = null;
  private weaponId: string | null = null;

  /** Shows the weapon in hand (or none). */
  setWeapon(def: WeaponDef | null) {
    if ((def?.id ?? null) === this.weaponId) return;
    this.weaponId = def?.id ?? null;
    if (this.weaponMesh) {
      this.weaponMesh.parent?.remove(this.weaponMesh);
      this.weaponMesh = null;
    }
    if (!def) return;
    const holder = new Group();
    holder.add(buildWeapon(def));
    this.root.add(holder);
    this.weaponMesh = holder;
    this.edge.set(0, 0, 0);
    this.prevBlade.set(0, 0, 0);
  }

  /** Edge direction in the fighter's own frame (stable whatever the body does). */
  private readonly edge = new Vector3();
  private readonly prevBlade = new Vector3();

  /**
   * Places the weapon in the (rendered) rear fist, pointing where the pose says. The
   * edge leads the swing while the weapon is being swung; at rest it faces the
   * opponent. Worked out in the fighter's frame from the posed weapon direction, so
   * body sway, footwork or size never twist it around the haft.
   */
  updateWeapon(f: Fighter, _length: number) {
    const w = this.weaponMesh;
    if (!w) return;
    const fore = this.bones.foreArmR;
    fore.updateMatrixWorld();
    fore.localToWorld(_grip.set(0, -(SKELETON.foreArmR.length + FIST_OFFSET), 0));
    w.position.copy(_grip);
    w.scale.setScalar(f.scale);

    const b = _lb.copy(f.pose.blade);
    const turn = _mv.subVectors(b, this.prevBlade);
    const fresh = this.prevBlade.lengthSq() === 0;
    this.prevBlade.copy(b);
    turn.addScaledVector(b, -turn.dot(b));
    const swinging = !fresh && turn.length() > 0.03;
    let want: Vector3;
    if (swinging) want = turn.normalize();
    else {
      // Edge toward the opponent (or down, when the weapon itself points at them).
      want = _fw.set(0, 0, 1).addScaledVector(b, -b.z);
      if (want.lengthSq() < 0.05) want.set(0, -1, 0).addScaledVector(b, b.y);
      want.normalize();
    }
    if (this.edge.lengthSq() === 0 || fresh) this.edge.copy(want);
    else this.edge.lerp(want, swinging ? 0.35 : 0.12);
    this.edge.addScaledVector(b, -this.edge.dot(b));
    if (this.edge.lengthSq() < 1e-6) this.edge.copy(want);
    this.edge.normalize();

    // Fighter frame -> world (yaw about Y).
    const c = Math.cos(f.yaw);
    const sn = Math.sin(f.yaw);
    const toW = (v: Vector3, out: Vector3) => out.set(v.x * c + v.z * sn, v.y, -v.x * sn + v.z * c);
    toW(b, _dir);
    toW(this.edge, _ew);
    _x.crossVectors(_dir, _ew).normalize();
    _mat.makeBasis(_x, _dir, _ew);
    w.quaternion.setFromRotationMatrix(_mat);
  }

  /** World position of a wound (where it bleeds from). */
  woundPoint(w: Wound, out = new Vector3()): Vector3 {
    const g = this.bones[w.bone];
    g.updateMatrixWorld();
    const [x, y, z] = w.stump ? w.local : surfacePoint(w.bone, w.local).p;
    return g.localToWorld(out.set(x, y, z));
  }

  /** A lasting cut: a dark gash on the body part with a trickle of blood running down. */
  addWound(w: Wound) {
    if (w.stump) {
      this.addStump(w);
      return;
    }
    const { p, n } = surfacePoint(w.bone, w.local);
    const g = new Group();
    g.position.set(p[0], p[1], p[2]);
    // Face the surface normal; the gash runs across it at the wound's angle.
    g.quaternion.setFromUnitVectors(_up.set(0, 0, 1), _n.set(n[0], n[1], n[2]));
    const gash = new Mesh(new BoxGeometry(w.length, 0.024, 0.008), WOUND_MAT);
    gash.rotation.z = w.angle;
    const wet = new Mesh(new BoxGeometry(w.length * 0.7, 0.01, 0.01), WET_MAT);
    wet.rotation.z = w.angle;
    wet.position.z = 0.002;
    g.add(gash, wet);
    // Trickle runs "down" the limb (toward -Y of the bone), on the surface.
    const down = _n.set(0, -1, 0).applyQuaternion(g.quaternion.clone().invert());
    const len = 0.04 + w.bleed * 0.08;
    const trickle = new Mesh(new BoxGeometry(0.014, len, 0.005), WOUND_MAT);
    trickle.position.set(down.x * len * 0.5, down.y * len * 0.5, 0.001);
    trickle.rotation.z = Math.atan2(down.x, -down.y);
    g.add(trickle);
    this.bones[w.bone].add(g);
    this.woundGroups.push(g);
  }

  /** Heals everything (new round). */
  clearWounds() {
    for (const g of this.woundGroups) g.parent?.remove(g);
    for (const m of this.woundMeshes) m.parent?.remove(m);
    this.woundGroups.length = 0;
    this.woundMeshes.length = 0;
  }

  /** Where a limb was cut off: a raw red stump on the body, and on the end of the limb. */
  private addStump(w: Wound) {
    const lost = w.stump!;
    const r = (SKELETON[lost].radius ?? 0.06) * 2.1;
    const cap = new Mesh(new BoxGeometry(lost === 'head' ? 0.16 : r, 0.03, lost === 'head' ? 0.14 : r), STUMP_MAT);
    cap.position.set(w.local[0], w.local[1] - (lost === 'head' ? -0.01 : 0.012), w.local[2]);
    this.bones[w.bone].add(cap);
    const bone = new Mesh(new BoxGeometry(r * 0.35, 0.035, r * 0.35), BONE_MAT);
    bone.position.copy(cap.position);
    this.bones[w.bone].add(bone);
    const end = new Mesh(new BoxGeometry(lost === 'head' ? 0.12 : r * 0.95, 0.025, lost === 'head' ? 0.12 : r * 0.95), STUMP_MAT);
    end.position.set(0, lost === 'head' ? 0.02 : -0.01, 0);
    this.bones[lost].add(end);
    this.woundMeshes.push(cap, bone, end);
  }

  /** Uniform model scale (giants / small creatures). */
  setScale(sc: number) {
    for (const b of BONES) this.bones[b].scale.setScalar(sc);
  }

  hitFlash() {
    this.flash = 1;
  }

  /**
   * Per-frame emissive cues: white hit flash, red telegraph on the attacking limb,
   * gold fists while a counter window is open.
   */
  updateCues(dt: number, f: Fighter, enabled = true) {
    this.flash = Math.max(0, this.flash - dt * 9);
    if (!enabled) {
      if (this.cuesShown) {
        for (const b of BONES) for (const m of this.mats[b]) m.emissive.setRGB(0, 0, 0);
        this.cuesShown = false;
      }
      return;
    }
    this.cuesShown = true;
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

const WOUND_MAT = new MeshStandardMaterial({ color: '#5e0a0a', roughness: 0.35, flatShading: true });
const WET_MAT = new MeshStandardMaterial({ color: '#b3121a', roughness: 0.15, metalness: 0.1, flatShading: true });
const STUMP_MAT = new MeshStandardMaterial({ color: '#9e1016', roughness: 0.3, flatShading: true });
const BONE_MAT = new MeshStandardMaterial({ color: '#efe6d2', roughness: 0.6, flatShading: true });
const _up = new Vector3();
const _n = new Vector3();

/** Main block of each body part (size, centre), bone-local — matches `build()`. */
const PART_BOX: Record<BoneName, { size: [number, number, number]; c: [number, number, number] }> = {
  pelvis: { size: [0.34, 0.2, 0.22], c: [0, 0.03, 0] },
  abdomen: { size: [0.33, 0.24, 0.21], c: [0, 0.1, 0] },
  chest: { size: [0.46, 0.3, 0.25], c: [0, 0.14, 0] },
  head: { size: [0.25, 0.27, 0.25], c: [0, 0.16, 0.01] },
  upperArmL: { size: [0.13, 0.31, 0.13], c: [0, -0.135, 0] },
  upperArmR: { size: [0.13, 0.31, 0.13], c: [0, -0.135, 0] },
  foreArmL: { size: [0.115, 0.24, 0.115], c: [0, -0.11, 0] },
  foreArmR: { size: [0.115, 0.24, 0.115], c: [0, -0.11, 0] },
  thighL: { size: [0.16, 0.47, 0.17], c: [0, -0.22, 0] },
  thighR: { size: [0.16, 0.47, 0.17], c: [0, -0.22, 0] },
  shinL: { size: [0.14, 0.4, 0.15], c: [0, -0.19, 0] },
  shinR: { size: [0.14, 0.4, 0.15], c: [0, -0.19, 0] },
};

/** Pushes a bone-local point out onto the surface of that body part's block. */
function surfacePoint(bone: BoneName, local: [number, number, number]): { p: [number, number, number]; n: [number, number, number] } {
  const { size, c } = PART_BOX[bone];
  const h = [size[0] / 2, size[1] / 2, size[2] / 2];
  const d = [local[0] - c[0], local[1] - c[1], local[2] - c[2]];
  // Limbs: never put the cut on the end caps — project sideways.
  const limb = bone !== 'pelvis' && bone !== 'abdomen' && bone !== 'chest' && bone !== 'head';
  d[1] = Math.max(-h[1] * 0.85, Math.min(h[1] * 0.85, d[1]));
  let axis = 0;
  let best = -1;
  for (let i = 0; i < 3; i++) {
    if (limb && i === 1) continue;
    const r = Math.abs(d[i]) / h[i];
    if (r > best) {
      best = r;
      axis = i;
    }
  }
  if (Math.abs(d[axis]) < 1e-4) d[axis] = h[axis];
  const p: [number, number, number] = [c[0] + d[0], c[1] + d[1], c[2] + d[2]];
  const sgn = Math.sign(d[axis]);
  p[axis] = c[axis] + sgn * (h[axis] + 0.003);
  for (let i = 0; i < 3; i++) if (i !== axis) p[i] = Math.max(c[i] - h[i] * 0.9, Math.min(c[i] + h[i] * 0.9, p[i]));
  const n: [number, number, number] = [0, 0, 0];
  n[axis] = sgn;
  return { p, n };
}

const _grip = new Vector3();
const _dir = new Vector3();
const _lb = new Vector3();
const _ew = new Vector3();
const _mv = new Vector3();
const _fw = new Vector3();
const _x = new Vector3();
const _mat = new Matrix4();
