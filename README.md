# Roguelike Brawler

A 3D low-poly roguelike where combat is automatic and physics-driven: **you only choose
when and how to attack — the character defends on its own.** Fight round after round,
one on one, in a gladiator gauntlet whose arena keeps changing — a boxing ring, the
street, a grocery store, the Roman colosseum — against tougher and tougher opponents,
demons and giant bosses.

## What's in

- **Combat:** context-sensitive punches and kicks, automatic block/duck/weave/slide,
  counters, powered-ragdoll hit reactions, boxer footwork and contextual movement
  (distance zones + fight state), hit-pause, shake, procedural audio, blood and facial
  damage that build up with punishment.
- **The gauntlet:** one opponent at a time; each round swaps the arena theme (ring →
  street → grocery store → colosseum) and the opponents get tougher; every 4th round is
  a **boss** in the colosseum.
  Falling sends you back to round 1 — coins and gear stay. Your best round is saved.
- **Opponents:** Rookie (quick jabs), Brawler (haymakers), Kicker (teep / low kick /
  body roundhouse), Bruiser (slow, armored, heavy), and from round 6 mythical creatures:
  **Imps** (small, fast swarmers) and **Demons** (horned heavy hitters). Humans dress for
  the venue — trunks and gloves in the ring, hoodies on the street, aprons in the store,
  helmets in the colosseum.
- **Bosses (giants):** The Champion (1.6×), The Minotaur (1.75×, horns and snout) and
  The Cyclops (1.85×). Size scales reach, step length, mass and hit weight.
- **Economy:** KOs burst into coins and each cleared round pays a bonus; between rounds
  a shop sells helmet, chestplate, leggings, boots and fist cuffs (3 tiers each) that
  change your stats and show on your character. Progress is saved in the browser.
- **Weapons:** every arena has weapons lying around — a folding chair in the ring, a
  bat and a machete on the street, a cleaver and a frying pan in the grocery store, a
  gladius and a battle axe in the colosseum. Walk over one and press **G** to grab it
  (G again swaps, or drops it). Each weapon is used the way it really is: the cleaver
  hacks in short chops from by the ear, the machete cuts diagonally (forehand into
  backhand), the gladius stabs point-first behind a lunge, and the heavy chop / smash
  is on E; two-handed weapons sweep wide and smash down with a slow, armoured
  overhead. Kicks stay kicks.
- **Strikes stop at the body:** nothing passes through anyone. A weapon is solid for its
  whole swing; how hard it lands depends on where in the arc it meets the body (still
  accelerating, or caught on the haft at point-blank range, it just knocks or thuds).
  Edges bite in and stick — held, then wrenched free; draw cuts bite briefly; fists,
  feet and blunt weapons rebound. Only a miss, a blow that cleaves clean through, or one
  that drives the target off their feet carries through. Edged weapons
  leave lasting cuts that keep bleeding (and slowly drain health — enough of them and
  your opponent bleeds out); heavy edges take arms, legs and heads off, and the limb
  flies free as a physics body while the stump pumps blood. Your own limbs only come
  off with the blow that finishes you. Enemies pick weapons up too; the Minotaur
  carries an axe and the Cyclops a spiked club. Blocking a blade costs a forearm cut.
- **Size-aware fighting:** every strike is fitted to the opponent actually in front of
  you — aimed at where their head, body and legs really are, shortened to the
  distance between you, with the body rising and looking up at a giant or sinking,
  leaning in and looking down at something small. Out-of-reach targets (a giant's
  head) are passed over for ones you can hit; giants strike down at you. Your eyes
  stay on your opponent's face.
- **Camera cuts:** big moments cut to a cinematic camera with slow motion and letterbox
  bars — limbs and heads coming off (close, near-frozen), the finishing blow (low and
  from the side, following them down), huge hits (a quick punch-in), your death (from
  above, colour draining, red vignette), the win (you, arms up, from just below) and
  each boss's entrance (a low angle looking up at the giant).
- **Movement:** in a fight, boxer footwork; out of range, a real run (~3.8 m/s) with a
  clocked stride, flight phase, forward lean and pumping arms.
- **Tutorial:** the first visit is a warm-up in the ring against a sparring partner —
  punches, a combo, automatic defense, countering, kicks — with few-word prompts.

A training ring with a respawning brawler is at `?mode=training` (or the **L** panel →
Gauntlet, which can also jump to any round; **Weapons** puts any weapon in your hands).

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
| Grab / drop weapon | **G** | | R3 / Back | |
| Skip warm-up | **Enter** | | | |

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

**Walking vs fighting.** Out of range (no opponent within ~4.6 m) the character walks
like a person: turns to face where it goes, feet side by side alternating and passing,
square hips, arms swinging. As an opponent closes in it blends into the fighting stance
and boxing footwork.

**Blood.** Damage accumulates per fighter. Fresh fighters don't bleed; once the head has
taken enough (hooks and uppercuts to the jaw count most) head shots spill blood from the
mouth or nose, deep damage opens a cut over the brow and keeps them dripping, and heavy
body shots — kicks above all — make a beaten fighter cough blood. Drops stain the floor
and faces bruise. Toggle it in **Settings → Options → Blood effects**.

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
    weapons.ts  weapons, armed techniques, blade geometry, wounds and dismemberment
  body/
    skeleton.ts 12-bone humanoid, forward kinematics, two-bone IK
    poses.ts    authored key poses (IK targets for fists/feet)
    animator.ts keyframe tracks that blend from wherever the body really is
    footwork.ts planted-foot stepping (step-and-drag, pivots, weight transfer)
    idle.ts     between-exchange life: rhythm, sway, scanning, paws, feints
    motion.ts   contextual movement profile (distance zones + fight-state modifiers)
    ragdoll.ts  Rapier powered ragdoll: joint "muscles" chase the animated pose;
                hits relax muscles near the impact + add impulses, then recover
  arena/      arena themes (shape, props, spawns) and their visuals (crowds, lights)
  world/      walkable areas and obstacle collision
  render/     blocky low-poly fighters + gear + creature parts, looks per venue, camera,
              wall cutout, blood, coins, particles
  feel/       procedural impact audio (WebAudio, no assets)
  input/      rebindable keyboard, mouse, gamepad and touch input
  game/       glue: fixed-step loop, gauntlet flow (rounds, bosses, coins, shop, weapons),
              round generation, economy + save data, trauma/blood, tutorial
  ui/         HUD, settings (key rebinding, blood toggle), shop
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
