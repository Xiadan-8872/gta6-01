// All sound is synthesized with WebAudio — no audio files, no network. A tiny synth
// (oscillators + filtered noise) plays the effects, an engine hum follows the speed,
// and a quiet synthwave pad loops underneath while the game runs. Audio starts on the
// first user gesture (browsers block it before then) and M toggles mute.
export function createAudio() {
  let ctx = null;
  let master = null;
  let musicNodes = null;
  let engineNodes = null;
  let muted = false;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
    } catch {
      return false;
    }
    return true;
  }

  function tone({ freq = 440, to = null, type = 'square', dur = 0.08, vol = 0.2, when = 0 }) {
    if (!ctx || !master) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (to !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise({ dur = 0.25, vol = 0.3, freq = 1200, when = 0 }) {
    if (!ctx || !master) return;
    const t0 = ctx.currentTime + when;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t0);
  }

  const sfx = {
    crash() {
      noise({ dur: 0.22, vol: 0.3, freq: 500 });
      tone({ freq: 140, to: 55, type: 'sawtooth', dur: 0.2, vol: 0.22 });
    },
    scrape() {
      noise({ dur: 0.12, vol: 0.12, freq: 2400 });
    },
    pickup() {
      tone({ freq: 660, type: 'sine', dur: 0.07, vol: 0.16 });
      tone({ freq: 990, type: 'sine', dur: 0.09, vol: 0.16, when: 0.06 });
    },
    cash() {
      tone({ freq: 880, type: 'sine', dur: 0.06, vol: 0.18 });
      tone({ freq: 1175, type: 'sine', dur: 0.06, vol: 0.18, when: 0.06 });
      tone({ freq: 1568, type: 'sine', dur: 0.14, vol: 0.18, when: 0.12 });
    },
    siren() {
      tone({ freq: 740, type: 'triangle', dur: 0.28, vol: 0.07 });
      tone({ freq: 988, type: 'triangle', dur: 0.28, vol: 0.07, when: 0.3 });
    },
    horn() {
      tone({ freq: 370, type: 'square', dur: 0.14, vol: 0.1 });
      tone({ freq: 466, type: 'square', dur: 0.14, vol: 0.1 });
    },
    skid() {
      noise({ dur: 0.3, vol: 0.1, freq: 3000 });
    },
    busted() {
      tone({ freq: 220, to: 110, type: 'sawtooth', dur: 0.5, vol: 0.25 });
      noise({ dur: 0.4, vol: 0.2, freq: 400 });
    },
    over() {
      tone({ freq: 392, to: 370, type: 'triangle', dur: 0.25, vol: 0.2 });
      tone({ freq: 311, to: 294, type: 'triangle', dur: 0.25, vol: 0.2, when: 0.22 });
      tone({ freq: 233, to: 220, type: 'triangle', dur: 0.5, vol: 0.2, when: 0.44 });
    },
    win() {
      [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, type: 'sine', dur: 0.22, vol: 0.18, when: i * 0.11 }));
    },
    click() {
      tone({ freq: 880, type: 'sine', dur: 0.04, vol: 0.12 });
    },
  };

  function startMusic() {
    if (!ctx || !master || musicNodes) return;
    const padGain = ctx.createGain();
    padGain.gain.value = 0.045;
    padGain.connect(master);
    const o1 = ctx.createOscillator();
    o1.type = 'sawtooth';
    o1.frequency.value = 55;
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = 110;
    const o3 = ctx.createOscillator();
    o3.type = 'triangle';
    o3.frequency.value = 220;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.1;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.02;
    lfo.connect(lfoGain);
    lfoGain.connect(padGain.gain);
    o1.connect(filter);
    filter.connect(padGain);
    o2.connect(padGain);
    o3.connect(padGain);
    o1.start();
    o2.start();
    o3.start();
    lfo.start();
    musicNodes = { o1, o2, o3, lfo, padGain, filter };
  }

  function startEngine() {
    if (!ctx || !master || engineNodes) return;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 55;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    const gain = ctx.createGain();
    gain.gain.value = 0.0;
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    osc.start();
    engineNodes = { osc, gain, filter };
  }

  function setEngine(speed01, handbrake) {
    if (!ctx || !engineNodes) return;
    const t = ctx.currentTime;
    engineNodes.osc.frequency.setTargetAtTime(55 + speed01 * 165 + (handbrake ? 30 : 0), t, 0.08);
    engineNodes.gain.gain.setTargetAtTime(0.028 + speed01 * 0.05, t, 0.1);
  }

  function setMuted(value) {
    muted = value;
    if (master && ctx) master.gain.setValueAtTime(muted ? 0 : 0.5, ctx.currentTime);
    return muted;
  }

  return {
    unlock() {
      if (ensure()) {
        startMusic();
        startEngine();
      }
    },
    play(name) {
      if (!ensure()) return;
      const fn = sfx[name];
      if (fn) fn();
    },
    setEngine,
    toggleMute() {
      ensure();
      return setMuted(!muted);
    },
    isMuted() {
      return muted;
    },
  };
}
