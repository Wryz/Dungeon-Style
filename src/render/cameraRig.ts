import { PerspectiveCamera, Vector3 } from 'three';

export const CAMERA_TUNING = {
  /** Vertical field of view (degrees). */
  fov: 55,
  /** How far behind the player the camera sits (m, for someone your size). */
  distance: 3.6,
  /** How far above the player's shoulders. */
  rise: 1.05,
  /** Off to the right a little, so the player doesn't hide who they're fighting. */
  shoulder: 0.7,
  /**
   * How briskly the camera swings round after the player turns (rad/s of a critically
   * damped spring): it lags, picks up speed, and eases in as it catches up.
   */
  turnRate: 3.2,
  /** How tightly it follows the player's position (1/s): close, not rigid. */
  follow: 7,
  shakeMul: 1,
  /** 0.5 frames the midpoint between the fighters, 0 frames the player. */
  focusMix: 0.6,
};

/** What the camera follows. */
export interface Followed {
  pos: Vector3;
  yaw: number;
  scale: number;
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Third-person camera: behind and a little above the player, looking past them at the
 * fight. It doesn't follow rigidly — it trails the player's position slightly, and when
 * they turn it swings round after them on a spring, slow to start, easing in at the end.
 * Trauma-based shake on top.
 */
export class CameraRig {
  readonly camera: PerspectiveCamera;
  private yaw = 0;
  private yawVel = 0;
  private readonly pos = new Vector3();
  private readonly look = new Vector3();
  private trauma = 0;
  private punch = 0;
  private t = 0;
  private ready = false;
  zoom = 1;
  /** Is this ground point inside the arena? (The camera stays in the room.) */
  inside: ((x: number, z: number) => boolean) | null = null;

  constructor() {
    this.camera = new PerspectiveCamera(CAMERA_TUNING.fov, 16 / 9, 0.1, 300);
  }

  /** Ground-plane forward/right of the view, for camera-relative movement input. */
  get groundForward() {
    return new Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }
  get groundRight() {
    // (A fighter's +X is their left: screen right is the other way.)
    return new Vector3(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
  }

  resize(w: number, h: number) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  addTrauma(amount: number) {
    this.trauma = Math.min(1, this.trauma + amount * CAMERA_TUNING.shakeMul);
  }

  zoomPunch(amount: number) {
    this.punch = Math.max(this.punch, amount);
  }

  /** Jump straight to behind `f` (a new round, a respawn). */
  snap(f: Followed) {
    this.yaw = f.yaw;
    this.yawVel = 0;
    this.place(f, null, 1);
    this.ready = true;
  }

  update(dt: number, f: Followed, target: Followed | null) {
    this.t += dt;
    if (!this.ready) this.snap(f);
    // Swing round behind the player: a critically damped spring on the heading, so a
    // turn starts slowly, carries, and settles without overshooting.
    const w = CAMERA_TUNING.turnRate;
    const diff = wrap(f.yaw - this.yaw);
    this.yawVel += (w * w * diff - 2 * w * this.yawVel) * dt;
    this.yaw = wrap(this.yaw + this.yawVel * dt);
    this.place(f, target, 1 - Math.exp(-dt * CAMERA_TUNING.follow));

    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    this.punch = Math.max(0, this.punch - dt * 4);
    const cam = this.camera;
    cam.position.copy(this.pos);
    cam.up.set(0, 1, 0);
    cam.lookAt(this.look);
    // Shake in screen space.
    const s = this.trauma * this.trauma;
    if (s > 0) {
      const n = (fq: number, o: number) => Math.sin(this.t * fq + o) * 0.6 + Math.sin(this.t * fq * 2.3 + o * 1.7) * 0.4;
      cam.updateMatrixWorld();
      const right = new Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
      const up = new Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
      cam.position.addScaledVector(right, n(47, 0) * s * 0.12).addScaledVector(up, n(53, 2) * s * 0.12);
      cam.rotateZ(n(31, 5) * s * 0.025);
    }
    const fov = (CAMERA_TUNING.fov * (1 - this.punch * 0.05)) / this.zoom;
    if (Math.abs(cam.fov - fov) > 1e-3) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
  }

  /** Move toward where the camera should be (k = 1: there at once). */
  private place(f: Followed, target: Followed | null, k: number) {
    const T = CAMERA_TUNING;
    const s = f.scale;
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    // Pull back further to keep a giant in the picture.
    const big = target ? Math.max(0, target.scale - 1) : 0;
    const dist = T.distance * s + big * 1.6;
    const height = (1.45 + T.rise) * s + big * 0.9;
    _want.set(f.pos.x - fx * dist - fz * T.shoulder, height, f.pos.z - fz * dist + fx * T.shoulder);
    // Backed up against a wall: come in closer (and look down a little more steeply)
    // rather than ending up on the other side of it.
    if (this.inside) {
      let u = 1;
      // (Never so close the player drops out of the picture: past that, the wall behind
      // is dissolved instead — see the cutout.)
      while (u > 0.6 && !this.inside(f.pos.x + (_want.x - f.pos.x) * u, f.pos.z + (_want.z - f.pos.z) * u)) u -= 0.05;
      _want.x = f.pos.x + (_want.x - f.pos.x) * u;
      _want.z = f.pos.z + (_want.z - f.pos.z) * u;
      _want.y += (1 - u) * 1.5 * s;
    }
    this.pos.lerp(_want, k);
    // Look past the player at the fight (or ahead of them, out of one).
    if (target) {
      _aim.set(target.pos.x, 1.25 * target.scale, target.pos.z);
      _lookWant.set(f.pos.x, 1.25 * s, f.pos.z).lerp(_aim, T.focusMix);
    } else {
      _lookWant.set(f.pos.x + fx * 2.2 * s, 1.15 * s, f.pos.z + fz * 2.2 * s);
    }
    if (k >= 1) this.look.copy(_lookWant);
    else this.look.lerp(_lookWant, Math.min(1, k * 1.4));
  }
}

const _want = new Vector3();
const _aim = new Vector3();
const _lookWant = new Vector3();
