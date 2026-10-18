---
name: make-reels
description: Produce finished, ready-to-upload Instagram Reels / TikToks / YouTube Shorts for a video game from its own repo. Capture real gameplay with the game's sound in sync, research trending music for the genre, edit to the beat (Remotion), design a look that fits the game, and deliver MP4s, covers and post captions. Use this whenever the user wants reels, shorts, TikToks, trailers, promo clips, gameplay montages or social videos for their game, even if they don't say "reel" (e.g. "make some content for Instagram", "I need clips to promote my game", "edit a hype video from gameplay").
---

# Make reels for a game

Make short vertical videos (default: three reels, ~20 s, 1080×1920, 30 fps) from real
gameplay of the game in this repo, finished and ready for the user to upload by hand.
Work end to end, check your own output visually, and only stop for decisions that are
truly theirs.

This skill is a **process**, not a house style. Every game is different, so its reels
should look and feel like that game. Don't reuse fonts, colours, caption treatments or
edit templates from other games' reels. Design them fresh from this game's identity.

## 1. Understand the game and its identity
- **What it is and why it's fun.** The genre, the core loop, the most impressive or
  surprising moments, what's unique. Read the README, the code and any store/press text.
- **How it runs.** The engine, how a frame is updated and rendered, where sound goes, how
  input is read, how levels/characters/items are chosen, any debug hooks or cinematic or
  slow-motion cameras.
- **Its look and voice.** The logo and brand files, its colour palette, the typefaces its
  own UI uses (bundled font files are the best source), and the tone: cosy, brutal,
  goofy, eerie, sleek. This drives every style decision later.
- **The container.** `nproc`, `free -g`, `ffmpeg -encoders | grep 264`, whether
  Chromium/Playwright is installed (`ls /opt/pw-browsers`, `npm root -g`), whether npm
  can reach the network, whether the engine CLI is present.

Then pick concepts that suit this game. Common shapes: a tour ("every level is
different"), a ranking or tier list, an escalation ("it keeps getting harder"),
"POV:", fails vs wins, progression (before and after). Each needs a hook in the first
second and a reason to comment or rewatch. Plan a shot list from them: which level,
setup or moment produces each beat of the story.

If the user gave constraints (content rating, things to show or avoid, a style
reference), they override everything here.

## 2. Capture real gameplay, smooth and in sync
The principle: **step the game a fixed 1/30 s per frame** instead of recording in real
time, so the footage is smooth however slow the renderer is (headless containers render
in software). Capture the game's **own sound in sync** by logging every sound call with
its game time and rendering that log offline afterwards. Let the player play on
**autopilot** so takes have action, and make sure takes **end on the key moment** (a
win, kill, goal, combo, crash).

- **Web games** (three.js, Babylon, Phaser, PixiJS, canvas): read
  `references/director-contract.md`, then use `scripts/capture.cjs` (Playwright +
  ffmpeg), `scripts/batch.sh` (parallel takes from a `shots.json`) and
  `scripts/director-template.js` (the game-specific hooks you write). Serve a
  **production build**: hot reload kills takes. For concrete code of every hook, see
  `references/director-example-dungeonstyle.js`, a working director for one fighting
  game. Take its techniques, not its gameplay choices.
- **Other engines**: read `references/capture-native.md` (Unity `captureFramerate` /
  Recorder, Godot Movie Maker, fallbacks).

Any change to the game itself should be a small, clean hook that doesn't affect
players. Mention it in the commit.

Frame the action for 9:16. The game's normal camera is usually framed for landscape, so
re-place it for portrait and keep the subject(s) large and unobstructed. If the game has
cinematic or slow-motion moments, they're usually the best footage.

**Test one short take first** and look at it (`scripts/inspect.sh` makes a timestamped
contact sheet). Fix framing, autopilot and key-moment detection before the batch; one bad
assumption multiplied over many takes wastes an hour. Then run the batch in the background
(watch its log for `done:` / errors), **inspect every take**, and re-shoot the bad ones.

## 3. Music
Read `references/music.md`. Research what's trending on Reels/TikTok for this game's
genre and mood. Never bake copyrighted songs into the file (Instagram mutes or blocks
them). Bake in royalty-free tracks in the trending style (CC0 / CC BY, with a credits
file), and also make a **game-sound-only version** of each reel for adding the trending
song in Instagram's audio picker. Measure each track's beat grid (`scripts/beats.py`) and
cut on measured beats. `scripts/bed.py` splices a track on beat boundaries when the window
you want runs into a long break.

## 4. Design and edit
Use Remotion (load `remotion:remotion-best-practices` if available) or another
programmatic editor. Set up a fresh project for this game. **Design the look from step 1:**
- **Type.** Use the game's own fonts if it ships them, otherwise pick open-licence fonts
  (Google Fonts, SIL OFL) that match its tone. Bundle the font file locally: the renderer
  may not reach font CDNs (fonts.gstatic.com usually works with curl;
  raw.githubusercontent.com may not).
- **Colour.** From the game's palette and logo.
- **Captions and motion.** Fit the tone: a cosy game wants soft, rounded and gentle; an
  action game can be punchy; a horror game sparse and unsettling. Short-form basics still
  apply: readable on a phone at a glance, inside the safe area (Instagram's buttons cover
  the right edge and the bottom ~20%), and on screen long enough to read.
- **Structure.** Hook in the first second, payoff, then the logo and call to action,
  ending so the loop back to the start feels intentional.

Mechanics worth carrying over:
- Timelines as data, with cuts placed on measured beat times.
- Key moments land just after a cut.
- A check that no cut runs past the end of its take (that freezes).
- A game-sound-only twin of each composition.
- Covers that keep the title in the centre band, so the profile grid's crop keeps it.

**Render one reel, make a contact sheet and look at it** before rendering the rest.
Check overlapping text, blocked or empty shots, captions under the end card, and pacing.

## 5. Render and deliver
`scripts/render.sh` shows the mastering step: about −14 LUFS and −1.5 dBTP (Instagram's
playback level), with a compressor before loudnorm for game-sound-only versions. Verify
the outputs (resolution, fps, codecs, duration, loudness).

Write a captions file. For each reel: the post caption (hook, a line of context, a
question that invites comments, the call to action), hashtags, alt text, the music
credit, and the suggested trending sound plus where to start it. Commit the pipeline, the
game hook and the outputs, push, and send the user the videos, covers and captions.
Then summarize: what each reel is, the baked-music vs game-sound versions, any weak
shots, and how to make the next batch.

## Gotchas from the first run (web capture)
- An element with `id="game"` makes `window.game` resolve to the element until the real
  object exists, so test for a property only the game object has.
- With `requestAnimationFrame` stubbed, Playwright's `waitForFunction` never re-polls.
  Use `{ polling: 500 }`.
- `canvas.toDataURL` and page screenshots are 3–5× slower than `gl.readPixels`.
- `xargs -P` stops launching after one job dies. Killed captures leave orphaned headless
  browsers, so kill those whose parent is PID 1.
- Edits to the director only affect takes that **start** afterwards.
- Some key moments bypass the game's usual event path (e.g. a fatal blow vs a normal KO).
  Detect them from the sound log too.
- Forced cinematic cameras can end up inside props in cluttered levels. Respect the
  game's line-of-sight checks, or cut around the blocked frames.
- The first second or two of a take is often the camera settling. Don't open a cut there.
