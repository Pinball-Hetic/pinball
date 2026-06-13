/**
 * Réglages volume — échelle 0–100 (intuitive).
 *
 * Volume final = master × bus × niveau_du_son
 *
 * Exemples :
 * - Musique trop forte → baisser `music` (ex. 50)
 * - Son d.ambiance faible → monter `cinematic` (volumes spécifiques fournis par la map)
 * - Tout le jeu plus fort → monter `master` (ex. 90)
 */

/** Volume global + bus par catégorie. */
export const AUDIO_VOLUME = {
  master: 80,
  music: 65,
  cinematic: 100,
  sfx: 50,
} as const;

/** Niveau fin par fichier (0–100+, relatif à son bus ; >100 = boost). */
export const SOUND_VOLUME = {
  earlySound: 100,
  gameOver: 85,
} as const;

export type SoundVolumeKey = keyof typeof SOUND_VOLUME;

export function percentToGain(percent: number): number {
  return Math.max(0, Math.min(100, percent)) / 100;
}

/** Niveau d'un fichier — à brancher sur le bus déjà réglé (>1.0 autorisé pour boost). */
export function soundLevel(sound: SoundVolumeKey): number {
  return Math.max(0, SOUND_VOLUME[sound]) / 100;
}
