import { AUDIO_VOLUME, percentToGain } from "./pinballAudioVolumes";

type GaplessLoopHandle = {
  source: AudioBufferSourceNode;
  gain: GainNode;
  baseVolume: number;
};

type OneShotHandle = {
  source: AudioBufferSourceNode;
  gain: GainNode;
};

type LoopBounds = {
  start: number;
  end: number;
};

const LOOP_BOUNDS_SCAN_STEP = 512;

export class SamplePlayer {
  private readonly gaplessLoops = new Map<string, GaplessLoopHandle>();
  private readonly loopBounds = new Map<string, LoopBounds>();
  private readonly rawCache = new Map<string, ArrayBuffer>();
  private readonly rawLoads = new Map<string, Promise<ArrayBuffer | null>>();
  private readonly bufferCache = new Map<string, AudioBuffer>();
  private readonly bufferLoads = new Map<string, Promise<AudioBuffer | null>>();
  private readonly gaplessPrepareLoads = new Map<string, Promise<void>>();
  private readonly activeOneShots = new Set<OneShotHandle>();

  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private cinematicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;

  ensureContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.musicBus = this.ctx.createGain();
      this.cinematicBus = this.ctx.createGain();
      this.sfxBus = this.ctx.createGain();

      this.musicBus.connect(this.master);
      this.cinematicBus.connect(this.master);
      this.sfxBus.connect(this.master);
      this.master.connect(this.ctx.destination);

