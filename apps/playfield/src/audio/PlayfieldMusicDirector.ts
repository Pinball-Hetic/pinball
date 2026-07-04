import {
  getBossById,
  type BossDefinition,
  type BossId,
} from "@pinball/game-engine";
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

/**
 * Playfield music orchestrator — one track at a time (early or boss).
 *
 * States:
 * - idle → early-sound (attract / game start)
 * - boss_fight → loops the active boss's revealSoundUrl
 * - boss_bridge → the defeated boss's music is kept until the next boss's
 *   reveal (e.g. spawnDG between the Demogorgon's death and Vecna's arrival)
 */
export class PlayfieldMusicDirector {
  private pendingBossResume: PendingBossResume | null = null;
  private bossFightEnded = true;
  private musicBridgeActive = false;
  private bridgeUntilBossId: BossId | null = null;
  private latePhaseActivated = false;
  private wantsEarly = false;
  private suppressEarlyUntilReset = false;

  private postVictoryMusicHeld = false;
  /** Alternate-world music playing (sacred-realm, etc.) on the boss bus. */
  private alternateWorldMusicActive = false;

  constructor(
    private readonly early: EarlySoundController,
    private readonly boss: BossFightMusicController,
  ) {}

  setWantsEarly(wants: boolean): void {
    this.wantsEarly = wants;
  }

  /** True while an exclusive track (early or boss) must keep the floor. */
  private isExclusiveMusicHeld(): boolean {
    return (
      this.isBossFightActive() ||
      this.musicBridgeActive ||
      this.postVictoryMusicHeld ||
      this.boss.isPlaying()
    );
  }

  private requestEarly(sync = false): void {
    if (
      !this.wantsEarly ||
      this.suppressEarlyUntilReset ||
      this.isExclusiveMusicHeld()
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

  private clearBridge(): void {
    this.musicBridgeActive = false;
    this.bridgeUntilBossId = null;
  }

  private clearBossMusicState(): void {
    this.boss.stopInstant();
    this.pendingBossResume = null;
    this.bossFightEnded = true;
    this.latePhaseActivated = false;
    this.postVictoryMusicHeld = false;
    this.alternateWorldMusicActive = false;
    this.clearBridge();
  }

  private buildLatePhase(def: BossDefinition) {
    if (!def.latePhaseSoundUrl || def.latePhaseHitThreshold == null) return undefined;
    return {
      url: def.latePhaseSoundUrl,
      volume: percentToGain(def.latePhaseSoundVolume ?? 100),
      hitThreshold: def.latePhaseHitThreshold,
    };
  }

  /** Alternate-world music (gapless loop on the boss bus). */
  onAlternateWorldEnter(url: string, volume: number): void {
    this.early.stopInstant();
    this.alternateWorldMusicActive = true;
    void this.boss.start(url, volume);
  }

  /** Alternate world ends without a boss fight — resume the early-sound. */
  onAlternateWorldExit(): void {
    if (!this.alternateWorldMusicActive) return;
    this.alternateWorldMusicActive = false;
    this.boss.stopInstant();
    this.early.clearHandoffBlock();
    this.requestEarly();
  }

  onBossReveal(def: BossDefinition): void {
    this.alternateWorldMusicActive = false; // boss music takes over
    this.clearBridge();
    this.bossFightEnded = false;
    this.latePhaseActivated = false;

    // No fight music → the early-sound keeps playing during the fight.
    if (!def.revealSoundUrl) return;

    this.haltEarlyForBossHandoff();

    const url = def.revealSoundUrl;
    const volume = percentToGain(def.revealSoundVolume ?? 100);

    this.pendingBossResume = {
      url,
      volume,
      bossId: def.id,
      latePhase: this.buildLatePhase(def),
    };
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

  onBossFightEnd(bossId: BossId, bosses: BossDefinition[]): void {
    const def = getBossById(bosses, bossId);
    const canBridge =
      def?.keepMusicUntilBossReveal != null &&
      this.pendingBossResume?.bossId === bossId &&
      this.boss.isPlaying();

    if (canBridge) {
      this.bossFightEnded = true;
      this.latePhaseActivated = false;
      this.musicBridgeActive = true;
      this.bridgeUntilBossId = def!.keepMusicUntilBossReveal!;
      return;
    }

    // Boss declaring keepMusicUntilReturnPortal: music continues until
    // RETURN_PORTAL_TRANSITION_END. If victoryMusicUrl is set, switch to it
    // at victory instead of keeping the fight music.
    if (def?.keepMusicUntilReturnPortal && this.boss.isPlaying()) {
      this.bossFightEnded = true;
      this.postVictoryMusicHeld = true;
      if (def.victoryMusicUrl) {
        const url    = def.victoryMusicUrl;
        const volume = percentToGain(def.victoryMusicVolume ?? 100);
        void this.boss.start(url, volume);
      }
      return;
    }

    this.clearBossMusicState();
    this.early.clearHandoffBlock();
    this.requestEarly();
  }

  /** Return-portal cinematic end (Vecna finale photo) — resume early-sound. */
  onReturnPortalTransitionEnd(): void {
    if (!this.postVictoryMusicHeld && !this.boss.isPlaying()) return;
    this.clearBossMusicState();
    this.early.clearHandoffBlock();
    this.requestEarly();
  }

  onDrain(options: { gameOver: boolean }): void {
    if (!options.gameOver && this.isExclusiveMusicHeld()) return;

    this.clearBossMusicState();
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
    this.clearBossMusicState();
    this.early.resetForNewGame();
    this.requestEarly();
  }

  onGameOverSting(): void {
    this.suppressEarlyUntilReset = true;
    this.clearBossMusicState();
    this.early.release();
  }

  /** Exposed for tests — asserts a single music source is active. */
  getDebugState(): {
    bossFightEnded: boolean;
    musicBridgeActive: boolean;
    bridgeUntilBossId: BossId | null;
    pendingBossId: BossId | null;
    bossPlaying: boolean;
    postVictoryMusicHeld: boolean;
  } {
    return {
      bossFightEnded: this.bossFightEnded,
      musicBridgeActive: this.musicBridgeActive,
      bridgeUntilBossId: this.bridgeUntilBossId,
      pendingBossId: this.pendingBossResume?.bossId ?? null,
      bossPlaying: this.boss.isPlaying(),
      postVictoryMusicHeld: this.postVictoryMusicHeld,
    };
  }
}
