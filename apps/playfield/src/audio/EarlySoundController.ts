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
  /** Bloque toute reprise tant que le boss tient la piste musique. */
  private handoffBlocked = false;

  constructor(private readonly samples: SamplePlayer) {}

  getPhase(): EarlySoundPhase {
    return this.phase;
  }

  arm(): Promise<void> {
<<<<<<< HEAD
    if (this.handoffBlocked) return Promise.resolve();
=======
>>>>>>> origin/dev
    this.phase = "armed";
    return this.samples
      .prepareGaplessLoop(getEarlySoundUrl(), EARLY_SOUND_LOOP_SILENCE_THRESHOLD)
      .then(() => undefined);
  }

  async engage(): Promise<void> {
    if (this.handoffBlocked) return;
<<<<<<< HEAD
    const url = getEarlySoundUrl();
    if (this.phase === "playing" || this.samples.isGaplessLoopPlaying(url)) {
=======
    if (this.phase === "playing" || this.samples.isGaplessLoopPlaying(EARLY_SOUND_URL)) {
>>>>>>> origin/dev
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
    if (this.handoffBlocked) return;
<<<<<<< HEAD
    const url = getEarlySoundUrl();
    if (this.phase === "playing" || this.samples.isGaplessLoopPlaying(url)) {
=======
    if (this.phase === "playing" || this.samples.isGaplessLoopPlaying(EARLY_SOUND_URL)) {
>>>>>>> origin/dev
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

  /** Arrêt immédiat — pas de fade (handoff vers musique boss). */
  stopInstant(): void {
    this.handoffBlocked = true;
<<<<<<< HEAD
    this.samples.stopGaplessLoop(getEarlySoundUrl());
=======
    this.samples.stopGaplessLoop(EARLY_SOUND_URL);
>>>>>>> origin/dev
    this.phase = "off";
  }

  clearHandoffBlock(): void {
    this.handoffBlocked = false;
<<<<<<< HEAD
  }

  /** @deprecated Utiliser stopInstant() via PlayfieldMusicDirector. */
  consumeOnBossReveal(): void {
    this.stopInstant();
=======
>>>>>>> origin/dev
  }

  resetForNewGame(): void {
    this.handoffBlocked = false;
<<<<<<< HEAD
    this.samples.stopGaplessLoop(getEarlySoundUrl());
=======
    this.samples.stopGaplessLoop(EARLY_SOUND_URL);
>>>>>>> origin/dev
    this.phase = "off";
  }
}
