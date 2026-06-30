import type { Server, Socket } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  GameOver,
  GameRegistered,
  LeaderboardEntry,
} from '@pinball/shared-types';
import type { GameStateManager } from '../infrastructure/GameStateManager';

const INPUT_BRIDGE_ROOM = 'input-bridge';

type TypedServer = Server<ClientToServerEvents, ServerToClientEvents>;
// Typed seams: SocketLike keeps event-payload typing (so `data` is inferred),
// IoLike narrows the server to the two methods the handler uses.
export type SocketLike = Socket<ClientToServerEvents, ServerToClientEvents>;
export type IoLike = Pick<TypedServer, 'emit' | 'to'>;

/**
 * Collaborators the socket gateway needs. Injected (DIP) so the connection
 * handler is unit-testable with fakes — no prisma, no module mocking.
 */
export interface SocketGatewayDeps {
  registerScore(data: GameOver): Promise<GameRegistered>;
  worldTopTen(mapId?: string): Promise<LeaderboardEntry[]>;
  gameState: GameStateManager;
}

/**
 * Builds the `connection` handler closed over its injected collaborators.
 * The composition root wires `io.on('connection', gateway)`.
 */
export function createSocketGateway(deps: SocketGatewayDeps) {
  const { registerScore, worldTopTen, gameState } = deps;

  return function handleConnection(io: IoLike, socket: SocketLike) {
    const role = (socket.handshake.auth as { role?: string } | undefined)?.role;
    console.log('[server] client connected:', socket.id, 'role=', role ?? 'frontend');

    if (role === 'input-bridge') {
      socket.join(INPUT_BRIDGE_ROOM);
      console.log('[server] input-bridge joined room');
    }

    // Sync the newly connected client with the current map so DMD/backglass
    // are up to date even if no `map:select` has been emitted yet.
    socket.emit('map:selected', { mapId: gameState.getMapId() });

    socket.on('map:select', ({ mapId }) => {
      if (typeof mapId !== 'string' || mapId === gameState.getMapId()) return;
      console.log('[server] map:select', mapId, '→ broadcast map:selected');
      gameState.setMapId(mapId);
      io.emit('map:selected', { mapId });
    });

    socket.on('input:button', (data) => {
      console.log('[server] input:button', data.id, data.action, '→ broadcast');
      io.emit('input:button', data);
    });

    socket.on('input:tilt', (data) => {
      console.log('[server] input:tilt', data.state, '→ broadcast');
      io.emit('input:tilt', data);
    });

    socket.on('input:sensor', (data) => {
      console.log('[server] input:sensor', data.id, data.value, '→ broadcast');
      io.emit('input:sensor', data);
    });

    // Dev `simulate-esp32` mode: route the event to the input-bridge room only.
    // The input-bridge injects the raw protocol line into its mock port, its parser
    // re-reads it and emits `input:button` back to the server, which broadcasts to all.
    socket.on('dev:simulate-button', (data) => {
      console.log('[server] dev:simulate-button', data.id, data.action, '→ input-bridge');
      io.to(INPUT_BRIDGE_ROOM).emit('dev:simulate-button', data);
    });

    socket.on('score:update', (data) => {
      console.log('[server] score:update', data.player, data.score, 'combo=', data.combo, 'x', data.multiplier);
      io.emit('score:update', data);
    });

    socket.on('game:start', (data) => {
      console.log('[server] game:start', data.player);
      io.emit('game:start', data);
    });

    socket.on('game:over', async (data) => {
      console.log('[server] game:over', data.player, 'final=', data.finalScore);
      io.emit('game:over', data);
      if (data.debug === true) {
        console.log('[server] game:over [debug skip]');
        return;
      }
      try {
        const registered = await registerScore(data);
        socket.emit('game:registered', registered);
        io.emit('leaderboard:refresh', await worldTopTen(data.mapId));
      } catch (err) {
        console.error('[server] game:over persist failed:', err);
      }
    });

    socket.on('dmd:display', (data) => {
      console.log('[server] dmd:display', data.mode);
      io.emit('dmd:display', data);
    });

    socket.on('dev:trigger-game-event', (data) => {
      console.log('[server] dev:trigger-game-event', data.type);
      io.emit('dev:trigger-game-event', data);
    });

    socket.on('disconnect', () => {
      console.log('[server] client disconnected:', socket.id);
    });
  };
}
