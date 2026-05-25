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

app.get('/', (req, res) => {
  res.send('Pinball Server is running');
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('input:button', (data) => {
    console.log('[input:button]', data);
    socket.broadcast.emit('input:button', data);
  });

  socket.on('input:tilt', (data) => {
    console.log('[input:tilt]', data);
    socket.broadcast.emit('input:tilt', data);
  });

  socket.on('input:sensor', (data) => {
    console.log('[input:sensor]', data);
    socket.broadcast.emit('input:sensor', data);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

httpServer.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
