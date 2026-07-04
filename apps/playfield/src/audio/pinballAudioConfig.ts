const DEFAULT_EARLY_SOUND_URL = "/audio/early-sound.mp3";
const DEFAULT_GAME_OVER_URL   = "/audio/sound-lost.mp3";

let _earlySoundUrl = DEFAULT_EARLY_SOUND_URL;
let _gameOverUrl   = DEFAULT_GAME_OVER_URL;
let _alternateWorldMusicUrl: string | undefined;
let _alternateWorldMusicVolume = 100;

/** Called by PinballPlayfield on mount to wire the active map's sounds. */
export function setMapAudioUrls(
  ambientMusic?: string,
  gameOverSound?: string,
  alternateWorldMusic?: string,
  alternateWorldMusicVolume?: number,
): void {
  _earlySoundUrl             = ambientMusic            ?? DEFAULT_EARLY_SOUND_URL;
  _gameOverUrl               = gameOverSound            ?? DEFAULT_GAME_OVER_URL;
  _alternateWorldMusicUrl    = alternateWorldMusic;
  _alternateWorldMusicVolume = alternateWorldMusicVolume ?? 100;
}

export function getEarlySoundUrl(): string { return _earlySoundUrl; }
export function getGameOverUrl():   string { return _gameOverUrl;   }
export function getAlternateWorldMusicUrl(): string | undefined { return _alternateWorldMusicUrl; }
export function getAlternateWorldMusicVolume(): number { return _alternateWorldMusicVolume; }

// Aliases kept for compatibility with existing imports
/** @deprecated Use getEarlySoundUrl() */
export const EARLY_SOUND_URL = DEFAULT_EARLY_SOUND_URL;
/** @deprecated Use getGameOverUrl() */
export const GAME_OVER_URL   = DEFAULT_GAME_OVER_URL;

export const EARLY_SOUND_FADE_OUT_S = 0.3;
/** Peak threshold (abs-max) to detect silence at the MP3 loop's start/end. */
export const EARLY_SOUND_LOOP_SILENCE_THRESHOLD = 0.004;
