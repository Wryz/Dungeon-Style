import type { Weight } from '../sim/moves';

/** Procedural impact sounds (no assets): noise bursts + pitched thumps through a compressor. */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private noise!: AudioBuffer;
  volume = 0.7;

  /** Must be called from a user gesture. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(comp).connect(ctx.destination);
    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.ctx) this.master.gain.value = v;
  }

  private noiseBurst(type: BiquadFilterType, freq: number, q: number, gain: number, attack: number, decay: number, sweepTo?: number) {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + attack + decay);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + attack + decay + 0.05);
  }

  private thump(from: number, to: number, gain: number, decay: number, type: OscillatorType = 'sine') {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(to, t + decay);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + decay + 0.02);
  }

  hit(weight: Weight, counter = false) {
    if (!this.ctx) return;
    const w = weight === 'light' ? 0 : weight === 'medium' ? 1 : 2;
    this.noiseBurst('lowpass', [2600, 1800, 1200][w], 0.8, [0.5, 0.7, 0.9][w], 0.002, [0.07, 0.1, 0.16][w]);
    this.thump([170, 140, 120][w], [70, 55, 40][w], [0.5, 0.7, 0.95][w], [0.1, 0.14, 0.22][w]);
    if (w >= 1) this.noiseBurst('highpass', 3500, 0.7, 0.35, 0.001, 0.03);
    if (counter) this.thump(900, 600, 0.12, 0.12, 'triangle');
  }

  block(heavy: boolean) {
    if (!this.ctx) return;
    this.noiseBurst('bandpass', 1400, 2.5, 0.6, 0.002, heavy ? 0.09 : 0.06);
    this.thump(260, 140, 0.35, 0.08, 'square');
  }

  whoosh(weight: Weight) {
    if (!this.ctx) return;
    const w = weight === 'light' ? 0 : weight === 'medium' ? 1 : 2;
    this.noiseBurst('bandpass', [900, 700, 500][w], 1.2, [0.12, 0.18, 0.26][w], 0.03, [0.08, 0.11, 0.16][w], [2400, 2000, 1500][w]);
  }

  dodge() {
    if (!this.ctx) return;
    this.noiseBurst('bandpass', 500, 0.9, 0.12, 0.04, 0.12, 1400);
  }

  counterReady() {
    if (!this.ctx) return;
    this.thump(1320, 1300, 0.07, 0.18, 'sine');
    this.thump(1980, 1970, 0.04, 0.14, 'sine');
  }

  coin() {
    if (!this.ctx) return;
    const f = 1300 + Math.random() * 300;
    this.thump(f, f * 1.01, 0.08, 0.09, 'square');
    this.thump(f * 1.5, f * 1.5, 0.05, 0.14, 'sine');
  }

  gate(closing: boolean) {
    if (!this.ctx) return;
    this.noiseBurst('lowpass', closing ? 700 : 400, 0.8, 0.5, 0.005, closing ? 0.25 : 0.5);
    this.thump(closing ? 110 : 80, 50, 0.6, closing ? 0.3 : 0.5, 'square');
  }

  glitch() {
    if (!this.ctx) return;
    this.thump(60 + Math.random() * 900, 30 + Math.random() * 2000, 0.06, 0.08, 'sawtooth');
  }

  chime() {
    if (!this.ctx) return;
    this.thump(660, 660, 0.08, 0.5, 'sine');
    this.thump(990, 990, 0.06, 0.7, 'sine');
  }

  knockdown() {
    if (!this.ctx) return;
    this.thump(90, 35, 0.9, 0.35);
    this.noiseBurst('lowpass', 500, 0.7, 0.5, 0.005, 0.3);
  }

  ko() {
    if (!this.ctx) return;
    this.thump(70, 28, 1, 0.8);
    this.noiseBurst('lowpass', 900, 0.5, 0.7, 0.003, 0.5);
    this.thump(440, 220, 0.15, 0.6, 'triangle');
  }
}
