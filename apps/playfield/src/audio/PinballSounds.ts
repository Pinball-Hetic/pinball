import type { GameEvent } from "@pinball/game-engine";
import { DEMOGORGON_TARGET_HITS } from "@pinball/game-engine";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

function ensureAudio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
  }
  return ctx;
}

export function unlockPinballAudio(): void {
  const audio = ensureAudio();
  if (!audio) return;
  if (audio.state === "suspended") void audio.resume();
}

function playTone(
  freq: number,
  duration: number,
  type: OscillatorType,
  gain: number,
  detune = 0,
): void {
  const audio = ensureAudio();
  if (!audio || !master) return;
  unlockPinballAudio();

  const osc = audio.createOscillator();
  const g = audio.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  osc.detune.value = detune;
  g.gain.setValueAtTime(0.0001, audio.currentTime);
  g.gain.exponentialRampToValueAtTime(gain, audio.currentTime + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + duration);
  osc.connect(g);
  g.connect(master);
  osc.start(audio.currentTime);
  osc.stop(audio.currentTime + duration + 0.02);
}

function playNoise(duration: number, gain: number, freq = 900): void {
  const audio = ensureAudio();
  if (!audio || !master) return;
  unlockPinballAudio();

  const bufferSize = Math.floor(audio.sampleRate * duration);
  const buffer = audio.createBuffer(1, bufferSize, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }

  const source = audio.createBufferSource();
  source.buffer = buffer;
  const filter = audio.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = freq;
  const g = audio.createGain();
  g.gain.setValueAtTime(gain, audio.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + duration);
  source.connect(filter);
  filter.connect(g);
  g.connect(master);
  source.start(audio.currentTime);
  source.stop(audio.currentTime + duration + 0.02);
}

function playLaunch(): void {
  playNoise(0.12, 0.35, 1200);
  playTone(220, 0.14, "sawtooth", 0.12, -120);
  playTone(520, 0.08, "square", 0.06, 40);
}

function playBumper(bumperIndex: number): void {
  const detune = bumperIndex * 90 - 90;
  playTone(340, 0.11, "triangle", 0.22, detune);
  playTone(680, 0.07, "sine", 0.1, detune * 0.5);
}

function playDemogorgonReveal(): void {
  playTone(55, 0.55, "sawtooth", 0.18, -200);
  playTone(110, 0.45, "square", 0.1, 100);
  playNoise(0.35, 0.2, 180);
  window.setTimeout(() => playTone(880, 0.2, "sawtooth", 0.08, -300), 120);
}

function playTargetHit(hitCount: number): void {
  const detune = hitCount * 120;
  playTone(620 + detune, 0.09, "square", 0.16, detune);
  playTone(1240 + detune, 0.05, "sine", 0.08, detune * 0.5);
}

function playVictory(): void {
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((freq, i) => {
    window.setTimeout(() => playTone(freq, 0.22, "triangle", 0.2 - i * 0.02), i * 90);
  });
  window.setTimeout(() => playNoise(0.15, 0.12, 2000), 280);
}

function playElevenAssist(): void {
  playTone(140, 0.22, "sine", 0.16, -40);
  playTone(420, 0.1, "triangle", 0.08, 80);
  playNoise(0.14, 0.1, 900);
}

function playPortalEnter(): void {
  playTone(90, 0.6, "sawtooth", 0.14, -180);
  playTone(180, 0.5, "square", 0.08, 60);
  playNoise(0.5, 0.22, 240);
  window.setTimeout(() => playTone(55, 0.35, "sine", 0.12, -120), 180);
  window.setTimeout(() => playNoise(0.25, 0.15, 600), 420);
}

function playPortalTransitionEnd(): void {
  playTone(220, 0.18, "triangle", 0.1);
  playNoise(0.12, 0.08, 1400);
}

export function handlePinballSoundEvent(event: GameEvent): void {
  switch (event.type) {
    case "BALL_LAUNCHED":
      playLaunch();
      break;
    case "BUMPER_HIT":
      playBumper(event.bumperIndex);
      break;
    case "DEMOGORGON_REVEAL":
      playDemogorgonReveal();
      break;
    case "DEMOGORGON_TARGET_HIT":
      playTargetHit(event.hitCount);
      if (event.hitCount >= DEMOGORGON_TARGET_HITS) {
        window.setTimeout(() => playVictory(), 80);
      }
      break;
    case "ELEVEN_ASSIST":
      playElevenAssist();
      break;
    case "PORTAL_ENTER":
      playPortalEnter();
      break;
    case "PORTAL_TRANSITION_END":
      playPortalTransitionEnd();
      break;
    default:
      break;
  }
}
