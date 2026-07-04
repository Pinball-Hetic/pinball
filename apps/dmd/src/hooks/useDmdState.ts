import { useEffect, useRef, useState } from 'react';
import { createPinballSocket, type PinballSocket } from '@pinball/shared-types/src/socket-client';
import type {
  DmdDisplay,
} from '@pinball/shared-types';
import { DEFAULT_MAP_ID } from '@pinball/shared-types';

const INTRO: DmdDisplay = { mode: 'INTRO', player: '—', alternateWorld: false };

// If NEXT_PUBLIC_MAP_ID is forced (Fliphetic single-map prod), use it as the
// initial value and never change it (the playfield selector is hidden in that
// case, so no map:selected will ever arrive).
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
    // Dynamic map sync: emitted by the server on connect (current state) then
    // on every selection. Ignored when NEXT_PUBLIC_MAP_ID is forced.
    socket.on('map:selected', ({ mapId: id }) => {
      if (!FORCED_MAP_ID) setMapId(id);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Derived from the last received display — state-driven, no separate event.
  const alternateWorld = display.alternateWorld;

  return { display, alternateWorld, connected, mapId };
}
