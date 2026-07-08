import { useEffect, useRef, useState } from 'react';
import { createPinballSocket, type PinballSocket } from '@pinball/shared-types/src/socket-client';
import type {
  DmdDisplay,
} from '@pinball/shared-types';
import { DEFAULT_MAP_ID } from '@pinball/shared-types';

const INTRO: DmdDisplay = { mode: 'INTRO', player: '—', alternateWorld: false };

const FORCED_MAP_ID = process.env.NEXT_PUBLIC_MAP_ID;

export function useDmdState() {
  const socketRef = useRef<PinballSocket | null>(null);
  const [display, setDisplay] = useState<DmdDisplay>(INTRO);
  const [connected, setConnected] = useState(false);
  const [mapId, setMapId] = useState<string>(FORCED_MAP_ID ?? DEFAULT_MAP_ID);

  useEffect(() => {
    const socket: PinballSocket = createPinballSocket();
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('dmd:display', (data) => setDisplay(data));
    socket.on('map:selected', ({ mapId: id }) => {
      if (!FORCED_MAP_ID) setMapId(id);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const alternateWorld = display.alternateWorld;

  return { display, alternateWorld, connected, mapId };
}
