import { loadFont } from "@remotion/fonts";
import { Audio, Video } from "@remotion/media";
import React from "react";
import { AbsoluteFill, Easing, Img, interpolate, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { cutFrames, FPS } from "../reel/Reel";

/*
 * The second set of reels, styled from the game's own interface rather than a generic
 * "viral" look: its UI is heavy system sans at weight 900 with wide tracking and cream ink
 * (Inter Black is the open-licence match); kills read like its death screen (red glow, a
 * hard dark-red drop, a slam); labels sit in its dark translucent banner pill; the call to
 * action is its gold ribbon.
 */
const INTER = "Inter";
loadFont({ family: INTER, url: staticFile("fonts/Inter-Black.otf"), weight: "900" });
loadFont({ family: INTER, url: staticFile("fonts/Inter-ExtraBold.otf"), weight: "800" });

// The game's palette (src/style.css).
export const INK = "#f2ede2";
export const GOLD = "#ffd36b";
export const DEATH = "#ff3b2f";
const DEATH_DROP = "#4a0505";
const PILL = "rgba(20, 24, 32, 0.6)";

/** One cut: a stretch of a take, so many beats long. */
export type GoreSegment = {
  clip: string;
  from: number;
  beats: number;
  rate?: number;
  /** Cream title (banner style). */
  title?: string;
  /** Death-red kill label, slammed in `labelAt` beats into the cut. */
  label?: string;
  labelAt?: number;
  /** Small pill under the label/title. */
  sub?: string;
  /** Gold counter, top left ("01", "1.95×"…). */
  count?: string;
  /** Extra red flash + punch this many beats into the cut (the blow landing mid-cut). */
  hits?: number[];
  push?: number;
  sound?: number;
};

export type GoreReelProps = {
  music: string | null;
  grid: number[];
  musicVolume: number;
  gameVolume: number;
  hook?: string;
  hookBeats?: number;
  segments: GoreSegment[];
  endBeats: number;
  cta: string;
};

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const slam = { ...clamp, easing: Easing.bezier(0.2, 1.6, 0.4, 1) } as const;

/** The game's banner: cream, weight 900, tracked out, a deep soft shadow. */
const Title: React.FC<{ text: string; top: number; size?: number }> = ({ text, top, size = 96 }) => {
  const f = useCurrentFrame();
  return (
    <div
      style={{
        position: "absolute",
        left: 70,
        right: 70,
        top,
        textAlign: "center",
        fontFamily: INTER,
        fontWeight: 900,
        fontSize: size,
        lineHeight: 1.02,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color: INK,
        textShadow: "0 6px 30px rgba(0,0,0,0.85), 0 2px 4px rgba(0,0,0,0.9)",
        opacity: interpolate(f, [0, 4], [0, 1], clamp),
        translate: interpolate(f, [0, 6], ["0px 24px", "0px 0px"], { ...clamp, easing: Easing.out(Easing.cubic) }),
      }}
    >
      {text}
    </div>
  );
};

/** The game's small banner pill: dark glass, very wide tracking. */
const Pill: React.FC<{ text: string; color?: string }> = ({ text, color = INK }) => (
  <div
    style={{
      display: "inline-block",
      padding: "10px 22px 9px 30px",
      background: PILL,
      borderRadius: 4,
      fontFamily: INTER,
      fontWeight: 800,
      fontSize: 30,
      letterSpacing: "0.4em",
      textTransform: "uppercase",
      color,
    }}
  >
    {text}
  </div>
);

/** A kill, the way the death screen announces one: red, glowing, slammed in. */
const KillLabel: React.FC<{ text: string; sub?: string; top: number }> = ({ text, sub, top }) => {
  const f = useCurrentFrame();
  return (
    <div style={{ position: "absolute", left: 40, right: 40, top, display: "flex", flexDirection: "column", alignItems: "center", gap: 22 }}>
      <div
        style={{
          fontFamily: INTER,
          fontWeight: 900,
          fontSize: 128,
          lineHeight: 1,
          letterSpacing: "0.1em",
          textAlign: "center",
          color: DEATH,
          textShadow: `0 0 24px rgba(255,40,30,0.7), 0 7px 0 ${DEATH_DROP}, 0 12px 34px #000`,
          scale: interpolate(f, [0, 8], [2.1, 1], slam),
          opacity: interpolate(f, [0, 2], [0, 1], clamp),
        }}
      >
        {text}
      </div>
      {sub ? (
        <div style={{ opacity: interpolate(f, [5, 9], [0, 1], clamp), translate: interpolate(f, [5, 10], ["0px 20px", "0px 0px"], clamp) }}>
          <Pill text={sub} />
        </div>
      ) : null}
    </div>
  );
};

const Cut: React.FC<{ s: GoreSegment; frames: number; beatFrames: number; gameVolume: number; textFrames: number; textTop: number }> = ({
  s,
  frames,
  beatFrames,
  gameVolume,
  textFrames,
  textTop,
}) => {
  const f = useCurrentFrame();
  const rate = s.rate ?? 1;
  const kicks = [0, ...(s.hits ?? []).map((b) => Math.round(b * beatFrames))];
  const since = Math.min(...kicks.map((k) => (f >= k ? f - k : Infinity)));
  const punch = interpolate(since, [0, 10], [1.1, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const push = interpolate(f, [0, frames], [1, s.push ?? 1.05], clamp);
  // Cuts and blows land with a blood-red flash (the game's hit colour), not white.
  const flash = interpolate(since, [0, 5], [0.55, 0], clamp);
  const shake = since < 7 ? (7 - since) * 2.6 : 0;
  const trim = Math.round(s.from * FPS);
  const labelFrom = Math.round((s.labelAt ?? 0) * beatFrames);
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ scale: punch * push, translate: `${Math.sin(f * 2.3) * shake}px ${Math.cos(f * 2.9) * shake}px` }}>
        <Video src={staticFile(`footage/${s.clip}.mp4`)} trimBefore={trim} playbackRate={rate} muted objectFit="cover" />
      </AbsoluteFill>
      <Audio src={staticFile(`footage/${s.clip}.wav`)} trimBefore={trim} playbackRate={rate} volume={s.sound ?? gameVolume} />
      <AbsoluteFill style={{ backgroundColor: "#a00d0a", mixBlendMode: "multiply", opacity: flash }} />
      <AbsoluteFill style={{ backgroundColor: "#ff2a1f", mixBlendMode: "screen", opacity: flash * 0.35 }} />
      {textFrames > 0 ? (
        <Sequence durationInFrames={textFrames} layout="none">
          {s.count ? (
            <div style={{ position: "absolute", top: 140, left: 70, fontFamily: INTER, fontWeight: 900, fontSize: 64, letterSpacing: "0.12em", color: GOLD, textShadow: "0 0 3px #000, 0 3px 8px #000" }}>
              {s.count}
            </div>
          ) : null}
          {s.title ? <Title text={s.title} top={textTop} /> : null}
          {s.label && labelFrom < textFrames ? (
            <Sequence from={labelFrom} durationInFrames={textFrames - labelFrom} layout="none">
              <KillLabel text={s.label} sub={s.sub} top={s.title ? textTop + 240 : textTop} />
            </Sequence>
          ) : s.sub && !s.label ? (
            <div style={{ position: "absolute", top: textTop + 230, left: 0, right: 0, textAlign: "center" }}>
              <Pill text={s.sub} />
            </div>
          ) : null}
        </Sequence>
      ) : null}
    </AbsoluteFill>
  );
};

