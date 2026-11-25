// Game sounds, synthesised with WebAudio (no audio files): soft bells, a marimba, a quiet clock
// tick and a little room reverb, all in consonant intervals. Browsers only allow sound after a
// click or key press on the page; the projector unlocks it on any interaction.
import { useCallback, useEffect, useRef, useState } from 'react';

export type SoundName = 'ready' | 'start' | 'tick' | 'tickFinal' | 'timeup' | 'trap' | 'report' | 'step' | 'fanfare';

export const SOUND_LABELS: Record<SoundName, string> = {
  ready: 'Звук включён',
  start: 'Старт обсуждения',
  tick: 'Последние секунды',
  tickFinal: 'Последние 3 секунды',
  timeup: 'Время вышло',
  trap: 'Ловушка',
  report: 'Начало доклада',
  step: 'Шаг фишки',
  fanfare: 'Итоги раунда',
};

const NOTE = { C4: 261.6, G4: 392, A4: 440, C5: 523.3, D5: 587.3, E5: 659.3, F5: 698.5, G5: 784, A5: 880, C6: 1046.5, E6: 1318.5, G6: 1568 };
const STEP_SCALE = [NOTE.C5, NOTE.D5, NOTE.E5, NOTE.G5, NOTE.A5, NOTE.C6, NOTE.A5, NOTE.G5, NOTE.E5, NOTE.D5];

interface Synth {
  c: AudioContext;
  dry: GainNode; // → master
  wet: GainNode; // → reverb → master
  noise: AudioBuffer;
}

// Bell: a few sine partials, the higher ones fade faster.
function bell(s: Synth, f: number, at: number, vol = 0.5, decay = 1.6) {
  const partials: [number, number][] = [[1, 1], [2, 0.42], [3, 0.2], [4.2, 0.1], [5.4, 0.05]];
  partials.forEach(([mult, amp], i) => {
    const osc = s.c.createOscillator();
    const g = s.c.createGain();
    osc.type = 'sine';
    osc.frequency.value = f * mult;
    const d = decay / (1 + i * 0.7);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol * amp, at + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, at + d);
    osc.connect(g);
    g.connect(s.dry);
    g.connect(s.wet);
    osc.start(at);
    osc.stop(at + d + 0.05);
  });
}

// Marimba: warm fundamental plus a short woody overtone.
function marimba(s: Synth, f: number, at: number, vol = 0.45, decay = 0.55) {
  const parts: [number, number, number][] = [[1, 1, decay], [4, 0.18, decay * 0.25], [10, 0.05, decay * 0.1]];
  for (const [mult, amp, d] of parts) {
    const osc = s.c.createOscillator();
    const g = s.c.createGain();
    osc.type = 'sine';
    osc.frequency.value = f * mult;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol * amp, at + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, at + d);
    osc.connect(g);
    g.connect(s.dry);
    g.connect(s.wet);
    osc.start(at);
    osc.stop(at + d + 0.05);
  }
}

// Clock tick: a filtered noise click plus a short woody «tok», like a wooden clock.
function tick(s: Synth, at: number, vol = 0.22, pitch = 2400) {
  const src = s.c.createBufferSource();
  src.buffer = s.noise;
  const bp = s.c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = pitch;
  bp.Q.value = 2.5;
  const g = s.c.createGain();
  g.gain.setValueAtTime(vol * 2.5, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.045);
  src.connect(bp).connect(g);
  g.connect(s.dry);
  src.start(at, Math.random() * 0.5, 0.06);
  const tok = s.c.createOscillator();
  const tg = s.c.createGain();
  tok.type = 'sine';
  tok.frequency.value = pitch * 0.55;
  tg.gain.setValueAtTime(0.0001, at);
  tg.gain.exponentialRampToValueAtTime(vol * 0.7, at + 0.002);
  tg.gain.exponentialRampToValueAtTime(0.0001, at + 0.06);
  tok.connect(tg);
  tg.connect(s.dry);
  tok.start(at);
  tok.stop(at + 0.08);
}

