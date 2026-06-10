import { MASTER_GAIN } from "./pinballAudioConfig";
import type { SamplePlayer } from "./SamplePlayer";

export class SfxEngine {
  private contextUnlocked = false;

  constructor(private readonly samples: SamplePlayer) {
    const master = this.samples.getMaster();
    if (master) master.gain.value = MASTER_GAIN;
  }

  markContextUnlocked(): void {
    this.contextUnlocked = true;
  }

  private playNow(play: () => void): void {
    const ctx = this.samples.ensureContext();
    if (!ctx) return;

    if (this.contextUnlocked && this.samples.isContextRunning()) {
      play();
      return;
    }

    void this.samples.resumeContext().then(() => {
      this.contextUnlocked = true;
      play();
    });
  }

  playLaunch(): void {
    this.playNow(() => {
      this.playNoise(0.12, 0.35, 1200);
      this.playTone(220, 0.14, "sawtooth", 0.12, -120);
      this.playTone(520, 0.08, "square", 0.06, 40);
    });
  }

  playBumper(bumperIndex: number): void {
    this.playNow(() => {
      const detune = bumperIndex * 90 - 90;
      this.playTone(340, 0.11, "triangle", 0.22, detune);
      this.playTone(680, 0.07, "sine", 0.1, detune * 0.5);
    });
  }

  playTargetHit(hitCount: number): void {
    this.playNow(() => {
      const detune = hitCount * 120;
      this.playTone(620 + detune, 0.09, "square", 0.16, detune);
      this.playTone(1240 + detune, 0.05, "sine", 0.08, detune * 0.5);
    });
  }

  playVictory(): void {
    this.playNow(() => {
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, i) => {
        window.setTimeout(() => this.playTone(freq, 0.22, "triangle", 0.2 - i * 0.02), i * 90);
      });
      window.setTimeout(() => this.playNoise(0.15, 0.12, 2000), 280);
    });
  }

  playElevenAssist(): void {
    this.playNow(() => {
      this.playTone(140, 0.22, "sine", 0.16, -40);
      this.playTone(420, 0.1, "triangle", 0.08, 80);
      this.playNoise(0.14, 0.1, 900);
    });
  }

  playPortalEnter(): void {
    this.playNow(() => {
      this.playTone(48, 0.62, "sawtooth", 0.16, -180);
      this.playTone(96, 0.48, "sine", 0.08, 60);
      this.playNoise(0.42, 0.17, 130);
      window.setTimeout(() => this.playTone(620, 0.16, "triangle", 0.07, -220), 90);
      window.setTimeout(() => this.playTone(310, 0.22, "sine", 0.05, 140), 210);
    });
  }

  playPortalTremor(): void {
    this.playNow(() => {
      this.playTone(40, 2.1, "sawtooth", 0.13, -140);
      this.playTone(78, 1.9, "square", 0.05, 90);
      this.playNoise(0.5, 0.11, 110);
      window.setTimeout(() => this.playNoise(0.32, 0.09, 85), 360);
      window.setTimeout(() => this.playNoise(0.26, 0.08, 65), 720);
      window.setTimeout(() => this.playNoise(0.2, 0.07, 50), 1080);
      window.setTimeout(() => this.playNoise(0.16, 0.06, 42), 1440);
    });
  }

  playBottomOut(): void {
    this.playNow(() => {
      this.playTone(120, 0.28, "sawtooth", 0.14);
      this.playTone(80, 0.35, "triangle", 0.1);
      this.playNoise(0.22, 0.12, 320);
    });
  }

  playPortalTransitionEnd(): void {
    this.playNow(() => {
      this.playTone(180, 0.24, "triangle", 0.11);
      this.playTone(360, 0.14, "sine", 0.06);
      this.playTone(540, 0.08, "triangle", 0.04);
      this.playNoise(0.14, 0.09, 1500);
      this.playNoise(0.1, 0.06, 820);
    });
  }

  private playTone(
    freq: number,
    duration: number,
    type: OscillatorType,
    gain: number,
    detune = 0,
  ): void {
    const ctx = this.samples.ensureContext();
    const master = this.samples.getMaster();
    if (!ctx || !master) return;

    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    osc.detune.value = detune;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.connect(g);
    g.connect(master);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration + 0.02);
  }

  private playNoise(duration: number, gain: number, freq = 900): void {
    const ctx = this.samples.ensureContext();
    const master = this.samples.getMaster();
    if (!ctx || !master) return;

    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    source.connect(filter);
    filter.connect(g);
    g.connect(master);
    source.start(ctx.currentTime);
    source.stop(ctx.currentTime + duration + 0.02);
  }
}
