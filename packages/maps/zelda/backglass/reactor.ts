// Type structurel du réacteur in-game du backglass (défini côté app dans
// useIngameReactor). Dupliqué ici pour que les composants Zelda de la map ne
// dépendent pas de l'app ; structurellement identique → assignable.
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
