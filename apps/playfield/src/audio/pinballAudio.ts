import type { GameEvent } from "@pinball/game-engine";
import { getBossById, type BossDefinition } from "@pinball/game-engine";
import { installAudioBootstrap } from "./AudioBootstrap";
import { EarlySoundController } from "./EarlySoundController";
import {
  getEarlySoundUrl,
  getGameOverUrl,
  setMapAudioUrls,
} from "./pinballAudioConfig";

export { setMapAudioUrls };
import { soundLevel, percentToGain } from "./pinballAudioVolumes";
import { SamplePlayer } from "./SamplePlayer";
import { SfxEngine } from "./SfxEngine";

export type PinballBootPhase = "loading" | "attract" | "in_game";

const samples = new SamplePlayer();
const earlySound = new EarlySoundController(samples);
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

// Préchargement des sons de la map (boss revealSoundUrl + ambiances).
export function warmMapSounds(urls: string[]): void {
  for (const url of urls) void samples.preloadBuffer(url);
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
    warmAssets();
    return;
  }
  if (phase === "attract") {
    wantsEarlySound = true;
    if (earlySound.getPhase() !== "playing") {
      requestEarlySoundStart();
    }
    return;
  }
  // in_game: keep ambient loop playing (background music until boss reveal / game over).
  wantsEarlySound = false;
  earlySound.disarm();
}

/** Called as soon as Rapier/GLB init completes — primary start trigger. */
export function onPlayfieldReady(): void {
  wantsEarlySound = true;
  requestEarlySoundStart();
}

export function unlockPinballAudio(): void {
  void samples.resumeContext();
  sfx.markContextUnlocked();
  tryStartEarlySound(true);
}

export function resetPinballAudioForNewGame(): void {
  earlySound.resetForNewGame();
  wantsEarlySound = true;
  requestEarlySoundStart();
}

export function playGameOverSound(): void {
  earlySound.release();
  void samples.playOneShotBuffer(getGameOverUrl(), soundLevel("gameOver"));
}

export function handlePinballSoundEvent(event: GameEvent, bosses: BossDefinition[]): void {
  switch (event.type) {
    case "BALL_LAUNCHED":
      sfx.playLaunch();
      break;
    case "BUMPER_HIT":
      sfx.playBumper(event.bumperIndex);
      break;
    case "BOSS_REVEAL": {
      const def = getBossById(bosses, event.bossId);
      if (def?.revealSoundUrl) {
        earlySound.consumeOnBossReveal();
        void samples.playOneShotBuffer(def.revealSoundUrl, percentToGain(def.revealSoundVolume ?? 100));
      }
      break;
    }
    case "BOSS_TARGET_HIT": {
      const def = getBossById(bosses, event.bossId);
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
      // Son d.event de la map joué via ctx.playSound (manifest.sounds).
      break;
    case "PORTAL_TREMOR":
      sfx.playPortalTremor();
      break;
    case "PORTAL_TRANSITION_END":
      sfx.playPortalTransitionEnd();
      break;
    case "RETURN_PORTAL_TRANSITION_END":
      sfx.playPortalTransitionEnd();
      break;
    case "BOTTOM_OUT":
      sfx.playBottomOut();
      break;
    default:
      break;
  }
}
