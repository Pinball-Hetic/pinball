import { useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import type { ServerToClientEvents, ClientToServerEvents, ScoreUpdate } from '@pinball/shared-types'

type PinballSocket = Socket<ServerToClientEvents, ClientToServerEvents>

export function useSocketScore() {
  const socketRef = useRef<PinballSocket | null>(null)
  const [score, setScore] = useState<ScoreUpdate>({
    player: '',
    score: 0,
    combo: 0,
    multiplier: 1,
  })
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SOCKET_URL || undefined
    const transports: ('polling' | 'websocket')[] = url ? ['websocket'] : ['polling']
    const socket: PinballSocket = io(url, { transports })
    socketRef.current = socket

    socket.on('connect', () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))
    socket.on('score:update', (data) => setScore(data))

    return () => {
      socket.disconnect()
    }
  }, [])

  return { score, connected }
}