// Soft pad under a chord: two slightly detuned triangles through a low-pass filter.
function pad(s: Synth, freqs: number[], at: number, dur: number, vol = 0.12) {
  const lp = s.c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1400;
  const g = s.c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + 0.25);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  lp.connect(g);
  g.connect(s.dry);
  g.connect(s.wet);
  for (const f of freqs) {
    for (const detune of [-6, 6]) {
      const osc = s.c.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = f;
      osc.detune.value = detune;
      osc.connect(lp);
      osc.start(at);
      osc.stop(at + dur + 0.05);
    }
  }
}

// Airy whoosh: noise swept through a band-pass filter.
function whoosh(s: Synth, at: number, vol = 0.18) {
  const src = s.c.createBufferSource();
  src.buffer = s.noise;
  const bp = s.c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 1.2;
  bp.frequency.setValueAtTime(300, at);
  bp.frequency.exponentialRampToValueAtTime(3200, at + 0.35);
  const g = s.c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + 0.15);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.4);
  src.connect(bp).connect(g);
  g.connect(s.dry);
  g.connect(s.wet);
  src.start(at, 0, 0.45);
}

function perform(s: Synth, name: SoundName, t: number, step: number) {
  switch (name) {
    case 'ready':
      bell(s, NOTE.G5, t, 0.4, 1.2);
      bell(s, NOTE.C6, t + 0.13, 0.4, 1.6);
      break;
    case 'start':
      [NOTE.C5, NOTE.E5, NOTE.G5].forEach((f, i) => marimba(s, f, t + i * 0.09));
      bell(s, NOTE.C6, t + 0.27, 0.42, 1.8);
      break;
    case 'tick':
      tick(s, t, 0.2, step % 2 ? 2000 : 2600);
      break;
    case 'tickFinal':
      tick(s, t, 0.26, 2600);
      marimba(s, NOTE.A5, t, 0.22, 0.35);
      break;
    case 'timeup':
      bell(s, NOTE.G5, t, 0.42, 1.6);
      bell(s, NOTE.E5, t + 0.24, 0.42, 1.8);
      bell(s, NOTE.C5, t + 0.48, 0.46, 2.6);
      pad(s, [NOTE.C4, NOTE.G4], t + 0.48, 2.2, 0.1);
      break;
    case 'trap':
      whoosh(s, t);
      marimba(s, NOTE.A4 / 2, t + 0.12, 0.5, 0.8);
      [NOTE.A5, NOTE.F5, NOTE.A5, NOTE.F5].forEach((f, i) => bell(s, f, t + 0.14 + i * 0.17, 0.32, 0.9));
      break;
    case 'report':
      bell(s, NOTE.C6, t, 0.32, 1.1);
      bell(s, NOTE.G6, t + 0.09, 0.2, 1.1);
      break;
    case 'step':
      marimba(s, STEP_SCALE[step % STEP_SCALE.length], t, 0.24, 0.35);
      break;
    case 'fanfare':
      [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6].forEach((f, i) => marimba(s, f, t + i * 0.1, 0.42));
      bell(s, NOTE.C6, t + 0.42, 0.38, 2);
      bell(s, NOTE.E6, t + 0.42, 0.22, 2);
      pad(s, [NOTE.C5, NOTE.G5], t + 0.42, 1.8, 0.08);
      break;
  }
}

let musicContext: AudioContext | null = null;

function makeSynth(): { synth: Synth; master: GainNode } {
  const c = new AudioContext();
  const master = c.createGain();
  const compressor = c.createDynamicsCompressor();
  compressor.threshold.value = -24;
  compressor.knee.value = 8;
  compressor.ratio.value = 4;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.25;
  const makeup = c.createGain();
  makeup.gain.value = 2.2;
  const limiter = c.createDynamicsCompressor();
  limiter.threshold.value = -1.5;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.1;
  master.connect(compressor).connect(makeup).connect(limiter).connect(c.destination);
  musicContext = c;

  // Small room reverb from a decaying noise impulse.
  const seconds = 1.8;
  const impulse = c.createBuffer(2, Math.floor(c.sampleRate * seconds), c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 3);
  }
  const reverb = c.createConvolver();
  reverb.buffer = impulse;
  const wet = c.createGain();
  wet.gain.value = 0.28;
  wet.connect(reverb).connect(master);
  const dry = c.createGain();
  dry.connect(master);

  const noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  return { synth: { c, dry, wet, noise }, master };
}

