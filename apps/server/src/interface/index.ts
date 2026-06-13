import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@pinball/shared-types';
import { topTen, globalStats } from '../use-cases/Leaderboard';
import { registerScore } from '../use-cases/RegisterScore';

const app = express();
const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer);

const PORT = process.env.PORT || 3001;

const INPUT_BRIDGE_ROOM = 'input-bridge';

app.get('/', (req, res) => {
  res.send('Pinball Server is running');
});

app.get('/api/leaderboard', async (req, res) => {
  try {
    const mapId = typeof req.query.mapId === 'string' ? req.query.mapId : undefined;
    res.json(await topTen(mapId));
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

  // Mode dev `simulate-esp32` : route ciblé vers l'input-bridge. C'est
  // l'input-bridge qui injectera le texte sur son port mock, son parser
  // relira, et émettra `input:button` au server → broadcast à tous.
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
    io.emit('game:over', data); // relay inchangé (DMD, backglass)
    // Game over déclenché depuis /debug : relay seul, pas de persistence.
    if (data.debug === true) {
      console.log('[server] game:over [debug skip] — pas de persistence');
      return;
    }
    try {
      const registered = await registerScore(data);
      socket.emit('game:registered', registered); // au seul émetteur → QR
      io.emit('leaderboard:refresh', await topTen()); // backglass (anon)
    } catch (err) {
      // le jeu continue — la persistence ne doit JAMAIS bloquer le relay
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
