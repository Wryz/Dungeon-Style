import { buy, canBuy, item, nextItem, type SaveData, SLOT_NAMES, SLOTS, type Slot } from '../game/economy';

const STAT_LABELS: Record<string, (v: number) => string> = {
  defense: (v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}% defense`,
  staggerResist: (v) => `+${Math.round(v * 100)}% stagger resist`,
  damageMul: (v) => `+${Math.round(v * 100)}% damage`,
  reach: (v) => `+${Math.round(v * 100)} cm reach`,
  knockbackMul: (v) => `+${Math.round(v * 100)}% knockback`,
  walkSpeed: (v) => `${v > 0 ? '+' : ''}${v.toFixed(2)} speed`,
  maxHp: (v) => `+${v} health`,
};

/** Between-rounds shop: spend coins on the five gear slots. */
export class Shop {
  private readonly el: HTMLDivElement;
  onBuy: ((slot: Slot) => void) | null = null;
  onDone: (() => void) | null = null;

  constructor(
    root: HTMLElement,
    private readonly save: SaveData,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'overlay shop';
    root.appendChild(this.el);
  }

  open(round: number) {
    this.render(round);
    this.el.classList.add('show');
  }

  close() {
    this.el.classList.remove('show');
  }

  private render(round: number) {
    const s = this.save;
    const cards = SLOTS.map((slot) => {
      const owned = item(slot, s.gear[slot]);
      const next = nextItem(s, slot);
      const stats = next ? Object.entries(next.mods).map(([k, v]) => STAT_LABELS[k]?.(v as number) ?? '').join(' · ') : '';
      return `
        <div class="card ${next ? '' : 'maxed'}">
          <div class="slot">${SLOT_NAMES[slot]}</div>
          <div class="owned">${owned ? `Wearing <b>${owned.name}</b>` : 'Nothing'}</div>
          ${
            next
              ? `<div class="next"><b>${next.name}</b><small>${stats}</small></div>
                 <button data-slot="${slot}" ${canBuy(s, next) ? '' : 'disabled'}>Buy · ${next.price}<span class="coin"></span></button>`
              : '<div class="next"><b>Best in slot</b></div>'
          }
        </div>`;
    }).join('');
    this.el.innerHTML = `
      <div class="panel-card wide">
        <h2>Round ${round} cleared</h2>
        <p class="sub">Gear and coins stay with you, even if you fall.</p>
        <div class="wallet"><span class="coin"></span> ${Math.floor(s.coins)}</div>
        <div class="cards">${cards}</div>
        <div class="actions"><span></span><button class="primary go">Next round · ${round + 1}</button></div>
      </div>`;
    for (const b of Array.from(this.el.querySelectorAll<HTMLButtonElement>('button[data-slot]'))) {
      b.addEventListener('click', () => {
        const slot = b.dataset.slot as Slot;
        const next = nextItem(s, slot);
        if (next && buy(s, next)) {
          this.onBuy?.(slot);
          this.render(round);
        }
      });
    }
    this.el.querySelector('.go')!.addEventListener('click', () => this.onDone?.());
  }
}
