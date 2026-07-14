import express from 'express';
import { createServer as createHttpServer } from 'http';
import path from 'path';
import { Server } from 'socket.io';
import { createServer as createViteServer } from 'vite';

async function startServer() {
  const app = express();
  const server = createHttpServer(app);
  const io = new Server(server, {
    cors: { origin: '*' }
  });
  
  const PORT = 3000;

  // Socket.IO real-time logic
  let connections = 0;
  let recentRings: number[] = [];

  io.on('connection', (socket) => {
    connections++;
    console.log(`User connected: ${socket.id}. Total: ${connections}`);
    io.emit('connections_updated', connections);
    socket.emit('recent_rings', recentRings);

    // Listen for the 'ring_bell' event from a client
    socket.on('ring_bell', () => {
      recentRings.unshift(Date.now());
      if (recentRings.length > 5) recentRings.pop(); // Keep only last 5 rings
      
      // Broadcast the 'bell_rung' event to ALL connected clients (including the sender)
      io.emit('bell_rung');
      io.emit('recent_rings', recentRings);
    });

    // Listen for the 'stop_bell' event to cancel an active alarm for everyone
    socket.on('stop_bell', () => {
      io.emit('bell_stopped');
    });

    socket.on('disconnect', () => {
      connections--;
      console.log(`User disconnected: ${socket.id}. Total: ${connections}`);
      io.emit('connections_updated', connections);
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
