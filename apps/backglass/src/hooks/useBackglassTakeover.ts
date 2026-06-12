import { useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  LeaderboardEntry,
  GameOver,
} from '@pinball/shared-types'
import { clipShowMs, mapStateFlag } from '@pinball/shared-types'
import { clipBehavior, eventTakeovers } from '@/map/content'

type PinballSocket = Socket<ServerToClientEvents, ClientToServerEvents>

export type TakeoverScene =
  | 'HIGH_SCORE'
  | 'RECAP'
  | 'MAP_EVENT'
  | 'ATTRACT'
  | 'CINEMATIC'

export interface Takeover {
  scene: TakeoverScene
  payload?: GameOver & { rank: number }
  clip?: string
}

// Chaînage : la scène suivante n'est poussée qu'à l'expiration de la
// courante (sa durée démarre alors). Le modèle pile-à-priorités préempte
// mais ne séquence pas — followUp ajoute le séquençage.
interface FollowUp {
  scene: TakeoverScene
  durationMs: number
  priority?: number
  payload?: GameOver & { rank: number }
}

interface StackEntry {
  scene: TakeoverScene
  priority: number
  expiresAt: number
  payload?: GameOver & { rank: number }
  clip?: string
  followUp?: FollowUp
}


interface JoyceSignal {
  text: string | null
  id: number
}

interface TakeoverState {
  takeover: Takeover | null
  alternateWorld: boolean
  highlightRank: number | undefined
  agitation: number
  joyce: JoyceSignal
  // true tant qu'un portal_swallow joue → on retarde le flip 3D du hall
  // of fame jusqu'à la fin du clip (synchro avec le bascule playfield).
  holdHallFlip: boolean
  fever: boolean
  goldWaveId: number // incrémenté → rejoue l'onde dorée (milestones 5k/15k)
}

const TICK_MS = 250
const ATTRACT_IDLE_MS = 60_000
const JOYCE_IDLE_MS = 90_000
const HIGH_SCORE_MS = 5_000
const RECAP_MS = 8_000
const HIGHLIGHT_MS = 4_000
const AGITATION_MS = 1_500

function computeRank(entries: LeaderboardEntry[], finalScore: number): number {
  return entries.filter((e) => e.score > finalScore).length + 1
}

function qualifies(entries: LeaderboardEntry[], finalScore: number): boolean {
  const tenth = entries.find((e) => e.rank === 10)
  return !tenth || finalScore > tenth.score
}

function agitationAt(elapsed: number): number {
  if (elapsed < 0 || elapsed > AGITATION_MS) return 0
  const half = AGITATION_MS / 2
  return elapsed < half ? elapsed / half : (AGITATION_MS - elapsed) / half
}

