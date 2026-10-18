import beatsJson from "./beats.json";
import { ACCENT, HOT } from "./reel/Caption";
import type { CoverProps } from "./reel/Cover";
import type { ReelProps, Segment } from "./reel/types";
import takesJson from "./takes.json";

// Written by the music step (scripts/beats.py, bed.py) and by stage.sh.
const BEATS: Record<string, { beats: number[] }> = beatsJson;
const TAKES: Record<string, { ko: number; seconds: number }> = takesJson;

/** The measured beats of a track from `start` (s) on: the reel's grid. */
const grid = (track: string, start = 0) => (BEATS[track]?.beats ?? [0, 0.5]).filter((b) => b >= start - 0.02);

/** Second of a take at which its finishing blow lands. */
const ko = (take: string) => {
  const t = TAKES[take]?.ko ?? -1;
  // (Missing a take: the other reels still build.)
  if (t < 0) console.warn(`${take}: no KO in the takes`);
  return Math.max(0, t);
};

/** A cut that opens `lead` seconds before the take's KO, so the blow lands just after the beat. */
const koCut = (take: string, beats: number, extra: Partial<Segment> = {}, lead = 0.3): Segment => ({ clip: take, from: ko(take) - lead, beats, ...extra });

/**
 * EXAMPLE: replace with this game's three concepts. Segment beats must add up to the
 * reel's length (~20 s of the grid). Captions: *word* is highlighted in `accent`.
 */
const example: ReelProps = {
  music: "music/TRACK.mp3",
  grid: grid("TRACK", 0),
  musicVolume: 0.7,
  gameVolume: 0.85,
  hook: "EVERY LEVEL IS *DIFFERENT*",
  hookBeats: 8,
  endBeats: 4,
  title: "GAME*NAME*",
  cta: "LINK IN BIO",
  segments: [
    koCut("take_a", 4, { text: "LEVEL 1", sub: "THE CAVE" }),
    koCut("take_b", 4, { text: "LEVEL 2", sub: "THE CASTLE" }),
    { clip: "take_boss", from: 0.1, beats: 4, text: "THE BOSS", sub: "2× YOUR SIZE", accent: HOT, push: 1.12 },
    koCut("take_boss", 8, {}, 0.4),
  ],
};

export const REELS: Record<string, ReelProps> = {
  Reel1Example: example,
};

export const COVERS: Record<string, CoverProps> = {
  Cover1Example: { still: "stills/example.jpg", text: "EVERY LEVEL IS *DIFFERENT*", sub: "HOW FAR CAN YOU GET?", accent: ACCENT },
};

// Every cut has to stay inside its take (a cut running off the end of the footage freezes).
for (const [id, r] of Object.entries(REELS)) {
  let at = 0;
  for (const s of r.segments) {
    const g = r.grid;
    const span = (n: number) => {
      const i = Math.min(Math.floor(n), g.length - 2);
      return g[i] + (g[i + 1] - g[i]) * (n - i);
    };
    const secs = (span(at + s.beats) - span(at)) * (s.rate ?? 1);
    const len = TAKES[s.clip]?.seconds ?? 0;
    if (s.from + secs > len + 0.01) console.warn(`${id}: ${s.clip} cut runs ${(s.from + secs - len).toFixed(2)}s past the take`);
    at += s.beats;
  }
}
