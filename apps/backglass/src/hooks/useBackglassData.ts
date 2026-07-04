import { useEffect, useRef, useState } from 'react'
import { createPinballSocket, type PinballSocket } from '@pinball/shared-types/src/socket-client'
import type {
  LeaderboardEntry,
  GlobalStats,
} from '@pinball/shared-types'
import { DEFAULT_MAP_ID } from '@pinball/shared-types'
import { isLeaderboardShape, isStatsShape, safeFetch } from './backglassFetch'

const EMPTY_STATS: GlobalStats = {
  totalGames: 0,
  totals: [],
  bestCombo: null,
  bestToday: null,
}

const FORCED_MAP_ID = process.env.NEXT_PUBLIC_MAP_ID

export function useBackglassData() {
  const socketRef = useRef<PinballSocket | null>(null)
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [stats, setStats] = useState<GlobalStats>(EMPTY_STATS)
  const [connected, setConnected] = useState(false)
  const [mapId, setMapId] = useState<string>(FORCED_MAP_ID ?? DEFAULT_MAP_ID)
  // Ref to the current map: the useEffect([], []) closures always read the
  // fresh value without being recreated.
  const mapIdRef = useRef<string>(FORCED_MAP_ID ?? DEFAULT_MAP_ID)

  useEffect(() => {
    // Kiosk: an error response (JSON {error}, 5xx HTML, disconnect) must
    // NEVER replace a valid state. Status + shape are validated, otherwise
    // the previous data (or EMPTY_STATS) is kept.
    const fetchLeaderboard = () =>
      safeFetch(`/api/leaderboard?mapId=${mapIdRef.current}`, isLeaderboardShape)
        .then(setEntries)
        .catch(() => {})

    const fetchStats = () =>
      safeFetch(`/api/stats?mapId=${mapIdRef.current}`, isStatsShape)
        .then(setStats)
        .catch(() => {})

    fetchLeaderboard()
    fetchStats()

    const socket: PinballSocket = createPinballSocket()
    socketRef.current = socket

    socket.on('connect', () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))
    // leaderboard:refresh arrives after a game:over on any map. Re-fetch from
    // the API with the current mapId to show only the active map's scores
    // (the event payload is ignored).
    socket.on('leaderboard:refresh', () => {
      fetchLeaderboard()
    })
    // the aggregates changed: re-fetch /api/stats
    socket.on('game:over', () => {
      fetchStats()
    })
    // Active map sync (emitted on connect + on every change).
    // Ignored when NEXT_PUBLIC_MAP_ID is forced (Fliphetic single-map prod).
    socket.on('map:selected', ({ mapId: id }) => {
      if (!FORCED_MAP_ID) {
        mapIdRef.current = id
        setMapId(id)
        // Immediate re-fetch with the new map: the board and stats must
        // switch right away, without waiting for the next poll.
        fetchLeaderboard()
        fetchStats()
      }
    })

    // Claims arrive async (phone, after the game, from any cabinet): poll
    // periodically to surface claimed names. The leaderboard:refresh socket
    // event covers the immediate post-local-game refresh; the poll catches
    // late claims.
    const poll = window.setInterval(() => {
      fetchLeaderboard()
    }, 30_000)

    return () => {
      socket.disconnect()
      window.clearInterval(poll)
    }
  }, [])

  return { entries, stats, connected, mapId }
}
