// HTTP + 방송 WebSocket (GET /v1/stream, 압축 켬).
import { createServer, type Server } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { HelloBuilder, route, type Ctx } from './http.ts';
import { tickMessage } from './protocol.ts';
import type { TickRecord } from './types.ts';

export interface Hub {
  server: Server;
  broadcast(t: TickRecord): void;
  clients(): number;
  close(): Promise<void>;
}

export function createHub(ctx: Ctx, corsOrigin = '*'): Hub {
  const hello = new HelloBuilder(ctx);
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const headers = { 'content-type': 'application/json', 'access-control-allow-origin': corsOrigin, 'access-control-allow-headers': 'content-type' };
    if (req.method === 'OPTIONS') { res.writeHead(204, headers); res.end(); return; }
    const r = route(req.method ?? 'GET', url, ctx);
    res.writeHead(r.status, headers);
    res.end(JSON.stringify(r.body));
  });
  const wss = new WebSocketServer({ noServer: true, perMessageDeflate: true });
  const set = new Set<WebSocket>();
  server.on('upgrade', (req, socket, head) => {
    const path = new URL(req.url ?? '/', 'http://x').pathname;
    if (path !== '/v1/stream') { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, (ws) => {
      set.add(ws);
      ws.on('close', () => set.delete(ws));
      ws.on('error', () => set.delete(ws));
      ws.send(JSON.stringify(hello.build()));
    });
  });
  return {
    server,
    broadcast(t) {
      if (!set.size) return;
      const msg = JSON.stringify(tickMessage(t, ctx.markets));
      for (const ws of set) if (ws.readyState === ws.OPEN) ws.send(msg);
    },
    clients: () => set.size,
    close: () => new Promise((resolve) => {
      for (const ws of set) ws.terminate();
      wss.close();
      server.close(() => resolve());
      server.closeAllConnections?.();
    }),
  };
}
