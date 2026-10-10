import { type Bindings, keyLabel } from '../input/bindings';
import type { BrawlerAI } from '../sim/ai';
import type { CombatEvent } from '../sim/combat';
import type { Fighter } from '../sim/fighter';

export type TutorialStep = 'punch' | 'combo' | 'defense' | 'counter' | 'kick' | 'done';

const ORDER: TutorialStep[] = ['punch', 'combo', 'defense', 'counter', 'kick', 'done'];
const NEEDED: Record<TutorialStep, number> = { punch: 3, combo: 1, defense: 2, counter: 1, kick: 2, done: 0 };

/**
 * Show-don't-tell first room: a sparring partner who can't be knocked out. Teaches, in
 * order, basic punches, a combo, that defense is automatic, countering after a dodge,
 * and kicks — each with a prompt of a few words.
 */
export class Tutorial {
  step: TutorialStep = 'punch';
  private count = 0;
  private doneTimer = 0;
  finished = false;

  constructor(
    private readonly partner: Fighter,
    private readonly partnerAI: BrawlerAI,
    private readonly player: Fighter,
  ) {
    partner.stats.damageMul = 0.2;
    partnerAI.cfg.passive = true;
    partnerAI.cfg.blockChance = 0;
  }

  prompt(b: Bindings): string {
    const k = (code: string) => `<b>${keyLabel(code)}</b>`;
    switch (this.step) {
      case 'punch':
        return `${k(b.lpunch)} ${k(b.rpunch)} punch`;
      case 'combo':
        return `${k(b.lpunch)}${k(b.rpunch)}${k(b.lpunch)} combo`;
      case 'defense':
        return 'Defense is automatic — watch';
      case 'counter':
        return 'Strike right after a dodge';
      case 'kick':
        return `${k(b.lkick)} ${k(b.rkick)} kick`;
      case 'done':
        return 'Go!';
    }
  }

  private advance() {
    this.step = ORDER[ORDER.indexOf(this.step) + 1];
    this.count = 0;
    // From the defense lesson on, the partner throws slow, readable punches.
    this.partnerAI.cfg.passive = !(this.step === 'defense' || this.step === 'counter');
    this.partnerAI.cfg.aggression = 0.7;
  }

  onEvent(e: CombatEvent) {
    if (this.step === 'done') return;
    const p = this.player;
    let progress = false;
    switch (this.step) {
      case 'punch':
        progress = e.type === 'hit' && e.attacker === p && e.move.limb.startsWith('hand');
        break;
      case 'combo':
        progress = e.type === 'hit' && e.attacker === p && e.combo >= 3;
        break;
      case 'defense':
        progress = (e.type === 'dodge' || e.type === 'block') && e.defender === p;
        break;
      case 'counter':
        progress = e.type === 'hit' && e.attacker === p && e.counter;
        break;
      case 'kick':
        progress = e.type === 'hit' && e.attacker === p && e.move.limb.startsWith('foot');
        break;
    }
    if (progress && ++this.count >= NEEDED[this.step]) this.advance();
  }

  /** Per fixed step: nobody gets knocked out in practice. */
  update() {
    for (const f of [this.partner, this.player]) f.hp = Math.max(f.hp, f.stats.maxHp * 0.35);
    if (this.step === 'done' && !this.finished && ++this.doneTimer > 120) this.finished = true;
  }
}
