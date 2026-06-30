import { createReadStream } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { io, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@pinball/shared-types';
import { createSocketEmitter, handleLine, type BridgeEmitter } from './dispatch';
import { createLineBuffer } from './line-buffer';

// Lecture série en fs brut + stty (pas de @serialport) : le binding natif
// serialport appelle uv_default_loop, non supporté par Bun (SIGILL au runtime).
// On lit donc le device comme un fichier après l'avoir mis en mode raw, exactement
// comme le bridge de référence Fliphetic. Bun supporte node:fs/child_process.

function readConfig() {
  return {
    MODE: process.env.INPUT_BRIDGE_MODE === 'serial' ? 'serial' : 'mock',
    SERIAL_PATH: process.env.SERIAL_PATH ?? '/dev/ttyUSB0',
    SERIAL_BAUD: process.env.SERIAL_BAUD ?? '115200',
    SERVER_URL: process.env.SERVER_URL ?? 'http://server:3001',
  } as const;
}

const { MODE, SERIAL_PATH, SERIAL_BAUD, SERVER_URL } = readConfig();

const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(SERVER_URL, {
  transports: ['websocket'],
  reconnection: true,
  auth: { role: 'input-bridge' },
});

const emitter: BridgeEmitter = createSocketEmitter(socket);

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
  handleLine(`BTN:${data.id}:${data.action}`, emitter);
  console.log('[bridge] dev:simulate-button replayed as', `BTN:${data.id}:${data.action}`);
});

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
  const lineBuffer = createLineBuffer((line) => handleLine(line, emitter));
  console.log('[bridge] serial port opened', SERIAL_PATH, '@', SERIAL_BAUD);

  stream.on('data', (chunk: string | Buffer) => lineBuffer.push(chunk));

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

if (import.meta.main) main();
