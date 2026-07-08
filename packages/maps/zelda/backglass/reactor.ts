// Must stay structurally identical to the app-side reactor type
// (useIngameReactor); duplicated here to avoid depending on the app.
export type Reaction =
  | { kind: 'gameStart'; player: string }
  | { kind: 'hit'; intensity: number }
  | { kind: 'combo'; combo: number }
  | { kind: 'multi'; multiplier: number }
  | { kind: 'event'; label: string }
  | { kind: 'lifeLost'; livesRemaining: number }

export interface Reactor {
  on: (cb: (r: Reaction) => void) => () => void
  getHeat: () => number
  setSuspended: (suspended: boolean) => void
  setHeatLock: (locked: boolean) => void
}