/** End card: the death screen's red-black glow, the logo, the gold ribbon. */
const EndCard: React.FC<{ cta: string; frames: number }> = ({ cta, frames }) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <AbsoluteFill
        style={{
          background: "radial-gradient(ellipse at 50% 42%, rgba(90, 10, 12, 0.8), rgba(8, 4, 6, 0.95) 70%)",
          opacity: interpolate(f, [0, 5], [0, 1], clamp),
        }}
      />
      <Img
        src={staticFile("brand/dungeonstyle-logo-stacked-dark.png")}
        style={{ width: 760, marginTop: -120, scale: interpolate(f, [0, 8], [1.5, 1], slam), opacity: interpolate(f, [0, 3], [0, 1], clamp) }}
      />
      <div
        style={{
          marginTop: 40,
          padding: "14px 34px 13px 44px",
          borderRadius: 6,
          background: "linear-gradient(90deg, #ffcc4d, #ff8a3d)",
          color: "#2a1300",
          fontFamily: INTER,
          fontWeight: 900,
          fontSize: 50,
          letterSpacing: "0.2em",
          boxShadow: "0 6px 0 rgba(0,0,0,0.5)",
          scale: interpolate(f, [6, 12], [0.5, 1], slam),
          opacity: interpolate(f, [6, 8], [0, 1], clamp),
        }}
      >
        {cta}
      </div>
      {/* The loop restarts on a red flash, like every cut. */}
      <AbsoluteFill style={{ backgroundColor: "#a00d0a", opacity: interpolate(f, [frames - 3, frames - 1], [0, 0.55], clamp) }} />
    </AbsoluteFill>
  );
};

