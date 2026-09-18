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
  process.env.NODE_ENV = 'development';
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

const hostname = process.env.HOST || process.env.HOSTNAME || parsedHost || 'localhost';
const port = parseInt(process.env.PORT || parsedPort || '9000', 10);
const appUrl = rawAppUrl || `http://${hostname}:${port}`;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

global.translationState = {
  isPaused: false,
  isCancelled: false,
};

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
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  global.io = io;

  io.on('connection', (socket) => {
    console.log('⚡ Socket connected:', socket.id);

    // Send active translation job state on reconnect/connect if available
    if (global.activeTranslationJob && global.activeTranslationJob.isActive) {
      socket.emit('translation:progress', {
        status: 'batch_progress',
        ...global.activeTranslationJob,
        isPaused: global.translationState ? global.translationState.isPaused : false,
      });
    }

    socket.on('join_chapter', (chapterId) => {
      socket.join(`chapter_${chapterId}`);
    });

    socket.on('leave_chapter', (chapterId) => {
      socket.leave(`chapter_${chapterId}`);
    });

    socket.on('translation:pause', () => {
      global.translationState.isPaused = true;
      io.emit('translation:state', { isPaused: true, isCancelled: false });
    });

    socket.on('translation:resume', () => {
      global.translationState.isPaused = false;
      io.emit('translation:state', { isPaused: false, isCancelled: false });
    });

    socket.on('translation:cancel', () => {
      global.translationState.isCancelled = true;
      global.translationState.isPaused = false;
      io.emit('translation:state', { isPaused: false, isCancelled: true });
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
});
}
