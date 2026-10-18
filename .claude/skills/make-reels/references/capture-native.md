# Capturing non-web games

The idea is the same as for web games: step a fixed 1/30 s per frame, log sounds and render
them offline (or record the engine's own audio, which is deterministic when stepped),
autopilot the player, portrait camera, KO log. Write the same outputs: `<take>.mp4` (silent
or with sound), `<take>.wav`, `<take>.json` (`{shot, seconds, fps, koAt, marks}`). Then
stage/edit/render are unchanged.

First check what the container can run: `nproc`, `free -g`, whether the engine CLI is
installed (`unity`, `godot`), and whether there's a display (`xvfb-run` exists?). If the
engine can't run headless here, say so and offer a fallback (below) instead of guessing.

## Unity
- Build or run with `-batchmode` (add `-nographics` only if you don't need rendering; for
  capture you do, so run under `xvfb-run` with a software GL, or use the Unity Recorder in
  an Editor batch run).
- `Time.captureFramerate = 30` makes game time advance exactly 1/30 s per rendered frame
  regardless of speed. Capture each frame with `ScreenCapture.CaptureScreenshotAsTexture()`
  into a 1080×1920 RenderTexture (set `Screen.SetResolution(1080, 1920, false)` or render a
  dedicated portrait camera to an RT), then `GetRawTextureData` and pipe it to ffmpeg, or
  use the Unity Recorder package (Movie Recorder, constant frame rate 30, with audio
  capture).
- Audio: with `captureFramerate` set, the Recorder's audio is in sync. Otherwise use
  `OnAudioFilterRead` on the listener to write samples, or log `AudioSource.Play` calls and
  mix the clips afterwards.
- Put the autopilot, revive, portrait camera and KO hooks in a `ReelDirector`
  MonoBehaviour that's only compiled/added for capture builds (`#if REEL_CAPTURE`).

## Godot
- `godot --path . --write-movie out.avi --fixed-fps 30 --resolution 1080x1920 res://reel.tscn`
  renders at a fixed frame rate with audio in sync (Movie Maker mode). Convert to H.264
  with ffmpeg. On a headless box use `xvfb-run` (or `--rendering-driver opengl3` with
  software GL).
- A `reel.tscn` (or autoload) sets up the shot, autopilot, revive, camera and KO logging.

## Other engines / fallback
- Look for a fixed-timestep or deterministic replay mode. If the game records replays,
  replay them in a capture build.
- If nothing can run in the container, the fallback is the user recording on their own
  machine (OBS: game window + application audio, 1080p60, MKV → remux). Then edit
  portrait-cropped footage with the same Remotion template (objectFit "cover" and a
  translate to keep the action centred). Say clearly that this needs them to play and
  record.
