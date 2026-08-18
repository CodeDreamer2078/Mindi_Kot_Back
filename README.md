# Mindi Kot — Backend

Real-time **Socket.IO** game server for Mindi Kot.

> **Important:** This service keeps rooms in memory and needs a **persistent Node.js process**.  
> Do **not** deploy it as a Vercel serverless function. Use **Render**, **Railway**, **Fly.io**, or a VPS.  
> Deploy the React client on [Vercel](https://vercel.com) and point it at this API URL.

Companion frontend repo: [Mindi_Kot](https://github.com/CodeDreamer2078/Mindi_Kot)

## Stack

- Node.js + Express
- Socket.IO
- In-memory game state (no database)

## Local setup

```bash
npm install
cp .env.example .env
npm run dev
```

Server: `http://localhost:5000`  
Health: `http://localhost:5000/health`

## Environment variables

| Variable | Example | Notes |
|----------|---------|--------|
| `PORT` | `5000` | Host platforms usually set this |
| `HOST` | `0.0.0.0` | Required on Render/Railway |
| `CLIENT_URL` | `https://your-app.vercel.app` | Comma-separated allowed CORS origins |
| `RECONNECT_TIMEOUT_MS` | `60000` | Seat hold after disconnect |
| `ROOM_INACTIVE_MS` | `1800000` | Abandoned room cleanup |

Example production:

```env
CLIENT_URL=https://mindi-kot.vercel.app,http://localhost:5173
```

## Deploy on Render (recommended)

1. New → **Web Service** → connect this repo  
2. Runtime: **Node**  
3. Build: `npm install`  
4. Start: `npm start`  
5. Set env:
   - `CLIENT_URL` = your Vercel frontend URL  
6. Deploy and copy the public URL (e.g. `https://mindi-kot-back.onrender.com`)

## Deploy on Railway

1. New project → Deploy from GitHub  
2. Add variables (`CLIENT_URL`, etc.)  
3. Railway sets `PORT` automatically  
4. Use the generated HTTPS URL as `VITE_SOCKET_URL` on the frontend

## Tests

```bash
npm test
```

## API

- `GET /` — service info  
- `GET /health` — uptime + active room count  
- Socket.IO events — see frontend README  

## License

MIT
