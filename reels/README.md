# Reels

Short vertical videos of DungeonStyle, made from real gameplay: filmed frame by frame from the game, then cut to music in [Remotion](https://remotion.dev).
Finished reels, covers and caption copy are in [`media/reels/`](../media/reels/).

## How it works

1. **Capture** (`capture/`). The production build runs in headless Chromium. Instead of letting the game loop run, `director.js` steps it one 1/30 s frame at a time, so the footage is smooth however slow the software renderer is. Each frame's pixels go straight into ffmpeg. While it films, `director.js`:
   - flies the player on autopilot (button presses as a player would make them; the character still defends itself) and doesn't let the player lose;
   - frames the fight for 9:16 and puts the game's own slow-motion cuts on the same side of the fight;
   - logs every sound call with its time instead of playing it. Afterwards that log is replayed through the game's own `Sfx` into an `OfflineAudioContext`, which gives sample-accurate sound in sync with the video;
   - logs the moments that matter (hits, knockdowns, gore, the KO).

   Each take writes `<name>.mp4`, `<name>.wav` and `<name>.json`.
2. **Stage** (`stage.sh`) copies takes into `edit/public/footage/` and indexes their KO times into `edit/src/takes.json`.
3. **Edit** (`edit/`) is a Remotion project. `src/reels.ts` holds the three timelines. Cuts are counted in beats of the music, using beat times measured from each track (`src/beats.json`). A cut usually opens a moment before a take's KO, so the blow lands on the beat. Captions are Anton (bundled, SIL OFL). Each composition also has a `-game-sound` twin for adding trending audio in Instagram.
4. **Render** (`render.sh`) renders, masters audio to −14 LUFS and writes to `media/reels/`.

## Making a new reel

```sh
npm ci && npx vite build && npx vite preview --port 5173 &   # the game, no hot reload
# add shots to reels/shots.json, e.g. { "name": "x_boss", "round": 8, "weapon": "katana", "armour": 6, "enemyHp": 0.5 }
OUT=reels/out JOBS=3 reels/capture/batch.sh x_boss            # ~1–1.5 s per frame per job on a 4-core box
reels/stage.sh reels/out
cd reels/edit && npm ci && npx remotion studio                 # add the timeline to src/reels.ts, preview
../render.sh Reel4Something Reel4Something-game-sound
```

Shot options: `round` (picks the arena and opponent: every 4th is a boss), `weapon`, `armour` (tier 1–6), `enemyHp` (fraction), `seconds` (cap), `tail` (seconds after the KO), `finishAfter` (seconds before the next clean hit wins), and camera options `camAngle`, `camDist`, `camRise`, `fov`, `cutPull`.

Music is in `edit/public/music/` with its licences in `CREDITS.md`.
