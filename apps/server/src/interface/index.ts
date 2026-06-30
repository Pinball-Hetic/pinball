import { createServer } from 'http';
import { Server } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@pinball/shared-types';
import { createGlobalApiClient, type LeaderboardCache } from '../infrastructure/GlobalApiClient';
import { prismaGameRepository } from '../infrastructure/PrismaGameRepository';
import { GameStateManager } from '../infrastructure/GameStateManager';
import { createRegisterScore } from '../use-cases/RegisterScore';
import { createLeaderboard } from '../use-cases/Leaderboard';
import { createApp } from './createApp';
import { createSocketGateway } from './socketGateway';

// Composition root: wire the real adapters into the use-case factories. All
// testable logic lives in createApp / createSocketGateway / the use-cases
// (side-effect-free, port-injected). This module is the only place that knows
// about prisma + the global API.
const PORT = process.env.PORT || 3001;

const games = prismaGameRepository;
const lbCache: LeaderboardCache = new Map();
const globalApi = createGlobalApiClient({
  fetch,
  config: { baseUrl: process.env.GLOBAL_API_URL, token: process.env.BORNE_TOKEN },
  cache: lbCache,
});
const registerScore = createRegisterScore({ games, scores: globalApi });
const { worldTopTen, globalStats } = createLeaderboard({
  games,
  world: globalApi,
});

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
