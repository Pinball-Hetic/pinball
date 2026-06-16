import { ReadlineParser } from '@serialport/parser-readline';
import { SerialPortStream } from '@serialport/stream';
import { MockBinding } from '@serialport/binding-mock';
import { autoDetect } from '@serialport/bindings-cpp';
import { io, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  ButtonId,
  ButtonAction,
} from '@pinball/shared-types';
import { CABINET_BUTTONS } from '@pinball/shared-types';

const MODE = process.env.INPUT_BRIDGE_MODE === 'serial' ? 'serial' : 'mock';
const SERIAL_PATH = process.env.SERIAL_PATH ?? '/dev/MOCK_ESP32';
const SERIAL_BAUD = Number(process.env.SERIAL_BAUD ?? '115200');
const SERVER_URL = process.env.SERVER_URL ?? 'http://server:3001';

const VALID_BUTTON_IDS: readonly ButtonId[] = CABINET_BUTTONS.map((b) => b.id);

// Référence module-level vers le port ouvert, assignée dans main(). Le handler
// `dev:simulate-button` (déclaré tôt) la lit paresseusement pour injecter du
// texte protocolaire dans le port mock virtuel.
let activePort: SerialPortStream | null = null;

const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(SERVER_URL, {
  transports: ['websocket'],
  reconnection: true,
  auth: { role: 'input-bridge' },
});

socket.on('connect', () => console.log('[bridge] socket connected to', SERVER_URL, 'as input-bridge id=', socket.id));
socket.on('disconnect', (reason) => console.log('[bridge] socket disconnected:', reason));
socket.on('connect_error', (err) => console.log('[bridge] connect_error:', err.message));

// Mode dev `simulate-esp32` côté playfield : le server route l'event ciblé
// vers nous (room `input-bridge`). On injecte la ligne protocolaire dans le
// port mock — notre propre parser la relira et émettra `input:button` au
// server comme si un vrai ESP32 l'avait envoyée.
socket.on('dev:simulate-button', (data) => {
  if (MODE !== 'mock') {
    console.warn('[bridge] dev:simulate-button ignored (serial mode, use real ESP32):', data);
    return;
  }
  if (!activePort || !activePort.port) {
    console.warn('[bridge] dev:simulate-button port not ready, ignoring', data);
    return;
  }
  const line = `BTN:${data.id}:${data.action}\n`;
  activePort.port.emitData(Buffer.from(line));
  console.log('[bridge] dev:simulate-button injected as', line.trim());
});

function isButtonId(value: string): value is ButtonId {
  return (VALID_BUTTON_IDS as readonly string[]).includes(value);
}

function emitButton(id: ButtonId, action: ButtonAction) {
  socket.emit('input:button', { id, action });
  console.log('[bridge] emit input:button', id, action);
}

function emitTilt() {
  socket.emit('input:tilt', { state: 'TRIGGERED' });
  console.log('[bridge] emit input:tilt TRIGGERED');
}

function emitSensor(id: string, value: number) {
  socket.emit('input:sensor', { id, value });
  console.log('[bridge] emit input:sensor', id, value);
}

function handleLine(raw: string) {
  const line = raw.trim();
  if (!line) return;
  const parts = line.split(':');
  if (parts[0] === 'BTN' && parts.length === 3) {
    const id = parts[1];
    const action = parts[2];
    if (!isButtonId(id)) {
      console.error('[bridge] parse: unknown button id:', JSON.stringify(line));
      return;
    }
    if (action !== 'DOWN' && action !== 'UP') {
      console.error('[bridge] parse: invalid btn action:', JSON.stringify(line));
      return;
    }
    emitButton(id, action);
    return;
  }
  if (parts[0] === 'TILT' && parts[1] === 'TRIGGERED' && parts.length === 2) {
    emitTilt();
    return;
  }
  if (parts[0] === 'SENSOR' && parts.length === 3) {
    const value = Number(parts[2]);
    if (Number.isNaN(value)) {
      console.error('[bridge] parse: invalid sensor value:', JSON.stringify(line));
      return;
    }
    emitSensor(parts[1], value);
    return;
  }
  console.error('[bridge] parse: unknown line:', JSON.stringify(line));
}

// Crée un port série virtuel pour les tests. N'émet aucune donnée par défaut —
// utilisé en combinaison avec le mode `simulate-esp32` côté playfield, qui
// envoie un event Socket.io que le server route ici ; on écrit alors la ligne
// protocolaire sur ce port mock et notre propre parser la relit.
async function openMockPort(): Promise<SerialPortStream> {
  MockBinding.createPort(SERIAL_PATH, { echo: false, record: false });
  const port = new SerialPortStream({
    binding: MockBinding,
    path: SERIAL_PATH,
    baudRate: SERIAL_BAUD,
  });
  await new Promise<void>((resolve, reject) => {
    port.once('open', () => resolve());
    port.once('error', reject);
  });
  console.log('[bridge] mock port opened', SERIAL_PATH);
  return port;
}

async function openSerialPort(): Promise<SerialPortStream> {
  const binding = autoDetect();
  for (let i = 1; i <= 60; i++) {
    try {
      const port = new SerialPortStream({
        binding,
        path: SERIAL_PATH,
        baudRate: SERIAL_BAUD,
      });
      await new Promise<void>((resolve, reject) => {
        port.once('open', () => resolve());
        port.once('error', reject);
      });
      console.log('[bridge] serial port opened', SERIAL_PATH, 'attempt', i);
      return port;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (i === 1 || i % 10 === 0) {
        console.log(`[bridge] serial open attempt ${i}/60 failed: ${msg}`);
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error(`could not open ${SERIAL_PATH} after 60 attempts`);
}

async function main() {
  console.log('[bridge] start mode=', MODE, 'serverUrl=', SERVER_URL, 'path=', SERIAL_PATH);
  const port = MODE === 'serial' ? await openSerialPort() : await openMockPort();
  activePort = port;
  const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));
  parser.on('data', (chunk: string | Buffer) => handleLine(chunk.toString()));
  port.on('error', (err) => console.error('[bridge] port error', err.message));

  const shutdown = (signal: string) => {
    console.log('[bridge] received', signal, '— shutting down');
    try {
      port.close(() => {
        activePort = null;
        socket.disconnect();
        process.exit(0);
      });
    } catch {
      activePort = null;
      socket.disconnect();
      process.exit(0);
    }
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[bridge] fatal:', err);
  process.exit(1);
});
