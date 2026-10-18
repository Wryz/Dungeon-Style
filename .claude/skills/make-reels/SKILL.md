---
name: make-reels
description: Produce finished, ready-to-upload Instagram Reels / TikToks / YouTube Shorts for a video game from its own repo. Capture real gameplay frame by frame with the game's sound in sync, cut it to the beat of music in the trending style with Remotion, add viral-style captions, an end card and covers, and deliver MP4s plus captions and hashtags. Use this whenever the user wants reels, shorts, TikToks, trailers, promo clips, gameplay montages or social videos for their game, even if they don't say "reel" (e.g. "make some content for Instagram", "I need clips to promote my game", "edit a hype video from gameplay").
---

# Make reels for a game

Make three ~20 s vertical reels (1080×1920, 30 fps) from real gameplay of the game in
this repo, ready for the user to upload by hand. The user expects finished, post-ready
videos, not a plan. Work end to end, check your own output visually, and only stop for
decisions that are truly theirs.

The method was proven on a three.js fighting game (DungeonStyle). Everything here
generalizes. The bundled scripts and template are the working code from that run.

## What "good" means here
- **Real gameplay with real sound in sync.** The game's own hits, crunches and crowd at the
  exact frame. Captured footage, no mock-ups.
- **Smooth.** Frame-stepped capture, so a slow headless renderer doesn't matter.
- **On the beat.** Every cut on a measured beat, the big hit landing just after it.
- **Hook in the first second, payoff, loop.** The opening frame already has action and a
  hook line. Each reel ends on the logo + "LINK IN BIO" and a flash that loops cleanly back into the start.
- **Viral styling.** Big condensed caps (Anton, bundled), heavy black outline, key words in
  the game's brand colours, punch zoom + flash + shake on every cut, vignette.
- **Honest.** Keep the game's content as it is (gore included unless told otherwise).
  Say what you couldn't verify (e.g. trending songs' tempos) and point out weak shots.

## Workflow

### 0. Recon (short)
Find out what the game is, how it runs and how it's built: engine, how a frame is updated
and rendered, where sound goes, how player input is read, how levels/rounds/enemies/
weapons are chosen, whether a debug/dev hook exposes the game object, any cinematic or
slow-mo camera, the brand assets (logo, colours) and the game's name. Check the
container: `nproc`, `free -g`, `ffmpeg -encoders | grep 264`, Chromium/Playwright
(`ls /opt/pw-browsers`, `npm root -g`), outbound npm.

Pick 3 concepts that suit this game. Patterns that work:
- **Tour**: "every level/round is a new X", one finisher per place.
- **Ranking / tier list**: weapons, characters, items, worst to best, coloured tier tags,
  "what's your S tier?".
- **Escalation**: "they keep getting bigger/harder", bosses walking in, then each going down.
- Others: "POV: …", fails vs wins, "1 vs 100", before/after progression.

Each needs a hook line, per-cut captions and a comment-bait question. Plan the shot list
from the concepts (which level, loadout and opponent gives each moment).

### 1. Capture
**Web games** (three.js, Babylon, Phaser, PixiJS, canvas…): read
`references/director-contract.md`, then set up in the repo:
```
reels/capture/capture.cjs   ← scripts/capture.cjs
reels/capture/batch.sh      ← scripts/batch.sh
reels/capture/director.js   ← scripts/director-template.js, filled in for this game
reels/shots.json            ← [{ "name": "a_level1", "level": 1, "weapon": "…", "enemyHp": 0.4, "seconds": 22, "tail": 3 }, …]
reels/stage.sh, reels/render.sh, reels/inspect.sh ← scripts/
```
`references/director-example-dungeonstyle.js` is a complete working director to crib
from. Serve a **production build** (`vite build && vite preview --port 5173`, or any static
server). A dev server's hot reload kills takes the moment anything in the repo changes.
Any change to the game itself should be a small, clean hook that doesn't affect
players (e.g. a way to point the sound engine at another audio context). Mention it in
the commit.

**Other engines** (Unity, Godot, native): read `references/capture-native.md`.

Then:
1. **Test one take first** (one shot, `seconds` ~6–10), and look at it:
   `reels/inspect.sh reels/out/<take>.mp4 0 99 3` → contact sheet with timestamps. Fix
   framing (both subjects in frame, not hidden behind the player, not inside props),
   the autopilot (is it actually fighting?) and the KO detection before the batch. One bad
   assumption multiplied by 15 takes costs an hour.
2. **Batch**: `OUT=reels/out JOBS=3 GAME_URL=… reels/capture/batch.sh` (3 jobs on 4 cores;
   expect ~1–1.5 s per frame per job in software WebGL). Run it in the background and
   watch its log with a Monitor on `done:|Error|error`. While it runs, do the music
   research and set up the edit.
3. **Inspect every take** and re-shoot the bad ones (no KO, camera blocked, player died).
   Common fixes: lower `enemyHp`, add `finishAfter`, a different level or loadout.
   Protect good takes from being overwritten by re-runs (copy them to a `final/` folder).

