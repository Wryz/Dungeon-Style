import './style.css';
import { buildPanel } from './debug/panel';
import { Game } from './game/game';

async function boot() {
  const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
  const hud = document.querySelector<HTMLDivElement>('#ui')!;
  const loading = document.querySelector<HTMLDivElement>('#loading');
  try {
    const game = await Game.create(canvas, hud);
    const panel = buildPanel(game);
    game.onTogglePanel = panel.toggle;
    game.start();
    loading?.remove();
    (window as unknown as { game: Game }).game = game;
  } catch (err) {
    console.error(err);
    if (loading) loading.textContent = `Failed to start: ${(err as Error).message}`;
  }
}

void boot();
