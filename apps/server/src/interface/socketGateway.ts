import type {
  ClientToServerEvents,
  ServerToClientEvents,
  GameOver,
  GameRegistered,
  LeaderboardEntry,
} from '@pinball/shared-types';
import type { GameStateManager } from '../infrastructure/GameStateManager';

const INPUT_BRIDGE_ROOM = 'input-bridge';

// Simple relay events: log + broadcast the payload verbatim to everyone.
// Non-trivial handlers (map:select, dev:simulate-button, game:over, disconnect)
// stay explicit below. Both keys of this list and the broadcast target are the
// SAME event name — these are pure pass-through relays.
const RELAY_EVENTS = [
  'input:button',
  'input:tilt',
  'input:sensor',
  'score:update',
  'game:start',
  'dmd:display',
  'dev:trigger-game-event',
] as const satisfies readonly (keyof ClientToServerEvents & keyof ServerToClientEvents)[];

// Narrow structural seams (DIP): only the members the connection handler
// actually touches. Both the real socket.io `Server`/`Socket` (composition
// root) AND the unit-test fakes satisfy these — no `as unknown` double-cast.
//
// Listeners/emitters are typed against the event maps so payloads stay
// inferred. The signatures are deliberately wide enough (a single broad
// overload covering every event) that socket.io's per-event overloaded
// methods remain assignable to them structurally.

type ListenerFor<E> = E extends (...args: infer A) => void ? (...args: A) => void : never;

export interface Emitter<EmitEvents> {
  emit<Ev extends keyof EmitEvents>(event: Ev, ...args: Parameters<ListenerFor<EmitEvents[Ev]>>): boolean;
}

export interface IoLike extends Emitter<ServerToClientEvents> {
  to(room: string): Emitter<ServerToClientEvents>;
}

export interface SocketLike extends Emitter<ServerToClientEvents> {
  readonly id: string;
  readonly handshake: { auth: unknown };
  join(room: string): void | Promise<void>;
  // Return is intentionally `void`: socket.io's real `on` returns `this`,
  // which is assignable to a void-returning signature, while test fakes can
  // return nothing — both satisfy this without a cast.
  on<Ev extends keyof ClientToServerEvents>(
    event: Ev,
    listener: ListenerFor<ClientToServerEvents[Ev]>,
  ): void;
  on(event: 'disconnect', listener: () => void): void;
}

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

    // Data-driven relays (OCP/DRY): each just logs + broadcasts verbatim.
    for (const event of RELAY_EVENTS) {
      socket.on(event, (...args: unknown[]) => {
        console.log('[server]', event, '→ broadcast');
        io.emit(event, ...(args as Parameters<ListenerFor<ServerToClientEvents[typeof event]>>));
      });
    }

    // Dev `simulate-esp32` mode: route the event to the input-bridge room only.
    // The input-bridge injects the raw protocol line into its mock port, its parser
    // re-reads it and emits `input:button` back to the server, which broadcasts to all.
    socket.on('dev:simulate-button', (data) => {
      console.log('[server] dev:simulate-button', data.id, data.action, '→ input-bridge');
      io.to(INPUT_BRIDGE_ROOM).emit('dev:simulate-button', data);
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

    socket.on('disconnect', () => {
      console.log('[server] client disconnected:', socket.id);
    });
  };
}
