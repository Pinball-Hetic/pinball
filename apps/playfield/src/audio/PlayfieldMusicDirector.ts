import type { BossDefinition } from "@pinball/game-engine";
import type { BossId } from "@pinball/game-engine";
import { percentToGain } from "./pinballAudioVolumes";
import type { BossFightMusicController } from "./BossFightMusicController";
import type { EarlySoundController } from "./EarlySoundController";

type PendingBossResume = {
  url: string;
  volume: number;
  bossId: BossId;
};

/** Orchestrateur early-sound ↔ musique boss (exclusif, arrêt instant). */
export class PlayfieldMusicDirector {
  private pendingBossResume: PendingBossResume | null = null;
  private bossFightEnded = true;
  private wantsEarly = false;
  private suppressEarlyUntilReset = false;

  constructor(
    private readonly early: EarlySoundController,
    private readonly boss: BossFightMusicController,
  ) {}

  setWantsEarly(wants: boolean): void {
    this.wantsEarly = wants;
  }

  private requestEarly(sync = false): void {
    if (
      !this.wantsEarly ||
      this.suppressEarlyUntilReset ||
      this.boss.isPlaying()
    ) {
      return;
    }
    if (sync) {
      this.early.engageSync();
    } else {
      void this.early.engage();
    }
  }

  onBossReveal(def: BossDefinition): void {
    if (!def.revealSoundUrl) return;

    const url = def.revealSoundUrl;
    const volume = percentToGain(def.revealSoundVolume ?? 100);

    this.pendingBossResume = { url, volume, bossId: def.id };
    this.bossFightEnded = false;

    this.early.stopInstant();
    void this.boss.start(url, volume);
  }

  onBossFightEnd(bossId: BossId): void {
    void bossId;
    this.boss.stopInstant();
    this.pendingBossResume = null;
    this.bossFightEnded = true;
    this.requestEarly();
  }

  onDrain(options: { gameOver: boolean }): void {
    this.boss.stopInstant();
    if (options.gameOver) {
      this.pendingBossResume = null;
      this.bossFightEnded = true;
    }
    this.requestEarly();
  }

  onBallLaunched(): void {
    if (this.bossFightEnded || !this.pendingBossResume) return;

    const { url, volume } = this.pendingBossResume;
    this.early.stopInstant();
    void this.boss.start(url, volume);
  }

  onResetGame(): void {
    this.suppressEarlyUntilReset = false;
    this.boss.stopInstant();
    this.pendingBossResume = null;
    this.bossFightEnded = true;
    this.early.resetForNewGame();
    this.requestEarly();
  }

  onGameOverSting(): void {
    this.suppressEarlyUntilReset = true;
    this.boss.stopInstant();
    this.pendingBossResume = null;
    this.bossFightEnded = true;
    this.early.release();
  }
}