      this.syncBusGains();
    }
    return this.ctx;
  }

  /** Recalcule les bus depuis AUDIO_VOLUME (appelé à l'init). */
  syncBusGains(): void {
    if (!this.master || !this.musicBus || !this.cinematicBus || !this.sfxBus) return;
    this.master.gain.value = percentToGain(AUDIO_VOLUME.master);
    this.musicBus.gain.value = percentToGain(AUDIO_VOLUME.music);
    this.cinematicBus.gain.value = percentToGain(AUDIO_VOLUME.cinematic);
    this.sfxBus.gain.value = percentToGain(AUDIO_VOLUME.sfx);
  }

  /** Durée en secondes du buffer en cache, null si pas encore chargé. */
  getBufferDuration(url: string): number | null {
    const buf = this.bufferCache.get(url);
    return buf ? buf.duration : null;
  }

  getMaster(): GainNode | null {
    this.ensureContext();
    return this.master;
  }

  getSfxBus(): GainNode | null {
    this.ensureContext();
    return this.sfxBus;
  }

  getCinematicBus(): GainNode | null {
    this.ensureContext();
    return this.cinematicBus;
  }

  /** Baisse musique + sfx pour laisser passer un hit cinématique. */
  duckBackground(durationS = 2.5): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicBus || !this.sfxBus) return;

    const now = ctx.currentTime;
    const musicTarget = percentToGain(AUDIO_VOLUME.music);
    const sfxTarget = percentToGain(AUDIO_VOLUME.sfx);

    this.musicBus.gain.cancelScheduledValues(now);
    this.musicBus.gain.setValueAtTime(this.musicBus.gain.value, now);
    this.musicBus.gain.linearRampToValueAtTime(musicTarget * 0.05, now + 0.04);
    this.musicBus.gain.linearRampToValueAtTime(musicTarget, now + durationS);

    this.sfxBus.gain.cancelScheduledValues(now);
    this.sfxBus.gain.setValueAtTime(this.sfxBus.gain.value, now);
    this.sfxBus.gain.linearRampToValueAtTime(sfxTarget * 0.12, now + 0.04);
    this.sfxBus.gain.linearRampToValueAtTime(sfxTarget, now + durationS);
  }

  isContextRunning(): boolean {
    return this.ctx?.state === "running";
  }

  resumeContext(): Promise<void> {
    const ctx = this.ensureContext();
    if (!ctx) return Promise.resolve();
    if (ctx.state === "running") return Promise.resolve();
    return ctx.resume().catch(() => undefined);
  }

  preloadBuffer(url: string): Promise<AudioBuffer | null> {
    return this.loadBuffer(url);
  }

  prepareGaplessLoop(url: string, silenceThreshold = 0.004): Promise<void> {
    const pending = this.gaplessPrepareLoads.get(url);
    if (pending) return pending;

    const load = this.loadBuffer(url).then((buffer) => {
      if (!buffer) return;
      if (!this.loopBounds.has(url)) {
        this.loopBounds.set(url, this.detectLoopBounds(buffer, silenceThreshold));
      }
    });

    this.gaplessPrepareLoads.set(url, load);
    return load;
  }

  isGaplessLoopReady(url: string): boolean {
    return this.bufferCache.has(url) && this.loopBounds.has(url);
  }

  isGaplessLoopPlaying(url: string): boolean {
    return this.gaplessLoops.has(url);
  }

  private startGaplessLoopSource(url: string, volume: number): boolean {
    const ctx = this.ensureContext();
    const musicBus = this.musicBus;
    const buffer = this.bufferCache.get(url);
    if (!ctx || !musicBus || !buffer) return false;
    if (this.gaplessLoops.has(url)) return true;

    const bounds = this.loopBounds.get(url) ?? { start: 0, end: buffer.duration };

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.loopStart = bounds.start;
    source.loopEnd = bounds.end;

    const gain = ctx.createGain();
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(musicBus);

    try {
      source.start(0, bounds.start);
    } catch {
      return false;
    }

    this.gaplessLoops.set(url, { source, gain, baseVolume: volume });
    return true;
  }

  async playGaplessLoop(url: string, volume: number): Promise<boolean> {
    await this.resumeContext();
    if (!this.isGaplessLoopReady(url)) {
      await this.prepareGaplessLoop(url);
    }
    return this.startGaplessLoopSource(url, volume);
  }

  playGaplessLoopInGesture(url: string, volume: number): boolean {
    this.ensureContext();
    return this.startGaplessLoopSource(url, volume);
  }

  stopGaplessLoop(url: string): void {
    const handle = this.gaplessLoops.get(url);
    if (!handle) return;
    try {
      handle.source.stop();
    } catch {
      // already stopped
    }
    handle.source.disconnect();
    handle.gain.disconnect();
    this.gaplessLoops.delete(url);
  }

  fadeOutGaplessLoop(url: string, fadeOutS: number): void {
    const handle = this.gaplessLoops.get(url);
    const ctx = this.ctx;
    if (!handle || !ctx) return;

    const now = ctx.currentTime;
    const startVol = handle.gain.gain.value;
    handle.gain.gain.cancelScheduledValues(now);
    handle.gain.gain.setValueAtTime(startVol, now);
    handle.gain.gain.linearRampToValueAtTime(0, now + fadeOutS);

    try {
      handle.source.stop(now + fadeOutS + 0.05);
    } catch {
      // already stopped
    }

    window.setTimeout(() => {
      this.stopGaplessLoop(url);
    }, fadeOutS * 1000 + 100);
  }

  private trackOneShot(source: AudioBufferSourceNode, gain: GainNode): void {
    const handle: OneShotHandle = { source, gain };
    this.activeOneShots.add(handle);
    source.onended = () => {
      this.activeOneShots.delete(handle);
      try {
        source.disconnect();
        gain.disconnect();
      } catch {
        // already disconnected
      }
    };
  }

  /** Coupe les pistes cinématiques/boss encore en lecture (ex. spawnDG). */
  stopActiveOneShots(): void {
    for (const { source, gain } of this.activeOneShots) {
      try {
        source.stop();
      } catch {
        // already stopped
      }
      try {
        source.disconnect();
        gain.disconnect();
      } catch {
        // already disconnected
      }
    }
    this.activeOneShots.clear();
  }

  playOneShotCached(url: string, volume: number): boolean {
    const ctx = this.ensureContext();
    const cinematicBus = this.cinematicBus;
    const buffer = this.bufferCache.get(url);
    if (!ctx || !cinematicBus || !buffer) return false;

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const g = ctx.createGain();
    g.gain.setValueAtTime(volume, ctx.currentTime);

    source.connect(g);
    g.connect(cinematicBus);
    source.start();
    this.trackOneShot(source, g);
    return true;
  }

  async playOneShotBuffer(url: string, volume: number): Promise<void> {
    await this.resumeContext();
    if (this.playOneShotCached(url, volume)) return;
    const buffer = await this.loadBuffer(url);
    if (!buffer) return;
    this.playOneShotCached(url, volume);
  }

  private fetchRaw(url: string): Promise<ArrayBuffer | null> {
    const cached = this.rawCache.get(url);
    if (cached) return Promise.resolve(cached);

    const pending = this.rawLoads.get(url);
    if (pending) return pending;

    const load = fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.arrayBuffer();
      })
      .then((data) => {
        this.rawCache.set(url, data);
        return data;
      })
      .catch((err) => {
        console.warn(`[SamplePlayer] Failed to fetch ${url}`, err);
        return null;
      });

    this.rawLoads.set(url, load);
    return load;
  }

  private loadBuffer(url: string): Promise<AudioBuffer | null> {
    const cached = this.bufferCache.get(url);
    if (cached) return Promise.resolve(cached);

    const pending = this.bufferLoads.get(url);
    if (pending) return pending;

    const load = this.fetchRaw(url).then(async (raw) => {
      if (!raw) return null;
      const ctx = this.ensureContext();
      if (!ctx) return null;
      const buffer = await ctx.decodeAudioData(raw.slice(0));
      this.bufferCache.set(url, buffer);
      return buffer;
    });

    this.bufferLoads.set(url, load);
    return load;
  }

  private detectLoopBounds(buffer: AudioBuffer, threshold: number): LoopBounds {
    const { length, sampleRate } = buffer;

    let firstAudible = 0;
    for (let i = 0; i < length; i += LOOP_BOUNDS_SCAN_STEP) {
      if (this.samplePeakAt(buffer, i) > threshold) {
        firstAudible = Math.max(0, i - LOOP_BOUNDS_SCAN_STEP);
        break;
      }
    }

    let lastAudible = length - 1;
    for (let i = length - 1; i >= 0; i -= LOOP_BOUNDS_SCAN_STEP) {
      if (this.samplePeakAt(buffer, i) > threshold) {
        lastAudible = Math.min(length - 1, i + LOOP_BOUNDS_SCAN_STEP);
        break;
      }
    }

    const start = firstAudible / sampleRate;
    const end = (lastAudible + 1) / sampleRate;
    if (end - start < 1) {
      return { start: 0, end: buffer.duration };
    }
    return { start, end };
  }

  private samplePeakAt(buffer: AudioBuffer, index: number): number {
    let peak = 0;
    for (let ch = 0; ch < buffer.numberOfChannels; ch += 1) {
      peak = Math.max(peak, Math.abs(buffer.getChannelData(ch)[index]));
    }
    return peak;
  }
}
