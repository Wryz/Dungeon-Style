import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS } from '../src/game/prefs';
import { CombatSim } from '../src/sim/combat';
import { createEnemy } from '../src/sim/enemies';
import { type Fighter } from '../src/sim/fighter';
import { createBrawler, createPlayer } from '../src/sim/roster';
import { WEAPON_MOVES, WEAPONS } from '../src/sim/weapons';
import { RectWalkable } from '../src/world/collision';

function pair(dist = 1.0) {
  const sim = new CombatSim(11);
  sim.walkable = new RectWalkable(-50, 50, -50, 50);
  const player = createPlayer();
  player.autoDefense = false;
  const { fighter: enemy, ai } = createBrawler(sim.rng, { passive: true, blockChance: 0 });
  player.yaw = Math.PI / 2;
  enemy.pos.set(dist, 0, 0);
  enemy.yaw = -Math.PI / 2;
  sim.add(player);
  sim.add(enemy, ai);
  for (let i = 0; i < 30; i++) sim.step();
  player.pos.set(0, 0, 0);
  enemy.pos.set(dist, 0, 0);
  return { sim, player, enemy };
}

function reactionTo(f: Fighter, sim: CombatSim, target: Fighter, id: string, aim: string) {
  // A version that staggers rather than drops them, to see the reaction itself.
  f.startMove({ ...f.moves[id], knockdown: false, poiseDamage: 5 }, false, aim);
  for (let i = 0; i < 40; i++) {
    sim.step();
    if (target.state === 'hitstun') return target.hitReaction;
  }
  return null;
}

describe('realistic reactions and timing', () => {
  it('a hook whips the head away from it; an uppercut throws the chin up; a liver shot caves the side', () => {
    let p = pair(1.0);
    expect(reactionTo(p.player, p.sim, p.enemy, 'hook', 'head')).toBe('hitHookL');
    p = pair(1.0);
    expect(reactionTo(p.player, p.sim, p.enemy, 'hook', 'liver')).toBe('hitLiver');
    p = pair(0.8);
    expect(reactionTo(p.player, p.sim, p.enemy, 'uppercut', 'head')).toBe('hitUpper');
  });

  it('giants move their limbs slower; heavy weapons swing slower', () => {
    const sim = new CombatSim(1);
    const giant = createEnemy('minotaur', sim.rng).fighter;
    const man = createEnemy('brawler', sim.rng).fighter;
    giant.startMove(giant.moves.straight);
    man.startMove(man.moves.straight);
    expect(giant.move!.startup).toBeGreaterThan(man.move!.startup * 1.2);
    const a = createPlayer();
    a.weapon = WEAPONS.axe;
    a.startMove(WEAPON_MOVES.sweep);
    const b = createPlayer();
    b.weapon = WEAPONS.bat;
    b.startMove(WEAPON_MOVES.sweep);
    expect(a.move!.startup).toBeGreaterThan(b.move!.startup);
  });

  it('every footfall is reported (for footstep sounds)', () => {
    const { sim, player } = pair(30);
    let landed = 0;
    for (let i = 0; i < 120; i++) {
      player.moveInput.set(0, 0, 1);
      sim.step();
      landed += player.footwork.landed.length;
      player.footwork.landed.length = 0;
    }
    // Running ~3.5 steps a second for two seconds.
    expect(landed).toBeGreaterThan(4);
  });

  it('game-style cues are off by default', () => {
    expect(DEFAULT_PREFS.cues).toBe(false);
  });
});
