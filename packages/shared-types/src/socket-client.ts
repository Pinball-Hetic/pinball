// ───────────────────────────────────────────────────────────────────────────
// CLIENT-side Socket.io factory (playfield / dmd / backglass kiosks).
// Single place for the "how a kiosk connects to the server" rule — it was
// previously duplicated across ~8 hooks/pages.
//
// IMPORTANT — deliberately NOT re-exported from index.ts. The `server` imports
// `@pinball/shared-types` (for TYPES) but does not depend on
// `socket.io-client` (it uses `socket.io` server-side). Going through
// `export *` would pull client code into the server bundle. Frontends
// therefore import it by direct path:
//     import { createPinballSocket } from '@pinball/shared-types/src/socket-client'
// ───────────────────────────────────────────────────────────────────────────

import { io, type Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from './socket-events';

/**
 * Project-typed Socket.io: incoming (Server→Client) and outgoing
 * (Client→Server) events are constrained by the shared contracts.
 */
export type PinballSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * Creates and OPENS a Socket.io connection to the game server.
 *
 * Transport choice depends on the deployment environment:
 *
 * - `NEXT_PUBLIC_SOCKET_URL` SET (local dev: the server port is exposed,
 *   e.g. http://localhost:3334) → DIRECT WebSocket connection, faster.
 *
 * - `NEXT_PUBLIC_SOCKET_URL` UNSET (Fliphetic prod: the server has no host
 *   port, we go through a same-origin Next.js rewrite) → pure POLLING.
 *   Reason: Next.js rewrites cannot relay the HTTP "upgrade" that promotes a
 *   polling connection to WebSocket → a WebSocket would fail silently.
 *   Polling (~50-100 ms latency) is acceptable for buttons and score.
 *
 * NB: `process.env.NEXT_PUBLIC_SOCKET_URL` is replaced with its value at BUILD
 * time by Next.js ("public" variable inlined in the bundle). This only works
 * because `@pinball/shared-types` is listed in `transpilePackages` of all 3
 * apps — otherwise Next would not do the replacement in this file.
 *
 * @returns a socket already connecting. The caller owns its lifecycle
 *          (`socket.disconnect()` on component unmount).
 */
export function createPinballSocket(): PinballSocket {
  const url = process.env.NEXT_PUBLIC_SOCKET_URL || undefined;
  const transports: ('websocket' | 'polling')[] = url ? ['websocket'] : ['polling'];
  return io(url, { transports });
}
