export type PlayfieldViewMode = 'legacy' | 'portrait-fill';

export const DEFAULT_PLAYFIELD_VIEW_MODE: PlayfieldViewMode = 'portrait-fill';

export function parsePlayfieldViewMode(raw?: string): PlayfieldViewMode {
  if (raw === 'legacy') return 'legacy';
  if (raw === 'portrait-fill') return 'portrait-fill';
  return DEFAULT_PLAYFIELD_VIEW_MODE;
}
