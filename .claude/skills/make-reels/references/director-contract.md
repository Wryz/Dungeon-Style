# The director contract (web games)

`scripts/capture.cjs` loads the game page with `requestAnimationFrame` stubbed out, injects
the director (before the game's own scripts run), waits for `__reel.ready()`, then drives
it. The director defines `window.__reel` with:

| Member | Called | Must |
|---|---|---|
| `ready()` | polled every 500 ms after load | Return true once the game object exists and can be driven. |
| `setup(shot)` | once | Apply the shot (level, loadout, difficulty), install the hooks below, start the fight/level. |
| `step()` | once per output frame | Advance the game exactly 1/30 s (update **and** render) and return that frame's pixels as a `Uint8Array` (RGBA, W×H×4; WebGL rows bottom-up, which capture flips with `vflip`; set `VFLIP=0` if yours are top-down). |
| `state()` | after every step | Return `{ frame, t, koAt, over }`. `koAt` is the take time (s) of the finishing blow, or -1. `over` is true if the take can't produce anything more. Capture stops `shot.tail` seconds after the KO, at `over`, or at `shot.seconds`. |
| `renderAudio(seconds)` | once at the end | Return 16-bit stereo WAV bytes of the take's sound (or null). |
| `events`, `marks`, `koAt` | read at the end | Sound log `[{t, name, args}]`, moments `[{t, kind, label}]`, KO time. Saved to `<take>.json`. |

## The hooks, and why each matters

- **Frame stepping.** The game's loop must not run on its own (rAF is stubbed). Call its own
  per-frame function with a fixed dt. If it has an accumulator or fixed-step physics,
  driving the outer frame function with dt = 1/30 is fine. Headless software WebGL renders a
  1080×1920 frame in ~0.4 s; stepping makes that irrelevant to the result.
- **Pixels.** `gl.readPixels` straight after the frame's render (same task, so no
  `preserveDrawingBuffer` needed). Don't use `canvas.toDataURL` or page screenshots: both
  are ~3–5× slower. Hide HTML HUD/overlays with CSS (they're not in the GL canvas anyway).
- **Sound log.** Replace every method of the game's sound object with one that pushes
  `{t, name, args}` and doesn't play. Only top-level calls get logged because the originals
  never run, so internal helper calls aren't doubled on replay. Then `renderAudio` makes a
  fresh instance of the same sound class, points it at an `OfflineAudioContext`, and
  replays each event at its time using `ctx.suspend(t).then(() => { play; ctx.resume() })`
  (times quantised to 128-sample render quanta, events at t=0 played before rendering).
  This keeps the sound sample-accurate with the video. If the class only creates its own
  `AudioContext`, add a tiny `attach(ctx)` method to the game (and have its unlock path
  call it): that's the one acceptable game change. If the game plays audio **files**
  (Howler, `<audio>`, a sampler), log `{t, file, volume, rate}` instead and mix them
  afterwards with ffmpeg `adelay` + `amix`.
- **KO detection.** Hook the game's KO/kill/death handling **and** the KO sound. Some
  finishes (fatal blows, bleed-outs) don't go through the "KO mark" path, and without a KO
  time the take ends without its tail.
- **Player can't lose.** Wrap the player-death handler to revive instead (a death opens
  game-over UI and ends the take), and floor the player's HP. Lower opponent damage (~0.3×)
  so they still land hits and the damage shows.
- **Takes end on a KO.** Lower opponent HP for the shot, and after `finishAfter` (~9 s) set
  every opponent to 1 HP so the next clean hit finishes it. Weak weapons and dodgy
  opponents otherwise run out the clock.
- **Autopilot.** Wrap the input poll (or set the player's input state) and act like a
  player: move toward the opponent, attack when in reach on a ~0.3–0.6 s rhythm with some
  randomness, back off when crowded. Wait out any intro hold (a boss walk-in): killing a
  boss during its entrance wastes the take.
- **Portrait camera.** After the game's camera update, re-place the camera: look at the
  midpoint between player and opponent (opponent's ragdoll pelvis if it has one), sit
  ~65° (≈1.15 rad) off the line between them, raised ~2.5 m, back 3.7 m + 0.55× their
  separation (+ more for giants), lerped (k = 1 − e^(−3.5·dt)). Keep any screen shake the
  game adds. If the spot is outside the level, try the other side, then come closer. A
  straight over-the-shoulder view hides the opponent behind the player in a narrow frame.
- **The game's own cinematic cuts** (slow-mo KO cams, boss intros) are the best footage.
  Keep them, but pull their distance out ~1.45× for 9:16 and set their side to be square
  on to the fighters' line, on the portrait camera's side. Respect the game's own
  line-of-sight check if it has one: in cluttered levels (shelves, pillars) a forced side
  can put the camera inside props.
- **Moments.** Push `{t, kind, label}` on hits, knockdowns, gore and KO from wherever the
  game reports them (an event bus, a recorder, a HUD popup). The edit uses the KO time.

`director-example-dungeonstyle.js` is a complete, working director for a three.js +
Rapier fighting game. Read it for concrete code for every hook above.
