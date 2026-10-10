import type { Button } from '../sim/fighter';

export interface InputFrame {
  /** Screen-space movement: x right, y up (−1..1). */
  moveX: number;
  moveY: number;
  presses: Button[];
  /** Debug / meta keys pressed this frame (KeyboardEvent.code). */
  keys: string[];
}

const PUNCH_KEYS = new Set(['KeyJ', 'KeyZ', 'Numpad1']);
const KICK_KEYS = new Set(['KeyK', 'KeyX', 'Numpad2']);
const META_KEYS = new Set(['F1', 'Backquote', 'KeyP', 'Period', 'KeyT', 'KeyH', 'KeyR', 'KeyM']);

/** Keyboard + mouse + gamepad + touch, collapsed into one frame of intent. */
export class Input {
  private readonly held = new Set<string>();
  private presses: Button[] = [];
  private keys: string[] = [];
  private gpPrev: boolean[] = [];
  private touchMove = { x: 0, y: 0 };
  onAnyInput: (() => void) | null = null;

  constructor(target: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.onAnyInput?.();
      if (PUNCH_KEYS.has(e.code)) this.presses.push('punch');
      else if (KICK_KEYS.has(e.code)) this.presses.push('kick');
      if (META_KEYS.has(e.code)) {
        this.keys.push(e.code);
        if (e.code === 'F1') e.preventDefault();
      }
      this.held.add(e.code);
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.held.delete(e.code));
    window.addEventListener('blur', () => this.held.clear());
    target.addEventListener('mousedown', (e) => {
      this.onAnyInput?.();
      if (e.button === 0) this.presses.push('punch');
      else if (e.button === 2) this.presses.push('kick');
    });
    target.addEventListener('contextmenu', (e) => e.preventDefault());
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) this.buildTouch();
  }

  private buildTouch() {
    const wrap = document.createElement('div');
    wrap.className = 'touch';
    wrap.innerHTML = `
      <div class="stick"><div class="knob"></div></div>
      <div class="tbtns"><button data-b="kick">KICK</button><button data-b="punch">PUNCH</button></div>`;
    document.body.appendChild(wrap);
    document.body.classList.add('has-touch');
    const stick = wrap.querySelector<HTMLDivElement>('.stick')!;
    const knob = wrap.querySelector<HTMLDivElement>('.knob')!;
    let id: number | null = null;
    const update = (t: Touch) => {
      const r = stick.getBoundingClientRect();
      let x = (t.clientX - (r.left + r.width / 2)) / (r.width / 2);
      let y = (t.clientY - (r.top + r.height / 2)) / (r.height / 2);
      const l = Math.hypot(x, y);
      if (l > 1) {
        x /= l;
        y /= l;
      }
      this.touchMove = { x, y: -y };
      knob.style.transform = `translate(${x * 40}px, ${y * 40}px)`;
    };
    stick.addEventListener('touchstart', (e) => {
      this.onAnyInput?.();
      const t = e.changedTouches[0];
      id = t.identifier;
      update(t);
      e.preventDefault();
    });
    stick.addEventListener('touchmove', (e) => {
      for (const t of Array.from(e.changedTouches)) if (t.identifier === id) update(t);
      e.preventDefault();
    });
    const end = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === id) {
          id = null;
          this.touchMove = { x: 0, y: 0 };
          knob.style.transform = '';
        }
      }
    };
    stick.addEventListener('touchend', end);
    stick.addEventListener('touchcancel', end);
    for (const b of Array.from(wrap.querySelectorAll<HTMLButtonElement>('button'))) {
      b.addEventListener('touchstart', (e) => {
        this.onAnyInput?.();
        this.presses.push(b.dataset.b as Button);
        b.classList.add('down');
        e.preventDefault();
      });
      b.addEventListener('touchend', () => b.classList.remove('down'));
    }
  }

  poll(): InputFrame {
    let x = 0;
    let y = 0;
    const h = this.held;
    if (h.has('KeyA') || h.has('ArrowLeft')) x -= 1;
    if (h.has('KeyD') || h.has('ArrowRight')) x += 1;
    if (h.has('KeyW') || h.has('ArrowUp')) y += 1;
    if (h.has('KeyS') || h.has('ArrowDown')) y -= 1;
    x += this.touchMove.x;
    y += this.touchMove.y;

    const pads = navigator.getGamepads?.() ?? [];
    for (const gp of pads) {
      if (!gp) continue;
      const ax = gp.axes[0] ?? 0;
      const ay = gp.axes[1] ?? 0;
      if (Math.hypot(ax, ay) > 0.2) {
        x += ax;
        y -= ay;
      }
      const map: [number, Button][] = [
        [2, 'punch'], [3, 'punch'], [5, 'punch'],
        [0, 'kick'], [1, 'kick'], [7, 'kick'],
      ];
      for (const [i, b] of map) {
        const down = !!gp.buttons[i]?.pressed;
        if (down && !this.gpPrev[i]) {
          this.presses.push(b);
          this.onAnyInput?.();
        }
        this.gpPrev[i] = down;
      }
      break;
    }
    const l = Math.hypot(x, y);
    if (l > 1) {
      x /= l;
      y /= l;
    }
    const frame = { moveX: x, moveY: y, presses: this.presses, keys: this.keys };
    this.presses = [];
    this.keys = [];
    return frame;
  }
}
