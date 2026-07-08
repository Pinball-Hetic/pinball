import type { ButtonId, ButtonAction } from '@pinball/shared-types';
import { parseLine } from './parser';

export interface BridgeEmitter {
  button(id: ButtonId, action: ButtonAction): void;
  tilt(): void;
  sensor(id: string, value: number): void;
}

export interface InputSocket {
  emit(event: 'input:button', data: { id: ButtonId; action: ButtonAction }): unknown;
  emit(event: 'input:tilt', data: { state: 'TRIGGERED' }): unknown;
  emit(event: 'input:sensor', data: { id: string; value: number }): unknown;
}

export function createSocketEmitter(socket: InputSocket): BridgeEmitter {
  return {
    button(id, action) {
      socket.emit('input:button', { id, action });
      console.log('[bridge] emit input:button', id, action);
    },
    tilt() {
      socket.emit('input:tilt', { state: 'TRIGGERED' });
      console.log('[bridge] emit input:tilt TRIGGERED');
    },
    sensor(id, value) {
      socket.emit('input:sensor', { id, value });
      console.log('[bridge] emit input:sensor', id, value);
    },
  };
}

export function handleLine(raw: string, emitter: BridgeEmitter): void {
  const parsed = parseLine(raw);
  if (!parsed) return;
  switch (parsed.kind) {
    case 'button':
      emitter.button(parsed.id, parsed.action);
      return;
    case 'tilt':
      emitter.tilt();
      return;
    case 'sensor':
      emitter.sensor(parsed.id, parsed.value);
      return;
    case 'unknown':
      if (process.env.INPUT_BRIDGE_VERBOSE) {
        console.error('[bridge] parse: unknown line:', JSON.stringify(parsed.line));
      }
      return;
  }
}
