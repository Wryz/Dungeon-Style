# Roguelike Brawler

A 3D low-poly roguelike where combat is automatic and physics-driven: **you only choose
when and how to attack — the character defends on its own.** Run short roofless
dungeons, collect coins, choose to erase your memories at the end and run it again —
each loop pays more and runs easier, while the world slowly reveals it is a simulation
on a man's computer.

## What's in

- **Milestone 1 – combat:** context-sensitive punches and kicks, automatic
  block/duck/weave/slide, counters, powered-ragdoll hit reactions, boxer footwork and
  contextual movement, hit-pause, shake, procedural audio.
- **Milestone 2 – dungeon & camera:** seeded roofless dungeons (start room, combat rooms
  joined by turning corridors, exit room). Walls between the camera and the fight
  dissolve in a dithered cutout; gates seal a room until it is cleared; the camera
  looks ahead while exploring and frames the fight in combat.
- **Milestone 3 – enemies, coins, shop:** four archetypes — Rookie (quick jabs),
  Brawler (haymakers), Kicker (teep / low kick / body roundhouse), Bruiser (slow,
  armored, heavy). An attack director makes groups take turns. KOs burst into coins that
  fly to you; between runs a shop sells helmet, chestplate, leggings, boots and fist
  cuffs (3 tiers each) that change your stats and show on your character. Progress is
  saved in the browser.
- **Milestone 4 – story loop:** the exit room's floating screen offers to erase your
  memories. Each loop: more coins (+35% per loop), smaller enemy groups, softer enemies.
  Story beats per loop, and environmental hints that escalate — missing-texture blocks
  and screen glitches, then floating UI windows, a mouse cursor, a desktop taskbar,
  until the explicit realization.
- **Milestone 5 – tutorial & polish:** the first visit teaches against a sparring
  partner, in order: punches, a combo, automatic defense, countering, kicks — with
  few-word prompts. Gate / coin / glitch sounds, transitions, settings and key rebinding.

The training arena from milestone 1 is still there: add `?mode=arena` to the URL (or use
the **L** panel → Run).

