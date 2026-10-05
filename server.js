const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server } = require('socket.io');

const isDev = process.argv.includes('--dev') || process.env.npm_lifecycle_event === 'dev';

// Load .env / .env.local before reading process.env (Next's own loader)
require('@next/env').loadEnvConfig(process.cwd());

if (isDev) {
  process.env.NODE_ENV = 'development';
} else if (!process.env.NODE_ENV) {
  // `npm start` without NODE_ENV must still serve the production build; dev always passes --dev.
  process.env.NODE_ENV = 'production';
}

const dev = process.env.NODE_ENV !== 'production';

const rawAppUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL;

let parsedHost = '';
let parsedPort = '';
if (rawAppUrl) {
  try {
    const parsed = new URL(rawAppUrl);
    parsedHost = parsed.hostname;
    parsedPort = parsed.port;
  } catch {}
}

// Not HOSTNAME: Docker sets it to the container id.
const hostname = process.env.HOST || parsedHost || 'localhost';
const port = parseInt(process.env.PORT || parsedPort || '9000', 10);
const appUrl = rawAppUrl || `http://${hostname}:${port}`;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Log instead of dying on a stray rejection from a background job (polish queue, batch, updater).
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

if (require.main === module) {
  app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling req', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  });

  const io = new Server(server, {
    path: '/socket.io',
    // Same-origin only (the app serves its own client); no cross-site socket listeners.
    cors: {
      origin: rawAppUrl || false,
      methods: ['GET', 'POST'],
    },
  });

  global.io = io;

  io.on('connection', (socket) => {
    console.log('⚡ Socket connected:', socket.id);

    // Translation pause/resume/cancel and the "current job" replay used to live here with no auth,
    // so any visitor could stop an admin's batch. They are now admin-checked HTTP routes under
    // /api/translation/*, and the widget restores its own job via /api/translation/status.

    socket.on('join_chapter', (chapterId) => {
      socket.join(`chapter_${chapterId}`);
    });

    socket.on('leave_chapter', (chapterId) => {
      socket.leave(`chapter_${chapterId}`);
    });

    socket.on('disconnect', () => {
      console.log('⚡ Socket disconnected:', socket.id);
    });
  });

  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n❌ Error: Port ${port} is already in use by another process!`);
      console.error(`To free port ${port} on Windows, run:`);
      console.error(`   Stop-Process -Id (Get-NetTCPConnection -LocalPort ${port}).OwningProcess -Force\n`);
    } else {
      console.error(err);
    }
    process.exit(1);
  });

  server.listen(port, () => {
    console.log(`> Ready on ${appUrl} as ${dev ? 'development' : 'production'}`);
  });

  // Graceful shutdown: `docker stop` sends SIGTERM, Ctrl+C sends SIGINT. Stop taking requests, let
  // in-flight ones finish briefly, then exit (background timers would otherwise keep us alive).
  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return process.exit(1); // second Ctrl+C: exit now
    shuttingDown = true;
    console.log(`${signal} received, shutting down...`);
    io.close();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 8000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}).catch((err) => {
  console.error('Failed to start Next.js:', err);
  process.exit(1);
});
}
