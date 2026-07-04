import { RefObject, useEffect, useRef } from 'react'
import type { PinballSocket } from '@pinball/shared-types/src/socket-client'
import type { DmdDisplay, GameStart } from '@pinball/shared-types'
import { hitIntensity, heatAfterHit, nextHeat, roundedHeat } from './heatModel'

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
  // Suspends reactions/heat (during a full-screen cinematic clip).
  setSuspended: (suspended: boolean) => void
  // Locks heat at 1 (FEVER state: permanent blaze).
  setHeatLock: (locked: boolean) => void
}

export function useIngameReactor(
  targetRef: RefObject<HTMLElement | null>,
  socket: PinballSocket,
): Reactor {
  const listenersRef = useRef<Set<(r: Reaction) => void>>(new Set())
  const heatRef = useRef(0)
  const lastScoreRef = useRef<number | null>(null)
  const suspendedRef = useRef(false)
  const heatLockRef = useRef(false)

  const reactorRef = useRef<Reactor>({
    on: (cb) => {
      listenersRef.current.add(cb)
      return () => {
        listenersRef.current.delete(cb)
      }
    },
    getHeat: () => heatRef.current,
    setSuspended: (suspended) => {
      suspendedRef.current = suspended
    },
    setHeatLock: (locked) => {
      heatLockRef.current = locked
    },
  })

  useEffect(() => {
    const emit = (r: Reaction) => {
      if (suspendedRef.current) return
      listenersRef.current.forEach((cb) => cb(r))
    }

    const onGameStart = (d: GameStart) => {
      lastScoreRef.current = null
      emit({ kind: 'gameStart', player: d.player })
    }
    socket.on('game:start', onGameStart)

    const onDmdDisplay = (d: DmdDisplay) => {
      switch (d.mode) {
        case 'SCORE': {
          const prev = lastScoreRef.current
          lastScoreRef.current = d.score
          if (prev !== null && d.score > prev && !suspendedRef.current) {
            const intensity = hitIntensity(d.score - prev)
            heatRef.current = heatAfterHit(heatRef.current, intensity)
            emit({ kind: 'hit', intensity })
          }
          break
        }
        case 'EVENT':
          lastScoreRef.current = d.score
          emit({ kind: 'event', label: d.label })
          break
        case 'COMBO_FLASH':
          lastScoreRef.current = d.score
          emit({ kind: 'combo', combo: d.combo })
          break
        case 'MULTI_FLASH':
          lastScoreRef.current = d.score
          emit({ kind: 'multi', multiplier: d.multiplier })
          break
        case 'LIFE_LOST':
          emit({ kind: 'lifeLost', livesRemaining: d.livesRemaining })
          break
        default:
          break
      }
    }
    socket.on('dmd:display', onDmdDisplay)

    // Heat loop: continuous decay, direct --heat write (no re-render).
    // Only write when the rounded value changes → 0 style invalidations at rest.
    let raf = 0
    let last: number | null = null
    let written = -1
    const loop = (t: number) => {
      const dt = last !== null ? (t - last) / 1000 : null
      heatRef.current = nextHeat(heatRef.current, dt, heatLockRef.current)
      last = t
      const rounded = roundedHeat(heatRef.current)
      if (rounded !== written) {
        written = rounded
        targetRef.current?.style.setProperty('--heat', String(rounded))
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      // Shared socket (lifted into BackglassStage): remove OUR handlers
      // without disconnecting it — the caller owns its lifecycle.
      socket.off('game:start', onGameStart)
      socket.off('dmd:display', onDmdDisplay)
    }
  }, [targetRef, socket])

  return reactorRef.current
}
