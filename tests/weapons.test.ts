import { describe, expect, it } from 'vitest';
import { BLEED_DPS, type CombatEvent, CombatSim } from '../src/sim/combat';
import { createEnemy } from '../src/sim/enemies';
import { type Fighter } from '../src/sim/fighter';
import { createBrawler, createPlayer } from '../src/sim/roster';
import { WEAPON_MOVES, type WeaponId, WEAPONS } from '../src/sim/weapons';
import { RectWalkable } from '../src/world/collision';

function duel(weapon: WeaponId | null, dist: number) {
  const sim = new CombatSim(3);
  sim.walkable = new RectWalkable(-50, 50, -50, 50);
  const player = createPlayer();
  player.weapon = weapon ? WEAPONS[weapon] : null;
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

function swing(sim: CombatSim, f: Fighter, id: string, frames = 45): CombatEvent[] {
  f.startMove(WEAPON_MOVES[id], false, 'head');
  const out: CombatEvent[] = [];
  for (let i = 0; i < frames; i++) out.push(...sim.step());
  return out;
}

const hits = (ev: CombatEvent[]) => ev.filter((e) => e.type === 'hit') as Extract<CombatEvent, { type: 'hit' }>[];

describe('weapons', () => {
  it('every technique connects at its fighting range', () => {
    for (const [w, ids, d] of [
      ['machete', ['slash', 'backslash', 'chop'], 1.4],
      ['axe', ['sweep', 'sweepBack', 'overhead'], 1.7],
    ] as const) {
      for (const id of ids) {
        const { sim, player } = duel(w, d);
        expect(hits(swing(sim, player, id)).length, `${w} ${id}`).toBe(1);
      }
    }
  });

  it('a weapon outreaches a fist', () => {
    const { sim, player } = duel('machete', 1.75);
    expect(hits(swing(sim, player, 'slash')).length).toBe(1);
    const unarmed = duel(null, 1.75);
    unarmed.player.press('rpunch');
    const ev: CombatEvent[] = [];
    for (let i = 0; i < 40; i++) ev.push(...unarmed.sim.step());
    expect(hits(ev).length).toBe(0);
  });

  it('edges leave lasting cuts that keep bleeding; blunt weapons do not cut', () => {
    const { sim, player, enemy } = duel('machete', 1.4);
    const [h] = hits(swing(sim, player, 'slash'));
    expect(h.wound).not.toBeNull();
    expect(enemy.wounds.length).toBe(1);
    const hp = enemy.hp;
    for (let i = 0; i < 300; i++) sim.step();
    // Five seconds later: still bleeding, health drained by it.
    expect(enemy.wounds[0].bleed).toBeGreaterThan(0.1);
    expect(enemy.hp).toBeLessThan(hp - BLEED_DPS * enemy.wounds[0].floor * 4);
    const blunt = duel('bat', 1.7);
    const [b] = hits(swing(blunt.sim, blunt.player, 'sweep'));
    expect(b.wound).toBeNull();
    expect(blunt.enemy.wounds.length).toBe(0);
  });

  it('heavy edges take limbs off; losing the head ends the fight', () => {
    const { sim, player, enemy } = duel('axe', 1.8);
    enemy.limbDamage.head = 30;
    const [h] = hits(swing(sim, player, 'overhead'));
    expect(h.bone).toBe('head');
    expect(h.sever).toBe('head');
    expect(enemy.alive).toBe(false);
    expect(enemy.isSevered('head')).toBe(true);
  });

  it('losing an arm takes its strikes away and drops the weapon', () => {
    const sim = new CombatSim(4);
    const { fighter: e } = createEnemy('brawler', sim.rng);
    e.weapon = WEAPONS.machete;
    sim.add(e);
    (sim as unknown as { sever(f: Fighter, b: string): void }).sever(e, 'foreArmR');
    expect(e.weapon).toBeNull();
    expect(sim.drops.length).toBe(1);
    expect(e.canUse(e.moves.straight)).toBe(false);
    expect(e.wounds.some((w) => w.stump === 'foreArmR')).toBe(true);
  });

  it('your own limbs only come off with the blow that finishes you', () => {
    const sim = new CombatSim(5);
    sim.walkable = new RectWalkable(-50, 50, -50, 50);
    const player = createPlayer();
    player.autoDefense = false;
    const { fighter: e, ai } = createBrawler(sim.rng, { passive: true });
    e.weapon = WEAPONS.axe;
    player.yaw = Math.PI / 2;
    e.pos.set(1.8, 0, 0);
    e.yaw = -Math.PI / 2;
    sim.add(player);
    sim.add(e, ai);
    for (let i = 0; i < 20; i++) sim.step();
    player.limbDamage.head = 999;
    e.startMove(WEAPON_MOVES.overhead, false, 'head');
    for (let i = 0; i < 45; i++) sim.step();
    expect(player.hp).toBeGreaterThan(0);
    expect(player.severed.size).toBe(0);
  });

  it('picks up, swaps and drops weapons', () => {
    const { sim, player } = duel(null, 4);
    sim.addDrop(WEAPONS.machete, 0.4, 0);
    sim.addDrop(WEAPONS.bat, -0.5, 0.2);
    player.pickupRequest = 10;
    sim.step();
    expect(player.weapon?.id).toBe('machete');
    player.pickupRequest = 10;
    sim.step();
    expect(player.weapon?.id).toBe('bat');
    expect(sim.drops.map((d) => d.weapon.id)).toEqual(['machete']);
    player.pos.set(5, 0, 5);
    player.pickupRequest = 10;
    sim.step();
    expect(player.weapon).toBeNull();
    expect(sim.drops.length).toBe(2);
  });

  it('armed buttons: Q is the quick strike, E the heavy one', () => {
    for (const [w, light, heavy] of [['gladius', 'slash', 'chop'], ['bat', 'sweep', 'overhead']] as const) {
      const { sim, player } = duel(w, 3);
      player.press('lpunch');
      sim.step();
      expect(player.move?.id).toBe(light);
      for (let i = 0; i < 80; i++) sim.step();
      player.press('rpunch');
      sim.step();
      expect(player.move?.id).toBe(heavy);
    }
  });

  it('enemies go and grab weapons lying nearby, then fight with them', () => {
    const sim = new CombatSim(6);
    sim.walkable = new RectWalkable(-50, 50, -50, 50);
    const player = createPlayer();
    const { fighter: e, ai } = createBrawler(sim.rng, { blockChance: 0 });
    player.pos.set(-3, 0, 0);
    e.pos.set(1, 0, 0);
    sim.add(player);
    sim.add(e, ai);
    sim.addDrop(WEAPONS.machete, 2.5, 1);
    let used = false;
    for (let i = 0; i < 900 && !used; i++) {
      sim.step();
      if (e.move?.weapon) used = true;
    }
    expect(e.weapon?.id).toBe('machete');
    expect(used).toBe(true);
  });

  it('bosses come armed', () => {
    const sim = new CombatSim(7);
    expect(createEnemy('minotaur', sim.rng).fighter.weapon?.id).toBe('axe');
    expect(createEnemy('cyclops', sim.rng).fighter.weapon?.id).toBe('club');
    expect(createEnemy('champion', sim.rng).fighter.weapon).toBeNull();
  });
});
