import { Pane } from 'tweakpane';
import { RAGDOLL_TUNING } from '../body/ragdoll';
import { GAME_TUNING, type Game } from '../game/game';
import { CAMERA_TUNING } from '../render/cameraRig';
import { ENEMY_MOVES, type MoveDef, PLAYER_MOVES } from '../sim/moves';

const MOVE_FIELDS: [keyof MoveDef, number, number, number][] = [
  ['startup', 1, 45, 1],
  ['active', 1, 12, 1],
  ['recovery', 1, 50, 1],
  ['damage', 0, 30, 0.5],
  ['hitstun', 0, 60, 1],
  ['knockback', 0, 8, 0.1],
  ['impulse', 0, 80, 1],
  ['hitstop', 0, 24, 1],
  ['shake', 0, 1, 0.01],
  ['radius', 0.05, 0.4, 0.01],
];

/** Live tuning panel (F1). Everything edits the running game in place. */
export function buildPanel(game: Game): { toggle: () => void } {
  const container = document.createElement('div');
  container.className = 'panel';
  container.style.display = 'none';
  document.body.appendChild(container);
  const pane = new Pane({ title: 'Combat tuning', container });

  const time = pane.addFolder({ title: 'Time' });
  time.addBinding(GAME_TUNING, 'timeScale', { min: 0.05, max: 1.5, step: 0.05, label: 'time scale' });
  time.addBinding(GAME_TUNING, 'paused');
  time.addButton({ title: 'Step frame (.)' }).on('click', () => game.requestStep());
  time.addBinding(GAME_TUNING, 'showHitboxes', { label: 'hitboxes (H)' });

  const feel = pane.addFolder({ title: 'Feel' });
  feel.addBinding(GAME_TUNING, 'hitstopMul', { min: 0, max: 3, step: 0.05, label: 'hit-pause ×' });
  feel.addBinding(CAMERA_TUNING, 'shakeMul', { min: 0, max: 3, step: 0.05, label: 'shake ×' });
  feel.addBinding(RAGDOLL_TUNING, 'impulseMul', { min: 0, max: 4, step: 0.05, label: 'impulse ×' });
  feel.addBinding(RAGDOLL_TUNING, 'dipMul', { min: 0, max: 1.5, step: 0.05, label: 'hit limpness' });
  feel.addBinding(RAGDOLL_TUNING, 'muscleGain', { min: 0.05, max: 1, step: 0.01, label: 'muscle gain' });
  feel.addBinding(RAGDOLL_TUNING, 'rootGain', { min: 0.05, max: 1, step: 0.01, label: 'balance gain' });
  feel.addBinding(RAGDOLL_TUNING, 'limpStrength', { min: 0, max: 0.6, step: 0.01, label: 'downed muscle' });
  feel.addBinding(GAME_TUNING, 'volume', { min: 0, max: 1, step: 0.05 }).on('change', (ev) => game.sfx.setVolume(ev.value));

  const cam = pane.addFolder({ title: 'Camera', expanded: false });
  cam.addBinding(CAMERA_TUNING, 'elevation', { min: 0.2, max: 1.4, step: 0.01 });
  cam.addBinding(CAMERA_TUNING, 'azimuth', { min: -1.2, max: 1.2, step: 0.01 });
  cam.addBinding(CAMERA_TUNING, 'baseView', { min: 3, max: 14, step: 0.1, label: 'view height' });

  const enemy = pane.addFolder({ title: 'Enemy AI' });
  enemy.addBinding(game.aiCfg, 'passive', { label: 'training dummy' });
  enemy.addBinding(game.aiCfg, 'aggression', { min: 0, max: 3, step: 0.05 });
  enemy.addBinding(game.aiCfg, 'blockChance', { min: 0, max: 1, step: 0.05, label: 'block chance' });
  enemy.addBinding(game.aiCfg, 'stringChance', { min: 0, max: 1, step: 0.05, label: 'string chance' });
  enemy.addButton({ title: 'Respawn enemy' }).on('click', () => game.spawnEnemy());
  enemy.addButton({ title: 'Restart (R)' }).on('click', () => game.restart());

  const moves = pane.addFolder({ title: 'Moves', expanded: false });
  for (const [label, table] of [['You', PLAYER_MOVES], ['Brawler', ENEMY_MOVES]] as const) {
    const group = moves.addFolder({ title: label, expanded: false });
    for (const m of Object.values(table)) {
      const f = group.addFolder({ title: m.name, expanded: false });
      for (const [key, min, max, step] of MOVE_FIELDS) {
        f.addBinding(m as unknown as Record<string, number>, key, { min, max, step });
      }
    }
  }

  pane.addButton({ title: 'Copy tuning as JSON' }).on('click', () => {
    const pick = (t: Record<string, MoveDef>) =>
      Object.fromEntries(Object.values(t).map((m) => [m.id, Object.fromEntries(MOVE_FIELDS.map(([k]) => [k, m[k]]))]));
    const json = JSON.stringify(
      { game: GAME_TUNING, ragdoll: RAGDOLL_TUNING, camera: CAMERA_TUNING, ai: game.aiCfg, player: pick(PLAYER_MOVES), enemy: pick(ENEMY_MOVES) },
      null,
      2,
    );
    console.log(json);
    void navigator.clipboard?.writeText(json);
  });

  // Keep bindings in sync with keyboard shortcuts.
  setInterval(() => {
    if (container.style.display !== 'none') pane.refresh();
  }, 250);

  return {
    toggle: () => {
      container.style.display = container.style.display === 'none' ? 'block' : 'none';
    },
  };
}
