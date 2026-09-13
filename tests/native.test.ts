import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { DisplayHelper } from '../src/display';
const exe = path.resolve('native/publish/DisplayHelper.exe');
test('native structure layout and recovery serialization', { skip: process.platform !== 'win32' || !existsSync(exe) }, async () => {
  const helper = new DisplayHelper(exe, path.resolve('.cache/tests/unused.json'));
  const result = await helper.run<{ passed: boolean; devModeSize: number }>('selftest');
  assert.equal(result.passed, true); assert.equal(result.devModeSize, 220);
});
test('unknown target cannot change a physical screen or create a recovery journal', { skip: process.platform !== 'win32' || !existsSync(exe) }, async () => {
  const recovery = path.resolve('.cache/tests/' + randomBytes(8).toString('hex') + '.json');
  const helper = new DisplayHelper(exe, recovery);
  await assert.rejects(helper.run('activate', 'nonexistent-virtual-target', '1440', '1080', '60', recovery));
  assert.equal(existsSync(recovery), false);
  mkdirSync(path.dirname(recovery), { recursive: true });
  writeFileSync(recovery, JSON.stringify({ version: 1, identity: 'nonexistent-virtual-target', wasActive: false, before: {}, applied: {} }));
  const original = readFileSync(recovery, 'utf8');
  await assert.rejects(helper.restore()); assert.equal(readFileSync(recovery, 'utf8'), original);
});
