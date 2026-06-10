import {
  EARLY_SOUND_FADE_OUT_S,
  EARLY_SOUND_GAIN,
  EARLY_SOUND_LOOP_SILENCE_THRESHOLD,
  EARLY_SOUND_URL,
} from "./pinballAudioConfig";
import type { SamplePlayer } from "./SamplePlayer";

export type EarlySoundPhase = "off" | "armed" | "playing" | "released";

export class EarlySoundController {
  private phase: EarlySoundPhase = "off";
  private demogorgonConsumed = false;

  constructor(private readonly samples: SamplePlayer) {}

  getPhase(): EarlySoundPhase {
    return this.phase;
  }

  arm(): Promise<void> {
    if (this.demogorgonConsumed) return Promise.resolve();
    this.phase = "armed";
    return this.samples
      .prepareGaplessLoop(EARLY_SOUND_URL, EARLY_SOUND_LOOP_SILENCE_THRESHOLD)
      .then(() => undefined);
  }

  async engage(): Promise<void> {
    if (this.demogorgonConsumed) return;
    if (this.phase === "playing" || this.samples.isGaplessLoopPlaying(EARLY_SOUND_URL)) {
      this.phase = "playing";
      return;
    }
    if (this.phase !== "armed" && this.phase !== "off") return;

    await this.samples.resumeContext();
    const started = await this.samples.playGaplessLoop(EARLY_SOUND_URL, EARLY_SOUND_GAIN);
    if (started) {
      this.phase = "playing";
    }
  }

  engageSync(): void {
    if (this.demogorgonConsumed) return;
    if (this.phase === "playing" || this.samples.isGaplessLoopPlaying(EARLY_SOUND_URL)) {
      this.phase = "playing";
      return;
    }
    if (this.phase !== "armed" && this.phase !== "off") return;

    this.samples.ensureContext();
    void this.samples.resumeContext();
    if (!this.samples.isGaplessLoopReady(EARLY_SOUND_URL)) {
      void this.engage();
      return;
    }
    const started = this.samples.playGaplessLoopInGesture(EARLY_SOUND_URL, EARLY_SOUND_GAIN);
    if (started) {
      this.phase = "playing";
    }
  }

  release(): void {
    if (this.phase === "off") return;
    this.samples.fadeOutGaplessLoop(EARLY_SOUND_URL, EARLY_SOUND_FADE_OUT_S);
    this.phase = "released";
  }

  consumeForDemogorgon(): void {
    this.demogorgonConsumed = true;
    this.release();
  }

  resetForNewGame(): void {
    this.demogorgonConsumed = false;
    this.samples.stopGaplessLoop(EARLY_SOUND_URL);
    this.phase = "off";
  }

  disarm(): void {
    if (this.phase === "playing") return;
    this.phase = "off";
  }
}
