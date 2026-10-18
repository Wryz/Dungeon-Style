import beatsJson from "./beats.json";
import type { GoreCoverProps, GoreReelProps, GoreSegment } from "./gore/GoreReel";
import takesJson from "./takes.json";

// Round 2: extra gory, styled from the game's own interface (see gore/GoreReel.tsx).
const BEATS: Record<string, { beats: number[] }> = beatsJson;
const TAKES: Record<string, { ko: number; seconds: number; marks: { t: number; kind: string; label: string }[] }> = takesJson;

const grid = (track: string, start = 0) => (BEATS[track]?.beats ?? [0, 0.5]).filter((b) => b >= start - 0.02);
const ko = (take: string) => {
  const t = TAKES[take]?.ko ?? -1;
  if (t < 0) console.warn(`${take}: no KO in the takes`);
  return Math.max(0, t);
};
/** Second of a take's first moment of a kind ("gore", "down"…), else its KO. */
const moment = (take: string, kind: string) => TAKES[take]?.marks.find((m) => m.kind === kind)?.t ?? ko(take);

/** A cut that opens `beatsBefore` beats (≈ `lead` s) before the moment, so it lands on the beat after the cut. */
const at = (take: string, t: number, beats: number, lead: number, extra: Partial<GoreSegment> = {}): GoreSegment => ({ clip: take, from: t - lead, beats, ...extra });

const GT = 60 / 143.55; // Ghost Trip beat (s)
const DS = 60 / 152; // Dead Space / Boss Battle 10 beat (s)

// Which take carries the decapitation (a fresh one if the re-shoots landed it).
const DECAP = (["g_decap_3", "g_decap_4", "g_decap_5"] as const).find((t) => TAKES[t]?.marks.some((m) => m.label.includes("decapitation"))) ?? "a_dojo";
const decapAt = DECAP === "a_dojo" ? ko("a_dojo") : TAKES[DECAP].marks.find((m) => m.label.includes("decapitation"))!.t;

/**
 * 4 — "Every way to lose your head": the game's finishers, one per eight beats of a dark
 * Halloween-trap loop, numbered and named the way the game names them.
 */
const finishers: GoreReelProps = {
  music: "music/ghost_trip.mp3",
  grid: grid("ghost_trip", 12.86),
  musicVolume: 0.7,
  gameVolume: 0.95,
  hook: "EVERY WAY TO LOSE YOUR HEAD",
  hookBeats: 8,
  endBeats: 5,
  cta: "LINK IN BIO",
  segments: [
    at("g_split_2", moment("g_split_2", "gore"), 8, GT, { count: "01", label: "SKULL SPLIT", labelAt: 1, sub: "FIRE AXE", hits: [1] }),
    at("g_cleft_1", moment("g_cleft_1", "gore"), 8, GT, { count: "02", label: "SKULL CLEFT", labelAt: 1, sub: "KATANA", hits: [1] }),
    at("g_crush_1", moment("g_crush_1", "gore"), 8, GT, { count: "03", label: "SKULL CRUSHED", labelAt: 1, sub: "SLEDGEHAMMER", hits: [1] }),
    at(DECAP, decapAt, 8, DECAP === "a_dojo" ? 0.46 : GT, { count: "04", label: "DECAPITATED", labelAt: 1, sub: DECAP === "g_decap_5" || DECAP === "g_decap_3" ? "BATTLE AXE" : DECAP === "g_decap_4" ? "FIRE AXE" : "KATANA", hits: [1] }),
    at("g_demon_1", moment("g_demon_1", "gore"), 8, GT, { count: "05", label: "LIMB OFF", labelAt: 1, sub: "AND THE REST OF YOU", hits: [1] }),
    { clip: "g_cleft_1", from: 5.4, beats: 5 },
  ],
};

/**
 * 5 — "Wait for it": one long fight against the Troll under the track's near-silent build
 * (the game's own hits carry it), the kill slammed onto the drop, then another.
 */
const waitForIt: GoreReelProps = {
  music: "music/rager_dead_space_dubstep.mp3",
  grid: grid("rager_dead_space_dubstep", 120.37),
  musicVolume: 0.8,
  gameVolume: 1,
  hook: "WAIT FOR IT…",
  hookBeats: 30,
  endBeats: 5,
  cta: "LINK IN BIO",
  segments: [
    { clip: "g_wait_troll", from: 0.1, beats: 6, sub: "ROUND 16 · THE TROLL", push: 1.1 },
    { clip: "g_wait_troll", from: 3.0, beats: 8 },
    { clip: "g_wait_troll", from: 6.3, beats: 8 },
    { clip: "g_wait_troll", from: 10.6, beats: 8 },
    // The drop.
    at("g_wait_troll", ko("g_wait_troll"), 6, 0.1, { label: "THERE IT IS", labelAt: 0, hits: [0] }),
    at("g_wait_cyclops", ko("g_wait_cyclops"), 8, DS, { label: "AND AGAIN", labelAt: 1, sub: "THE CYCLOPS", hits: [1] }),
  ],
};

/** 6 — "They said demons don't bleed": demons and an imp, kills on the metal track's accents. */
const demons: GoreReelProps = {
  music: "music/nene_boss_battle_10_metal.mp3",
  grid: grid("nene_boss_battle_10_metal", 13.42),
  musicVolume: 0.75,
  gameVolume: 0.95,
  hook: "THEY SAID DEMONS DON'T BLEED",
  hookBeats: 10,
  endBeats: 7,
  cta: "LINK IN BIO",
  segments: [
    at("g_demon_1", moment("g_demon_1", "gore"), 10, DS, { label: "LIMB OFF", labelAt: 1, hits: [1] }),
    at("g_demon_1", ko("g_demon_1"), 9, DS, { label: "DEMON DOWN", labelAt: 1, hits: [1] }),
    at("g_demon_2", moment("g_demon_2", "down"), 10, 2 * DS, { label: "THEY BLEED", labelAt: 2, sub: "KATANA", hits: [2] }),
    at("g_imp_1", ko("g_imp_1"), 9, 2 * DS, { label: "IMP LAUNCHED", labelAt: 2, sub: "FIRE AXE", hits: [2] }),
    { clip: "g_demon_2", from: 8.6, beats: 7 },
  ],
};

export const GORE_REELS: Record<string, GoreReelProps> = {
  Reel4Finishers: finishers,
  Reel5WaitForIt: waitForIt,
  Reel6Demons: demons,
};

export const GORE_COVERS: Record<string, GoreCoverProps> = {
  Cover4Finishers: { still: "stills/finishers.jpg", title: "EVERY WAY TO LOSE", label: "YOUR HEAD" },
  Cover5WaitForIt: { still: "stills/waitforit.jpg", title: "WAIT", label: "FOR IT…" },
  Cover6Demons: { still: "stills/demons.jpg", title: "DEMONS", label: "BLEED TOO" },
};

// Every cut has to stay inside its take (a cut running off the end of the footage freezes).
for (const [id, r] of Object.entries(GORE_REELS)) {
  let n = 0;
  for (const s of r.segments) {
    const g = r.grid;
    const span = (b: number) => {
      const i = Math.min(Math.floor(b), g.length - 2);
      return g[i] + (g[i + 1] - g[i]) * (b - i);
    };
    const secs = (span(n + s.beats) - span(n)) * (s.rate ?? 1);
    const len = TAKES[s.clip]?.seconds ?? 0;
    if (s.from < 0 || s.from + secs > len + 0.01) console.warn(`${id}: ${s.clip} cut ${s.from.toFixed(2)}+${secs.toFixed(2)}s is outside the take (${len}s)`);
    n += s.beats;
  }
}
