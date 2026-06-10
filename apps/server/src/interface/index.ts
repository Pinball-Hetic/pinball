import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@pinball/shared-types';

const app = express();
const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer);

const PORT = process.env.PORT || 3001;

const INPUT_BRIDGE_ROOM = 'input-bridge';

app.get('/', (req, res) => {
  res.send('Pinball Server is running');
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

  socket.on('game:over', (data) => {
    console.log('[server] game:over', data.player, 'final=', data.finalScore);
    io.emit('game:over', data);
  });

  socket.on('dmd:display', (data) => {
    console.log('[server] dmd:display', data.mode);
    io.emit('dmd:display', data);
  });

  socket.on('dmd:atmosphere', (data) => {
    console.log('[server] dmd:atmosphere upsideDown=', data.upsideDownActive);
    io.emit('dmd:atmosphere', data);
  });

  socket.on('disconnect', () => {
    console.log('[server] client disconnected:', socket.id);
  });
});

httpServer.listen(PORT, () => {
  console.log(`[server] listening on port ${PORT}`);
});
