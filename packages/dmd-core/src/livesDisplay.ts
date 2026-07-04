// DMD lives display rule.
//
// Up to 3 lives: row of ● dots (direct visual count). Beyond that (bonus /
// rescue lives) dots don't scale → switch to a compact "N ●" counter. Driven
// by the REAL number of lives, never capped at 3 (otherwise DMD ↔ game
// desync). Shared by the canvas rendering (drawLivesRow) and the flat JSX
// rendering (apps/dmd ?flat).

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
