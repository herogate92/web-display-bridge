import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Pairing } from '../src/auth';
test('invitation supports four devices and expires exactly after five minutes', () => {
  let time = 0; const p = new Pairing(() => time); const ticket = p.invitation;
  assert.match(ticket, /^\d{4}$/);
  assert.equal(p.exchange('bad'), undefined);
  time = 300_000; assert.equal(p.exchange(ticket), undefined);
  const q = new Pairing(() => 0), first = q.invitation;
  const secrets = Array.from({ length: 4 }, () => q.exchange(first));
  assert.ok(secrets.every(Boolean)); assert.equal(new Set(secrets).size, 4);
  assert.equal(q.exchange(first), undefined);
});
test('each device credential has one active socket and can reconnect', () => {
  const p = new Pairing(); const s = p.exchange(p.invitation)!, second = p.exchange(p.invitation)!;
  assert.equal(p.acquire('random'), false); assert.equal(p.acquire(s), true); assert.equal(p.acquire(second), true);
  assert.equal(p.acquire(s), false); p.release(s); assert.equal(p.acquire(s), true);
  p.revoke(); assert.equal(p.valid(s), false); assert.equal(p.acquire(s), false);
});
test('a display-specific pairing admits only one mobile device', () => {
  const p = new Pairing(undefined, 1), code = p.invitation;
  assert.ok(p.exchange(code)); assert.equal(p.exchange(code), undefined);
});
