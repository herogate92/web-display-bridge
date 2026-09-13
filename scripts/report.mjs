import { readFileSync, writeFileSync } from 'node:fs';
const input = process.argv[2];
if (!input) throw new Error('Usage: node scripts/report.mjs <session.jsonl> [output.json]');
const rows = readFileSync(input, 'utf8').trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
const receive = rows.filter(r => r.event === 'receiver-stats');
const values = receive.map(r => r.details.fps).filter(v => typeof v === 'number' && Number.isFinite(v));
const duration = receive.length > 1 ? (Date.parse(receive.at(-1).at) - Date.parse(receive[0].at)) / 1000 : 0;
const average = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
const maxGap = receive.slice(1).reduce((max, r, index) => Math.max(max, (Date.parse(r.at) - Date.parse(receive[index].at)) / 1000), 0);
const report = {
  input, receiverSamples: values.length, receiverDurationSeconds: duration,
  averageReportedFps: average == null ? null : Math.round(average * 100) / 100,
  maximumSampleGapSeconds: maxGap,
  tenMinuteFpsTarget: duration < 600 || maxGap > 5 || average == null ? 'insufficient-uninterrupted-data' : average >= 55 ? 'met-for-collected-samples' : 'not-met',
  screenLatencyMedianMs: null,
  latencyStatus: 'not-measured: requires synchronized source/viewer filming; RTT is not screen latency',
  notes: 'Run one connection/profile per measurement. Use continuously moving content. These statistics do not prove iPad compatibility or 1-hour stability.',
  profiles: rows.filter(r => r.event === 'start').map(r => r.details.profile),
  errors: rows.filter(r => r.event === 'error' || r.event.endsWith('-error'))
};
const output = JSON.stringify(report, null, 2);
if (process.argv[3]) writeFileSync(process.argv[3], output); else console.log(output);
