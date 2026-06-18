import type { GameEvent } from "@pinball/game-engine";
import { getBossById, type BossDefinition } from "@pinball/game-engine";
import { installAudioBootstrap } from "./AudioBootstrap";
import { BossFightMusicController } from "./BossFightMusicController";
import { EarlySoundController } from "./EarlySoundController";
import {
  getEarlySoundUrl,
  getGameOverUrl,
  getAlternateWorldMusicUrl,
  getAlternateWorldMusicVolume,
  setMapAudioUrls,
} from "./pinballAudioConfig";
export { setMapAudioUrls };
import { PlayfieldMusicDirector } from "./PlayfieldMusicDirector";
import { soundLevel, percentToGain } from "./pinballAudioVolumes";
import { SamplePlayer } from "./SamplePlayer";
import { SfxEngine } from "./SfxEngine";

export type PinballBootPhase = "loading" | "attract" | "in_game";

const samples = new SamplePlayer();
const earlySound = new EarlySoundController(samples);
const bossMusic = new BossFightMusicController(samples);
const musicDirector = new PlayfieldMusicDirector(earlySound, bossMusic);
const sfx = new SfxEngine(samples);

let wantsEarlySound = false;
let assetsWarmed = false;

function warmAssets(): void {
  if (assetsWarmed) return;
  assetsWarmed = true;
  void samples.prepareGaplessLoop(getEarlySoundUrl());
  void samples.preloadBuffer(getGameOverUrl());
  // Sons spécifiques à la map (reveal boss, ambiance) : préchargés via
  // warmMapSounds(urls) depuis le playfield (URLs fournies par la map).
}

// Préchargement des sons de la map (musique boss en boucle gapless).
export function warmMapSounds(urls: string[]): void {
  for (const url of urls) {
    void samples.prepareGaplessLoop(url);
    void samples.preloadBuffer(url);
  }
}

// Son cinématique d'event de la map (ducking + impact). URL+volume fournis
// par le contenu de la map (manifest.sounds).
export function playMapCinematicSound(url: string, volumePercent = 100): void {
  const gain = percentToGain(volumePercent);
  void samples.resumeContext();
  sfx.markContextUnlocked();
  samples.duckBackground(2.5);
  sfx.playCinematicImpact();
  if (samples.playOneShotCached(url, gain)) return;
  void samples.playOneShotBuffer(url, gain);
}

function tryStartEarlySound(sync: boolean): void {
  if (!wantsEarlySound) return;
  musicDirector.setWantsEarly(true);
  if (sync) {
    earlySound.engageSync();
    return;
  }
  void earlySound.engage();
}

function requestEarlySoundStart(sync = false): void {
  void earlySound.arm().then(() => tryStartEarlySound(sync));
  if (samples.isGaplessLoopReady(getEarlySoundUrl())) {
    tryStartEarlySound(sync);
  }
}

installAudioBootstrap({
  samples,
  warmAssets,
  onGestureUnlock: () => {
    sfx.markContextUnlocked();
    tryStartEarlySound(true);
  },
});

export function notifyBootPhase(phase: PinballBootPhase): void {
  if (phase === "loading") {
    wantsEarlySound = false;
    musicDirector.setWantsEarly(false);
    warmAssets();
    return;
  }
  wantsEarlySound = true;
  musicDirector.setWantsEarly(true);
  if (phase === "attract" && earlySound.getPhase() !== "playing") {
    requestEarlySoundStart();
  }
  // in_game : early-sound continue jusqu'au BOSS_REVEAL (director gère le handoff).
}

/** Called as soon as Rapier/GLB init completes — primary start trigger. */
export function onPlayfieldReady(): void {
  wantsEarlySound = true;
  musicDirector.setWantsEarly(true);
  requestEarlySoundStart();
}

export function unlockPinballAudio(): void {
  void samples.resumeContext();
  sfx.markContextUnlocked();
  tryStartEarlySound(true);
}

export function resetPinballAudioForNewGame(): void {
  wantsEarlySound = true;
  musicDirector.setWantsEarly(true);
  musicDirector.onResetGame();
}

export function onMusicDrain(options: { gameOver: boolean }): void {
  musicDirector.onDrain(options);
  if (!options.gameOver) {
    wantsEarlySound = true;
    musicDirector.setWantsEarly(true);
  }
}

export function onMusicGameOver(): void {
  wantsEarlySound = true;
  musicDirector.setWantsEarly(true);
  musicDirector.onGameOverSting();
  void samples.playOneShotBuffer(getGameOverUrl(), soundLevel("gameOver"));
}

/** @deprecated Utiliser onMusicGameOver — conservé pour compatibilité interne. */
export function playGameOverSound(): void {
  onMusicGameOver();
}

/**
 * Durée du son game-over en ms (depuis le buffer mis en cache par warmAssets).
 * Retourne 4 000 ms par défaut si le buffer n'est pas encore disponible.
 */
export function getGameOverSoundDurationMs(): number {
  const dur = samples.getBufferDuration(getGameOverUrl());
  return dur != null ? dur * 1000 : 4_000;
}

export function handlePinballSoundEvent(event: GameEvent, bosses: BossDefinition[]): void {
  switch (event.type) {
    case "BALL_LAUNCHED":
      musicDirector.onBallLaunched();
      sfx.playLaunch();
      break;
    case "BUMPER_HIT":
      sfx.playBumper(event.bumperIndex);
      break;
    case "BOSS_REVEAL": {
      const def = getBossById(bosses, event.bossId);
      if (def) musicDirector.onBossReveal(def);
      break;
    }
    case "BOSS_FIGHT_END":
      musicDirector.onBossFightEnd(event.bossId, bosses);
      break;
    case "BOSS_TARGET_HIT": {
      const def = getBossById(bosses, event.bossId);
      if (def) musicDirector.onBossTargetHit(def, event.hitCount);
      sfx.playTargetHit(event.hitCount);
      if (def && event.hitCount >= def.targetHits) {
        window.setTimeout(() => sfx.playVictory(), 80);
      }
      break;
    }
    case "ASSIST":
      sfx.playAssist();
      break;
    case "PORTAL_ENTER":
      break;
    case "PORTAL_TREMOR":
      sfx.playPortalTremor();
      break;
    case "PORTAL_TRANSITION_END": {
      sfx.playPortalTransitionEnd();
      const altUrl = getAlternateWorldMusicUrl();
      if (altUrl) {
        const altVol = percentToGain(getAlternateWorldMusicVolume());
        musicDirector.onAlternateWorldEnter(altUrl, altVol);
      }
      break;
    }
    case "RETURN_PORTAL_TRANSITION_END":
      musicDirector.onReturnPortalTransitionEnd();
      sfx.playPortalTransitionEnd();
      break;
    case "WORLD_CYCLE_COMPLETE":
      musicDirector.onAlternateWorldExit();
      break;
    case "BOTTOM_OUT":
      sfx.playBottomOut();
      break;
    default:
      break;
  }
}
