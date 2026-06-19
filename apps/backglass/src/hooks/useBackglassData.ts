import { useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  LeaderboardEntry,
  GlobalStats,
} from '@pinball/shared-types'
import { DEFAULT_MAP_ID } from '@pinball/shared-types'

type PinballSocket = Socket<ServerToClientEvents, ClientToServerEvents>

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
  // Ref sur la map courante : les closures du useEffect([], []) lisent
  // toujours la valeur à jour sans se recréer.
  const mapIdRef = useRef<string>(FORCED_MAP_ID ?? DEFAULT_MAP_ID)

  useEffect(() => {
    // Kiosk : une réponse d'erreur (JSON {error}, 5xx HTML, déconnexion)
    // ne doit JAMAIS remplacer un état valide. On valide statut + forme,
    // sinon on garde les données précédentes (ou EMPTY_STATS).
    const fetchLeaderboard = () =>
      fetch(`/api/leaderboard?mapId=${mapIdRef.current}`)
        .then((res) => {
          if (!res.ok) throw new Error(`leaderboard ${res.status}`)
          return res.json()
        })
        .then((data) => {
          if (!Array.isArray(data)) throw new Error('leaderboard shape')
          setEntries(data)
        })
        .catch(() => {})

    const fetchStats = () =>
      fetch(`/api/stats?mapId=${mapIdRef.current}`)
        .then((res) => {
          if (!res.ok) throw new Error(`stats ${res.status}`)
          return res.json()
        })
        .then((data) => {
          if (typeof data?.totalGames !== 'number') throw new Error('stats shape')
          setStats(data as GlobalStats)
        })
        .catch(() => {})

    fetchLeaderboard()
    fetchStats()

    const url = process.env.NEXT_PUBLIC_SOCKET_URL || undefined
    const transports: ('polling' | 'websocket')[] = url ? ['websocket'] : ['polling']
    const socket: PinballSocket = io(url, { transports })
    socketRef.current = socket

    socket.on('connect', () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))
    // leaderboard:refresh arrive après un game:over sur n'importe quelle map.
    // On re-fetch depuis l'API avec le mapId courant pour ne montrer que les
    // scores de la map active (le payload de l'event est ignoré).
    socket.on('leaderboard:refresh', () => {
      fetchLeaderboard()
    })
    // les agrégats ont changé : on re-fetch /api/stats
    socket.on('game:over', () => {
      fetchStats()
    })
    // Synchro map active (émis à la connexion + à chaque changement).
    // Ignoré si NEXT_PUBLIC_MAP_ID est forcé (prod Fliphetic mono-map).
    socket.on('map:selected', ({ mapId: id }) => {
      if (!FORCED_MAP_ID) {
        mapIdRef.current = id
        setMapId(id)
        // Re-fetch immédiat avec la nouvelle map : le board et les stats
        // doivent basculer dès le changement, sans attendre le prochain poll.
        fetchLeaderboard()
        fetchStats()
      }
    })

    // Les claims arrivent async (téléphone, après la partie, depuis n'importe
    // quelle borne) : poll périodique pour faire apparaître les pseudos
    // réclamés. Le socket leaderboard:refresh couvre le rafraîchissement
    // immédiat post-partie locale ; le poll rattrape les claims tardifs.
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
