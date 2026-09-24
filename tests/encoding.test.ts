import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encoderKind, preferHardwareCodecs } from '../src/browser/encoding';
import { setLanguage, t } from '../src/browser/i18n';

const config = { width: 1440, height: 1080, fps: 60, bitrate: 8_000_000 };
const vp8 = { mimeType: 'video/VP8', clockRate: 90000 };
const baseline = { mimeType: 'video/H264', clockRate: 90000, sdpFmtpLine: 'packetization-mode=1;profile-level-id=42e01f' };
const high = { mimeType: 'video/H264', clockRate: 90000, sdpFmtpLine: 'packetization-mode=1;profile-level-id=640c1f' };
const rtx = { mimeType: 'video/rtx', clockRate: 90000 };
const red = { mimeType: 'video/red', clockRate: 90000 };

test('efficient codec profiles are offered first and repair/fallback codecs are preserved', async () => {
  const input = [vp8, rtx, baseline, high, red];
  const queried: string[] = [];
  const result = await preferHardwareCodecs(input, config, async query => {
    assert.equal(query.type, 'webrtc');
    assert.deepEqual({ ...query.video, contentType: '' }, { contentType: '', width: 1440, height: 1080, framerate: 60, bitrate: 8_000_000 });
    queried.push(query.video.contentType);
    return { supported: true, smooth: true, powerEfficient: query.video.contentType.includes('640c1f') };
  });
  assert.equal(result.codecs[0], high);
  assert.equal(result.codecs[1], baseline);
  assert.deepEqual(new Set(result.codecs), new Set(input));
  assert.deepEqual(input, [vp8, rtx, baseline, high, red]);
  assert.equal(queried.length, 3);
  assert.ok(queried.includes('video/H264;packetization-mode=1;profile-level-id=640c1f'));
});

test('an efficient non-H264 codec outranks software H264 while H264 breaks efficiency ties', async () => {
  let result = await preferHardwareCodecs([baseline, vp8], config, async query => ({
    supported: true, smooth: true, powerEfficient: query.video.contentType === 'video/VP8'
  }));
  assert.equal(result.codecs[0], vp8);
  result = await preferHardwareCodecs([vp8, baseline], config, async () => ({ supported: true, smooth: true, powerEfficient: true }));
  assert.equal(result.codecs[0], baseline);
});

test('missing, rejected and stalled probes leave a bounded compatible fallback', async () => {
  const input = [vp8, rtx, baseline];
  for (const probe of [undefined, async () => { throw new Error('Unsupported API'); }, () => new Promise<never>(() => {})]) {
    const result = await preferHardwareCodecs(input, config, probe, 10);
    assert.deepEqual(result.codecs, [baseline, vp8, rtx]);
  }
});

test('actual encoder names distinguish CPU, GPU and unknown without treating H264 as hardware', () => {
  assert.equal(encoderKind('OpenH264'), 'software');
  assert.equal(encoderKind('SimulcastEncoderAdapter (libvpx)'), 'software');
  assert.equal(encoderKind('MediaFoundationVideoEncodeAccelerator (NVIDIA H.264 Encoder MFT)'), 'hardware');
  assert.equal(encoderKind('Intel Quick Sync'), 'hardware');
  assert.equal(encoderKind('VideoToolbox'), 'hardware');
  for (const value of [undefined, '', 'H264', 'ExternalEncoder', 'Unknown encoder', 'VideoEncodeAccelerator / OpenH264']) {
    assert.equal(encoderKind(value), 'unknown');
  }
});

test('both languages explain software fallback and unverified hardware status', () => {
  for (const locale of ['ko', 'en'] as const) {
    setLanguage(locale);
    for (const key of ['gpuPreferred', 'gpuActive', 'cpuActive', 'encoderUnknown', 'cpuEncodingWarning'] as const) assert.ok(t(key));
    assert.match(t('cpuEncodingWarning'), /CPU/);
    assert.match(t('gpuActive'), /GPU/);
  }
  setLanguage('ko');
});
