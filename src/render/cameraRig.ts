import { OrthographicCamera, Vector3 } from 'three';

export const CAMERA_TUNING = {
  elevation: 0.62, // radians above horizontal
  azimuth: -0.32, // radians around Y (0 = straight from +Z)
  baseView: 7.2, // visible world height in metres
  shakeMul: 1,
  /** How much the view widens with fighter separation. */
  spreadMul: 0.75,
  spreadPad: 3.2,
  /** 0.5 frames the midpoint between fighters, 0 frames the player. */
  focusMix: 0.5,
};

/** Orthographic camera above and to the side, following the fight with trauma-based shake. */
export class CameraRig {
  readonly camera: OrthographicCamera;
  private readonly focus = new Vector3();
  private aspect = 16 / 9;
  private view = CAMERA_TUNING.baseView;
  private trauma = 0;
  private punch = 0;
  private t = 0;
  zoom = 1;

  constructor() {
    this.camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  }

  /** Ground-plane forward/right of the view, for camera-relative movement input. */
  get groundForward() {
    const a = CAMERA_TUNING.azimuth;
    return new Vector3(-Math.sin(a), 0, -Math.cos(a));
  }
  get groundRight() {
    const a = CAMERA_TUNING.azimuth;
    return new Vector3(Math.cos(a), 0, -Math.sin(a));
  }

  resize(w: number, h: number) {
    this.aspect = w / h;
  }

  addTrauma(amount: number) {
    this.trauma = Math.min(1, this.trauma + amount * CAMERA_TUNING.shakeMul);
  }

  zoomPunch(amount: number) {
    this.punch = Math.max(this.punch, amount);
  }

  snap(target: Vector3) {
    this.focus.copy(target);
  }

  update(dt: number, target: Vector3, spread: number) {
    this.t += dt;
    const k = 1 - Math.exp(-dt * 5);
    this.focus.lerp(target, k);
    const want = Math.max(CAMERA_TUNING.baseView, spread * CAMERA_TUNING.spreadMul + CAMERA_TUNING.spreadPad * Math.sign(CAMERA_TUNING.spreadMul)) / this.zoom;
    this.view += (want - this.view) * (1 - Math.exp(-dt * 3));
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    this.punch = Math.max(0, this.punch - dt * 4);

    const e = CAMERA_TUNING.elevation;
    const a = CAMERA_TUNING.azimuth;
    const dir = new Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e));
    const cam = this.camera;
    cam.position.copy(this.focus).addScaledVector(dir, 40);
    cam.up.set(0, 1, 0);
    cam.lookAt(this.focus);

    // Shake in screen space.
    const s = this.trauma * this.trauma;
    if (s > 0) {
      const n = (f: number, o: number) => Math.sin(this.t * f + o) * 0.6 + Math.sin(this.t * f * 2.3 + o * 1.7) * 0.4;
      const right = new Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
      const up = new Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
      cam.position.addScaledVector(right, n(47, 0) * s * 0.28).addScaledVector(up, n(53, 2) * s * 0.28);
      cam.rotateZ(n(31, 5) * s * 0.025);
    }

    const h = (this.view * (1 - this.punch * 0.06)) / 2;
    cam.left = -h * this.aspect;
    cam.right = h * this.aspect;
    cam.top = h;
    cam.bottom = -h;
    cam.updateProjectionMatrix();
  }
}
