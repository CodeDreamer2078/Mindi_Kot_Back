import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import { Server } from 'socket.io';
import {
  DEFAULT_RECONNECT_TIMEOUT_MS,
  DEFAULT_ROOM_INACTIVE_MS,
} from './constants.js';
import { GameManager } from './game/GameManager.js';
import { registerSocketHandlers } from './socket/socketHandlers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const PORT = Number(process.env.PORT) || 5000;
const HOST = process.env.HOST || '0.0.0.0';

/** Comma-separated origins, e.g. https://app.vercel.app,http://localhost:5173 */
const CLIENT_ORIGINS = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const RECONNECT_TIMEOUT_MS =
  Number(process.env.RECONNECT_TIMEOUT_MS) || DEFAULT_RECONNECT_TIMEOUT_MS;
const ROOM_INACTIVE_MS =
  Number(process.env.ROOM_INACTIVE_MS) || DEFAULT_ROOM_INACTIVE_MS;

function isAllowedOrigin(origin) {
  if (!origin) {
    return true;
  }

  return CLIENT_ORIGINS.includes(origin) || CLIENT_ORIGINS.includes('*');
}

const app = express();
app.use(
  cors({
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS blocked for origin: ${origin}`));
    },
  })
);
app.use(express.json());

const gameManager = new GameManager({
  reconnectTimeoutMs: RECONNECT_TIMEOUT_MS,
  roomInactiveMs: ROOM_INACTIVE_MS,
});

app.get('/', (_req, res) => {
  res.json({
    name: 'Mindi Kot API',
    ok: true,
    health: '/health',
  });
});

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    rooms: gameManager.roomCount(),
    uptime: process.uptime(),
  });
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: CLIENT_ORIGINS.includes('*') ? true : CLIENT_ORIGINS,
    methods: ['GET', 'POST'],
  },
  transports: ['websocket', 'polling'],
});

gameManager.startCleanupLoop();
registerSocketHandlers(io, gameManager);

server.listen(PORT, HOST, () => {
  console.log(`Mindi Kot server listening on http://${HOST}:${PORT}`);
  console.log(`CORS origins: ${CLIENT_ORIGINS.join(', ')}`);
});
