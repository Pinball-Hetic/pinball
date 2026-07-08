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
  onDevEvent?: (data: DevGameEventTrigger) => void;
}

export interface UsePhysicalInputs {
  callbacksRef: React.MutableRefObject<PhysicalInputCallbacks>;
  isConnectedRef: React.MutableRefObject<boolean>;
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
