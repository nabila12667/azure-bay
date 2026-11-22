// Sound, all synthesized with WebAudio — no audio files, no network. A
// low engine hum that follows the car's speed, a two-tone siren when the
// police are close, gunshots, punches, pickups, mission jingles and a
// slow bass-and-hats groove under it all. Nothing plays before the first
// user gesture; M mutes everything.

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let musicTimer = null;
  let muted = false;
  let musicStep = 0;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 60;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 400;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'square';
      sirenOsc.frequency.value = 700;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
    } catch {
      return false;
    }
    return true;
  }

  function unlock() {
    if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  function tone(freq, duration, type, volume, when) {
    if (!ctx || muted) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.value = freq;
      const t = ctx.currentTime + (when || 0);
      gain.gain.setValueAtTime(volume || 0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
      osc.connect(gain);
      gain.connect(master);
      osc.start(t);
      osc.stop(t + duration + 0.05);
    } catch {
      // Sound is garnish: never let it break the game.
    }
  }

  function noise(duration, volume, filterFreq) {
    if (!ctx || muted) return;
    try {
      const len = Math.floor(ctx.sampleRate * duration);
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = filterFreq || 1200;
      const gain = ctx.createGain();
      gain.gain.value = volume || 0.3;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      src.start();
    } catch {
      // See above.
    }
  }

  // A slow groove: root notes on the bass, hats on the off-beats.
  const BASS_LINE = [55, 55, 65.4, 49, 55, 55, 73.4, 65.4];
  function startMusic() {
    if (!ctx || musicTimer) return;
    musicTimer = window.setInterval(() => {
      if (muted || !ctx) return;
      const note = BASS_LINE[musicStep % BASS_LINE.length];
      tone(note, 0.5, 'triangle', 0.12);
      if (musicStep % 2 === 1) noise(0.05, 0.04, 6000);
      musicStep += 1;
    }, 300);
  }

  return {
    unlock,
    startMusic,
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    engine(speed, driving) {
      if (!ctx || muted) return;
      const target = driving ? 0.05 + Math.min(0.1, Math.abs(speed) / 6000) : 0;
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.1);
      engineOsc.frequency.setTargetAtTime(55 + Math.abs(speed) * 0.12, ctx.currentTime, 0.1);
    },
    siren(on) {
      if (!ctx) return;
      sirenGain.gain.setTargetAtTime(on && !muted ? 0.045 : 0, ctx.currentTime, 0.2);
      if (on) sirenOsc.frequency.setTargetAtTime(650 + Math.sin(performance.now() / 280) * 180, ctx.currentTime, 0.05);
    },
    shot() {
      noise(0.12, 0.35, 2500);
      tone(180, 0.08, 'square', 0.12);
    },
    shotgun() {
      noise(0.3, 0.5, 900);
      tone(90, 0.25, 'square', 0.25);
      tone(55, 0.3, 'sine', 0.3);
    },
    beep() {
      tone(880, 0.12, 'sine', 0.22);
    },
    punch() {
      noise(0.08, 0.25, 500);
      tone(90, 0.1, 'sine', 0.25);
    },
    pickup() {
      tone(660, 0.09, 'sine', 0.2);
      tone(880, 0.12, 'sine', 0.2, 0.08);
    },
    cash() {
      tone(990, 0.07, 'triangle', 0.18);
      tone(1320, 0.12, 'triangle', 0.18, 0.06);
    },
    explosion() {
      noise(0.7, 0.5, 700);
      tone(55, 0.6, 'sine', 0.4);
    },
    sting() {
      tone(220, 0.15, 'square', 0.15);
      tone(174, 0.25, 'square', 0.15, 0.14);
    },
    jingle() {
      tone(523, 0.12, 'triangle', 0.22);
      tone(659, 0.12, 'triangle', 0.22, 0.11);
      tone(784, 0.2, 'triangle', 0.24, 0.22);
    },
    fail() {
      tone(330, 0.2, 'sawtooth', 0.14);
      tone(247, 0.35, 'sawtooth', 0.14, 0.18);
    },
    busted() {
      tone(392, 0.15, 'square', 0.18);
      tone(311, 0.15, 'square', 0.18, 0.14);
      tone(233, 0.3, 'square', 0.18, 0.28);
    },
  };
}
