import { beatFor } from '../story/story';

/** End-of-dungeon story choice at the memory terminal. */
export class Choice {
  private readonly el: HTMLDivElement;
  onErase: (() => void) | null = null;
  onCancel: (() => void) | null = null;
  isOpen = false;

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'overlay choice';
    root.appendChild(this.el);
  }

  open(loop: number, coinsThisRun: number, nextMul: number) {
    const beat = beatFor(loop);
    this.el.innerHTML = `
      <div class="panel-card terminal">
        <div class="term-title">${beat.title}</div>
        ${beat.lines.map((l) => `<p>${l}</p>`).join('')}
        <p class="sub">This run: ${Math.floor(coinsThisRun)} coins. Next loop pays ×${nextMul.toFixed(2)} and runs easier.</p>
        <div class="actions">
          <button class="later">Not yet</button>
          <button class="primary erase">Erase memories and run it again</button>
        </div>
      </div>`;
    this.el.querySelector('.erase')!.addEventListener('click', () => {
      this.close();
      this.onErase?.();
    });
    this.el.querySelector('.later')!.addEventListener('click', () => {
      this.close();
      this.onCancel?.();
    });
    this.el.classList.add('show');
    this.isOpen = true;
  }

  close() {
    this.el.classList.remove('show');
    this.isOpen = false;
  }
}