// Music has a separate gain and limiter, so the effects volume never changes it.
const musicTracks = ['/theme/music-1.mp3', '/theme/music-2.mp3'];
let musicAudio: HTMLAudioElement | null = null;
let musicGain: GainNode | null = null;
let musicWanted = false;
let musicVolume = 60;
let musicIndex = 0;
let musicStop: ReturnType<typeof setTimeout> | undefined;

export function setMusic(on: boolean, volume = musicVolume) {
  musicWanted = on;
  musicVolume = volume;
  const c = musicContext;
  if (!c) return;
  if (!musicAudio) {
    musicAudio = new Audio(musicTracks[0]);
    musicAudio.preload = 'auto';
    musicAudio.addEventListener('ended', () => {
      musicIndex = (musicIndex + 1) % musicTracks.length;
      musicAudio!.src = musicTracks[musicIndex];
      if (musicWanted) void musicAudio!.play().catch(() => {});
    });
    try {
      const source = c.createMediaElementSource(musicAudio);
      const limiter = c.createDynamicsCompressor();
      limiter.threshold.value = -2;
      limiter.knee.value = 0;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.15;
      musicGain = c.createGain();
      musicGain.gain.value = 0;
      source.connect(musicGain).connect(limiter).connect(c.destination);
    } catch {
      musicGain = null;
      musicAudio.volume = 0;
    }
  }
  const target = on ? (Math.max(0, Math.min(100, volume)) / 100) ** 1.5 * 1.6 : 0;
  if (musicGain) {
    musicGain.gain.cancelScheduledValues(c.currentTime);
    musicGain.gain.setValueAtTime(musicGain.gain.value, c.currentTime);
    musicGain.gain.setTargetAtTime(target, c.currentTime, on ? 0.8 : 0.4);
  } else musicAudio.volume = Math.min(1, target);
  clearTimeout(musicStop);
  if (on) {
    if (musicAudio.paused) void musicAudio.play().catch(() => {});
  } else musicStop = setTimeout(() => { if (!musicWanted) musicAudio?.pause(); }, 2500);
}

// volume: 0..100. autoUnlock: unlock on any click/key on the page and greet with a chime (projector).
export function useSound({ volume = 70, autoUnlock = true }: { volume?: number; autoUnlock?: boolean } = {}) {
  const synth = useRef<Synth | null>(null);
  const master = useRef<GainNode | null>(null);
  const announced = useRef(false);
  const steps = useRef(0);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (master.current) master.current.gain.value = (Math.max(0, Math.min(100, volume)) / 100) ** 1.3 * 4;
  }, [volume, enabled]);

  const play = useCallback((name: SoundName) => {
    const s = synth.current;
    if (!s || s.c.state !== 'running') return;
    perform(s, name, s.c.currentTime + 0.02, name === 'step' || name === 'tick' ? steps.current++ : 0);
  }, []);

  const enable = useCallback((greet = autoUnlock) => {
    if (!synth.current) {
      const made = makeSynth();
      synth.current = made.synth;
      master.current = made.master;
      master.current.gain.value = (Math.max(0, Math.min(100, volume)) / 100) ** 1.3 * 4;
      const c = made.synth.c;
      // The browser may suspend audio later (sleep, device change) — then ask for a click again.
      c.onstatechange = () => {
        if (c.state !== 'running') announced.current = false;
        setEnabled(c.state === 'running');
      };
    }
    const c = synth.current.c;
    const unlocked = () => {
      if (c.state !== 'running') return false;
      setEnabled(true);
      if (greet && !announced.current) {
        announced.current = true;
        play('ready'); // audible confirmation that sound works
      }
      return true;
    };
    return c.state === 'running' ? Promise.resolve(unlocked()) : c.resume().then(unlocked);
  }, [autoUnlock, play, volume]);

  useEffect(() => {
    if (!autoUnlock) return;
    const unlock = () => void enable();
    const events = ['pointerdown', 'keydown', 'touchstart'] as const;
    for (const e of events) window.addEventListener(e, unlock);
    return () => { for (const e of events) window.removeEventListener(e, unlock); };
  }, [autoUnlock, enable]);

  return { enabled, enable, play };
}
