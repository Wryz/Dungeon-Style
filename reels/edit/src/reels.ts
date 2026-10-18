import beats from "./beats.json";
import { EMBER, GOLD } from "./reel/Caption";
import type { CoverProps } from "./reel/Cover";
import type { ReelProps, Segment } from "./reel/types";
import takes from "./takes.json";

type Take = keyof typeof takes;

/** The measured beats of a track from `start` (s) on: the reel's grid. */
const grid = (track: keyof typeof beats, start = 0) => beats[track].beats.filter((b) => b >= start - 0.02);

/** Second of a take at which its finishing blow lands. */
const ko = (take: Take) => {
  const t = takes[take].ko;
  if (t < 0) throw new Error(`${take} has no KO`);
  return t;
};

/** A cut that opens `lead` seconds before the take's KO, so the blow lands just after the beat. */
const koCut = (take: Take, beats: number, extra: Partial<Segment> = {}, lead = 0.3): Segment => ({ clip: take, from: ko(take) - lead, beats, ...extra });

// Tier colours, as the game's rarities run (common → mythic).
const TIER = { D: "#b9b2a6", C: "#7ed957", B: "#4fa3ff", A: "#b98aff", S: GOLD, SS: EMBER };

/**
 * 1 — "Every round is a new arena": one KO per arena on the beat, the bosses landing on
 * the drops. The music bed is the track cut on beats so it ends in its break and the loop
 * comes back in on the drop.
 */
const arenas: ReelProps = {
  music: "music/bed_arenas.mp3",
  grid: grid("bed_arenas"),
  musicVolume: 0.7,
  gameVolume: 0.85,
  hook: "EVERY ROUND IS A *NEW ARENA*",
  hookBeats: 8,
  endBeats: 3,
  cta: "LINK IN BIO",
  segments: [
    koCut("a_ring", 4, { text: "ROUND 1", sub: "THE RING" }),
    koCut("a_street", 4, { text: "ROUND 2", sub: "THE STREET" }),
    { clip: "a_grocery", from: 3.9, beats: 5, text: "ROUND 3", sub: "THE GROCERY STORE", hits: [1.8] },
    { clip: "b_champion", from: 0.1, beats: 3, text: "ROUND 4", sub: "BOSS FIGHT", accent: EMBER, push: 1.12 },
    koCut("a_warehouse", 4, { text: "ROUND 5", sub: "THE FIGHT CLUB" }),
    koCut("a_bar", 4, { text: "ROUND 6", sub: "THE BIKER BAR" }),
    koCut("a_dojo", 5, { text: "ROUND 7", sub: "THE DOJO" }),
    koCut("b_minotaur", 4, { text: "ROUND 8", sub: "THE MINOTAUR", accent: EMBER }),
    koCut("a_rooftop", 4, { text: "ROUND 9", sub: "THE ROOFTOP" }),
    koCut("b_troll", 5, { text: "ROUND 16", sub: "THE TROLL", accent: EMBER }, 0.4),
    { clip: "b_troll", from: ko("b_troll") + 1.5, beats: 3 },
  ],
};

/** 2 — "Ranking every weapon": a tier list, one finishing blow per weapon, worst to best. */
const tierList: ReelProps = {
  music: "music/offardifferentnature_ai_contact_CC0.mp3",
  grid: grid("offardifferentnature_ai_contact_CC0", 1.74),
  musicVolume: 0.65,
  gameVolume: 0.9,
  hook: "RANKING EVERY *WEAPON*",
  hookBeats: 4,
  endBeats: 4,
  cta: "LINK IN BIO",
  segments: [
    koCut("a_bar", 4, { text: "BEER BOTTLE", sub: "D TIER", accent: TIER.D }, 0.5),
    koCut("a_grocery", 4, { text: "FRYING PAN", sub: "C TIER", accent: TIER.C }, 1.6),
    koCut("a_warehouse", 4, { text: "LEAD PIPE", sub: "B TIER", accent: TIER.B }),
    koCut("a_street", 4, { text: "BASEBALL BAT", sub: "B TIER", accent: TIER.B }),
    { clip: "w_chair", from: 14.4, beats: 4, text: "FOLDING CHAIR", sub: "A TIER", accent: TIER.A },
    koCut("w_machete", 4, { text: "MACHETE", sub: "A TIER", accent: TIER.A }),
    koCut("a_dojo", 4, { text: "KATANA", sub: "S TIER", accent: TIER.S }),
    koCut("a_rooftop", 4, { text: "FIRE AXE", sub: "S TIER", accent: TIER.S }),
    koCut("w_sledge", 4, { text: "SLEDGEHAMMER", sub: "S TIER", accent: TIER.S }),
    koCut("w_axe", 8, { text: "BATTLE AXE", sub: "SS TIER", accent: TIER.SS }, 0.5),
  ],
};

/**
 * 3 — "They keep getting bigger": the four bosses, each walking in then going down.
 * Opens on the track's quiet build (the Champion's entrance), the drop hits with the first
 * KO, and the end card sits in the next quiet stretch so the loop rolls back into the build.
 */
const bosses: ReelProps = {
  music: "music/alexmorgan_aggressive_phonk_drift.mp3",
  grid: grid("alexmorgan_aggressive_phonk_drift", 9.26),
  musicVolume: 0.75,
  gameVolume: 0.9,
  hook: "THEY KEEP GETTING *BIGGER*",
  hookBeats: 7,
  endBeats: 4,
  cta: "LINK IN BIO",
  segments: [
    { clip: "b_champion", from: 0, beats: 7, text: "THE CHAMPION", sub: "1.6× YOUR SIZE", accent: EMBER, push: 1.15 },
    koCut("b_champion", 4),
    { clip: "b_minotaur", from: 0.2, beats: 2, text: "THE MINOTAUR", sub: "1.75×", accent: EMBER },
    koCut("b_minotaur", 3),
    { clip: "b_cyclops", from: 0.2, beats: 2, text: "THE CYCLOPS", sub: "1.85×", accent: EMBER },
    koCut("b_cyclops", 3),
    { clip: "b_troll", from: 0.2, beats: 2, text: "THE TROLL", sub: "1.95×", accent: EMBER },
    koCut("b_troll", 3, {}, 0.4),
    { clip: "b_troll", from: ko("b_troll") + 1.5, beats: 4 },
  ],
};

export const REELS: Record<string, ReelProps> = {
  Reel1Arenas: arenas,
  Reel2Weapons: tierList,
  Reel3Bosses: bosses,
};

export const COVERS: Record<string, CoverProps> = {
  Cover1Arenas: { still: "stills/arenas.jpg", text: "EVERY ROUND IS A *NEW ARENA*", sub: "HOW FAR CAN YOU GET?" },
  Cover2Weapons: { still: "stills/weapons.jpg", text: "RANKING EVERY *WEAPON*", sub: "DUNGEONSTYLE TIER LIST" },
  Cover3Bosses: { still: "stills/bosses.jpg", text: "THEY KEEP GETTING *BIGGER*", sub: "4 BOSSES", accent: EMBER },
};
