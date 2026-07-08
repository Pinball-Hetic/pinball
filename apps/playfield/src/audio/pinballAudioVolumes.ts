export const AUDIO_VOLUME = {
  master: 100,
  music: 85,
  cinematic: 100,
  sfx: 68,
} as const;

export const SOUND_VOLUME = {
  earlySound: 100,
  gameOver: 100,
} as const;

export type SoundVolumeKey = keyof typeof SOUND_VOLUME;

export function percentToGain(percent: number): number {
  return Math.max(0, Math.min(100, percent)) / 100;
}

export function soundLevel(sound: SoundVolumeKey): number {
  return Math.max(0, SOUND_VOLUME[sound]) / 100;
}
