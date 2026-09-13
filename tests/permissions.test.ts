import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mayRequestPermission as allowed } from '../src/permissions';
test('display capture permission is granted only to the active local main frame', () => {
  const url = 'file:///C:/WebDisplayBridge/host.html';
  assert.equal(allowed(true, true, true, 'display-capture', url, url), true);
  assert.equal(allowed(true, true, true, 'media', url, url, ['video']), true);
  assert.equal(allowed(true, true, true, 'media', url, url, ['audio']), false);
  for (const permission of ['fileSystem', 'clipboard-read', 'openExternal']) assert.equal(allowed(true, true, true, permission, url, url), false);
  assert.equal(allowed(false, true, true, 'display-capture', url, url), false);
  assert.equal(allowed(true, false, true, 'display-capture', url, url), false);
  assert.equal(allowed(true, true, false, 'display-capture', url, url), false);
  assert.equal(allowed(true, true, true, 'display-capture', 'https://remote', url), false);
});
