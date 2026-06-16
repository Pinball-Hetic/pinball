import {
  EARLY_SOUND_FADE_OUT_S,
  EARLY_SOUND_LOOP_SILENCE_THRESHOLD,
  getEarlySoundUrl,
} from "./pinballAudioConfig";
import { soundLevel } from "./pinballAudioVolumes";
import type { SamplePlayer } from "./SamplePlayer";

export type EarlySoundPhase = "off" | "armed" | "playing" | "released";

export class EarlySoundController {
  private phase: EarlySoundPhase = "off";
  private revealConsumed = false;

  constructor(private readonly samples: SamplePlayer) {}

  getPhase(): EarlySoundPhase {
    return this.phase;
  }

  arm(): Promise<void> {
    if (this.revealConsumed) return Promise.resolve();
    this.phase = "armed";
    return this.samples
      .prepareGaplessLoop(getEarlySoundUrl(), EARLY_SOUND_LOOP_SILENCE_THRESHOLD)
      .then(() => undefined);
  }

  async engage(): Promise<void> {
    if (this.revealConsumed) return;
    const url = getEarlySoundUrl();
    if (this.phase === "playing" || this.samples.isGaplessLoopPlaying(url)) {
      this.phase = "playing";
      return;
    }
    if (this.phase !== "armed" && this.phase !== "off") return;

    await this.samples.resumeContext();
    const started = await this.samples.playGaplessLoop(url, soundLevel("earlySound"));
    if (started) {
      this.phase = "playing";
    }
  }

  engageSync(): void {
    if (this.revealConsumed) return;
    const url = getEarlySoundUrl();
    if (this.phase === "playing" || this.samples.isGaplessLoopPlaying(url)) {
      this.phase = "playing";
      return;
    }
    if (this.phase !== "armed" && this.phase !== "off") return;

    this.samples.ensureContext();
    void this.samples.resumeContext();
    if (!this.samples.isGaplessLoopReady(url)) {
      void this.engage();
      return;
    }
    const started = this.samples.playGaplessLoopInGesture(url, soundLevel("earlySound"));
    if (started) {
      this.phase = "playing";
    }
  }

  release(): void {
    if (this.phase === "off") return;
    this.samples.fadeOutGaplessLoop(getEarlySoundUrl(), EARLY_SOUND_FADE_OUT_S);
    this.phase = "released";
  }

  consumeOnBossReveal(): void {
    this.revealConsumed = true;
    this.samples.stopGaplessLoop(getEarlySoundUrl());
    this.phase = "released";
  }

  resetForNewGame(): void {
    this.revealConsumed = false;
    this.samples.stopGaplessLoop(getEarlySoundUrl());
    this.phase = "off";
  }

  /** Clears armed state only — intentionally does not stop an active loop. */
  disarm(): void {
    if (this.phase === "playing") return;
    this.phase = "off";
  }
}
