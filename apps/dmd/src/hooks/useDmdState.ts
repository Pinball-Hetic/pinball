import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  DmdDisplay,
} from '@pinball/shared-types';

type PinballSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const INTRO: DmdDisplay = { mode: 'INTRO', player: '—', upsideDown: false };

export function useDmdState() {
  const socketRef = useRef<PinballSocket | null>(null);
  const [display, setDisplay] = useState<DmdDisplay>(INTRO);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SOCKET_URL || undefined;
    const transports: ('polling' | 'websocket')[] = url ? ['websocket'] : ['polling'];
    const socket: PinballSocket = io(url, { transports });
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('dmd:display', (data) => setDisplay(data));

    return () => {
      socket.disconnect();
    };
  }, []);

  // Dérivé du dernier display reçu — state-driven, pas d'event séparé.
  const upsideDown = display.upsideDown;

  return { display, upsideDown, connected };
}
