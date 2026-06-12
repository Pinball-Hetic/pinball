import { useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  DevGameEventTrigger,
  DmdDisplay,
  GameStats,
  LeaderboardEntry,
} from '@pinball/shared-types'

type PinballSocket = Socket<ServerToClientEvents, ClientToServerEvents>

const PLAYER = 'DEBUG'
const DEBUG_STATS: GameStats = {
  maxCombo: 12,
  maxMultiplier: 5,
  counters: { demogorgons: 2, portals: 1, hetic: 5 },
  durationS: 88,
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

export default function DebugPage() {
  const socketRef = useRef<PinballSocket | null>(null)
  const [connected, setConnected] = useState(false)
  const [ud, setUd] = useState(false)
  const [score, setScore] = useState(12500)
  const [combo, setCombo] = useState(6)
  const [multi, setMulti] = useState(3)
  const [lives, setLives] = useState(2)
  const [hetic, setHetic] = useState(3)
  const udRef = useRef(ud)
  udRef.current = ud

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SOCKET_URL || undefined
    const transports: ('polling' | 'websocket')[] = url ? ['websocket'] : ['polling']
    const socket: PinballSocket = io(url, { transports })
    socketRef.current = socket
    socket.on('connect', () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))
    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [])

  const triggerEvent = (type: DevGameEventTrigger['type'], hitCount?: number) =>
    socketRef.current?.emit('dev:trigger-game-event', { type, hitCount })

  const pushDisplay = (d: DmdDisplay) => socketRef.current?.emit('dmd:display', d)

  const scoreSnap = () => ({
    player: PLAYER,
    score,
    combo,
    multiplier: multi,
    lives,
    mapState: { hetic, fever: false },
    upsideDown: udRef.current,
  })

  const addScore = (amount: number) =>
    socketRef.current?.emit('dev:trigger-game-event', { type: 'DEBUG_ADD_SCORE', amount })

  const heticComplete = async () => {
    for (let i = 0; i < 5; i++) {
      triggerEvent('DROP_TARGET_COMPLETE')
      // eslint-disable-next-line no-await-in-loop
      await wait(400)
    }
  }

  // ── Partie simulée ─────────────────────────────────────────────────────
  const gameOverNormal = () =>
    socketRef.current?.emit('game:over', {
      player: PLAYER,
      finalScore: 3200,
      mapId: 'strangerthings',
      stats: DEBUG_STATS,
      debug: true,
    })

  const gameOverQualifying = async () => {
    let tenth = 0
    try {
      const res = await fetch('/api/leaderboard')
      const list: LeaderboardEntry[] = await res.json()
      tenth = list.find((e) => e.rank === 10)?.score ?? 0
    } catch {
      tenth = 0
    }
    socketRef.current?.emit('game:over', {
      player: PLAYER,
      finalScore: tenth + 1000,
      mapId: 'strangerthings',
      stats: DEBUG_STATS,
      debug: true,
    })
  }

  const scoreBurst = async () => {
    const socket = socketRef.current
    if (!socket) return
    let s = 0
    for (let i = 0; i < 10; i++) {
      s += 500 + i * 350
      socket.emit('score:update', {
        player: PLAYER,
        score: s,
        combo: i,
        multiplier: 1 + Math.floor(i / 3),
        lives: 3,
        mapState: { hetic: 0, fever: false },
      })
      // eslint-disable-next-line no-await-in-loop
      await wait(150)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200 p-6 font-mono">
      <div className="mb-4 rounded bg-red-900/60 border border-red-500 px-4 py-2 text-red-200 text-sm tracking-widest">
        DEBUG TOOLS — dev only · socket {connected ? 'connecté' : 'déconnecté'}
      </div>

      <label className="inline-flex items-center gap-3 mb-6 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={ud}
          onChange={(e) => setUd(e.target.checked)}
          className="w-5 h-5 accent-fuchsia-500"
        />
        <span className={ud ? 'text-fuchsia-400' : 'text-zinc-400'}>UPSIDE DOWN</span>
      </label>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Group title="Chaîne complète (via playfield)">
          <p className="text-xs text-amber-400 mb-2">
            nécessite le playfield ouvert dans un autre onglet
          </p>
          <Btn onClick={() => triggerEvent('BALL_LAUNCHED')}>BALL_LAUNCHED</Btn>
          <Btn onClick={() => triggerEvent('BUMPER_HIT')}>BUMPER_HIT</Btn>
          <Btn onClick={() => triggerEvent('SLINGSHOT_HIT')}>SLINGSHOT</Btn>
          <Btn onClick={() => triggerEvent('RAMP_HIT')}>RAMP</Btn>
          <Btn onClick={() => triggerEvent('DROP_TARGET_COMPLETE')}>DROP COMPLETE</Btn>
          <Btn onClick={() => triggerEvent('DEMOGORGON_REVEAL')}>DEMOGORGON REVEAL</Btn>
          <Btn onClick={() => triggerEvent('DEMOGORGON_TARGET_HIT', 1)}>DEMOGORGON HIT 1/2</Btn>
          <Btn onClick={() => triggerEvent('DEMOGORGON_TARGET_HIT', 5)}>
            DEMOGORGON HIT 2/2 (victoire)
          </Btn>
          <Btn onClick={() => triggerEvent('PORTAL_ENTER')}>PORTAL ENTER</Btn>
          <Btn onClick={() => triggerEvent('ELEVEN_ASSIST')}>ELEVEN ASSIST</Btn>
          <Btn onClick={() => triggerEvent('DRAIN')}>DRAIN</Btn>
          <Btn onClick={() => triggerEvent('BOTTOM_OUT')}>BOTTOM_OUT</Btn>
        </Group>

        <Group title="DMD direct">
          <Btn onClick={() => pushDisplay({ mode: 'INTRO', player: PLAYER, upsideDown: ud })}>
            INTRO
          </Btn>
          <div className="grid grid-cols-5 gap-1 my-1">
            <NumIn label="score" value={score} onChange={setScore} />
            <NumIn label="combo" value={combo} onChange={setCombo} />
            <NumIn label="multi" value={multi} onChange={setMulti} />
            <NumIn label="lives" value={lives} onChange={setLives} />
            <NumIn label="hetic" value={hetic} onChange={setHetic} />
          </div>
          <Btn onClick={() => pushDisplay({ mode: 'SCORE', ...scoreSnap() })}>SCORE</Btn>
          <Btn
            onClick={() =>
              pushDisplay({
                mode: 'EVENT',
                label: 'DEMOGORGON',
                points: 250,
                ...scoreSnap(),
              })
            }
          >
            EVENT (label)
          </Btn>
          <Btn onClick={() => pushDisplay({ mode: 'COMBO_FLASH', ...scoreSnap() })}>
            COMBO_FLASH x{combo}
          </Btn>
          <Btn onClick={() => pushDisplay({ mode: 'MULTI_FLASH', ...scoreSnap() })}>
            MULTI_FLASH x{multi}
          </Btn>
          <Btn
            onClick={() =>
              pushDisplay({ mode: 'LIFE_LOST', livesRemaining: lives, score, player: PLAYER, upsideDown: ud })
            }
          >
            LIFE_LOST
          </Btn>
          <Btn
            onClick={() =>
              pushDisplay({ mode: 'GAME_OVER', player: PLAYER, finalScore: score, upsideDown: ud })
            }
          >
            GAME_OVER
          </Btn>
          {(
            [
              ['demogorgon_rises'],
              ['portal_swallow'],
              ['demogorgon_slain'],
              ['last_chance'],
              ['hall_of_fame'],
              ['milestone_5k', 5000],
              ['milestone_15k', 15000],
              ['milestone_30k', 30000],
              ['milestone_big', 75000],
              ['hetic_letter', 3],
              ['hetic_complete'],
              ['skill_shot'],
            ] as const
          ).map(([clip, value]) => (
            <Btn
              key={clip}
              onClick={() =>
                pushDisplay({ mode: 'CINEMATIC', clip, player: PLAYER, score, value, upsideDown: ud })
              }
            >
              CINEMATIC: {clip}
              {value != null ? ` (${value})` : ''}
            </Btn>
          ))}
        </Group>

        <Group title="Score & paliers">
          <p className="text-xs text-amber-400 mb-2">
            via la vraie chaîne (playfield ouvert) — franchit les paliers
          </p>
          <Btn onClick={() => addScore(1000)}>+1 000</Btn>
          <Btn onClick={() => addScore(5000)}>+5 000</Btn>
          <Btn onClick={() => addScore(15000)}>+15 000</Btn>
          <Btn onClick={() => addScore(30000)}>+30 000</Btn>
        </Group>

        <Group title="HETIC">
          <Btn onClick={() => triggerEvent('DROP_TARGET_COMPLETE')}>
            LETTRE +1 (drop complete)
          </Btn>
          <Btn onClick={heticComplete}>HETIC COMPLET (×5)</Btn>
        </Group>

        <Group title="Partie simulée">
          <Btn onClick={() => socketRef.current?.emit('game:start', { player: PLAYER })}>
            game:start
          </Btn>
          <Btn onClick={gameOverNormal}>game:over NORMAL (debug)</Btn>
          <Btn onClick={gameOverQualifying}>game:over QUALIFIANT (debug)</Btn>
          <Btn onClick={scoreBurst}>score:update burst</Btn>
        </Group>
      </div>
    </div>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm uppercase tracking-widest text-zinc-400 border-b border-zinc-700 pb-1">
        {title}
      </h2>
      {children}
    </section>
  )
}

function Btn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="rounded bg-zinc-800 hover:bg-zinc-700 active:bg-fuchsia-700 px-4 py-3 text-left text-sm transition-colors border border-zinc-700"
    >
      {children}
    </button>
  )
}

function NumIn({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (n: number) => void
}) {
  return (
    <label className="flex flex-col text-[10px] text-zinc-500">
      {label}
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="bg-zinc-900 border border-zinc-700 rounded px-1 py-1 text-zinc-200 text-xs"
      />
    </label>
  )
}
