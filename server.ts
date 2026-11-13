import http from 'node:http';
import path from 'node:path';
import express from 'express';
import dotenv from 'dotenv';
import { WebSocketServer, WebSocket } from 'ws';
import { createApiRouter } from './src/server/routes.ts';
import { mqBroker } from './src/server/broker.ts';

dotenv.config();

const MAIN_PORT = Number(process.env.PORT || process.env.ALERTNET_PORT || 3000);
const WORKER_PORTS = [
  { id: 'instance-1', port: 3101 },
  { id: 'instance-2', port: 3102 },
];

async function bootstrap() {
  const gatewayApp = express();
  const mainServer = http.createServer(gatewayApp);

  // WebSocket server on port 3000 for real-time Community Chat, SOS & Rescue updates
  const wss = new WebSocketServer({ server: mainServer, path: '/ws' });
  const clients = new Set<WebSocket>();

  const broadcastWs = (event: string, data: unknown) => {
    const msg = JSON.stringify({ event, data, ts: Date.now() });
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
      }
    }
  };

  mqBroker.setBroadcastHook(broadcastWs);

  wss.on('connection', (ws) => {
    clients.add(ws);
    ws.send(JSON.stringify({ event: 'ws:connected', data: { instances: 2 } }));
    ws.on('close', () => clients.delete(ws));
  });

  // Start two independent stateless Express worker instances (ports 3101 & 3102)
  const activeWorkers: Array<{ id: string; port: number }> = [];
  for (const w of WORKER_PORTS) {
    const workerApp = express();
    workerApp.use(express.json({ limit: '6mb' }));
    workerApp.use('/api', createApiRouter(w.id, broadcastWs));

    await new Promise<void>((resolve) => {
      const srv = workerApp.listen(w.port, '127.0.0.1', () => {
        activeWorkers.push(w);
        resolve();
      });
      srv.on('error', () => {
        // Fallback if port already bound in reload scenario
        resolve();
      });
    });
  }

  // Round-robin load balancer across stateless worker instances
  let rrCounter = 0;
  gatewayApp.use(express.json({ limit: '6mb' }));
  gatewayApp.use('/api', async (req, res, next) => {
    if (activeWorkers.length === 0) {
      next();
      return;
    }
    const target = activeWorkers[rrCounter % activeWorkers.length];
    rrCounter++;

    try {
      const targetUrl = `http://127.0.0.1:${target.port}${req.originalUrl}`;
      const headers: Record<string, string> = {};
      if (req.headers.authorization) headers['authorization'] = req.headers.authorization;
      if (req.headers['content-type']) headers['content-type'] = String(req.headers['content-type']);

      const upstream = await fetch(targetUrl, {
        method: req.method,
        headers,
        body:
          req.method !== 'GET' && req.method !== 'HEAD' && req.body
            ? JSON.stringify(req.body)
            : undefined,
      });

      const instanceHeader = upstream.headers.get('x-alertnet-instance') || target.id;
      res.setHeader('X-AlertNet-Instance', instanceHeader);
      res.status(upstream.status);
      const text = await upstream.text();
      res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
      res.send(text);
    } catch {
      next();
    }
  });

  // Fallback in-process API router if worker proxy encounters a transient socket error
  gatewayApp.use('/api', createApiRouter('instance-1', broadcastWs));

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    gatewayApp.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    gatewayApp.use(express.static(distDir));
    gatewayApp.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  mainServer.listen(MAIN_PORT, '0.0.0.0', () => {
    console.log(`AlertNet gateway listening on http://0.0.0.0:${MAIN_PORT} (load-balancing 2 stateless worker instances)`);
  });
}

void bootstrap();
