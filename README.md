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
- **The gauntlet:** one opponent at a time; every round is a new arena and a tougher
  opponent; every 4th round is a **boss** in the colosseum. Regular rounds cycle
  through seven arenas: the boxing ring, the street, a grocery store, an underground
  warehouse fight club, a biker bar, a dojo and a city rooftop at night — each with its
  own props, floor sound, ambience and locals.
  Falling sends you back to round 1 — coins and gear stay. Your best round is saved.
- **Opponents, each with a fighting style of its own** (see *Fighting styles* below):
  Rookie, Brawler, Kicker, Bruiser, **Samurai** (katana) and **Ninja** (ninjato and
  throwing knives), and from round 6 mythical creatures: **Imps** (small acrobats) and
  **Demons** (horned stalkers that pounce). Humans dress for the venue — trunks and
  gloves in the ring, hoodies on the street, aprons in the store, helmets in the
  colosseum; the samurai wears hakama and a topknot, the ninja black with a mask.
- **Bosses (giants):** The Champion (1.6×), The Minotaur (1.75×, horns and snout) and
  The Cyclops (1.85×). Size scales reach, step length, mass and hit weight.
- **Economy:** KOs burst into coins and each cleared round pays a bonus; between rounds
  a shop sells helmet, chestplate, leggings, boots and fist cuffs (3 tiers each) that
  change your stats and show on your character. Progress is saved in the browser.
- **Weapons:** every arena has weapons lying around — a folding chair in the ring, a
  bat and a machete on the street, a cleaver and a frying pan in the grocery store, a
  crowbar and a sledgehammer in the warehouse, a pool cue and a beer bottle in the bar,
  a katana and a bokken in the dojo, a lead pipe and a fire axe on the rooftop, a
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
- **Real timing and reactions:** heavy weapons are slower to bring round, giants move
  their limbs slower (like a longer pendulum) and small creatures quicker. A straight
  snaps the head back, a hook whips it round away from the blow, an uppercut throws the
  chin up, a body shot folds you, a liver shot caves in the right side. Armed fighters
  keep their weapon's distance — crowded, they back out or push you off with a teep —
  and every weapon blow is aimed so the edge / head lands, not the haft.
- **Sound:** footsteps that match the floor (canvas, asphalt, tile, sand; giants thud),
  fighters exhale on every strike and grunt when a big one lands, punches slap the face
  and thud into the body, a bat knocks, a pan rings, a chair clatters, an axe chops.
  The crowd gasps and roars at knockdowns and severed limbs; the bar's jukebox, the
  store's fridges and the warehouse's lights hum. No continuous background hiss. All
  procedural.
- **Presentation:** no game-style sparks on flesh — sweat flies off a face that gets
  hit. Hit flashes, telegraph rings, glowing limbs and popups are optional
  (Settings → Combat cues, off by default).
- **Small things:** the head stays level and faces where the eyes need to be (the neck
  soaks up the hips' and shoulders' swing; it turns to keep the opponent in view).
  Eyes blink, screw shut for a moment when hit, squint as a strike comes in and close
  when knocked out. A jab barely moves a head, a full power shot snaps it. Stamina:
  every strike, defence and sprint costs gas and body shots empty the tank — a tired
  fighter punches slower, drops the hands, loses the bounce, heaves for breath (you
  hear yourself panting) and throws less; easing off brings it back. Skin goes from
  dry to glistening as a fight wears on (and more sweat flies off a soaked face),
  blades stay red and drip after cutting, gloves pick up blood from a bleeding face,
  sand kicks up underfoot in the colosseum, and hits don't freeze time.
- **Movement:** in a fight, boxer footwork; out of range, a real run (~3.8 m/s) with a
  clocked stride, flight phase, forward lean, pumping arms and a lean into turns.

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
It's a read, not a guarantee. Fresh, against one opponent's first strike, most are seen
coming. Each of these lets more get through: tiredness, being rattled by the last hit,
the second and third strikes of a string, quick jabs, and a second attacker swinging
at the same time. Standing still against a brawler, about one strike in five lands.

**The skill is timing.** Defense only works while you are free. If you are committed to
your own attack's wind-up or recovery when the enemy's strike lands, you get hit. Fast
attacks can interrupt a wind-up (counter hit), but the Brawler's haymaker and sweep have
**armor** against light hits (orange telegraph). Red limb glow + ground ring = incoming.

