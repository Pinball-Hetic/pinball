import type { BossDefinition } from "@pinball/game-engine";
import type { BossId } from "@pinball/game-engine";
import { percentToGain } from "./pinballAudioVolumes";
import type { BossFightMusicController } from "./BossFightMusicController";
import type { EarlySoundController } from "./EarlySoundController";

type PendingBossResume = {
  url: string;
  volume: number;
  bossId: BossId;
  latePhase?: {
    url: string;
    volume: number;
    hitThreshold: number;
  };
};

/** Orchestrateur early-sound ↔ musique boss (exclusif, arrêt instant). */
export class PlayfieldMusicDirector {
  private pendingBossResume: PendingBossResume | null = null;
  private bossFightEnded = true;
  private latePhaseActivated = false;
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
      this.boss.isPlaying() ||
      this.isBossFightActive()
    ) {
      return;
    }
    if (sync) {
      this.early.engageSync();
    } else {
      void this.early.engage();
    }
  }

  private isBossFightActive(): boolean {
    return !this.bossFightEnded && this.pendingBossResume !== null;
  }

  private haltEarlyForBossHandoff(): void {
    this.early.stopInstant();
  }

  onBossReveal(def: BossDefinition): void {
    this.bossFightEnded = false;
    this.latePhaseActivated = false;
    this.haltEarlyForBossHandoff();

    if (!def.revealSoundUrl) return;

    const url = def.revealSoundUrl;
    const volume = percentToGain(def.revealSoundVolume ?? 100);
    const latePhase =
      def.latePhaseSoundUrl && def.latePhaseHitThreshold != null
        ? {
            url: def.latePhaseSoundUrl,
            volume: percentToGain(def.latePhaseSoundVolume ?? 100),
            hitThreshold: def.latePhaseHitThreshold,
          }
        : undefined;

    this.pendingBossResume = { url, volume, bossId: def.id, latePhase };
    void this.boss.start(url, volume);
  }

  onBossTargetHit(def: BossDefinition, hitCount: number): void {
    if (this.bossFightEnded || !this.pendingBossResume) return;
    if (this.latePhaseActivated) return;
    if (this.pendingBossResume.bossId !== def.id) return;

    const latePhase = this.pendingBossResume.latePhase;
    if (!latePhase || hitCount < latePhase.hitThreshold) return;

    this.latePhaseActivated = true;
    this.pendingBossResume = {
      ...this.pendingBossResume,
      url: latePhase.url,
      volume: latePhase.volume,
    };
    this.haltEarlyForBossHandoff();
    void this.boss.start(latePhase.url, latePhase.volume);
  }

  onBossFightEnd(bossId: BossId): void {
    void bossId;
    this.boss.stopInstant();
    this.pendingBossResume = null;
    this.bossFightEnded = true;
    this.latePhaseActivated = false;
    this.early.clearHandoffBlock();
    this.requestEarly();
  }

  onDrain(options: { gameOver: boolean }): void {
    // Vie perdue mais combat boss en cours : la musique continue sans coupure.
    if (!options.gameOver && this.isBossFightActive()) return;

    this.boss.stopInstant();
    if (options.gameOver) {
      this.pendingBossResume = null;
      this.bossFightEnded = true;
      this.latePhaseActivated = false;
    }
    this.early.clearHandoffBlock();
    this.requestEarly();
  }

  onBallLaunched(): void {
    if (this.bossFightEnded || !this.pendingBossResume) return;
    if (this.boss.isPlaying()) return;

    const { url, volume } = this.pendingBossResume;
    this.haltEarlyForBossHandoff();
    void this.boss.start(url, volume);
  }

  onResetGame(): void {
    this.suppressEarlyUntilReset = false;
    this.boss.stopInstant();
    this.pendingBossResume = null;
    this.bossFightEnded = true;
    this.latePhaseActivated = false;
    this.early.resetForNewGame();
    this.requestEarly();
  }

  onGameOverSting(): void {
    this.suppressEarlyUntilReset = true;
    this.boss.stopInstant();
    this.pendingBossResume = null;
    this.bossFightEnded = true;
    this.latePhaseActivated = false;
    this.early.release();
  }
}
