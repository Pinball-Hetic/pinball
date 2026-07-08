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
  const mapIdRef = useRef<string>(FORCED_MAP_ID ?? DEFAULT_MAP_ID)

  useEffect(() => {
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
    socket.on('leaderboard:refresh', () => {
      fetchLeaderboard()
    })
    socket.on('game:over', () => {
      fetchStats()
    })
    socket.on('map:selected', ({ mapId: id }) => {
      if (!FORCED_MAP_ID) {
        mapIdRef.current = id
        setMapId(id)
        fetchLeaderboard()
        fetchStats()
      }
    })

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
