/**
 * The battle log's camera: every battle is recorded off the game canvas as a video
 * (the browser's own MediaRecorder), with the moments that mattered marked on it — hits,
 * parries, knockdowns, the finish — so it can be rewound, stepped through and clipped.
 */

export type MarkKind = 'hit' | 'hurt' | 'parry' | 'down' | 'gore' | 'ko' | 'death';

export interface BattleMark {
  /** Seconds into the recording. */
  t: number;
  kind: MarkKind;
  label: string;
}

export interface BattleMeta {
  round: number;
  arena: string;
  opponent: string;
  boss: boolean;
}

export interface Battle extends BattleMeta {
  id: number;
  result: 'won' | 'lost' | 'left';
  /** Seconds of footage. */
  duration: number;
  marks: BattleMark[];
  /** The recording (null if this browser can't record video). */
  url: string | null;
  mime: string;
  thumb: string | null;
  when: Date;
}

/** Battles kept for the session (oldest dropped first). */
const KEEP = 12;
const FPS = 30;

function pickMime(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const m of ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4;codecs=avc1', 'video/mp4']) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m;
    } catch {
      // ignore
    }
  }
  return null;
}

export class BattleRecorder {
  readonly battles: Battle[] = [];
  /** Recording on (a setting): off, battles are still logged, just without video. */
  enabled = true;
  onChange: (() => void) | null = null;
  private readonly mime = pickMime();
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private current: (BattleMeta & { marks: BattleMark[]; t: number; thumb: string | null }) | null = null;
  private paused = false;
  private wantThumb = false;
  private lastTick = 0;
  private nextId = 1;
  private readonly thumbCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;

  constructor(private readonly canvas: HTMLCanvasElement) {}

  /** Whether this browser can record clips at all. */
  get canRecord(): boolean {
    return !!this.mime && typeof this.canvas.captureStream === 'function';
  }

  get recording(): boolean {
    return !!this.current;
  }

  /** A battle starts. (An unfinished one before it is kept as 'left'.) */
  start(meta: BattleMeta) {
    if (this.current) this.stop('left');
    this.current = { ...meta, marks: [], t: 0, thumb: null };
    this.paused = false;
    this.lastTick = performance.now();
    this.chunks = [];
    this.rec = null;
    if (!this.enabled || !this.canRecord) return;
    try {
      const stream = this.canvas.captureStream(FPS);
      const rec = new MediaRecorder(stream, { mimeType: this.mime!, videoBitsPerSecond: 3_000_000 });
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) this.chunks.push(e.data);
      };
      rec.start(1000);
      this.rec = rec;
    } catch {
      this.rec = null;
    }
  }

  /**
   * Time passing in the battle, as filmed: wall-clock time (the game clamps a slow frame's
   * step; the recording doesn't), less any time paused.
   */
  tick(paused: boolean) {
    const now = performance.now();
    const dt = this.lastTick ? (now - this.lastTick) / 1000 : 0;
    this.lastTick = now;
    if (!this.current) return;
    if (paused !== this.paused) {
      this.paused = paused;
      try {
        if (paused && this.rec?.state === 'recording') this.rec.pause();
        else if (!paused && this.rec?.state === 'paused') this.rec.resume();
      } catch {
        // ignore
      }
    }
    if (!paused) this.current.t += Math.min(dt, 1);
  }

  /** Something worth finding again. */
  mark(kind: MarkKind, label: string) {
    if (!this.current) return;
    const last = this.current.marks[this.current.marks.length - 1];
    // (One marker per moment: a burst of hits is one entry.)
    if (last && last.kind === kind && last.label === label && this.current.t - last.t < 0.4) return;
    this.current.marks.push({ t: this.current.t, kind, label });
    if (kind === 'ko' || kind === 'gore' || kind === 'death' || !this.current.thumb) this.wantThumb = true;
  }

  /** Call straight after the frame is drawn: grabs a thumbnail when one's wanted. */
  afterRender() {
    if (!this.wantThumb || !this.current || !this.thumbCanvas) return;
    this.wantThumb = false;
    try {
      const w = 240;
      const h = Math.round((w * this.canvas.height) / Math.max(1, this.canvas.width));
      this.thumbCanvas.width = w;
      this.thumbCanvas.height = h;
      this.thumbCanvas.getContext('2d')!.drawImage(this.canvas, 0, 0, w, h);
      this.current.thumb = this.thumbCanvas.toDataURL('image/jpeg', 0.7);
    } catch {
      // ignore
    }
  }

  /** The battle's over: the footage is finished and filed in the log. */
  stop(result: Battle['result']) {
    const c = this.current;
    if (!c) return;
    this.current = null;
    const battle: Battle = {
      id: this.nextId++,
      round: c.round,
      arena: c.arena,
      opponent: c.opponent,
      boss: c.boss,
      result,
      duration: c.t,
      marks: c.marks,
      url: null,
      mime: this.mime ?? '',
      thumb: c.thumb,
      when: new Date(),
    };
    this.battles.unshift(battle);
    while (this.battles.length > KEEP) {
      const old = this.battles.pop()!;
      if (old.url) URL.revokeObjectURL(old.url);
    }
    const rec = this.rec;
    this.rec = null;
    if (!rec || rec.state === 'inactive') {
      this.onChange?.();
      return;
    }
    const chunks = this.chunks;
    rec.onstop = () => {
      if (chunks.length) battle.url = URL.createObjectURL(new Blob(chunks, { type: this.mime ?? 'video/webm' }));
      this.onChange?.();
    };
    try {
      rec.stop();
    } catch {
      this.onChange?.();
    }
  }
}