**Solid bodies.** Fighters are capsules (head, trunk, arms, legs), not just two circles:
trunks, heads, upper arms and legs push each other apart (gloves and forearms are allowed
to meet guard-on-guard), and the bigger body gives way less. A strike stops on whatever
it reaches first. A guard that's up catches it. A forearm or shin driven into the body
from too close gets smothered, and a teep thrown from there shoves. A punch that was
slipped slides off the shoulder instead of passing through the head, and a fist already
touching the target late in its wind-up lands early. Fists, feet and weapons that hit a
pillar, crate or car stop on it, with a knock or a few sparks. Weapons never pass through
the person holding them or rest inside the opponent. A dodged swing rides over the body
it missed, and a re-aimed overhead still goes up and over the top. Furniture is padded
for knees and feet. Every obstacle has a height, so a counter-height table is solid to a
fist but not to something that passes above it. A fighter who goes down is solid to the
one still standing, so they fall against them, not through them. `tests/collision.test.ts`
runs AI-vs-AI fights across arenas and fails if bodies, limbs or weapons pass through
each other or the scenery.

**Human timing and motion.**
- **Defence:** people read a strike and start moving a beat before it lands (~150–200 ms),
  timed to arrive with it, rather than snapping out of the way in the last frames.
- **Hit reactions:** the head goes with the blow at once (the ragdoll takes the impulse),
  and the rest of the body follows over ~70–100 ms.
- **Strike speed:** strike keyframes ease in and out smoothly, so fists and feet peak
  around real speeds instead of jumping in a single frame.
- **Footwork:** a stride lifted at walking pace quickens with the cadence when you break
  into a run (no lurch). Feet step round each other when turning, and they stay planted
  and step to recover under a hit reaction (no gliding). The turn slows while the legs
  are crossed.
- **Arms:** the limb solver keeps an arm's roll and elbow plane continuous, so elbows
  don't flip from frame to frame. Elbows go back when the hands are low, out and
  forward when they're raised.
- **Two-handed weapons:** the lead hand slides along the haft to wherever it can reach,
  and running with one doesn't pump the shoulders.

**Weapons have weight.**
- **Mass:** every weapon has a mass (machete 0.6 kg, axe 2.6, sledgehammer 4.5). How
  heavy it is depends on who holds it: mass over strength, and strength grows with body
  size squared. A giant swings an axe like you'd swing a light weapon.
- **Grip:** heavy two-handers are held like tools. The rear hand holds the end of the
  handle, and the lead hand rides up under the head to hold, carry and wind up the
  weight. It slides back down to meet the rear hand as the swing comes through. Swords
  keep their hands a hand's width apart.
- **The head holds its orientation:** a weapon is rigid in the hands, and a heavy head
  won't roll round the handle. Through a swing the edge stays in the plane of the
  swing: upright for an overhead, level for a sweep. At rest the head hangs upright, and
  it twists only as fast as the wrists can turn that weight.
- **Picking one up takes time:** turn to it, step in, squat and bend over it (two hands
  for a two-hander), grab it, and rise with the weight. That's ~0.4 s for a machete and
  ~0.8 s for a sledgehammer. Get hit before your hands close on it and it stays on the
  floor.
- **Heavy to swing and carry:** heavier means slower swings that cost more stamina,
  slower stamina recovery while you hold it, and slower walking. A heavy swing that
  meets nothing drags you on a step and takes longer to recover from.

**Mass and gravity.**
- **Knockback is momentum:** a blow's push is the attacker's strength (body size squared)
  against the defender's mass (size cubed), times the weapon's mass and swing speed.
  The same cross moves an imp ~31 cm, a man ~16 cm and the Minotaur ~5 cm. A giant's
  punch sends you flying, and blocking a sledgehammer drives you back further than the
  same swing with a bat.
- **Bodies have inertia:** giants take a while to get going and to pull up, small
  creatures dart, and carrying something heavy adds to it.
- **Things fall:** a weapon let go of (dropped, or the arm cut off) falls from the hand
  under gravity, tumbling less the heavier it is. It bounces, settles, and clatters by
  mass and material: metal rings, wood knocks.
- **Landings:** a knocked-down body thuds when it actually hits the floor, deeper the
  heavier it is. It raises dust, and a giant landing jolts the camera. A body that
  falls against someone still standing slides off them to the floor.
