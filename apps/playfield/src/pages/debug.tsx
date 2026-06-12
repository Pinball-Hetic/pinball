import { useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  DevGameEventTrigger,
  DmdDisplay,
  GameStats,
  LeaderboardEntry,
  CinematicClip,
} from '@pinball/shared-types'
import { getMapPackage } from '@pinball/maps'

type PinballSocket = Socket<ServerToClientEvents, ClientToServerEvents>

// Map active : le debug est data-driven (boutons boss + clips depuis la map).
const MAP_ID = process.env.NEXT_PUBLIC_MAP_ID ?? 'strangerthings'
const MAP_PKG = getMapPackage(MAP_ID)
const BOSSES = MAP_PKG?.layout.bosses ?? []
// Clips de la map (manifest.clipFamilies) + clips core génériques.
const CINEMATIC_CLIPS = [
  ...(Object.keys(MAP_PKG?.manifest.clipFamilies ?? {}) as CinematicClip[]),
  'hall_of_fame' as CinematicClip,
  'skill_shot' as CinematicClip,
]
// Clés de mapState éditables, déclarées par la map (pas de clé en dur).
const MAP_STATE_NUMBERS = MAP_PKG?.manifest.debugMapState?.numbers ?? []
const MAP_STATE_FLAGS = MAP_PKG?.manifest.debugMapState?.flags ?? []

const PLAYER = 'DEBUG'
const DEBUG_STATS: GameStats = {
  maxCombo: 12,
  maxMultiplier: 5,
  counters: {},
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
  // mapState numérique générique (clés = MAP_STATE_NUMBERS de la map).
  const [mapNums, setMapNums] = useState<Record<string, number>>(() =>
    Object.fromEntries(MAP_STATE_NUMBERS.map((k) => [k, 0])),
  )
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

  const triggerEvent = (
    type: DevGameEventTrigger['type'],
    extra?: { bossId?: string; hitCount?: number },
  ) => socketRef.current?.emit('dev:trigger-game-event', { type, ...extra })

  const pushDisplay = (d: DmdDisplay) => socketRef.current?.emit('dmd:display', d)

  // Construit le mapState générique (numériques + flags à false) pour les events.
  const mapStateOf = (nums: Record<string, number>) => ({
    ...nums,
    ...Object.fromEntries(MAP_STATE_FLAGS.map((f) => [f, false])),
  })

  const scoreSnap = () => ({
    player: PLAYER,
    score,
    combo,
    multiplier: multi,
    lives,
    mapState: mapStateOf(mapNums),
    alternateWorld: udRef.current,
  })

  const addScore = (amount: number) =>
    socketRef.current?.emit('dev:trigger-game-event', { type: 'DEBUG_ADD_SCORE', amount })

  const dropTargetCompleteX5 = async () => {
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
      mapId: MAP_ID,
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
      mapId: MAP_ID,
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
        mapState: mapStateOf(Object.fromEntries(MAP_STATE_NUMBERS.map((k) => [k, 0]))),
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
        <span className={ud ? 'text-fuchsia-400' : 'text-zinc-400'}>MONDE ALTERNATIF</span>
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
          {BOSSES.map((b) => (
            <span key={b.id} className="contents">
              <Btn onClick={() => triggerEvent('BOSS_REVEAL', { bossId: b.id })}>
                {b.hud.dmdLabel} REVEAL
              </Btn>
              <Btn onClick={() => triggerEvent('BOSS_TARGET_HIT', { bossId: b.id, hitCount: 1 })}>
                {b.hud.dmdLabel} HIT 1
              </Btn>
              <Btn onClick={() => triggerEvent('BOSS_TARGET_HIT', { bossId: b.id, hitCount: b.targetHits })}>
                {b.hud.dmdLabel} HIT {b.targetHits} (victoire)
              </Btn>
            </span>
          ))}
          <Btn onClick={() => triggerEvent('PORTAL_ENTER')}>PORTAL ENTER</Btn>
          <Btn onClick={() => triggerEvent('ASSIST')}>ASSIST</Btn>
          <Btn onClick={() => triggerEvent('DRAIN')}>DRAIN</Btn>
          <Btn onClick={() => triggerEvent('BOTTOM_OUT')}>BOTTOM_OUT</Btn>
        </Group>

        <Group title="DMD direct">
          <Btn onClick={() => pushDisplay({ mode: 'INTRO', player: PLAYER, alternateWorld: ud })}>
            INTRO
          </Btn>
          <div className="grid grid-cols-5 gap-1 my-1">
            <NumIn label="score" value={score} onChange={setScore} />
            <NumIn label="combo" value={combo} onChange={setCombo} />
            <NumIn label="multi" value={multi} onChange={setMulti} />
            <NumIn label="lives" value={lives} onChange={setLives} />
            {MAP_STATE_NUMBERS.map((k) => (
              <NumIn
                key={k}
                label={k}
                value={mapNums[k] ?? 0}
                onChange={(n) => setMapNums((prev) => ({ ...prev, [k]: n }))}
              />
            ))}
          </div>
          <Btn onClick={() => pushDisplay({ mode: 'SCORE', ...scoreSnap() })}>SCORE</Btn>
          <Btn
            onClick={() =>
              pushDisplay({
                mode: 'EVENT',
                label: BOSSES[0]?.hud.dmdLabel ?? 'BOSS',
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
              pushDisplay({ mode: 'LIFE_LOST', livesRemaining: lives, score, player: PLAYER, alternateWorld: ud })
            }
          >
            LIFE_LOST
          </Btn>
          <Btn
            onClick={() =>
              pushDisplay({ mode: 'GAME_OVER', player: PLAYER, finalScore: score, alternateWorld: ud })
            }
          >
            GAME_OVER
          </Btn>
          {CINEMATIC_CLIPS.map((clip) => (
            <Btn
              key={clip}
              onClick={() =>
                pushDisplay({ mode: 'CINEMATIC', clip, player: PLAYER, score, alternateWorld: ud })
              }
            >
              CINEMATIC: {clip}
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

        <Group title="Drop targets / collecte">
          <Btn onClick={() => triggerEvent('DROP_TARGET_COMPLETE')}>
            DROP COMPLETE +1
          </Btn>
          <Btn onClick={dropTargetCompleteX5}>DROP COMPLETE (×5)</Btn>
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
