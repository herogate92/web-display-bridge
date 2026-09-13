import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { once } from 'node:events';
import path from 'node:path';
import { WebSocket } from 'ws';
import { startServer } from '../src/server';

async function freePort() {
  const socket = net.createServer(); socket.listen(0, '127.0.0.1'); await once(socket, 'listening');
  const port = (socket.address() as net.AddressInfo).port;
  await new Promise<void>(resolve => socket.close(() => resolve())); return port;
}

test('two display sessions use separate codes, credentials and sockets', async t => {
  const port = await freePort(), origin = 'http://127.0.0.1:' + port;
  const received: { sessionId: string; signal: any }[] = [];
  const counts = new Map<string, number>();
  const server = await startServer({
    address: '127.0.0.1', port, publicDir: path.resolve('public'),
    onSignal: (sessionId, signal) => received.push({ sessionId, signal }),
    onConnect: (sessionId, count) => counts.set(sessionId, count),
    onDisconnect: (sessionId, count) => counts.set(sessionId, count)
  });
  t.after(() => server.close());
  const first = server.addSession('display-a'), second = server.addSession('display-b');
  assert.match(first.code, /^\d{4}$/); assert.match(second.code, /^\d{4}$/); assert.notEqual(first.code, second.code);

  const request = (url: string, method = 'GET', body?: unknown, headers: Record<string, string> = {}) =>
    new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }>((resolve, reject) => {
      const req = http.request(url, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers } }, res => {
        let text = ''; res.on('data', chunk => text += chunk); res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, body: text }));
      }); req.on('error', reject); if (body) req.write(JSON.stringify(body)); req.end();
    });
  const pair = async (code: string) => {
    const result = await request(origin + '/pair', 'POST', { token: code }, { Origin: origin });
    assert.equal(result.status, 200); return result.headers['set-cookie']![0].split(';')[0];
  };
  assert.equal((await request(first.url)).status, 200);
  assert.equal((await request(second.url)).status, 200);
  const firstCookie = await pair(first.code), secondCookie = await pair(second.code);
  assert.equal((await request(origin + '/pair', 'POST', { token: first.code }, { Origin: origin })).status, 403);
  assert.deepEqual(JSON.parse((await request(origin + '/session', 'GET', undefined, { Cookie: firstCookie })).body), { paired: true, sessionId: 'display-a' });

  const firstSocket = new WebSocket('ws://127.0.0.1:' + port + '/signal', { headers: { Origin: origin, Cookie: firstCookie } });
  const secondSocket = new WebSocket('ws://127.0.0.1:' + port + '/signal', { headers: { Origin: origin, Cookie: secondCookie } });
  await Promise.all([once(firstSocket, 'open'), once(secondSocket, 'open')]);
  assert.equal(counts.get('display-a'), 1); assert.equal(counts.get('display-b'), 1);
  const firstRestart = received.find(item => item.sessionId === 'display-a' && item.signal.type === 'restart')!;
  const secondRestart = received.find(item => item.sessionId === 'display-b' && item.signal.type === 'restart')!;
  assert.ok(firstRestart); assert.ok(secondRestart); assert.notEqual(firstRestart.signal.clientId, secondRestart.signal.clientId);

  const firstMessage = once(firstSocket, 'message');
  server.send({ type: 'offer', data: { type: 'offer', sdp: 'first' }, negotiation: 1, clientId: firstRestart.signal.clientId, sessionId: 'display-a' });
  assert.equal(JSON.parse(String((await firstMessage)[0])).data.sdp, 'first');

  server.removeSession('display-a'); await once(firstSocket, 'close');
  assert.equal(secondSocket.readyState, WebSocket.OPEN);
  secondSocket.close(); await once(secondSocket, 'close');
  const resumed = new WebSocket('ws://127.0.0.1:' + port + '/signal', { headers: { Origin: origin, Cookie: secondCookie } });
  await once(resumed, 'open'); resumed.close(); await once(resumed, 'close');
});
