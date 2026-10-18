# Music: trending research, royalty-free tracks, beat grids

## Two versions of every reel, always
- **Baked-in**: a royalty-free track in the trending style, every cut on its beats. Safe
  to post as-is.
- **`-game-sound`**: the same edit with game audio only, for adding a trending song in
  Instagram's audio picker. Copyrighted trending songs must never be baked into the file:
  Instagram mutes or blocks the reel.

## Research (good to hand to a subagent in the background while capture runs)
1. What's trending right now on Reels/TikTok for this game's genre (fight edits → phonk /
   Brazilian "montagem" phonk; cozy games → lo-fi / soft pop; racing → drift phonk / DnB;
   horror → dark ambient / slowed). Use WebSearch (SocialBee's weekly "trending Instagram
   songs" list and TikTok discover pages are useful). Report artist, title, the section
   people use, approximate BPM, and how sure you are. BPM sites often don't have these
   titles, and TikTok pages render empty to fetches, so say "unverified" rather than inventing numbers.
2. Download 2–4 royalty-free tracks in that style whose licence explicitly allows social
   use: **CC0** best (OpenGameArt, some FreeMusicArchive), **CC BY 4.0** fine with a credit
   line (FreeMusicArchive, Incompetech). Avoid NC/ND for promo. Pixabay returns 403 to
   curl. Verify each with `ffprobe`. Keep a `CREDITS.md` (file, title, artist, URL, licence,
   exact credit line).

## Beat grid
- `python -I scripts/beats.py edit/src/beats.json edit/public/music/*.mp3 [--bpm a,b,…]`
  (librosa in a venv: `python -m venv .venv && .venv/bin/pip install librosa`). Pass the
  album's stated BPM if known: it locks the tracker.
- `python -I scripts/beats.py --show edit/src/beats.json <track> <start> 48` prints each
  beat as `index:time:loudness`. Pick a window that starts on a strong beat (the drop).
  For a clean loop, end it on a quieter stretch so the restart slams back into the drop.
- If the ~20 s window runs into a long break, or the track goes quiet early, splice a bed
  on beat boundaries:
  `python -I scripts/bed.py edit/src/beats.json edit/public/music/T.mp3 edit/public/music/bed_x.mp3 <start> 0-29 0-16`
  This writes the bed and its own grid (`grid("bed_x")`).
- Cuts are placed on **measured beat times** (`grid`), not a constant BPM, so they never
  drift. Cuts are usually 4 beats; use 2 for fast montage bits and 5–8 for a
  slow-motion money shot.

## Mixing & mastering
- Music ~0.65–0.75 and game sound ~0.85–0.9 in the edit. The hits should cut through.
- `render.sh` masters to −14 LUFS / −1.5 dBTP (Instagram's level). Game-sound-only
  versions get a compressor first, otherwise their spikes leave them at ~−18 LUFS.
