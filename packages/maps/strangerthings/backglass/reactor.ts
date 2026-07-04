// Structural type of the backglass in-game reactor (defined app-side in
// useIngameReactor). Duplicated here so the map's ST components don't
// depend on the app; structurally identical → assignable.
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
