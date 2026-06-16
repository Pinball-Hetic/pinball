import { createReadStream } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { io, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  ButtonId,
  ButtonAction,
} from '@pinball/shared-types';
import { CABINET_BUTTONS } from '@pinball/shared-types';

// Lecture série en fs brut + stty (pas de @serialport) : le binding natif
// serialport appelle uv_default_loop, non supporté par Bun (SIGILL au runtime).
// On lit donc le device comme un fichier après l'avoir mis en mode raw, exactement
// comme le bridge de référence Fliphetic. Bun supporte node:fs/child_process.

const MODE = process.env.INPUT_BRIDGE_MODE === 'serial' ? 'serial' : 'mock';
const SERIAL_PATH = process.env.SERIAL_PATH ?? '/dev/ttyUSB0';
const SERIAL_BAUD = process.env.SERIAL_BAUD ?? '115200';
const SERVER_URL = process.env.SERVER_URL ?? 'http://server:3001';

const VALID_BUTTON_IDS: readonly ButtonId[] = CABINET_BUTTONS.map((b) => b.id);

const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(SERVER_URL, {
  transports: ['websocket'],
  reconnection: true,
  auth: { role: 'input-bridge' },
});

socket.on('connect', () => console.log('[bridge] socket connected to', SERVER_URL, 'as input-bridge id=', socket.id));
socket.on('disconnect', (reason) => console.log('[bridge] socket disconnected:', reason));
socket.on('connect_error', (err) => console.log('[bridge] connect_error:', err.message));

// Mode dev `simulate-esp32` côté playfield : le server route l'event ciblé vers
// nous (room `input-bridge`). On rejoue la ligne protocolaire directement dans
// le parser — chemin identique à une ligne reçue d'un vrai ESP32.
socket.on('dev:simulate-button', (data) => {
  if (MODE !== 'mock') {
    console.warn('[bridge] dev:simulate-button ignored (serial mode, use real ESP32):', data);
    return;
  }
  handleLine(`BTN:${data.id}:${data.action}`);
  console.log('[bridge] dev:simulate-button replayed as', `BTN:${data.id}:${data.action}`);
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
  // Lignes non reconnues (bruit de boot ESP32, etc.) — ignorées hors debug pour
  // ne pas noyer les logs au démarrage du chip.
  if (process.env.INPUT_BRIDGE_VERBOSE) {
    console.error('[bridge] parse: unknown line:', JSON.stringify(line));
  }
}

// Ouvre le device série : passe la tty en mode raw au bon baud (busybox stty),
// puis lit le flux ligne par ligne. Si le device est absent (ESP non branché /
// pas encore énuméré), retente toutes les 3 s — tolère le reboot USB après flash.
function openSerial() {
  try {
    execFileSync('stty', [
      '-F', SERIAL_PATH, SERIAL_BAUD, 'raw', '-echo', 'cs8', '-parenb', '-cstopb',
    ]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log('[bridge] device not ready, retry in 3s:', SERIAL_PATH, '-', msg);
    setTimeout(openSerial, 3000);
    return;
  }

  const stream = createReadStream(SERIAL_PATH);
  let buf = '';
  console.log('[bridge] serial port opened', SERIAL_PATH, '@', SERIAL_BAUD);

  stream.on('data', (chunk: string | Buffer) => {
    buf += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      handleLine(line);
    }
    if (buf.length > 8192) buf = ''; // garde-fou contre une ligne sans newline
  });

  const reopen = (label: string) => {
    console.log('[bridge] serial', label, '— reopening in 3s');
    stream.destroy();
    setTimeout(openSerial, 3000);
  };
  stream.once('error', (err) => reopen('error: ' + err.message));
  stream.once('close', () => reopen('closed'));
}

function main() {
  console.log('[bridge] start mode=', MODE, 'serverUrl=', SERVER_URL, 'path=', SERIAL_PATH);
  if (MODE === 'serial') {
    openSerial();
  } else {
    console.log('[bridge] mock mode — waiting for dev:simulate-button events');
  }

  const shutdown = (signal: string) => {
    console.log('[bridge] received', signal, '— shutting down');
    socket.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main();
