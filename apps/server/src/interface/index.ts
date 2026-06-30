import { createServer } from 'http';
import { Server } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@pinball/shared-types';
import { worldTopTen, globalStats } from '../use-cases/Leaderboard';
import { registerScore } from '../use-cases/RegisterScore';
import { GameStateManager } from '../infrastructure/GameStateManager';
import { createApp } from './createApp';
import { createSocketGateway } from './socketGateway';

// Composition root: wire the real adapters/use-cases into the factories.
// All testable logic lives in createApp / createSocketGateway (side-effect-free).
const PORT = process.env.PORT || 3001;

export const app = createApp({ worldTopTen, globalStats });
export const httpServer = createServer(app);
export const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer);

const gameState = new GameStateManager();
const handleConnection = createSocketGateway({ registerScore, worldTopTen, gameState });
io.on('connection', (socket) => handleConnection(io, socket));

if (import.meta.main) {
  httpServer.listen(PORT, () => {
    console.log(`[server] listening on port ${PORT}`);
  });
}
