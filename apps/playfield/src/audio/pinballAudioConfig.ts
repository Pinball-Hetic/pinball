const DEFAULT_EARLY_SOUND_URL = "/audio/early-sound.mp3";
const DEFAULT_GAME_OVER_URL   = "/audio/sound-lost.mp3";

let _earlySoundUrl = DEFAULT_EARLY_SOUND_URL;
let _gameOverUrl   = DEFAULT_GAME_OVER_URL;

/** Appelé par PinballPlayfield au montage pour brancher les sons de la map active. */
export function setMapAudioUrls(ambientMusic?: string, gameOverSound?: string): void {
  _earlySoundUrl = ambientMusic  ?? DEFAULT_EARLY_SOUND_URL;
  _gameOverUrl   = gameOverSound ?? DEFAULT_GAME_OVER_URL;
}

export function getEarlySoundUrl(): string { return _earlySoundUrl; }
export function getGameOverUrl():   string { return _gameOverUrl;   }

// Alias pour la compatibilité avec les imports existants
/** @deprecated Utiliser getEarlySoundUrl() */
export const EARLY_SOUND_URL = DEFAULT_EARLY_SOUND_URL;
/** @deprecated Utiliser getGameOverUrl() */
export const GAME_OVER_URL   = DEFAULT_GAME_OVER_URL;

export const EARLY_SOUND_FADE_OUT_S = 0.3;
/** Seuil peak (abs-max) pour détecter le silence en début/fin de boucle MP3. */
export const EARLY_SOUND_LOOP_SILENCE_THRESHOLD = 0.004;
