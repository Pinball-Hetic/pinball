import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import type {
  ButtonInput,
  ClientToServerEvents,
  SensorInput,
  ServerToClientEvents,
  TiltInput,
} from '@pinball/shared-types';

export interface PhysicalInputCallbacks {
  onButton?: (data: ButtonInput) => void;
  onTilt?: (data: TiltInput) => void;
  onSensor?: (data: SensorInput) => void;
}

export interface UsePhysicalInputs {
  callbacksRef: React.MutableRefObject<PhysicalInputCallbacks>;
  /**
   * `isConnectedRef` est volontairement un ref pour ne pas déclencher de
   * re-render du composant parent (Three.js démonterait la scène). Si un
   * indicateur UI est nécessaire plus tard, créer un sous-composant dédié
   * qui s'abonne à un store ou à un event bus, pas faire remonter un
   * useState ici.
   */
  isConnectedRef: React.MutableRefObject<boolean>;
}

export function usePhysicalInputs(): UsePhysicalInputs {
  const callbacksRef = useRef<PhysicalInputCallbacks>({});
  const isConnectedRef = useRef(false);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SOCKET_URL || undefined;
    // url défini (dev, port serveur exposé) → WS direct.
    // url undefined (prod Fliphetic, same-origin via rewrite Next.js) → polling
    // pur, car les rewrites ne proxient pas l'upgrade WebSocket.
    const transports: ('polling' | 'websocket')[] = url ? ['websocket'] : ['polling'];
    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(url, { transports });

    socket.on('connect', () => {
      isConnectedRef.current = true;
    });
    socket.on('disconnect', () => {
      isConnectedRef.current = false;
    });

    socket.on('input:button', (data) => callbacksRef.current.onButton?.(data));
    socket.on('input:tilt', (data) => callbacksRef.current.onTilt?.(data));
    socket.on('input:sensor', (data) => callbacksRef.current.onSensor?.(data));

    return () => {
      socket.disconnect();
    };
  }, []);

  return { callbacksRef, isConnectedRef };
}
