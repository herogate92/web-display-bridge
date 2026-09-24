import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { language, setLanguage, t, translateBackend } from '../src/browser/i18n';
import type { TranslationKey } from '../src/browser/i18n';

test('Korean is the default and English can be selected', () => {
  assert.equal(language(), 'ko');
  assert.equal(t('startScreen'), '이 화면 연결 시작');
  setLanguage('en');
  assert.equal(t('startScreen'), 'Connect this display');
  assert.equal(t('virtualScreen', { count: 2 }), 'Virtual display 2');
  assert.equal(translateBackend('연결 번호가 틀렸거나 만료되었거나 이미 사용 중입니다.'), 'The code is invalid, expired, or already in use.');
  assert.equal(translateBackend('확장 화면 전송 중입니다.'), 'Streaming the extended display.');
  setLanguage('ko');
  assert.equal(t('startScreen'), '이 화면 연결 시작');
});

test('PowerShell 5.1 dialog scripts retain UTF-8 Korean and English text', () => {
  for (const script of ['set-vdd-monitor-count.ps1', 'add-ipad9-modes.ps1']) {
    const file = readFileSync(path.join('docs', script));
    assert.deepEqual([...file.subarray(0, 3)], [0xef, 0xbb, 0xbf], `${script} needs a UTF-8 BOM`);
    const source = file.toString('utf8');
    assert.match(source, /\[ValidateSet\('ko', 'en'\)\]/);
    assert.match(source, /Language -eq 'en'/);
  }
});

test('every static UI translation key exists in both languages', () => {
  for (const page of ['host.html', 'viewer.html']) {
    const html = readFileSync(path.join('public', page), 'utf8');
    const keys = [...html.matchAll(/data-i18n="([^"]+)"/g)].map(match => match[1] as TranslationKey);
    for (const key of keys) {
      setLanguage('ko'); assert.ok(t(key), `${page}: ${key} missing in Korean`);
      setLanguage('en'); assert.ok(t(key), `${page}: ${key} missing in English`);
    }
  }
  setLanguage('ko');
});
