import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchRect, selectVirtual } from '../src/display';
import type { DisplayInfo } from '../src/shared';
const virtual: DisplayInfo = { identity: 'stable-monitor-id', name: '\\\\.\\DISPLAY2', description: 'Virtual Display Driver', virtual: true, active: true, primary: false, bounds: { x: 1920, y: 0, width: 1440, height: 1080 }, frequency: 60, modes: [] };
test('stable device identity survives display numbering changes', () => {
  const changed = { ...virtual, name: '\\\\.\\DISPLAY9' };
  assert.equal(selectVirtual([changed], virtual.identity), changed);
  assert.throws(() => selectVirtual([{ ...changed, identity: 'different' }], virtual.identity));
});
test('physical, primary, missing and ambiguous displays fail closed', () => {
  for (const list of [[], [virtual, virtual], [{ ...virtual, virtual: false }], [{ ...virtual, primary: true }]]) assert.throws(() => selectVirtual(list, virtual.identity));
});
test('capture matching requires one exact physical rectangle, including negative origins', () => {
  const target = { x: -1440, y: 0, width: 1440, height: 1080 };
  const candidates = [{ id: 10, bounds: target }, { id: 20, bounds: { ...target, x: 0 } }];
  assert.equal(matchRect(target, candidates).id, 10);
  assert.throws(() => matchRect(target, [candidates[1]]));
  assert.throws(() => matchRect(target, [candidates[0], candidates[0]]));
});