export const GoreReel: React.FC<GoreReelProps> = (p) => {
  const { fps } = useVideoConfig();
  const cuts = cutFrames(p);
  const total = cuts[p.segments.length];
  const beatFrames = ((p.grid[p.grid.length - 1] - p.grid[0]) / (p.grid.length - 1)) * fps;
  const endFrom = total - Math.round(p.endBeats * beatFrames);
  const hookFrames = Math.round((p.hookBeats ?? 0) * beatFrames);
  return (
    <AbsoluteFill style={{ backgroundColor: "#08040a" }}>
      {p.segments.map((s, i) => (
        <Sequence key={i} from={cuts[i]} durationInFrames={cuts[i + 1] - cuts[i]} name={`${i + 1}. ${s.clip}${s.label ? ` · ${s.label}` : s.title ? ` · ${s.title}` : ""}`}>
          <Cut
            s={s}
            frames={cuts[i + 1] - cuts[i]}
            beatFrames={beatFrames}
            gameVolume={p.gameVolume}
            textFrames={endFrom - cuts[i]}
            textTop={cuts[i] < hookFrames ? 520 : 330}
          />
        </Sequence>
      ))}
      {/* The death screen's red-black falloff at the edges, always on. */}
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 46%, rgba(0,0,0,0) 50%, rgba(40,2,4,0.55) 100%)" }} />
      {p.hook && hookFrames > 0 ? (
        <Sequence durationInFrames={hookFrames} name="Hook">
          <Title text={p.hook} top={210} size={84} />
        </Sequence>
      ) : null}
      <Sequence from={endFrom} durationInFrames={total - endFrom} name="End card">
        <EndCard cta={p.cta} frames={total - endFrom} />
      </Sequence>
      {p.music ? (
        <Audio src={staticFile(p.music)} trimBefore={Math.round(p.grid[0] * fps)} volume={(fr) => p.musicVolume * interpolate(fr, [total - 8, total], [1, 0.6], clamp)} />
      ) : null}
    </AbsoluteFill>
  );
};

export type GoreCoverProps = { still: string; title: string; label: string };

/** Cover: the still, the title in cream, the kill word in death-red, in the centre band. */
export const GoreCover: React.FC<GoreCoverProps> = ({ still, title, label }) => (
  <AbsoluteFill style={{ backgroundColor: "#08040a" }}>
    <Img src={staticFile(still)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
    <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 50%, rgba(40,2,4,0.15) 30%, rgba(8,4,6,0.75) 100%)" }} />
    <div style={{ position: "absolute", left: 60, right: 60, top: 640, textAlign: "center", fontFamily: INTER, fontWeight: 900, fontSize: 96, lineHeight: 1.04, letterSpacing: "0.06em", color: INK, textShadow: "0 6px 30px rgba(0,0,0,0.9)" }}>
      {title}
    </div>
    <div
      style={{
        position: "absolute",
        left: 30,
        right: 30,
        top: 900,
        textAlign: "center",
        fontFamily: INTER,
        fontWeight: 900,
        fontSize: 132,
        letterSpacing: "0.08em",
        color: DEATH,
        textShadow: `0 0 24px rgba(255,40,30,0.7), 0 7px 0 ${DEATH_DROP}, 0 12px 34px #000`,
      }}
    >
      {label}
    </div>
    <Img src={staticFile("brand/dungeonstyle-mark-1024.png")} style={{ position: "absolute", width: 150, left: 465, top: 1420 }} />
  </AbsoluteFill>
);
