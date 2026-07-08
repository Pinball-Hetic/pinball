// Never cap the lives count, or the DMD desyncs from the game.
export const DOTS_MAX_LIVES = 3;

export type LivesDisplay =
  | { kind: 'dots'; total: number; filled: number }
  | { kind: 'count'; value: number };

export function livesDisplay(lives: number): LivesDisplay {
  const n = Math.max(0, Math.floor(lives));
  if (n <= DOTS_MAX_LIVES) {
    return { kind: 'dots', total: DOTS_MAX_LIVES, filled: n };
  }
  return { kind: 'count', value: n };
}
