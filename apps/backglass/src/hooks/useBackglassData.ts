import { useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  LeaderboardEntry,
  GlobalStats,
} from '@pinball/shared-types'

type PinballSocket = Socket<ServerToClientEvents, ClientToServerEvents>

const EMPTY_STATS: GlobalStats = {
  totalGames: 0,
  totalDemogorgons: 0,
  totalPortals: 0,
  bestCombo: null,
  bestToday: null,
}

export function useBackglassData() {
  const socketRef = useRef<PinballSocket | null>(null)
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [stats, setStats] = useState<GlobalStats>(EMPTY_STATS)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const fetchLeaderboard = () =>
      fetch('/api/leaderboard')
        .then((res) => res.json())
        .then(setEntries)
        .catch(() => {})

    const fetchStats = () =>
      fetch('/api/stats')
        .then((res) => res.json())
        .then(setStats)
        .catch(() => {})

    fetchLeaderboard()
    fetchStats()

    const url = process.env.NEXT_PUBLIC_SOCKET_URL || undefined
    const transports: ('polling' | 'websocket')[] = url ? ['websocket'] : ['polling']
    const socket: PinballSocket = io(url, { transports })
    socketRef.current = socket

    socket.on('connect', () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))
    socket.on('leaderboard:refresh', (data) => setEntries(data))
    // les agrégats ont changé : on re-fetch /api/stats
    socket.on('game:over', () => {
      fetchStats()
    })

    return () => {
      socket.disconnect()
    }
  }, [])

  return { entries, stats, connected }
}