export function useBackglassTakeover(entries: LeaderboardEntry[]) {
  const entriesRef = useRef(entries)
  entriesRef.current = entries

  const stackRef = useRef<StackEntry[]>([])
  const lastActivityRef = useRef(0)
  const lastJoyceIdleRef = useRef(0)
  const alternateWorldRef = useRef(false)
  const highlightUntilRef = useRef(0)
  const highlightRankRef = useRef<number | undefined>(undefined)
  const agitationStartRef = useRef(-AGITATION_MS)
  const joyceRef = useRef<JoyceSignal>({ text: null, id: 0 })
  const prevTopRef = useRef<TakeoverScene | null>(null)
  // Dernier game:over complet (avec stats + rang) — alimente le clip
  // hall_of_fame (HighScore/Recap), qui n'en reçoit pas via dmd:display.
  const lastGameOverRef = useRef<(GameOver & { rank: number }) | null>(null)
  const feverRef = useRef(false)
  const goldWaveRef = useRef(0)

  const [state, setState] = useState<TakeoverState>({
    takeover: null,
    alternateWorld: false,
    highlightRank: undefined,
    agitation: 0,
    joyce: { text: null, id: 0 },
    holdHallFlip: false,
    fever: false,
    goldWaveId: 0,
  })

  const pushJoyce = (text: string) => {
    joyceRef.current = { text, id: joyceRef.current.id + 1 }
  }

  useEffect(() => {
    const now0 = performance.now()
    lastActivityRef.current = now0
    lastJoyceIdleRef.current = now0

    const url = process.env.NEXT_PUBLIC_SOCKET_URL || undefined
    const transports: ('polling' | 'websocket')[] = url ? ['websocket'] : ['polling']
    const socket: PinballSocket = io(url, { transports })

    const markActivity = () => {
      lastActivityRef.current = performance.now()
    }

    socket.on('game:start', markActivity)
    socket.on('score:update', markActivity)

    socket.on('game:over', (data: GameOver) => {
      const now = performance.now()
      markActivity()
      const list = entriesRef.current
      const rank = computeRank(list, data.finalScore)
      const isHigh = qualifies(list, data.finalScore)
      const payload = { ...data, rank }
      lastGameOverRef.current = payload

      if (isHigh) {
        // HIGH_SCORE puis RECAP CHAÎNÉ : le recap ne démarre qu'à
        // l'expiration du high score (followUp), pas en parallèle masqué.
        // Le payload (stats) voyage dans l'entry → pas écrasé par un event.
        stackRef.current.push({
          scene: 'HIGH_SCORE',
          priority: 100,
          expiresAt: now + HIGH_SCORE_MS,
          payload,
          followUp: { scene: 'RECAP', durationMs: 10_000, priority: 80, payload },
        })
        pushJoyce(data.player)
      } else {
        stackRef.current.push({
          scene: 'RECAP',
          priority: 80,
          expiresAt: now + RECAP_MS,
          payload,
        })
        pushJoyce('GAME OVER')
      }
    })

    socket.on('dmd:display', (d) => {
      alternateWorldRef.current = d.alternateWorld ?? false
      if ('mapState' in d) feverRef.current = mapStateFlag(d.mapState, 'fever')
      if (d.mode === 'CINEMATIC') {
        // Garde kiosk : event serveur malformé sans clip. Un clip inconnu
        // ne crashe plus (clipShowMs garantit un nombre → jamais de NaN sur
        // expiresAt) : il tombe sur la branche default → scène générique.
        if (d.clip == null) return
        markActivity()
        const now = performance.now()
        const clip = d.clip
        const isHall = clip === 'hall_of_fame'
        const pushTk = (durationMs: number) =>
          stackRef.current.push({
            scene: 'CINEMATIC',
            priority: 110,
            expiresAt: now + durationMs,
            clip,
            // hall_of_fame n'a pas de stats via dmd:display : on rebranche le
            // dernier game:over complet (HighScore/Recap).
            payload: isHall ? lastGameOverRef.current ?? undefined : undefined,
          })
        // Dispatch data-driven fourni par la map (joyce/onde/fever/takeover).
        // hall_of_fame + clips inconnus : takeover générique via clipShowMs.
        const b = clipBehavior[clip]
        if (b?.goldWave) goldWaveRef.current += 1
        // fever démarre dès le clip : pendant le CINEMATIC aucun display SCORE
        // (porteur de fever) n'arrive, on l'active donc ici sans retard.
        if (b?.fever) feverRef.current = true
        if (b?.joyce) pushJoyce(typeof b.joyce === 'function' ? b.joyce(d.value) : b.joyce)
        if (!b?.noTakeover) pushTk(b?.takeoverMs ?? clipShowMs(clip))
        return
      }
      if (d.mode === 'EVENT') {
        markActivity()
        agitationStartRef.current = performance.now()
        // Event → takeover de map (label → scène), data-driven.
        const ev = d.label ? eventTakeovers[d.label] : undefined
        if (ev) {
          stackRef.current.push({
            scene: 'MAP_EVENT',
            priority: ev.priority,
            expiresAt: performance.now() + ev.durationMs,
            clip: ev.clipKey,
          })
          if (ev.joyce) pushJoyce(ev.joyce)
        }
      } else if (d.mode === 'COMBO_FLASH' || d.mode === 'MULTI_FLASH') {
        markActivity()
        agitationStartRef.current = performance.now()
      }
    })

    const interval = window.setInterval(() => {
      const now = performance.now()
      // purge des scènes expirées
      const expiring = stackRef.current.filter((e) => e.expiresAt <= now)
      stackRef.current = stackRef.current.filter((e) => e.expiresAt > now)

      // Chaînage : une scène qui expire avec un followUp pousse la suivante
      // MAINTENANT (sa durée démarre ici, plus de masquage).
      for (const e of expiring) {
        if (e.followUp) {
          stackRef.current.push({
            scene: e.followUp.scene,
            priority: e.followUp.priority ?? 80,
            expiresAt: now + e.followUp.durationMs,
            payload: e.followUp.payload,
          })
        }
      }

      // un HIGH_SCORE qui vient d'expirer → surbrillance de la ligne. Si un
      // followUp (RECAP) suit, on prolonge la surbrillance pour qu'elle
      // survive au recap et reste visible sur la scène de base.
      const highExpired = expiring.find((e) => e.scene === 'HIGH_SCORE')
      if (highExpired?.payload) {
        highlightRankRef.current = highExpired.payload.rank
        const extra = highExpired.followUp ? highExpired.followUp.durationMs : 0
        highlightUntilRef.current = now + extra + HIGHLIGHT_MS
      }
      if (highlightUntilRef.current && now > highlightUntilRef.current) {
        highlightUntilRef.current = 0
        highlightRankRef.current = undefined
      }

      // ATTRACT : aucune activité depuis 60s
      const idle = now - lastActivityRef.current > ATTRACT_IDLE_MS
      const hasReal = stackRef.current.some((e) => e.scene !== 'ATTRACT')
      stackRef.current = stackRef.current.filter((e) => e.scene !== 'ATTRACT')
      if (idle && !hasReal) {
        stackRef.current.push({
          scene: 'ATTRACT',
          priority: 10,
          expiresAt: Infinity,
        })
        // pseudo du n°1 sur le Joyce wall, périodiquement
        if (now - lastJoyceIdleRef.current > JOYCE_IDLE_MS) {
          lastJoyceIdleRef.current = now
          const top = entriesRef.current.find((e) => e.rank === 1)
          if (top) pushJoyce(top.name)
        }
      }

      // takeover actif = plus haute priorité
      const top = stackRef.current.reduce<StackEntry | null>(
        (best, e) => (!best || e.priority > best.priority ? e : best),
        null,
      )
      prevTopRef.current = top?.scene ?? null

      // Clip qui retarde le flip 3D du hall of fame (ex. portal_swallow) —
      // déclaré par la map via clipBehavior.holdsHallFlip.
      const portalActive = stackRef.current.some(
        (e) => e.scene === 'CINEMATIC' && e.clip != null && clipBehavior[e.clip]?.holdsHallFlip,
      )

      setState({
        takeover: top
          ? { scene: top.scene, payload: top.payload, clip: top.clip }
          : null,
        alternateWorld: alternateWorldRef.current,
        highlightRank: highlightRankRef.current,
        agitation: agitationAt(now - agitationStartRef.current),
        joyce: joyceRef.current,
        holdHallFlip: portalActive,
        fever: feverRef.current,
        goldWaveId: goldWaveRef.current,
      })
    }, TICK_MS)

    return () => {
      window.clearInterval(interval)
      socket.disconnect()
    }
  }, [])

  return state
}
