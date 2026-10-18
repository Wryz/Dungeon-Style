/*
 * Reel director: injected into the game page by capture.cjs (before the game's own scripts).
 * Copy to reels/capture/director.js and fill in every ADAPT block for this game.
 * The contract it must keep is in references/director-contract.md; a complete, working
 * example for a 3D fighting game is references/director-example-dungeonstyle.js.
 *
 * Its jobs: step the game one 1/30 s frame at a time; fly the player on autopilot so the
 * take has action; keep the player from losing; frame the action for 9:16; log every sound
 * call (with its time) instead of playing it, and render that log offline afterwards; log
 * the moments that matter (hits, kills, KO) so the edit can cut on them.
 */
(() => {
  const FPS = 30;
  const R = (window.__reel = { frame: 0, events: [], marks: [], opts: null, koAt: -1 });
  const t = () => R.frame / FPS;

  /** ADAPT: the game object (window.game in a dev/debug build, a global, a module export…). */
  const G = () => window.game;

  // Careful: an element with id="game" makes window.game the element until the real game
  // object is assigned. Test for something only the game object has.
  R.ready = () => !!(G() && G().sfx /* ADAPT */);

  R.setup = (opts) => {
    const g = G();
    R.opts = opts;

    // ---- ADAPT: loadout / level / difficulty from the shot (opts.level, opts.weapon, …).

    // ---- Sound: log, don't play. ADAPT: the object every sound goes through.
    const sfx = g.sfx;
    const proto = Object.getPrototypeOf(sfx);
    for (const name of Object.getOwnPropertyNames(proto)) {
      if (name === 'constructor' || typeof proto[name] !== 'function') continue;
      if (/* ADAPT: setup methods that must keep working */ ['unlock', 'attach'].includes(name)) continue;
      sfx[name] = (...args) => {
        R.events.push({ t: t(), name, args });
        if (name === /* ADAPT: the knockout/kill sound */ 'ko' && R.koAt < 0) R.koAt = t();
      };
    }

    // ---- ADAPT: moments. Wrap whatever the game calls on a hit / kill / KO:
    //   R.marks.push({ t: t(), kind: 'hit' | 'ko' | 'gore' | 'down', label }); and set R.koAt on the finish.

    // ---- ADAPT: autopilot. Feed synthetic input the way a player would (wrap the input
    // poll, or set the player's move/press state each frame): close in, attack in rhythm
    // with a little randomness, back off when too close.

    // ---- ADAPT: the player never loses (a death or game-over ends the take): revive or
    // floor their health. Weaken opponents (HP / damage) so a take reaches its finish in
    // ~10–15 s.

    // ---- ADAPT: portrait camera. After the game's camera update, re-place the camera so
    // the player and their opponent both fit a 9:16 frame: mostly side-on to the line
    // between them, raised, pulled back with their separation, smoothed. If the game
    // has its own slow-motion/cinematic cuts, keep them (they're the money shots) but
    // pull them back (~1.45×) and put them on the portrait camera's side of the fight.

    // ---- ADAPT: start the level/round/fight.
  };

  /** One frame of game time; returns the frame's pixels (RGBA, bottom row first). */
  R.step = () => {
    const g = G();
    // ADAPT: after `finishAfter` seconds, let the next clean hit end it (every take gets its KO).
    R.frame++;
    g.frame(1 / FPS); // ADAPT: the game's per-frame update + render, with a fixed dt
    const gl = g.renderer.getContext(); // ADAPT: the WebGL(2) context
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    if (!R.buf || R.buf.length !== w * h * 4) R.buf = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, R.buf);
    return R.buf;
  };

  /** ADAPT `over`: true once the take can't produce anything more (e.g. a game-over screen). */
  R.state = () => ({ frame: R.frame, t: t(), koAt: R.koAt, over: false });

  /** Render the logged sounds, in sync, as 16-bit stereo WAV bytes (null: no sound). */
  R.renderAudio = async (seconds) => {
    const g = G();
    const rate = 48000;
    const ctx = new OfflineAudioContext(2, Math.ceil(seconds * rate), rate);
    // ADAPT: a fresh instance of the sound class pointed at `ctx` (add a small
    // `attach(ctx)` to the game's sound class if it only ever builds its own AudioContext).
    const sfx = new g.sfx.constructor();
    sfx.attach(ctx);
    const q = 128 / rate;
    const groups = new Map();
    for (const ev of R.events) {
      const at = Math.round(ev.t / q) * q;
      if (at >= seconds) continue;
      if (!groups.has(at)) groups.set(at, []);
      groups.get(at).push(ev);
    }
    const play = (evs) => {
      for (const ev of evs) {
        try {
          sfx[ev.name](...ev.args);
        } catch (err) {
          console.warn('sfx replay', ev.name, err);
        }
      }
    };
    for (const [at, evs] of groups) {
      if (at <= 0) play(evs);
      else
        ctx.suspend(at).then(() => {
          play(evs);
          ctx.resume();
        });
    }
    const buf = await ctx.startRendering();
    const n = buf.length;
    const out = new DataView(new ArrayBuffer(44 + n * 4));
    const str = (o, s) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
    str(0, 'RIFF');
    out.setUint32(4, 36 + n * 4, true);
    str(8, 'WAVEfmt ');
    out.setUint32(16, 16, true);
    out.setUint16(20, 1, true);
    out.setUint16(22, 2, true);
    out.setUint32(24, rate, true);
    out.setUint32(28, rate * 4, true);
    out.setUint16(32, 4, true);
    out.setUint16(34, 16, true);
    str(36, 'data');
    out.setUint32(40, n * 4, true);
    const L = buf.getChannelData(0);
    const Rc = buf.getChannelData(1);
    for (let i = 0; i < n; i++) {
      out.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 0x7fff, true);
      out.setInt16(46 + i * 4, Math.max(-1, Math.min(1, Rc[i])) * 0x7fff, true);
    }
    return new Uint8Array(out.buffer);
  };
})();
