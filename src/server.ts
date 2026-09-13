import http from 'node:http';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { Pairing } from './auth';
import { validateSignal } from './signals';
import type { Signal } from './shared';

type Options = {
  address: string; port?: number; publicDir: string;
  onSignal(sessionId: string, signal: Signal): void;
  onConnect(sessionId: string, count: number): void;
  onDisconnect(sessionId: string, count: number): void;
};

export async function startServer(o: Options) {
  type Client = { socket: WebSocket; credential: string; sessionId: string; alive: boolean };
  const sessions = new Map<string, Pairing>();
  const clients = new Map<string, Client>();
  const failedPairing = new Map<string, { count: number; reset: number }>();
  let heartbeat: NodeJS.Timeout;
  const port = o.port ?? 8443;
  const origin = 'http://' + o.address + ':' + port;
  const files: Record<string, [string, string]> = {
    '/': ['viewer.html', 'text/html; charset=utf-8'], '/viewer.js': ['viewer.js', 'text/javascript'],
    '/style.css': ['style.css', 'text/css'], '/test-pattern': ['pattern.html', 'text/html; charset=utf-8'], '/pattern.js': ['pattern.js', 'text/javascript']
  };
  const findCredential = (credential: string) => [...sessions].find(([, pairing]) => pairing.valid(credential));
  const sessionCount = (sessionId: string) => [...clients.values()].filter(client => client.sessionId === sessionId).length;

  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; media-src 'self' blob:; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    if (req.headers.host !== o.address + ':' + port) { res.writeHead(403).end(); return; }
    if (req.method === 'GET' && req.url === '/session') {
      const credential = /(?:^|;\s*)wm=([A-Za-z0-9_-]+)/.exec(req.headers.cookie ?? '')?.[1] ?? '';
      const found = findCredential(credential);
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ paired: !!found, sessionId: found?.[0] }));
      return;
    }
    if (req.method === 'POST' && req.url === '/pair') {
      if (req.headers.origin !== origin || req.headers['content-type'] !== 'application/json') { res.writeHead(403).end(); return; }
      try {
        const remote = req.socket.remoteAddress ?? 'unknown', now = Date.now();
        let attempts = failedPairing.get(remote);
        if (!attempts || now >= attempts.reset) { attempts = { count: 0, reset: now + 60_000 }; failedPairing.set(remote, attempts); }
        if (attempts.count >= 5) { res.writeHead(429).end('연결 번호 입력 횟수를 초과했습니다. 1분 뒤 다시 시도하세요.'); return; }
        let body = ''; for await (const chunk of req) { body += chunk.toString(); if (body.length > 512) { res.writeHead(413).end(); return; } }
        const value = JSON.parse(body).token;
        const selected = typeof value === 'string' ? [...sessions].find(([, pairing]) => pairing.invitation === value) : undefined;
        const secret = selected?.[1].exchange(value);
        if (!selected || !secret) { attempts.count++; res.writeHead(403).end('연결 번호가 틀렸거나 만료되었거나 이미 사용 중입니다.'); return; }
        res.setHeader('Set-Cookie', 'wm=' + secret + '; HttpOnly; SameSite=Strict; Path=/');
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ paired: true, sessionId: selected[0] }));
      } catch { res.writeHead(400).end(); }
      return;
    }
    const requestPath = new URL(req.url ?? '/', origin).pathname;
    const invitation = /^\/(\d{4})$/.exec(requestPath)?.[1];
    const file = invitation && [...sessions.values()].some(pairing => pairing.invitation === invitation) ? files['/'] : files[requestPath];
    if (req.method !== 'GET' || !file) { res.writeHead(404).end(); return; }
    try { res.writeHead(200, { 'Content-Type': file[1] }).end(readFileSync(path.join(o.publicDir, file[0]))); }
    catch { res.writeHead(500).end(); }
  });
  server.requestTimeout = 10000; server.headersTimeout = 10000;

  const wss = new WebSocketServer({ noServer: true, maxPayload: 110_000, perMessageDeflate: false });
  server.on('upgrade', (req, network, head) => {
    network.on('error', () => network.destroy());
    const credential = /(?:^|;\s*)wm=([A-Za-z0-9_-]+)/.exec(req.headers.cookie ?? '')?.[1] ?? '';
    const found = findCredential(credential);
    if (req.url !== '/signal' || req.headers.origin !== origin || req.headers.host !== o.address + ':' + port || !found || !found[1].acquire(credential)) {
      network.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return;
    }
    try {
      wss.handleUpgrade(req, network, head, ws => {
        const clientId = randomBytes(12).toString('base64url');
        const tagged = ws as WebSocket & { clientId?: string; credential?: string; sessionId?: string };
        tagged.clientId = clientId; tagged.credential = credential; tagged.sessionId = found[0];
        wss.emit('connection', ws);
      });
    } catch { found[1].release(credential); network.destroy(); }
  });
  wss.on('connection', ws => {
    const tagged = ws as WebSocket & { clientId?: string; credential?: string; sessionId?: string };
    const clientId = tagged.clientId!, credential = tagged.credential!, sessionId = tagged.sessionId!;
    const client: Client = { socket: ws, credential, sessionId, alive: true }; clients.set(clientId, client);
    let count = 0, since = Date.now();
    ws.on('error', () => ws.terminate());
    ws.on('pong', () => { client.alive = true; });
    ws.on('message', raw => {
      if (Date.now() - since > 1000) { count = 0; since = Date.now(); }
      if (++count > 80) { ws.close(1008, 'Rate limit'); return; }
      try {
        const value: unknown = JSON.parse(raw.toString());
        if (!validateSignal(value, 'viewer')) { ws.close(1008, 'Invalid signal'); return; }
        o.onSignal(sessionId, { ...value, clientId, sessionId });
      } catch { ws.close(1008, 'Invalid message'); }
    });
    ws.on('close', () => {
      if (clients.get(clientId)?.socket !== ws) return;
      clients.delete(clientId); sessions.get(sessionId)?.release(credential);
      o.onSignal(sessionId, { type: 'leave', clientId, sessionId });
      o.onDisconnect(sessionId, sessionCount(sessionId));
    });
    o.onSignal(sessionId, { type: 'restart', clientId, sessionId });
    o.onConnect(sessionId, sessionCount(sessionId));
  });

  const listen = (s: http.Server, p: number) => new Promise<void>((resolve, reject) => {
    s.once('error', reject); s.listen(p, o.address, () => { s.off('error', reject); resolve(); });
  });
  try { await listen(server, port); } catch (error) { server.close(); wss.close(); throw error; }
  heartbeat = setInterval(() => {
    for (const client of clients.values()) {
      if (!client.alive) { client.socket.terminate(); continue; }
      client.alive = false; client.socket.ping();
    }
  }, 5000);

  return {
    origin,
    addSession(sessionId: string) {
      if (sessions.has(sessionId)) throw new Error('이미 실행 중인 화면 세션입니다.');
      let pairing = new Pairing(undefined, 1);
      while ([...sessions.values()].some(existing => existing.invitation === pairing.invitation)) pairing = new Pairing(undefined, 1);
      sessions.set(sessionId, pairing);
      return { url: origin + '/' + pairing.invitation, code: pairing.invitation };
    },
    requestOffers(sessionId?: string) {
      for (const [clientId, client] of clients) if (!sessionId || client.sessionId === sessionId)
        o.onSignal(client.sessionId, { type: 'restart', clientId, sessionId: client.sessionId });
    },
    send(signal: Signal) {
      const client = signal.clientId ? clients.get(signal.clientId) : undefined;
      if (client && client.sessionId === signal.sessionId && client.socket.readyState === WebSocket.OPEN) {
        const { clientId: _clientId, sessionId: _sessionId, ...outbound } = signal;
        client.socket.send(JSON.stringify(outbound));
      }
    },
    removeSession(sessionId: string) {
      sessions.get(sessionId)?.revoke(); sessions.delete(sessionId);
      for (const client of clients.values()) if (client.sessionId === sessionId) client.socket.terminate();
    },
    close() {
      clearInterval(heartbeat);
      for (const pairing of sessions.values()) pairing.revoke();
      sessions.clear();
      for (const client of clients.values()) client.socket.terminate();
      clients.clear(); wss.close(); server.closeAllConnections();
      return new Promise<void>(resolve => server.close(() => resolve()));
    }
  };
}
