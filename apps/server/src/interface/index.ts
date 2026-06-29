import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@pinball/shared-types';
import { worldTopTen, globalStats } from '../use-cases/Leaderboard';
import { registerScore } from '../use-cases/RegisterScore';
import { GameStateManager } from '../infrastructure/GameStateManager';

const app = express();
const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer);

const PORT = process.env.PORT || 3001;

const INPUT_BRIDGE_ROOM = 'input-bridge';

const gameState = new GameStateManager();

app.get('/', (req, res) => {
  res.send('Pinball Server is running');
});

app.get('/api/leaderboard', async (req, res) => {
  try {
    const mapId = typeof req.query.mapId === 'string' ? req.query.mapId : undefined;
    res.json(await worldTopTen(mapId));
  } catch (err) {
    console.error('[server] /api/leaderboard failed:', err);
    res.status(500).json({ error: 'leaderboard unavailable' });
  }
});

app.get('/api/stats', async (req, res) => {
  try {
    const mapId = typeof req.query.mapId === 'string' ? req.query.mapId : undefined;
    res.json(await globalStats(mapId));
  } catch (err) {
    console.error('[server] /api/stats failed:', err);
    res.status(500).json({ error: 'stats unavailable' });
  }
});

io.on('connection', (socket) => {
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
    io.emit('game:over', data); // relay to DMD and backglass
    // Triggered from /debug: relay only, skip persistence.
    if (data.debug === true) {
      console.log('[server] game:over [debug skip] — no persistence');
      return;
    }
    try {
      const registered = await registerScore(data);
      socket.emit('game:registered', registered); // emit to sender only → QR code
      io.emit('leaderboard:refresh', await worldTopTen(data.mapId)); // backglass leaderboard for played map
    } catch (err) {
      // Persistence must never block the relay — the game keeps running.
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
});

httpServer.listen(PORT, () => {
  console.log(`[server] listening on port ${PORT}`);
});
