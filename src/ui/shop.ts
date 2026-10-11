import { buy, buyWeapon, canBuy, item, MAX_TIER, nextItem, nextWeapon, type SaveData, SLOT_NAMES, SLOTS, type Slot, weaponItem } from '../game/economy';

const STAT_LABELS: Record<string, (v: number) => string> = {
  defense: (v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}% defense`,
  staggerResist: (v) => `+${Math.round(v * 100)}% stagger resist`,
  damageMul: (v) => `+${Math.round(v * 100)}% damage`,
  reach: (v) => `+${Math.round(v * 100)} cm reach`,
  knockbackMul: (v) => `+${Math.round(v * 100)}% knockback`,
  walkSpeed: (v) => `${v > 0 ? '+' : ''}${v.toFixed(2)} speed`,
  maxHp: (v) => `+${v} health`,
};

/** Between-rounds shop: spend coins on the five gear slots and a weapon to carry in. */
export class Shop {
  private readonly el: HTMLDivElement;
  /** Opened after a death: the run starts again from round 1. */
  fallen = false;
  onBuy: ((slot: Slot | 'weapon') => void) | null = null;
  onDone: (() => void) | null = null;

  constructor(
    root: HTMLElement,
    private readonly save: SaveData,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'overlay shop';
    root.appendChild(this.el);
  }

  /** @param pay what the run paid out, when it ended in a death (null: a round was cleared). */
  open(round: number, pay: number | null) {
    this.fallen = pay !== null;
    this.pay = pay ?? 0;
    this.render(round);
    this.el.classList.add('show');
  }

  private pay = 0;

  close() {
    this.el.classList.remove('show');
  }

  private render(round: number) {
    const s = this.save;
    const pips = (tier: number) => `<span class="pips">${Array.from({ length: MAX_TIER }, (_, i) => `<i class="${i < tier ? 'on' : ''}"></i>`).join('')}</span>`;
    const cards = SLOTS.map((slot) => {
      const owned = item(slot, s.gear[slot]);
      const next = nextItem(s, slot);
      const stats = next ? Object.entries(next.mods).map(([k, v]) => STAT_LABELS[k]?.(v as number) ?? '').join(' · ') : '';
      return `
        <div class="card ${next ? '' : 'maxed'}">
          <div class="slot">${SLOT_NAMES[slot]} ${pips(s.gear[slot])}</div>
          <div class="owned">${owned ? `Wearing <b>${owned.name}</b>` : 'Nothing'}</div>
          ${
            next
              ? `<div class="next"><b>${next.name}</b><small>${stats}</small></div>
                 <button data-slot="${slot}" ${canBuy(s, next) ? '' : 'disabled'}>Buy · ${next.price}<span class="coin"></span></button>`
              : '<div class="next"><b>Best in slot</b></div>'
          }
        </div>`;
    });
    const wOwned = weaponItem(s.weapon);
    const wNext = nextWeapon(s);
    cards.push(`
        <div class="card weapon ${wNext ? '' : 'maxed'}">
          <div class="slot">Weapon ${pips(s.weapon)}</div>
          <div class="owned">${wOwned ? `Carrying <b>${wOwned.name}</b> into every round` : 'Bare hands'}</div>
          ${
            wNext
              ? `<div class="next"><b>${wNext.name}</b><small>${wNext.blurb}</small></div>
                 <button data-slot="weapon" ${s.coins >= wNext.price ? '' : 'disabled'}>Buy · ${wNext.price}<span class="coin"></span></button>`
              : '<div class="next"><b>Best there is</b></div>'
          }
        </div>`);
    const head = this.fallen
      ? `<h2>Fallen in round ${round}</h2>
         <p class="sub">Back to round 1 — but the run paid <b>+${this.pay}</b> coins, and everything you've bought stays yours. Gear up and go again; they get tougher and better armoured every round.</p>`
      : `<h2>Round ${round} cleared</h2>
         <p class="sub">Gear and coins stay with you, even if you fall. Your opponents gear up too.</p>`;
    this.el.innerHTML = `
      <div class="panel-card wide">
        ${head}
        <div class="wallet"><span class="coin"></span> ${Math.floor(s.coins)}</div>
        <div class="cards">${cards.join('')}</div>
        <div class="actions"><span></span><button class="primary go">${this.fallen ? 'Start again · round 1' : `Next round · ${round + 1}`}</button></div>
      </div>`;
    for (const b of Array.from(this.el.querySelectorAll<HTMLButtonElement>('button[data-slot]'))) {
      b.addEventListener('click', () => {
        if (b.dataset.slot === 'weapon') {
          const w = nextWeapon(s);
          if (w && buyWeapon(s, w)) {
            this.onBuy?.('weapon');
            this.render(round);
          }
          return;
        }
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
