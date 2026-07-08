// Deliberately NOT re-exported from index.ts: `server` imports this package for
// TYPES only and must not pull `socket.io-client` into its bundle via `export *`.
// Frontends import it by direct path:
//     import { createPinballSocket } from '@pinball/shared-types/src/socket-client'

import { io, type Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from './socket-events';

export type PinballSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * NEXT_PUBLIC_SOCKET_URL SET → direct WebSocket. UNSET (Fliphetic prod: server
 * has no host port, same-origin Next.js rewrite) → pure polling: rewrites cannot
 * relay the HTTP upgrade, so a WebSocket would fail silently.
 * NB: the env var is inlined at build time only because `@pinball/shared-types`
 * is in every app's `transpilePackages`.
 */
export function createPinballSocket(): PinballSocket {
  const url = process.env.NEXT_PUBLIC_SOCKET_URL || undefined;
  const transports: ('websocket' | 'polling')[] = url ? ['websocket'] : ['polling'];
  return io(url, { transports });
}