Built with **Three.js + Rapier (WASM physics) + TypeScript + Vite**. Runs entirely in the
browser, no backend.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # combat rules + reach regression tests (headless)
npm run build      # typecheck + production build into dist/
```

## Controls

| Action | Keyboard (default) | Mouse | Gamepad | Touch |
|---|---|---|---|---|
| Move | WASD (+ arrows) | | left stick | stick |
| Left punch | **Q** | left click | X / LB | L PUNCH |
| Right punch | **E** | right click | Y / RB | R PUNCH |
| Left kick | **R** | | A / LT | L KICK |
| Right kick | **F** | | B / RT | R KICK |

**Esc** (or the ⚙ button) opens **Settings**, where every key can be rebound; bindings
are saved in the browser. Debug: **L** tuning panel · **H** hitboxes · **T** cycle
slow-mo · **P** pause · **.** step one frame · **Backspace** restart · **M** mute.

## How the combat works

**Four buttons, many moves.** The technique depends on the button and the situation:

| | Close | Mid range | In a chain | After duck / weave / slide / block |
|---|---|---|---|---|
| **Left punch** | jab | gazelle punch (lunge) | jab → jab, cross → hook | hook / hook / gazelle / jab |
| **Right punch** | cross | cross | jab → cross, hook → cross | uppercut / cross / cross / cross |
| **Left kick** | push kick (guard breaker) | flying kick | → push kick | push kick / push kick / sliding strike / push kick |
| **Right kick** | low kick | sliding strike | → low kick | low kick / low kick / sliding strike / low kick |

**Strikes vary where they land.** Each throw picks a target (plus a little natural
scatter): jabs and crosses to the head or body, hooks to the head or liver, push kicks to
the stomach, chest or thigh, the right kick to the thigh, calf or ribs (a body
roundhouse). Body shots are mid-height attacks — they hit the body, and automatic defense
blocks them instead of slipping. Against an opponent who is covering up, strikes favour
the body and legs. The Brawler mixes head and body haymakers the same way.

**Facing is a soft lock.** You turn toward your opponent but not instantly: strafing
leans your body into the strafe, small offsets are tolerated, and a strike only gets a
little aim assist early in its wind-up, so angles matter. Punches thrown while moving
keep the legs stepping underneath; kicks and lunges carry your momentum.

**Footwork.** Feet are planted in the world and take discrete steps: the lead foot steps
first going forward, the rear foot going back, the near-side foot going sideways (the
other drags in), turns pivot on the lead foot, and the hips shift over the planted foot.
How a fighter moves is **contextual**: a live motion profile is re-blended every frame
from distance zones — *pocket* (toe to toe: low, tight guard, small steps, head
movement), *striking* range, *outside*/kicking range (longer stance, pawing to find
range) and *roaming* (long walking strides, hands relaxed) — then adjusted by the fight:
hurt (heavier, hands drop, rhythm dies), guard running low (shell up), a strike
incoming (plant and sit down), just got hit (cautious), pressing an advantage (stalk,
feint more), opponent down (relax). Retreating uses short gliding steps with the head
kept over the lead knee. Open the **L** panel to watch the context change live.
Between exchanges they stay alive — bouncing in rhythm, shifting weight, scanning,
pawing with the lead hand, re-stancing and throwing feints (purely visual: feints never
glow red and never trigger defenses). The player is a light-footed out-fighter; the
Brawler is a heavier plodder with shoulder rolls.

**Automatic defense.** When the enemy winds up, the character picks a reaction from the
attack's height, shape and timing: high straights → weave, hooks → duck, mid body blows →
block (costs guard), low sweeps → slide. A successful dodge opens a short **counter
window** (gold fists + ring) — attack inside it for the counter move.

**The skill is timing.** Defense only works while you are free. If you are committed to
your own attack's wind-up or recovery when the enemy's strike lands, you get hit. Fast
attacks can interrupt a wind-up (counter hit), but the Brawler's haymaker and sweep have
**armor** against light hits (orange telegraph). Red limb glow + ground ring = incoming.

## Architecture

```
src/
  sim/        deterministic 60 Hz combat simulation (no rendering, unit-tested)
    combat.ts   step loop, hit detection, block/dodge/counter resolution, events
    fighter.ts  fighter state machine + animated target pose
    moves.ts    frame data for every move and defensive reaction
    select.ts   context move selection (per button) + automatic defense choice
    ai.ts       enemy AI (per-archetype plans, spacing, strings, blocking) + director
    enemies.ts  enemy archetypes (stats, moves, style, coins)
  body/
    skeleton.ts 12-bone humanoid, forward kinematics, two-bone IK
    poses.ts    authored key poses (IK targets for fists/feet)
    animator.ts keyframe tracks that blend from wherever the body really is
    footwork.ts planted-foot stepping (step-and-drag, pivots, weight transfer)
    idle.ts     between-exchange life: rhythm, sway, scanning, paws, feints
    motion.ts   contextual movement profile (distance zones + fight-state modifiers)
    ragdoll.ts  Rapier powered ragdoll: joint "muscles" chase the animated pose;
                hits relax muscles near the impact + add impulses, then recover
  world/      dungeon generation (grid, rooms, gates), collision, dungeon visuals
  story/      story beats per loop and the escalating simulation hints
  render/     blocky low-poly fighters + gear, arena, camera, wall cutout, coins, particles
  feel/       procedural impact audio (WebAudio, no assets)
  input/      rebindable keyboard, mouse, gamepad and touch input
  game/       glue: fixed-step loop, run flow (rooms, coins, terminal, shop, loops),
              economy + save data, tutorial
  ui/         HUD, settings (key rebinding), shop, end-of-dungeon choice
  debug/      Tweakpane live tuning (frame data, feel, physics, AI)
```

**Gameplay truth vs. visuals.** Hits are decided by the sim against the *animated* pose,
so outcomes are exact and readable. The visible body is a physics ragdoll that follows
that pose, which is where the weight and mutual reactions come from. Physics can never
make a correct move miss.

## Tuning workflow

Open **L**, enable *training dummy* to practise on a passive target, adjust frame data /
hit-pause / impulses live, then **Copy tuning as JSON** and paste the values back into
`src/sim/moves.ts` (or ask Claude to). The reach regression test
(`tests/reach.test.ts`) fails if a pose change makes a move's declared reach dishonest.
