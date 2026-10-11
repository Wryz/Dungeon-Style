import type { Camera, Vector3 } from 'three';
import { type Bindings, keyLabel } from '../input/bindings';
import type { Fighter } from '../sim/fighter';

/** DOM overlay: health/guard bars, combo counter, pop-up callouts, controls hint. */
export class Hud {
  private readonly el: HTMLDivElement;
  private readonly pHp: HTMLDivElement;
  private readonly pHpLag: HTMLDivElement;
  private readonly pGuard: HTMLDivElement;
  private readonly eWrap: HTMLDivElement;
  private readonly eHp: HTMLDivElement;
  private readonly eHpLag: HTMLDivElement;
  private readonly eName: HTMLDivElement;
  private readonly combo: HTMLDivElement;
  private readonly wave: HTMLDivElement;
  private readonly banner: HTMLDivElement;
  private readonly hint: HTMLDivElement;
  private readonly coinsEl: HTMLDivElement;
  private readonly promptEl: HTMLDivElement;
  private readonly flashEl: HTMLDivElement;
  private shownCoins = 0;
  private comboTimer = 0;
  private lagP = 1;
  private lagE = 1;

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'hud';
    this.el.innerHTML = `
      <div class="bars left">
        <div class="name">YOU</div>
        <div class="bar hp"><div class="lag"></div><div class="fill"></div></div>
        <div class="bar guard"><div class="fill"></div></div>
      </div>
      <div class="bars right">
        <div class="name enemy-name">BRAWLER</div>
        <div class="bar hp"><div class="lag"></div><div class="fill"></div></div>
      </div>
      <div class="wave"></div>
      <div class="coins"><span class="coin"></span><b>0</b></div>
      <div class="prompt"></div>
      <div class="flash"></div>
      <div class="combo"></div>
      <div class="banner"></div>
      <div class="hint"></div>
      <button class="gear" title="Settings (Esc)">⚙</button>`;
    root.appendChild(this.el);
    const q = <T extends HTMLElement>(s: string) => this.el.querySelector<T>(s)!;
    this.pHp = q('.left .hp .fill');
    this.pHpLag = q('.left .hp .lag');
    this.pGuard = q('.left .guard .fill');
    this.eWrap = q('.bars.right');
    this.eHp = q('.right .hp .fill');
    this.eHpLag = q('.right .hp .lag');
    this.eName = q('.enemy-name');
    this.combo = q('.combo');
    this.wave = q('.wave');
    this.banner = q('.banner');
    this.hint = q('.hint');
    this.coinsEl = q('.coins');
    this.promptEl = q('.prompt');
    this.flashEl = q('.flash');
  }

  setCoins(n: number, animate = true) {
    if (!animate) this.shownCoins = n;
    const target = Math.floor(n);
    if (target > this.shownCoins) {
      this.coinsEl.classList.remove('bump');
      void this.coinsEl.offsetWidth;
      this.coinsEl.classList.add('bump');
    }
    this.shownCoins = target;
    this.coinsEl.querySelector('b')!.textContent = String(target);
  }

  showCoins(show: boolean) {
    this.coinsEl.style.display = show ? '' : 'none';
  }

  /** Short tutorial prompt floating above a world position (empty text hides it). */
  prompt(text: string, world?: Vector3, camera?: Camera) {
    if (!text) {
      this.promptEl.classList.remove('show');
      return;
    }
    if (this.promptEl.innerHTML !== text) this.promptEl.innerHTML = text;
    this.promptEl.classList.add('show');
    if (world && camera) {
      const p = world.clone().project(camera);
      this.promptEl.style.left = `${(p.x * 0.5 + 0.5) * 100}%`;
      this.promptEl.style.top = `${(-p.y * 0.5 + 0.5) * 100}%`;
    }
  }

  /** Full-screen white flash (memory erase). */
  flash() {
    this.flashEl.classList.remove('on');
    void this.flashEl.offsetWidth;
    this.flashEl.classList.add('on');
  }

  update(dt: number, player: Fighter, enemy: Fighter | null, label: string) {
    const ph = player.hp / player.stats.maxHp;
    this.lagP = Math.max(ph, this.lagP - dt * 0.5);
    this.pHp.style.width = `${ph * 100}%`;
    this.pHpLag.style.width = `${this.lagP * 100}%`;
    this.pGuard.style.width = `${(player.guard / player.stats.maxGuard) * 100}%`;
    this.pGuard.parentElement!.classList.toggle('low', player.guard < 30);
    if (enemy) {
      const eh = enemy.hp / enemy.stats.maxHp;
      this.lagE = Math.max(eh, this.lagE - dt * 0.5);
      this.eHp.style.width = `${eh * 100}%`;
      this.eHpLag.style.width = `${this.lagE * 100}%`;
      this.eName.textContent = enemy.name.toUpperCase();
      this.eWrap.style.opacity = '1';
    } else {
      this.eWrap.style.opacity = '0';
      this.lagE = 1;
    }
    this.wave.textContent = label;
    this.comboTimer -= dt;
    if (this.comboTimer <= 0) this.combo.classList.remove('show');
  }

  /** Rebuilds the controls hint from the current key bindings. */
  setBindings(b: Bindings) {
    const k = (code: string) => `<b>${keyLabel(code)}</b>`;
    this.hint.innerHTML = `
      <span>${k(b.up)}${k(b.left)}${k(b.down)}${k(b.right)} move</span>
      <span>${k(b.lpunch)} ${k(b.rpunch)} punch L / R</span>
      <span>${k(b.lkick)} ${k(b.rkick)} kick L / R</span>
      <span>${k(b.pickup)} grab / drop weapon</span>
      <span class="dim">defense is automatic</span>
      <span class="dim"><b>Esc</b> settings</span>
      <span class="dim"><b>L</b> tuning</span>`;
  }

  get gearButton(): HTMLButtonElement {
    return this.el.querySelector('.gear')!;
  }

  showCombo(n: number) {
    if (n < 2) return;
    this.combo.innerHTML = `<b>${n}</b> HITS`;
    this.combo.classList.remove('show');
    void this.combo.offsetWidth;
    this.combo.classList.add('show');
    this.comboTimer = 1.4;
  }

  showBanner(text: string, sub = '', cls = '') {
    this.banner.className = `banner show ${cls}`;
    this.banner.innerHTML = `<div>${text}</div>${sub ? `<small>${sub}</small>` : ''}`;
  }

  hideBanner() {
    this.banner.className = 'banner';
  }

  fadeHint() {
    this.hint.classList.add('faded');
  }

  /** Small callout that floats up from a world position. */
  popup(text: string, world: Vector3, camera: Camera, cls = '') {
    const p = world.clone().project(camera);
    const div = document.createElement('div');
    div.className = `popup ${cls}`;
    div.textContent = text;
    div.style.left = `${(p.x * 0.5 + 0.5) * 100}%`;
    div.style.top = `${(-p.y * 0.5 + 0.5) * 100}%`;
    this.el.appendChild(div);
    setTimeout(() => div.remove(), 900);
  }
}
