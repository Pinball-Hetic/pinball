export type PlayfieldViewMode = 'legacy' | 'portrait-fill';

export const DEFAULT_PLAYFIELD_VIEW_MODE: PlayfieldViewMode = 'legacy';

export function parsePlayfieldViewMode(raw?: string): PlayfieldViewMode {
  if (raw === 'portrait-fill') return 'portrait-fill';
  return DEFAULT_PLAYFIELD_VIEW_MODE;
}
