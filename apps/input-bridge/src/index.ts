import { createReadStream } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { io, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@pinball/shared-types';
import { createSocketEmitter, handleLine, type BridgeEmitter } from './dispatch';
import { createLineBuffer } from './line-buffer';
import { runWithRetry, type OpenOutcome } from './serial-retry';

// Serial reading via raw fs + stty (no @serialport): the serialport native
// binding calls uv_default_loop, unsupported by Bun (SIGILL at runtime).
// So we read the device as a file after putting it in raw mode, exactly like
// the Fliphetic reference bridge. Bun supports node:fs/child_process.

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

// Playfield dev mode `simulate-esp32`: the server routes the event to us
// (room `input-bridge`). Replay the protocol line straight through the
// parser — identical path to a line received from a real ESP32.
socket.on('dev:simulate-button', (data) => {
  if (MODE !== 'mock') {
    console.warn('[bridge] dev:simulate-button ignored (serial mode, use real ESP32):', data);
    return;
  }
  handleLine(`BTN:${data.id}:${data.action}`, emitter);
  console.log('[bridge] dev:simulate-button replayed as', `BTN:${data.id}:${data.action}`);
});

// Serial device IO adapter (no retry policy here — it lives in
// serial-retry.ts). Puts the tty in raw mode at the right baud (busybox stty),
// then reads the stream line by line. Open failure → 'failed'; otherwise wires
// the stream's error/close to `reopen` (provided by the policy) and → 'opened'.
function openSerialDevice(reopen: () => void): OpenOutcome {
  try {
    execFileSync('stty', [
      '-F', SERIAL_PATH, SERIAL_BAUD, 'raw', '-echo', 'cs8', '-parenb', '-cstopb',
    ]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log('[bridge] device not ready, retry in 3s:', SERIAL_PATH, '-', msg);
    return 'failed';
  }

  const stream = createReadStream(SERIAL_PATH);
  const lineBuffer = createLineBuffer((line) => handleLine(line, emitter));
  console.log('[bridge] serial port opened', SERIAL_PATH, '@', SERIAL_BAUD);

  stream.on('data', (chunk: string | Buffer) => lineBuffer.push(chunk));

  const onDown = (label: string) => {
    console.log('[bridge] serial', label, '— reopening in 3s');
    stream.destroy();
    reopen();
  };
  stream.once('error', (err) => onDown('error: ' + err.message));
  stream.once('close', () => onDown('closed'));
  return 'opened';
}

// If the device is absent (ESP unplugged / not yet enumerated), retry every
// 3 s — tolerates the USB reboot after flashing.
function openSerial() {
  runWithRetry({
    openDevice: openSerialDevice,
    schedule: (run, delayMs) => setTimeout(run, delayMs),
  });
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
