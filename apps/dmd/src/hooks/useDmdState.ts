import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  DmdDisplay,
} from '@pinball/shared-types';
import { DEFAULT_MAP_ID } from '@pinball/shared-types';

type PinballSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const INTRO: DmdDisplay = { mode: 'INTRO', player: '—', alternateWorld: false };

// Si NEXT_PUBLIC_MAP_ID est forcé (prod Fliphetic mono-map), on l'utilise comme
// valeur initiale et on n'en change pas (le sélecteur n'est pas affiché côté
// playfield dans ce cas, donc aucun map:selected n'arrivera).
const FORCED_MAP_ID = process.env.NEXT_PUBLIC_MAP_ID;

export function useDmdState() {
  const socketRef = useRef<PinballSocket | null>(null);
  const [display, setDisplay] = useState<DmdDisplay>(INTRO);
  const [connected, setConnected] = useState(false);
  const [mapId, setMapId] = useState<string>(FORCED_MAP_ID ?? DEFAULT_MAP_ID);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SOCKET_URL || undefined;
    const transports: ('polling' | 'websocket')[] = url ? ['websocket'] : ['polling'];
    const socket: PinballSocket = io(url, { transports });
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('dmd:display', (data) => setDisplay(data));
    // Synchro dynamique de la map : émis par le server à la connexion (état
    // courant) puis à chaque sélection. Ignoré si NEXT_PUBLIC_MAP_ID est forcé.
    socket.on('map:selected', ({ mapId: id }) => {
      if (!FORCED_MAP_ID) setMapId(id);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Dérivé du dernier display reçu — state-driven, pas d'event séparé.
  const alternateWorld = display.alternateWorld;

  return { display, alternateWorld, connected, mapId };
}
