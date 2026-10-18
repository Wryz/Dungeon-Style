import beats from "./beats.json";
import type { CoverProps } from "./reel/Cover";
import type { ReelProps } from "./reel/types";

/** The measured beats of a track from `start` (s) on: the reel's grid. */
const grid = (track: keyof typeof beats, start: number) => beats[track].beats.filter((b) => b >= start - 0.02);

export const REELS: Record<string, ReelProps> = {
  Test: {
    music: "music/alexmorgan_brazilian_phonk_bass_drop.mp3",
    grid: grid("alexmorgan_brazilian_phonk_bass_drop", 18.53),
    musicVolume: 0.8,
    gameVolume: 0.9,
    hook: "EVERY ROUND IS A *NEW ARENA*",
    hookBeats: 4,
    endBeats: 4,
    cta: "LINK IN BIO",
    segments: [
      { clip: "a_ring", from: 2.4, beats: 4, text: "ROUND 1", sub: "THE RING" },
      { clip: "a_ring", from: 10.7, beats: 4, rate: 0.6, hits: [1] },
      { clip: "a_ring", from: 12.5, beats: 4 },
    ],
  },
};

export const COVERS: Record<string, CoverProps> = {};
