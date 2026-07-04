import { useEffect, useRef } from 'react';
import { createPinballSocket, type PinballSocket } from '@pinball/shared-types/src/socket-client';
import type {
  ButtonInput,
  DevGameEventTrigger,
  SensorInput,
  TiltInput,
} from '@pinball/shared-types';

export interface PhysicalInputCallbacks {
  onButton?: (data: ButtonInput) => void;
  onTilt?: (data: TiltInput) => void;
  onSensor?: (data: SensorInput) => void;
  // Inject a GameEvent from the /debug page (full chain).
  onDevEvent?: (data: DevGameEventTrigger) => void;
}

export interface UsePhysicalInputs {
  callbacksRef: React.MutableRefObject<PhysicalInputCallbacks>;
  /**
   * `isConnectedRef` is deliberately a ref to avoid triggering a re-render of
   * the parent component (Three.js would unmount the scene). If a UI indicator
   * is needed later, create a dedicated sub-component that subscribes to a store
   * or event bus rather than lifting a useState up here.
   */
  isConnectedRef: React.MutableRefObject<boolean>;
  /**
   * Emits a `dev:simulate-button` event to the server. Used by the
   * `simulate-esp32` keyboard mode to validate the network chain without ESP32
   * hardware. No-op if the socket isn't connected.
   */
  simulateButton: (data: ButtonInput) => void;
}

export function usePhysicalInputs(): UsePhysicalInputs {
  const callbacksRef = useRef<PhysicalInputCallbacks>({});
  const isConnectedRef = useRef(false);
  const socketRef = useRef<PinballSocket | null>(null);

  useEffect(() => {
    const socket: PinballSocket = createPinballSocket();
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