- **Feel:** a giant's footsteps jolt the camera when it's close. A heavy weapon held
  in guard sags, more as the arms tire. Carrying a heavy two-hander, the body leans
  back against it. Heavy weapons land with a longer impact pause and a bigger jolt.
  `tests/gravity.test.ts` covers the sim side.

**Fighting styles.** Every opponent fights its own way: its own techniques, a
temperament, and particular ways with particular weapons.

| Opponent | Temperament | Signature techniques |
|---|---|---|
| Rookie | sloppy: backs off flinching after every hit | pawing jabs, a wild looping **haymaker** when hurt |
| Brawler | pressure | hooks and body shots, grabs what's lying around and **throws** it |
| Kicker | pressure | teeps and low kicks, **spinning back kick** in close, **jumping kick** to close in |
| Bruiser | pressure | **shoulder charge** at a run, **stomp** |
| Samurai | patient: waits just out of reach | katana: **kesa-giri**, **men**, **tsuki**; a **draw cut** when you step in or whiff |
| Ninja | skirmish: in, cut, sprint back out | **kunai** off the belt from range, **dash slash**, **flip slash**, **back flip** away |
| Imp | skirmish | **back flip** out of trouble, **front flip heel drop** |
| Demon | skirmish (stalks) | hooks and straights, **pounce** from out of reach, spinning back kick |
| Champion | pressure | combinations, **superman punch** |
| Minotaur | berserk: angrier the more it's hurt | axe sweeps, overheads, **spinning cleave**, **axe throw** — then a head-down **charge** while he goes to get it back |
| Cyclops | pressure | huge sweeps, pounding overheads, **stomp**, the odd **club throw** |

All of it is physical:
- **Jumps and flips** follow a real ballistic arc: how high is set by how long they
  are in the air (h = g·t²/8). The take-off speed is fixed and there's no steering in
  the air. A flip turns the body about its centre of mass at a steady rate. Hit in
  mid-air, a fighter goes down. A body flying into someone stops against them.
- **Spins** turn the whole body under the weapon. A giant pitches its spin down to a
  man's chest rather than sweeping over his head. A spinning back kick stops turning
  while the leg drives out, then finishes the turn.
- **Thrown weapons** are rigid bodies: gravity, end-over-end spin, sub-stepped
  collisions. An axe cuts only if the edge is leading when it arrives. A practised
  thrower judges the spin for the distance, so it does from where they stood. Step in
  or out and it may arrive handle-first. Knives fly point first. Damage comes from
  kinetic energy, reckoned at a man's size as it is for blows in the hand. The push
  comes from momentum, all of it into the body: Δv = p / (M + m). Automatic defence reads things thrown at
  you (a big axe more readily than a small knife). Anything thrown ends up on the
  floor for whoever gets to it first.

**Fighting logic.**
- **Steering:** enemies walk round props instead of pressing into them.
- **Blocking:** enemies only block what a guard can stop, and need an arm to do it. An
  armless enemy kicks.
- **Armed moves:** a weapon technique wins a name clash with an unarmed move ('sweep'
  is an axe swing when armed, not a leg sweep).
- **Dodges:** a dodge only counts if the strike was really coming.
- **Same-frame hits:** a second contact on the same frame can't land on someone already
  down. `tests/review.test.ts` covers these.
- **Armed spacing:** an armed enemy stands where the head of its weapon meets you, not
  the handle. It only counts as crowded when even the near end of the head can't land.
  Backing off, it circles away from walls and corners instead of backing into them.
  When pinned anyway, it shoves or swings short with the haft.
- **Size:** distances allow for a bigger body's bulk. A small creature doesn't throw at
  a giant's head (it can't reach it); it goes for the legs.
- **Weapons on the floor:** enemies only bend down for one when you're out of reach,
  down or busy. They leave what they couldn't fight with (an imp won't take a
  sledgehammer).
- **Stamina:** a gassed enemy gives ground and gets its breath back before going
  again. An armless one mixes teeps and low kicks rather than only sweeping.
- **Axe edges:** an axe cuts only with its head. The handle knocks, and a hit on the
  haft still carries the weapon's mass. Light weapons push at least as hard as a fist.
  `tests/fightAI.test.ts` covers these.

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
              round generation, economy + save data, trauma/blood
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
