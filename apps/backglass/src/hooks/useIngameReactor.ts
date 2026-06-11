import { RefObject, useEffect, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import type { ServerToClientEvents, ClientToServerEvents } from '@pinball/shared-types'

type PinballSocket = Socket<ServerToClientEvents, ClientToServerEvents>

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
  // Suspend les réactions/heat (pendant un clip cinématique plein écran).
  setSuspended: (suspended: boolean) => void
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

const HEAT_DECAY = 0.5 // par seconde
const HIT_GAIN = 0.3

export function useIngameReactor(targetRef: RefObject<HTMLElement | null>): Reactor {
  const listenersRef = useRef<Set<(r: Reaction) => void>>(new Set())
  const heatRef = useRef(0)
  const lastScoreRef = useRef<number | null>(null)
  const suspendedRef = useRef(false)

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
  })

  useEffect(() => {
    const emit = (r: Reaction) => {
      if (suspendedRef.current) return
      listenersRef.current.forEach((cb) => cb(r))
    }

    const url = process.env.NEXT_PUBLIC_SOCKET_URL || undefined
    const transports: ('polling' | 'websocket')[] = url ? ['websocket'] : ['polling']
    const socket: PinballSocket = io(url, { transports })

    socket.on('game:start', (d) => {
      lastScoreRef.current = null
      emit({ kind: 'gameStart', player: d.player })
    })

    socket.on('dmd:display', (d) => {
      switch (d.mode) {
        case 'SCORE': {
          const prev = lastScoreRef.current
          lastScoreRef.current = d.score
          if (prev !== null && d.score > prev && !suspendedRef.current) {
            const intensity = clamp((d.score - prev) / 500, 0.1, 1)
            heatRef.current = Math.min(1, heatRef.current + intensity * HIT_GAIN)
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
    })

    // Boucle heat : decay continu, écriture directe de --heat (pas de re-render).
    // On n'écrit que si la valeur arrondie change → 0 invalidation style au repos.
    let raf = 0
    let last: number | null = null
    let written = -1
    const loop = (t: number) => {
      if (last !== null) {
        const dt = (t - last) / 1000
        heatRef.current = Math.max(0, heatRef.current - HEAT_DECAY * dt)
      }
      last = t
      const rounded = Math.round(heatRef.current * 100) / 100
      if (rounded !== written) {
        written = rounded
        targetRef.current?.style.setProperty('--heat', String(rounded))
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      socket.disconnect()
    }
  }, [targetRef])

  return reactorRef.current
}
