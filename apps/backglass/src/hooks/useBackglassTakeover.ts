import { useEffect, useRef, useState } from 'react'
import type { PinballSocket } from '@pinball/shared-types/src/socket-client'
import type { LeaderboardEntry, GameOver, DmdDisplay } from '@pinball/shared-types'
import { clipShowMs, mapStateFlag } from '@pinball/shared-types'
import { useMapContent } from '@/map/content'
import { TakeoverStack } from './takeoverStack'
import type { Takeover } from './takeoverStack'

// Re-export for existing consumers (the types live in takeoverStack.ts,
// next to the state machine).
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
  // true while a portal_swallow plays → the hall of fame 3D flip is delayed
  // until the clip ends (in sync with the playfield switch).
  holdHallFlip: boolean
  fever: boolean
  goldWaveId: number // incremented → replays the gold wave (5k/15k milestones)
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

export function useBackglassTakeover(entries: LeaderboardEntry[], socket: PinballSocket) {
  const { clipBehavior, eventTakeovers, clips } = useMapContent()
  // Refs to the map data: the useEffect([], []) closure always reads the
  // current values without being recreated. key={mapId} on the Stage forces a
  // full remount when the map changes → refs cleanly reinitialized.
  const clipBehaviorRef = useRef(clipBehavior)
  clipBehaviorRef.current = clipBehavior
  const eventTakeoversRef = useRef(eventTakeovers)
  eventTakeoversRef.current = eventTakeovers
  const clipsRef = useRef(clips)
  clipsRef.current = clips

  const entriesRef = useRef(entries)
  entriesRef.current = entries

  // The state machine (scene stack) — all decision logic lives there.
  const stackRef = useRef(new TakeoverStack())
  // Derived signals managed by the hook (outside the stack's responsibility):
  // alternate world, agitation, Joyce wall, fever, gold wave, last game:over.
  const alternateWorldRef = useRef(false)
  const agitationStartRef = useRef(-AGITATION_MS)
  const joyceRef = useRef<JoyceSignal>({ text: null, id: 0 })
  // Last complete game:over (with stats + rank) — feeds the hall_of_fame clip
  // (HighScore/Recap), which does not receive it via dmd:display.
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

    const markActivity = () => {
      stack.markActivity(performance.now())
    }

    socket.on('game:start', markActivity)
    socket.on('score:update', markActivity)

    const onGameOver = (data: GameOver) => {
      const now = performance.now()
      markActivity()
      const list = entriesRef.current
      const rank = computeRank(list, data.finalScore)
      const isHigh = qualifies(list, data.finalScore)
      const payload = { ...data, rank }
      lastGameOverRef.current = payload

      if (isHigh) {
        // HIGH_SCORE then CHAINED RECAP: the recap only starts when the high
        // score expires (followUp), not masked in parallel.
        // The payload (stats) travels in the entry → not clobbered by an event.
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
    }
    socket.on('game:over', onGameOver)

    const onDmdDisplay = (d: DmdDisplay) => {
      alternateWorldRef.current = d.alternateWorld ?? false
      if ('mapState' in d) feverRef.current = mapStateFlag(d.mapState, 'fever')
      if (d.mode === 'CINEMATIC') {
        // Kiosk guard: malformed server event without a clip. An unknown clip
        // no longer crashes (clipShowMs guarantees a number → never NaN on
        // expiresAt): it hits the default branch → generic scene.
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
            // hall_of_fame has no stats via dmd:display: rewire the last
            // complete game:over (HighScore/Recap).
            payload: isHall ? lastGameOverRef.current ?? undefined : undefined,
          })
        // Data-driven dispatch provided by the map (joyce/wave/fever/takeover).
        // hall_of_fame + unknown clips: generic takeover via clipShowMs.
        const b = clipBehaviorRef.current[clip]
        if (b?.goldWave) goldWaveRef.current += 1
        // fever starts with the clip: during CINEMATIC no SCORE display
        // (fever carrier) arrives, so activate it here without delay.
        if (b?.fever) feverRef.current = true
        if (b?.joyce) pushJoyce(typeof b.joyce === 'function' ? b.joyce(d.value) : b.joyce)
        if (!b?.noTakeover) pushTk(b?.takeoverMs ?? clipShowMs(clipsRef.current, clip))
        return
      }
      if (d.mode === 'EVENT') {
        markActivity()
        agitationStartRef.current = performance.now()
        // Event → map takeover (label → scene), data-driven.
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
    }
    socket.on('dmd:display', onDmdDisplay)

    const interval = window.setInterval(() => {
      const now = performance.now()
      // All decision logic (purge / chaining / attract / priority) is delegated
      // to the state machine. The hook only feeds it the time and some map
      // data accessors, then projects the result into state.
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
      // Shared socket (lifted into BackglassStage): remove OUR handlers
      // without disconnecting it — the caller owns its lifecycle.
      socket.off('game:start', markActivity)
      socket.off('score:update', markActivity)
      socket.off('game:over', onGameOver)
      socket.off('dmd:display', onDmdDisplay)
    }
  }, [socket])

  return state
}
