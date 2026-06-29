import { useEffect, useRef, useState } from 'react'
import { createPinballSocket } from '@pinball/shared-types/src/socket-client'
import type { LeaderboardEntry, GameOver } from '@pinball/shared-types'
import { clipShowMs, mapStateFlag } from '@pinball/shared-types'
import { useMapContent } from '@/map/content'
import { TakeoverStack } from './takeoverStack'
import type { Takeover } from './takeoverStack'

// Réexport pour compat des consommateurs existants (les types vivent désormais
// dans takeoverStack.ts, avec la machine à états).
export type { Takeover, TakeoverScene } from './takeoverStack'

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
const HIGH_SCORE_MS = 5_000
const RECAP_MS = 8_000
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
  const { clipBehavior, eventTakeovers, clips } = useMapContent()
  // Refs sur les données map : la closure du useEffect([], []) lit toujours les
  // valeurs courantes sans se recréer. key={mapId} sur le Stage force un
  // remontage complet quand la map change → refs réinitialisées proprement.
  const clipBehaviorRef = useRef(clipBehavior)
  clipBehaviorRef.current = clipBehavior
  const eventTakeoversRef = useRef(eventTakeovers)
  eventTakeoversRef.current = eventTakeovers
  const clipsRef = useRef(clips)
  clipsRef.current = clips

  const entriesRef = useRef(entries)
  entriesRef.current = entries

  // La machine à états (pile de scènes) — toute la logique de décision est là.
  const stackRef = useRef(new TakeoverStack())
  // Signaux dérivés gérés par le hook (hors responsabilité de la pile) : monde
  // alternatif, agitation, Joyce wall, fever, onde dorée, dernier game:over.
  const alternateWorldRef = useRef(false)
  const agitationStartRef = useRef(-AGITATION_MS)
  const joyceRef = useRef<JoyceSignal>({ text: null, id: 0 })
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
    const stack = stackRef.current
    stack.start(performance.now())

    const socket = createPinballSocket()

    const markActivity = () => {
      stack.markActivity(performance.now())
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
        stack.push({
          scene: 'HIGH_SCORE',
          priority: 100,
          expiresAt: now + HIGH_SCORE_MS,
          payload,
          followUp: { scene: 'RECAP', durationMs: 10_000, priority: 80, payload },
        })
        pushJoyce(data.player)
      } else {
        stack.push({
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
          stack.push({
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
        const b = clipBehaviorRef.current[clip]
        if (b?.goldWave) goldWaveRef.current += 1
        // fever démarre dès le clip : pendant le CINEMATIC aucun display SCORE
        // (porteur de fever) n'arrive, on l'active donc ici sans retard.
        if (b?.fever) feverRef.current = true
        if (b?.joyce) pushJoyce(typeof b.joyce === 'function' ? b.joyce(d.value) : b.joyce)
        if (!b?.noTakeover) pushTk(b?.takeoverMs ?? clipShowMs(clipsRef.current, clip))
        return
      }
      if (d.mode === 'EVENT') {
        markActivity()
        agitationStartRef.current = performance.now()
        // Event → takeover de map (label → scène), data-driven.
        const ev = d.label ? eventTakeoversRef.current[d.label] : undefined
        if (ev) {
          stack.push({
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
      // Toute la logique de décision (purge / chaînage / attract / priorité) est
      // déléguée à la machine à états. Le hook ne fait que lui fournir le temps
      // et quelques accès aux données map, puis projette le résultat en state.
      const { top, highlightRank, holdHallFlip } = stack.tick(now, {
        holdsHallFlip: (clip) => clipBehaviorRef.current[clip]?.holdsHallFlip ?? false,
        attractJoyceName: () => entriesRef.current.find((e) => e.rank === 1)?.name ?? null,
        onJoyce: pushJoyce,
      })

      setState({
        takeover: top
          ? { scene: top.scene, payload: top.payload, clip: top.clip }
          : null,
        alternateWorld: alternateWorldRef.current,
        highlightRank,
        agitation: agitationAt(now - agitationStartRef.current),
        joyce: joyceRef.current,
        holdHallFlip,
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
