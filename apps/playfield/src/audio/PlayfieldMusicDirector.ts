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
 * Orchestrateur musique playfield — une seule piste à la fois (early ou boss).
 *
 * États :
 * - idle → early-sound (attract / début de partie)
 * - boss_fight → boucle revealSoundUrl du boss actif
 * - boss_bridge → musique du boss vaincu conservée jusqu'au reveal du boss suivant
 *   (ex. spawnDG entre mort du Demogorgon et apparition de Vecna)
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

  constructor(
    private readonly early: EarlySoundController,
    private readonly boss: BossFightMusicController,
  ) {}

  setWantsEarly(wants: boolean): void {
    this.wantsEarly = wants;
  }

  /** True tant qu'une piste exclusive (early ou boss) doit tenir la main. */
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

  onBossReveal(def: BossDefinition): void {
    this.clearBridge();
    this.bossFightEnded = false;
    this.latePhaseActivated = false;
    this.haltEarlyForBossHandoff();

    if (!def.revealSoundUrl) return;

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

    // Boss déclarant keepMusicUntilReturnPortal : la musique en cours continue
    // jusqu'à la fin de la cinématique retour portail (cf. contrat BossDefinition,
    // déclaré côté map — aucun id de boss en dur ici).
    if (
      def?.keepMusicUntilReturnPortal &&
      this.boss.isPlaying()
    ) {
      this.bossFightEnded = true;
      this.postVictoryMusicHeld = true;
      return;
    }

    this.clearBossMusicState();
    this.early.clearHandoffBlock();
    this.requestEarly();
  }

  /** Fin cinématique retour portail (photo fin Vecna) — reprend early-sound. */
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

  /** Exposé pour les tests — vérifie qu'une seule source musique est active. */
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
