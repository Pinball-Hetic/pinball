import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import type {
  ButtonInput,
  ClientToServerEvents,
  DevGameEventTrigger,
  SensorInput,
  ServerToClientEvents,
  TiltInput,
} from '@pinball/shared-types';

export interface PhysicalInputCallbacks {
  onButton?: (data: ButtonInput) => void;
  onTilt?: (data: TiltInput) => void;
  onSensor?: (data: SensorInput) => void;
  // Injection d'un GameEvent depuis la page /debug (chaîne complète).
  onDevEvent?: (data: DevGameEventTrigger) => void;
}

type PinballSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

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
  /**
   * Émet un event `dev:simulate-button` vers le server. Utilisé par le
   * mode clavier `simulate-esp32` pour valider la chaîne réseau sans
   * hardware ESP32. No-op si le socket n'est pas connecté.
   */
  simulateButton: (data: ButtonInput) => void;
}

export function usePhysicalInputs(): UsePhysicalInputs {
  const callbacksRef = useRef<PhysicalInputCallbacks>({});
  const isConnectedRef = useRef(false);
  const socketRef = useRef<PinballSocket | null>(null);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SOCKET_URL || undefined;
    // url défini (dev, port serveur exposé) → WS direct.
    // url undefined (prod Fliphetic, same-origin via rewrite Next.js) → polling
    // pur, car les rewrites ne proxient pas l'upgrade WebSocket.
    const transports: ('polling' | 'websocket')[] = url ? ['websocket'] : ['polling'];
    const socket: PinballSocket = io(url, { transports });
    socketRef.current = socket;

    socket.on('connect', () => {
      isConnectedRef.current = true;
    });
    socket.on('disconnect', () => {
      isConnectedRef.current = false;
    });

    socket.on('input:button', (data) => callbacksRef.current.onButton?.(data));
    socket.on('input:tilt', (data) => callbacksRef.current.onTilt?.(data));
    socket.on('input:sensor', (data) => callbacksRef.current.onSensor?.(data));
    socket.on('dev:trigger-game-event', (data) => callbacksRef.current.onDevEvent?.(data));

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const simulateButton = (data: ButtonInput) => {
    const socket = socketRef.current;
    if (!socket?.connected) return;
    console.log('[playfield] sending dev:simulate-button', data.id, data.action);
    socket.emit('dev:simulate-button', data);
  };

  return { callbacksRef, isConnectedRef, simulateButton };
}
