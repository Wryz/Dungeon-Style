import { ACTIONS, type Bindings, DEFAULT_BINDINGS, keyLabel, rebind, RESERVED_KEYS } from '../input/bindings';
import type { Input } from '../input/input';

/** Settings overlay (Esc): rebind controls. Changes apply immediately and persist. */
export class SettingsMenu {
  private readonly el: HTMLDivElement;
  private readonly rows: HTMLDivElement;
  private open = false;
  onChange: ((b: Bindings) => void) | null = null;
  onOpenChange: ((open: boolean) => void) | null = null;

  constructor(
    root: HTMLElement,
    private readonly input: Input,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'settings';
    this.el.innerHTML = `
      <div class="settings-card">
        <h2>Controls</h2>
        <p class="sub">Click a key, then press the new one. Defense is automatic.</p>
        <div class="rows"></div>
        <p class="sub small">Arrow keys also move · Mouse: left / right punch · Gamepad: X/Y punch, A/B kick</p>
        <div class="actions">
          <button class="reset">Reset to defaults</button>
          <button class="close primary">Resume</button>
        </div>
      </div>`;
    root.appendChild(this.el);
    this.rows = this.el.querySelector('.rows')!;
    this.el.querySelector('.reset')!.addEventListener('click', () => this.apply({ ...DEFAULT_BINDINGS }));
    this.el.querySelector('.close')!.addEventListener('click', () => this.toggle(false));
    this.el.addEventListener('mousedown', (e) => {
      if (e.target === this.el) this.toggle(false);
    });
    this.render();
  }

  get isOpen() {
    return this.open;
  }

  toggle(force?: boolean) {
    this.open = force ?? !this.open;
    this.el.classList.toggle('show', this.open);
    if (!this.open) this.input.capture = null;
    this.render();
    this.onOpenChange?.(this.open);
  }

  private apply(b: Bindings) {
    this.input.setBindings(b);
    this.render();
    this.onChange?.(b);
  }

  private render() {
    const b = this.input.bindings;
    this.rows.innerHTML = '';
    for (const a of ACTIONS) {
      const row = document.createElement('div');
      row.className = 'row';
      const label = document.createElement('span');
      label.textContent = a.label;
      const key = document.createElement('button');
      key.className = 'key';
      key.textContent = keyLabel(b[a.id]);
      key.addEventListener('click', () => {
        key.textContent = 'press a key…';
        key.classList.add('listening');
        this.input.capture = (code) => {
          if (code !== 'Escape' && !RESERVED_KEYS.has(code)) this.apply(rebind(this.input.bindings, a.id, code));
          else this.render();
        };
      });
      row.append(label, key);
      this.rows.appendChild(row);
    }
  }
}
