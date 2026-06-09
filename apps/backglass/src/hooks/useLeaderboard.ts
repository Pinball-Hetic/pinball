import { useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import type { ServerToClientEvents, ClientToServerEvents, LeaderboardEntry } from '@pinball/shared-types'

type PinballSocket = Socket<ServerToClientEvents, ClientToServerEvents>

export function useLeaderboard() {
  const socketRef = useRef<PinballSocket | null>(null)
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    fetch('/api/leaderboard')
      .then((res) => res.json())
      .then((data) => setEntries(data))
      .catch(() => {})

    const url = process.env.NEXT_PUBLIC_SOCKET_URL || undefined
    const transports: ('polling' | 'websocket')[] = url ? ['websocket'] : ['polling']
    const socket: PinballSocket = io(url, { transports })
    socketRef.current = socket

    socket.on('connect', () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))
    socket.on('leaderboard:refresh', (data) => setEntries(data))

    return () => {
      socket.disconnect()
    }
  }, [])

  return { entries, connected }
}
