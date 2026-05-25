import { ReadlineParser } from '@serialport/parser-readline';
import { SerialPortStream } from '@serialport/stream';
import { MockBinding } from '@serialport/binding-mock';
import { autoDetect } from '@serialport/bindings-cpp';
import { io, type Socket } from 'socket.io-client';

const MODE = process.env.INPUT_BRIDGE_MODE === 'serial' ? 'serial' : 'mock';
const SERIAL_PATH = process.env.SERIAL_PATH ?? '/dev/MOCK_ESP32';
const SERIAL_BAUD = Number(process.env.SERIAL_BAUD ?? '115200');
const SERVER_URL = process.env.SERVER_URL ?? 'http://server:3001';

const socket: Socket = io(SERVER_URL, {
  transports: ['websocket'],
  reconnection: true,
});

socket.on('connect', () => console.log('[socket] connected to', SERVER_URL, 'id=', socket.id));
socket.on('disconnect', (reason) => console.log('[socket] disconnected:', reason));
socket.on('connect_error', (err) => console.log('[socket] connect_error:', err.message));

function emitButton(id: string, action: 'DOWN' | 'UP') {
  socket.emit('button', { id, action });
  console.log('[evt] button', id, action);
}

function emitTilt(state: string) {
  socket.emit('tilt', { state });
  console.log('[evt] tilt', state);
}

function emitSensor(id: string, value: number) {
  socket.emit('sensor', { id, value });
  console.log('[evt] sensor', id, value);
}

function handleLine(raw: string) {
  const line = raw.trim();
  if (!line) return;
  const parts = line.split(':');
  if (parts[0] === 'BTN' && parts.length === 3) {
    const action = parts[2];
    if (action !== 'DOWN' && action !== 'UP') {
      console.error('[parse] invalid btn action:', JSON.stringify(line));
      return;
    }
    emitButton(parts[1], action);
    return;
  }
  if (parts[0] === 'TILT' && parts.length === 2) {
    emitTilt(parts[1]);
    return;
  }
  if (parts[0] === 'SENSOR' && parts.length === 3) {
    const value = Number(parts[2]);
    if (Number.isNaN(value)) {
      console.error('[parse] invalid sensor value:', JSON.stringify(line));
      return;
    }
    emitSensor(parts[1], value);
    return;
  }
  console.error('[parse] unknown line:', JSON.stringify(line));
}

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
  console.log('[mock] port opened', SERIAL_PATH);

  // TODO: remove when real ESP32 firmware exists.
  // Démo : émet un appui aléatoire toutes les 2s pour valider le pipeline.
  const buttons = ['LEFT', 'RIGHT', 'PLUNGER', 'START'];
  setInterval(() => {
    const id = buttons[Math.floor(Math.random() * buttons.length)];
    port.port?.emitData(Buffer.from(`BTN:${id}:DOWN\n`));
    setTimeout(() => port.port?.emitData(Buffer.from(`BTN:${id}:UP\n`)), 80);
  }, 2000);

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
      console.log('[serial] port opened', SERIAL_PATH, 'attempt', i);
      return port;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (i === 1 || i % 10 === 0) {
        console.log(`[serial] open attempt ${i}/60 failed: ${msg}`);
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error(`could not open ${SERIAL_PATH} after 60 attempts`);
}

async function main() {
  console.log('[input-bridge] mode=', MODE, 'serverUrl=', SERVER_URL, 'path=', SERIAL_PATH);
  const port = MODE === 'serial' ? await openSerialPort() : await openMockPort();
  const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));
  parser.on('data', (chunk: string | Buffer) => handleLine(chunk.toString()));
  port.on('error', (err) => console.error('[port] error', err.message));

  const shutdown = (signal: string) => {
    console.log('[input-bridge] received', signal, '— shutting down');
    try {
      port.close(() => {
        socket.disconnect();
        process.exit(0);
      });
    } catch {
      socket.disconnect();
      process.exit(0);
    }
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[input-bridge] fatal:', err);
  process.exit(1);
});
