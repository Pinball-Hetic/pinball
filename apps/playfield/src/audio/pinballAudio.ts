import type { GameEvent } from "@pinball/game-engine";
import { getBossById, type BossDefinition } from "@pinball/game-engine";
import { installAudioBootstrap } from "./AudioBootstrap";
import { EarlySoundController } from "./EarlySoundController";
import {
  APPARITION_UPSIDE_DOWN_URL,
  EARLY_SOUND_URL,
  GAME_OVER_URL,
  SPAWN_DG_URL,
} from "./pinballAudioConfig";
import { soundLevel } from "./pinballAudioVolumes";
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
  void samples.prepareGaplessLoop(EARLY_SOUND_URL);
  void samples.preloadBuffer(GAME_OVER_URL);
  void samples.preloadBuffer(SPAWN_DG_URL);
  void samples.preloadBuffer(APPARITION_UPSIDE_DOWN_URL);
}

export function playUpsideDownAppearSound(): void {
  const gain = soundLevel("apparitionUpsideDown");
  void samples.resumeContext();
  sfx.markContextUnlocked();
  samples.duckBackground(2.5);
  sfx.playCinematicImpact();
  if (samples.playOneShotCached(APPARITION_UPSIDE_DOWN_URL, gain)) return;
  void samples.playOneShotBuffer(APPARITION_UPSIDE_DOWN_URL, gain);
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
  if (samples.isGaplessLoopReady(EARLY_SOUND_URL)) {
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
  // in_game: keep ambient loop playing (background music until Demogorgon / game over).
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
  void samples.playOneShotBuffer(GAME_OVER_URL, soundLevel("gameOver"));
}

export function handlePinballSoundEvent(event: GameEvent, bosses: BossDefinition[]): void {
  switch (event.type) {
    case "BALL_LAUNCHED":
      sfx.playLaunch();
      break;
    case "BUMPER_HIT":
      sfx.playBumper(event.bumperIndex);
      break;
    case "BOSS_REVEAL":
      if (event.bossId === "demogorgon") {
        earlySound.consumeForDemogorgon();
        void samples.playOneShotBuffer(SPAWN_DG_URL, soundLevel("spawnDemogorgon"));
      }
      break;
    case "BOSS_TARGET_HIT": {
      const def = getBossById(bosses, event.bossId);
      sfx.playTargetHit(event.hitCount);
      if (def && event.hitCount >= def.targetHits) {
        window.setTimeout(() => sfx.playVictory(), 80);
      }
      break;
    }
    case "ASSIST":
      sfx.playElevenAssist();
      break;
    case "PORTAL_ENTER":
      // Son MP3 géré par playUpsideDownAppearSound() à l'apparition de l'image.
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
