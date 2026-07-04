/**
 * Volume settings — 0–100 scale (intuitive).
 *
 * Final volume = master × bus × sound_level
 *
 * ~35% global boost (cabinet test — previous levels too low). The
 * music/sfx/cinematic ratios relative to each other are preserved.
 *
 * Examples:
 * - Music too loud → lower `music` (e.g. 50)
 * - Ambient sound too quiet → raise `cinematic` (per-sound volumes supplied by the map)
 * - Whole game louder → raise `master` (e.g. 90)
 */

/** Global volume + per-category bus. */
export const AUDIO_VOLUME = {
  master: 100,
  music: 85,
  cinematic: 100,
  sfx: 68,
} as const;

/** Per-file fine level (0–100+, relative to its bus; >100 = boost). */
export const SOUND_VOLUME = {
  earlySound: 100,
  gameOver: 100,
} as const;

export type SoundVolumeKey = keyof typeof SOUND_VOLUME;

export function percentToGain(percent: number): number {
  return Math.max(0, Math.min(100, percent)) / 100;
}

/** A file's level — to plug onto the already-set bus (>1.0 allowed for boost). */
export function soundLevel(sound: SoundVolumeKey): number {
  return Math.max(0, SOUND_VOLUME[sound]) / 100;
}
