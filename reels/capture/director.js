/*
 * Reel director: injected into the game page (dev build, `?dev`) by capture.cjs.
 *
 * The game's own loop is switched off; the capture steps it one 1/30 s frame at a time,
 * however long each frame takes to render, so the footage is smooth. Meanwhile:
 *  - the player fights on autopilot (presses buttons like a player would; the character
 *    still defends itself, as in the game) and can't lose;
 *  - a portrait camera frames both fighters for 9:16 (the game's own slow-motion cuts
 *    still take over on the big moments);
 *  - every sound the game asks for is logged with its time instead of played, and the
 *    log is rendered afterwards through the same Sfx code into an OfflineAudioContext:
 *    sample-accurate sync with the video;
 *  - the moments that matter (hits, knockdowns, gore, KOs) are logged too, for the edit.
 */
(() => {
  const FPS = 30;
  const R = (window.__reel = {
    frame: 0,
    events: [],
    marks: [],
    opts: null,
    koAt: -1,
  });
  const t = () => R.frame / FPS;

  R.setup = (opts) => {
    const g = window.game;
    R.opts = opts;
    // ---- Kit: the player's weapon and armour (before the round, so it's worn).
    const s = g.save;
    if (opts.weapon) {
      if (!s.weapons.includes(opts.weapon)) s.weapons.push(opts.weapon);
      s.loadout = opts.weapon;
    } else s.loadout = null;
    if (opts.armour) for (const k of Object.keys(s.gear)) s.gear[k] = opts.armour;
    if (opts.outfit) s.outfit = opts.outfit;
    g.applyGear();

    // ---- Sound: log, don't play.
    const sfx = g.sfx;
    const proto = Object.getPrototypeOf(sfx);
    for (const name of Object.getOwnPropertyNames(proto)) {
      if (name === 'constructor' || name === 'unlock' || name === 'attach' || typeof proto[name] !== 'function') continue;
      sfx[name] = (...args) => {
        R.events.push({ t: t(), name, args });
      };
    }
    g.input.onAnyInput = () => {};

    // ---- Moments.
    const rec = g.recorder;
    const mark = rec.mark.bind(rec);
    rec.mark = (kind, label) => {
      R.marks.push({ t: t(), kind, label });
      if (kind === 'ko' && R.koAt < 0) R.koAt = t();
      return mark(kind, label);
    };
    rec.enabled = false;

    // ---- Autopilot: synthetic input from the player's seat.
    const poll = g.input.poll.bind(g.input);
    let nextPress = 0;
    g.input.poll = () => {
      const inp = poll();
      inp.keys = [];
      inp.presses = [];
      inp.moveX = 0;
      inp.moveY = 0;
      const p = g.player;
      const e = g.enemy;
      if (!e || !e.alive || !p.alive || g.holdIn > 0) return inp;
      const dx = e.pos.x - p.pos.x;
      const dz = e.pos.z - p.pos.z;
      const d = Math.hypot(dx, dz);
      const reach = (opts.reach ?? 1.15) + (e.scale - 1) * 0.6;
      let wx = 0;
      let wz = 0;
      if (d > reach) {
        wx = dx / d;
        wz = dz / d;
      } else if (d < reach * 0.6) {
        wx = -dx / d * 0.5;
        wz = -dz / d * 0.5;
      }
      const f = g.camRig.groundForward;
      const r = g.camRig.groundRight;
      inp.moveX = wx * r.x + wz * r.z;
      inp.moveY = wx * f.x + wz * f.z;
      if (d < reach + 0.35 && R.frame >= nextPress && p.state !== 'attack') {
        const pool = opts.buttons ?? ['rpunch', 'lpunch', 'rpunch', 'rkick', 'lkick'];
        inp.presses = [pool[Math.floor(Math.random() * pool.length)]];
        nextPress = R.frame + (opts.pressGap ?? 9) + Math.floor(Math.random() * 10);
      }
      return inp;
    };

    // ---- Portrait camera: along the fight line, raised, a little off to the side, so
    // the two stack up and down the 9:16 frame. Shake from the rig is kept.
    const rig = g.camRig;
    const update = rig.update.bind(rig);
    const cam = rig.camera;
    const pos = cam.position.clone();
    const look = cam.position.clone();
    const want = cam.position.clone();
    const wantLook = cam.position.clone();
    let primed = false;
    let side = 1;
    rig.update = (dt, f, target) => {
      update(dt, f, target);
      const shake = cam.position.clone().sub(rig.pos);
      const p = g.player.pos;
      const e = g.enemy ? (g.ragdolls.get(g.enemy)?.pelvisPos() ?? g.enemy.pos) : p;
      const big = g.enemy ? Math.max(0, g.enemy.scale - 1) : 0;
      let lx = e.x - p.x;
      let lz = e.z - p.z;
      const gap = Math.hypot(lx, lz) || 1;
      lx /= gap;
      lz /= gap;
      const ang = (opts.camAngle ?? 1.15) * side + Math.sin(R.frame / FPS * 0.35) * 0.12;
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      // Back along the line from the player, swung by `ang`.
      const bx = -(lx * ca - lz * sa);
      const bz = -(lx * sa + lz * ca);
      const dist = (opts.camDist ?? 3.7) + gap * 0.55 + big * 2.6;
      const mx = p.x + (e.x - p.x) * 0.5;
      const mz = p.z + (e.z - p.z) * 0.5;
      want.set(mx + bx * dist, (opts.camRise ?? 2.5) + big * 1.6, mz + bz * dist);
      // Stay in the room: try the other side, then come in closer.
      if (rig.inside && !rig.inside(want.x, want.z)) {
        const ox = -(lx * Math.cos(-ang) - lz * Math.sin(-ang));
        const oz = -(lx * Math.sin(-ang) + lz * Math.cos(-ang));
        if (rig.inside(mx + ox * dist, mz + oz * dist)) {
          side = -side;
          want.set(mx + ox * dist, want.y, mz + oz * dist);
        } else {
          for (let k = 0.9; k > 0.4 && !rig.inside(want.x, want.z); k -= 0.1) want.set(mx + bx * dist * k, want.y, mz + bz * dist * k);
        }
      }
      wantLook.set(mx, 0.95 + big * 0.9, mz);
      const a = primed ? 1 - Math.exp(-dt * 3.5) : 1;
      primed = true;
      pos.lerp(want, a);
      look.lerp(wantLook, a);
      cam.position.copy(pos).add(shake);
      cam.lookAt(look);
      const fov = opts.fov ?? 50;
      if (Math.abs(cam.fov - fov) > 0.01) {
        cam.fov = fov;
        cam.updateProjectionMatrix();
      }
    };

    // ---- The game's own slow-motion cuts are framed for 16:9: pull them back for 9:16.
    const play = g.cine.play.bind(g.cine);
    // They also take the portrait camera's side of the fight: shot over a shoulder, one
    // fighter hides the other in a narrow frame.
    g.cine.play = (shot) => {
      const at = shot.focus();
      const side = cam.position.clone().sub(at).setY(0);
      if (side.lengthSq() > 1e-4) shot = { ...shot, side: side.normalize().lerp(shot.side.clone().normalize(), 0.25) };
      play({ ...shot, distance: (shot.distance ?? 3) * (opts.cutPull ?? 1.45) });
    };

    // ---- The round.
    g.startRound(opts.round ?? 1);
    for (const e of g.enemies) {
      e.hp = e.stats.maxHp * (opts.enemyHp ?? 0.7);
      // They still land hits (and the damage shows), just not enough to end the take.
      e.stats.damageMul = (e.stats.damageMul ?? 1) * (opts.enemyDmg ?? 0.3);
    }
    rig.snap(g.player, g.enemy);
  };

  /** One frame of game time; returns the frame's pixels (bottom row first). */
  R.step = () => {
    const g = window.game;
    const p = g.player;
    // The player can't lose: they take the hits (and the damage shows), but never go down for good.
    const floor = p.stats.maxHp * 0.5;
    if (p.alive && p.hp < floor) p.hp = floor;
    R.frame++;
    g.frame(1 / FPS);
    const gl = g.renderer.getContext();
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    if (!R.buf || R.buf.length !== w * h * 4) R.buf = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, R.buf);
    return R.buf;
  };

  R.state = () => {
    const g = window.game;
    return { frame: R.frame, t: t(), koAt: R.koAt, phase: g.phase, alive: g.enemies.filter((e) => e.alive).length, shopOpen: g.shop.isOpen };
  };

  /** Render the logged sounds, in sync, as 16-bit stereo WAV bytes. */
  R.renderAudio = async (seconds) => {
    const g = window.game;
    const rate = 48000;
    const ctx = new OfflineAudioContext(2, Math.ceil(seconds * rate), rate);
    const sfx = new g.sfx.constructor();
    sfx.volume = g.sfx.volume;
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
    const Rch = buf.getChannelData(1);
    for (let i = 0; i < n; i++) {
      out.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 0x7fff, true);
      out.setInt16(46 + i * 4, Math.max(-1, Math.min(1, Rch[i])) * 0x7fff, true);
    }
    return new Uint8Array(out.buffer);
  };
})();
