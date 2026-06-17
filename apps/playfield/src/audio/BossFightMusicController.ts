import { EARLY_SOUND_LOOP_SILENCE_THRESHOLD } from "./pinballAudioConfig";
import type { SamplePlayer } from "./SamplePlayer";

/** Boucle gapless de musique de combat boss (ex. spawnDG). */
export class BossFightMusicController {
  private activeUrl: string | null = null;

  constructor(private readonly samples: SamplePlayer) {}

  getActiveUrl(): string | null {
    return this.activeUrl;
  }

  isPlaying(): boolean {
    return (
      this.activeUrl !== null &&
      this.samples.isGaplessLoopPlaying(this.activeUrl)
    );
  }

  arm(url: string): Promise<void> {
    return this.samples
      .prepareGaplessLoop(url, EARLY_SOUND_LOOP_SILENCE_THRESHOLD)
      .then(() => undefined);
  }

  async start(url: string, volume: number): Promise<void> {
    await this.samples.resumeContext();
    if (!this.samples.isGaplessLoopReady(url)) {
      await this.arm(url);
    }
    if (this.activeUrl && this.activeUrl !== url) {
      this.stopInstant();
    }
    const started = await this.samples.playGaplessLoop(url, volume);
    if (started) {
      this.activeUrl = url;
    }
  }

  /** Arrêt immédiat — pas de fade. */
  stopInstant(): void {
    if (!this.activeUrl) return;
    this.samples.stopGaplessLoop(this.activeUrl);
    this.activeUrl = null;
  }
}