### 2. Music
Read `references/music.md`. In short: research what's trending for the genre (a
background subagent is good for this), download 2–4 royalty-free tracks in that style
(CC0 / CC BY, with `CREDITS.md`), measure beat grids (`scripts/beats.py`), choose ~20 s
windows from the loudness map, and splice a bed with `scripts/bed.py` if needed.

### 3. Edit (Remotion)
Load the Remotion skill (`remotion:remotion-best-practices`) if it's available. Copy
`assets/edit/` to `reels/edit/` and run `npm i` there (it includes Anton.ttf; Remotion's
renderer may not reach Google Fonts). Then:
- `public/brand/logo.png` ← the game's logo. Set the brand colours in
  `src/reel/Caption.tsx` (`ACCENT`, `HOT`, `CREAM`, `INK`) from the logo/brand files.
- `reels/stage.sh reels/final` → copies takes into `public/footage/` and writes
  `src/takes.json` (KO time and length of every take).
- Write the three timelines in `src/reels.ts` (it has an example). A segment is
  `{clip, from, beats, text?, sub?, accent?, hits?, rate?, push?}`. `koCut(take, beats)`
  opens 0.3 s before a take's KO so the blow lands just after the cut. Start each reel on
  action. Use the game's own slow-motion cuts as money shots. `hook` holds a line over the
  first bars. `title` is the game's name on the end card, and `endBeats` sets how long the
  end card runs over the last cut. If the end card falls in the music's quiet stretch,
  the loop slams back into the drop.
- `npx tsc --noEmit`, then `npx remotion compositions`, which also warns if any cut runs past
  the end of its take (that would freeze).
- Render one reel, make a contact sheet (`ffmpeg -i R.mp4 -vf "fps=2,scale=180:-1,tile=11x4"`)
  and **look at it**. Check for captions colliding, blocked shots, empty frames at the
  start of takes (the camera settling), and captions left on under the end card. Fix,
  then render everything.
- Covers: a striking still per reel in `public/stills/` (ffmpeg `-ss T -frames:v 1`),
  set in `COVERS`. The title stays in the centre band so it survives the profile grid's
  crop.

### 4. Render & deliver
`reels/render.sh` (all reels, `-game-sound` versions and covers) → `media/reels/`,
mastered to −14 LUFS. Verify with ffprobe (1080×1920, 30 fps, h264/aac, ~20 s) and
`ffmpeg -af ebur128`. Write `media/reels/CAPTIONS.md`: for each reel, the caption
(hook, a line of context, the comment-bait question, "🎮 Link in bio"), ~8 hashtags, alt
text, the music credit line, and the suggested trending sound + where to start it for the
`-game-sound` version. Add posting tips: one reel a day, strongest first, and reply to
comments.

Commit the pipeline (`reels/`), the tiny game hook and the outputs, and push. Send the
user the three main reels, the covers and CAPTIONS.md (SendUserFile, if available).
Then give a short summary: what each reel is, what's baked in versus the game-sound
versions, any weak shots, and how to make the next batch.

## Hard-won gotchas
- `<canvas id="game">` makes `window.game` the canvas until the real object exists, so
  test for a property only the game object has.
- With `requestAnimationFrame` stubbed, Playwright's `waitForFunction` never re-polls. Use
  `{ polling: 500 }` (capture.cjs does).
- Dev servers with hot reload reload the page when repo files change (scaffolding Remotion
  is enough to trigger it). Capture against a production build.
- `xargs -P` stops launching new jobs once one is killed or fails (batch.sh guards this
  with `exit 0`). Killing a capture leaves orphaned headless browsers, so kill those whose
  parent is PID 1.
- Edits to `director.js` only affect takes that **start** afterwards.
- `canvas.toDataURL` and page screenshots are 3–5× slower than `gl.readPixels`.
- Some finishes don't go through the game's KO-mark path. Also detect the KO from the sound.
- raw.githubusercontent.com may be blocked. Fonts come from fonts.gstatic.com
  (`curl "https://fonts.googleapis.com/css2?family=Anton"` gives the TTF URL).
- Cluttered levels (shelves, pillars) block cinematic cameras. Prefer open levels for
  money shots, or cut around the blocked frames.
- The first ~1–2 s of a take is often the camera settling or an intro. Don't open a cut there.

## Bundled files
- `scripts/capture.cjs`: Playwright + ffmpeg frame-stepped capture driver (web).
- `scripts/director-template.js`: the director to fill in. Its contract is in
  `references/director-contract.md`.
- `scripts/batch.sh`, `scripts/stage.sh`, `scripts/render.sh`, `scripts/inspect.sh`.
- `scripts/beats.py` (beat grid + loudness map) and `scripts/bed.py` (beat-aligned bed splice).
- `assets/edit/`: the Remotion project (Reel with beat-cut segments, punch/flash/shake,
  captions, hook, end card, game-sound twin, covers, cut-length validation, Anton font).
- `references/director-example-dungeonstyle.js`: a complete working director.
- `references/capture-native.md`: Unity / Godot / other engines.
- `references/music.md`: trending research, licences, beat grids, mastering.
