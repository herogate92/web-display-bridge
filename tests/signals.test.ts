import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSignal } from '../src/signals';
test('viewer cannot impersonate offerer or invoke remote input', () => {
  assert.equal(validateSignal({ type: 'offer', data: { type: 'offer', sdp: 'sdp' }, negotiation: 1 }, 'viewer'), false);
  assert.equal(validateSignal({ type: 'answer', data: { type: 'answer', sdp: 'sdp' }, negotiation: 1 }, 'viewer'), true);
  assert.equal(validateSignal({ type: 'answer', data: { type: 'answer', sdp: 'sdp' } }, 'viewer'), false);
  for (const value of [null, {}, { type: 'input', data: 'mouse' }, { type: 'candidate', data: { candidate: 'x'.repeat(5000) } }, { type: 'answer', data: { type: 'offer', sdp: 'sdp' } }]) assert.equal(validateSignal(value, 'viewer'), false);
});
