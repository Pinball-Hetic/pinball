import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  DmdDisplay,
} from '@pinball/shared-types';

type PinballSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const INTRO: DmdDisplay = { mode: 'INTRO', player: '—' };

export function useDmdState() {
  const socketRef = useRef<PinballSocket | null>(null);
  const [display, setDisplay] = useState<DmdDisplay>(INTRO);
  const [upsideDown, setUpsideDown] = useState(false);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SOCKET_URL || undefined;
    const transports: ('polling' | 'websocket')[] = url ? ['websocket'] : ['polling'];
    const socket: PinballSocket = io(url, { transports });
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('dmd:display', (data) => setDisplay(data));
    socket.on('dmd:atmosphere', (data) => setUpsideDown(data.upsideDownActive));

    return () => {
      socket.disconnect();
    };
  }, []);

  return { display, upsideDown, connected };
}
