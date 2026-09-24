import type { DisplayInfo, HostApi, Signal, StreamConfig, SessionStatus } from '../shared';
import { language, setLanguage, t, translateBackend } from './i18n';
import type { TranslationKey } from './i18n';
import { encoderKind, preferHardwareCodecs } from './encoding';
import type { EncodingProbe } from './encoding';

declare global {
  interface Window {
    webmonitor: HostApi;
    webmonitorStartCapture(sessionId: string, chosen: StreamConfig): Promise<void>;
  }
}

const api = window.webmonitor;
const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const statusText = byId('status');
const error = byId('error');
const network = byId<HTMLSelectElement>('network');
const monitorCount = byId<HTMLSelectElement>('monitor-count');
const sessionsRoot = byId('sessions');
const languageSelect = byId<HTMLSelectElement>('host-language');
const IPAD_MODES = [
  { width: 1080, height: 810, label: 'ipadFast' },
  { width: 1440, height: 1080, label: 'ipadRecommended' },
  { width: 2160, height: 1620, label: 'ipadNative' }
] as const;

type Card = {
  target: DisplayInfo; index: number; root: HTMLElement; state: HTMLElement; resolution: HTMLSelectElement;
  fps: HTMLSelectElement; bitrate: HTMLInputElement; start: HTMLButtonElement;
  qr: HTMLImageElement; code: HTMLElement; url: HTMLElement; clients: HTMLElement;
  actualFps: HTMLElement; sent: HTMLElement; codec: HTMLElement; encoding: HTMLElement; encoderWarning: HTMLElement;
};
type PeerState = {
  peer: RTCPeerConnection; negotiation: number; pending: RTCIceCandidateInit[];
  interval?: ReturnType<typeof setInterval>; previousBytes: number; previousTime: number;
};
type Capture = { stream: MediaStream; config: StreamConfig; peers: Map<string, PeerState> };

let targets: DisplayInfo[] = [];
const cards = new Map<string, Card>();
const latestStatuses = new Map<string, SessionStatus>();
let lastDisplays: DisplayInfo[] = [];
let lastError: { value: unknown; prefix?: TranslationKey } | undefined;
const captures = new Map<string, Capture>();
let signalQueue = Promise.resolve();
let negotiationSequence = 0;

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const value = document.createElement(tag); if (className) value.className = className; if (text != null) value.textContent = text; return value;
}
function trNode<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, key: TranslationKey) {
  const value = node(tag, className, t(key)); value.dataset.i18n = key; return value;
}
function translateStatic() {
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach(element => {
    element.textContent = t(element.dataset.i18n as TranslationKey);
  });
}
function renderError() {
  if (!lastError) return;
  const detail = translateBackend(lastError.value);
  error.textContent = lastError.prefix ? t(lastError.prefix, { detail }) : detail;
  error.hidden = false;
}
function showError(value: unknown, prefix?: TranslationKey) { lastError = { value, prefix }; renderError(); }
function clearError() { lastError = undefined; error.hidden = true; error.textContent = ''; }
function remembered(identity: string): StreamConfig {
  try {
    const value = JSON.parse(localStorage.getItem('stream-config-' + identity) ?? 'null') as StreamConfig | null;
    if (value && [value.width, value.height, value.fps, value.bitrate].every(Number.isSafeInteger)) return value;
  } catch {}
  return { width: 1440, height: 1080, fps: 60, bitrate: 8_000_000 };
}
function clearPairing(card: Card) {
  card.qr.hidden = true; card.qr.removeAttribute('src'); card.code.textContent = '— — — —';
  card.url.textContent = t('addressAfterStart');
}
function availableModes(target: DisplayInfo) {
  return [...new Map(target.modes.filter(mode => mode.frequency >= 24 && mode.frequency <= 60)
    .map(mode => [mode.width + 'x' + mode.height, mode])).values()].sort((a, b) => a.width * a.height - b.width * b.height);
}
function updateFps(card: Card, preferred?: number) {
  const parts = card.resolution.value.split('x').map(Number);
  const ipad = IPAD_MODES.some(mode => mode.width === parts[0] && mode.height === parts[1]);
  const values = [...new Set(card.target.modes.filter(mode => mode.width === parts[0] && mode.height === parts[1])
    .map(mode => mode.frequency).filter(value => value >= 24 && value <= 60).concat(ipad ? [60, 30] : []))].sort((a, b) => b - a);
  const old = preferred ?? Number(card.fps.value);
  card.fps.replaceChildren();
  for (const value of values.length ? values : [60, 30]) card.fps.add(new Option(value + ' fps', String(value)));
  card.fps.value = values.includes(old) ? String(old) : values.includes(60) ? '60' : String(values[0] ?? 30);
}
function readConfig(card: Card): StreamConfig {
  const size = card.resolution.value.split('x').map(Number);
  const config = { width: size[0], height: size[1], fps: Number(card.fps.value), bitrate: Math.round(Number(card.bitrate.value) * 1_000_000) };
  if (![config.width, config.height, config.fps, config.bitrate].every(Number.isSafeInteger) || config.bitrate < 1_000_000 || config.bitrate > 40_000_000)
    throw new Error(t('invalidSettings'));
  return config;
}
function field(labelKey: TranslationKey, control: HTMLElement) {
  const label = node('label'); label.append(trNode('span', '', labelKey), control); return label;
}
function createCard(target: DisplayInfo, index: number) {
  const saved = remembered(target.identity);
  const root = node('article', 'card session-card');
  const heading = node('div', 'session-heading');
  heading.append(node('h2', '', t('virtualScreen', { count: index + 1 })), node('span', 'session-state', target.active ? t('activeWaiting') : t('ready')));
  root.append(heading);
  const layout = node('div', 'session-layout');
  const settings = node('div', 'session-settings');
  const fields = node('div', 'fields');
  const resolution = node('select') as HTMLSelectElement;
  for (const mode of IPAD_MODES) resolution.add(new Option(t(mode.label) + ' · ' + mode.width + ' × ' + mode.height, mode.width + 'x' + mode.height));
  for (const mode of availableModes(target)) {
    if (!IPAD_MODES.some(ipad => ipad.width === mode.width && ipad.height === mode.height))
      resolution.add(new Option(mode.width + ' × ' + mode.height, mode.width + 'x' + mode.height));
  }
  const desired = saved.width + 'x' + saved.height;
  resolution.value = [...resolution.options].some(option => option.value === desired) ? desired : '1440x1080';
  const fps = node('select') as HTMLSelectElement;
  const bitrate = node('input') as HTMLInputElement; bitrate.type = 'number'; bitrate.min = '1'; bitrate.max = '40'; bitrate.step = '1'; bitrate.value = String(saved.bitrate / 1_000_000);
  fields.append(field('resolution', resolution), field('frameRate', fps), field('maxBitrate', bitrate));
  settings.append(fields);

  const custom = node('details', 'custom-mode');
  const summary = trNode('summary', '', 'customResolution');
  const customFields = node('div', 'fields');
  const width = node('input') as HTMLInputElement; width.type = 'number'; width.min = '640'; width.max = '3840'; width.step = '2'; width.value = '1280';
  const height = node('input') as HTMLInputElement; height.type = 'number'; height.min = '480'; height.max = '2160'; height.step = '2'; height.value = '960';
  const customFps = node('input') as HTMLInputElement; customFps.type = 'number'; customFps.min = '24'; customFps.max = '60'; customFps.value = '60';
  customFields.append(field('width', width), field('height', height), field('fpsInput', customFps));
  const customStart = trNode('button', 'primary', 'customConnect') as HTMLButtonElement;
  custom.append(summary, customFields, customStart);
  settings.append(custom);

  const actions = node('div', 'actions');
  const start = trNode('button', 'primary', 'startScreen') as HTMLButtonElement;
  const stop = trNode('button', '', 'stopScreen') as HTMLButtonElement;
  actions.append(start, stop); settings.append(actions);

  const pairing = node('div', 'pairing');
  pairing.append(trNode('span', 'code-label', 'pairCode'));
  const code = node('p', 'connect-code', '— — — —');
  const qr = node('img') as HTMLImageElement; qr.width = 120; qr.height = 120; qr.alt = t('qrAlt'); qr.hidden = true;
  const url = node('p', 'url', t('addressAfterStart'));
  pairing.append(code, qr, url, trNode('p', 'muted small', 'oneDeviceHelp'));
  layout.append(settings, pairing); root.append(layout);

  const metrics = node('div', 'session-metrics');
  const metric = (key: TranslationKey) => { const box = node('div'); box.append(trNode('span', '', key)); const value = node('strong', '', '—'); box.append(value); metrics.append(box); return value; };
  const clients = metric('connectedDevices'), actualFps = metric('actualFps'), sent = metric('bitrate'), codec = metric('codecEncoder');
  clients.textContent = t('deviceCount', { count: 0 }); root.append(metrics);
  const encoding = node('p', 'encoding-status', t('gpuPreferred'));
  const encoderWarning = node('p', 'warning encoder-warning'); encoderWarning.hidden = true;
  encoderWarning.setAttribute('role', 'status');
  root.append(encoding, encoderWarning);
  const card: Card = { target, index, root, state: heading.lastElementChild as HTMLElement, resolution, fps, bitrate, start, qr, code, url, clients, actualFps, sent, codec, encoding, encoderWarning };
  updateFps(card, saved.fps);
  resolution.onchange = () => updateFps(card);
  start.onclick = () => void begin(target.identity);
  stop.onclick = () => void stopSession(target.identity);
  customStart.onclick = () => void begin(target.identity, {
    width: Number(width.value), height: Number(height.value), fps: Number(customFps.value), bitrate: Math.round(Number(bitrate.value) * 1_000_000)
  });
  return card;
}
function renderTargets() {
  cards.clear(); sessionsRoot.replaceChildren();
  targets.forEach((target, index) => {
    const card = createCard(target, index); cards.set(target.identity, card); sessionsRoot.append(card.root);
  });
}
function renderDisplayInfo() {
  byId('display-info').textContent = lastDisplays.map(item =>
    t(item.primary ? 'primary' : item.virtual ? 'virtual' : 'physical') + ' · ' + item.description + ' · ' + item.bounds.width + '×' + item.bounds.height
  ).join('\n');
}
function refreshLanguage() {
  document.documentElement.lang = language();
  languageSelect.value = language();
  translateStatic();
  for (const card of cards.values()) {
    card.root.querySelector('h2')!.textContent = t('virtualScreen', { count: card.index + 1 });
    card.state.textContent = card.target.active ? t('activeWaiting') : t('ready');
    card.qr.alt = t('qrAlt');
    if (card.qr.hidden) card.url.textContent = t('addressAfterStart');
    for (const mode of IPAD_MODES) {
      const option = [...card.resolution.options].find(item => item.value === mode.width + 'x' + mode.height);
      if (option) option.textContent = t(mode.label) + ' · ' + mode.width + ' × ' + mode.height;
    }
    const status = latestStatuses.get(card.target.identity);
    if (status) applyStatus(status);
    else { card.clients.textContent = t('deviceCount', { count: 0 }); card.encoding.textContent = t('gpuPreferred'); }
  }
  renderDisplayInfo();
  statusText.textContent = lastDisplays.length ? t('displaySummary', { count: targets.length }) : t('checkingDisplays');
  renderError();
}
async function inspect() {
  try {
    clearError();
    const info = await api.inspect();
    targets = info.displays.filter(item => item.virtual && !item.primary);
    lastDisplays = info.displays;
    const selectedNetwork = network.value; network.replaceChildren();
    for (const address of info.addresses) network.add(new Option(address, address));
    if (info.addresses.includes(selectedNetwork)) network.value = selectedNetwork;
    monitorCount.value = String(Math.max(1, Math.min(4, info.monitorCount || 1)));
    byId('recovery').hidden = !info.recovery || info.sessions.length > 0;
    byId('driver-warning').hidden = targets.length > 0;
    renderTargets(); latestStatuses.clear();
    for (const state of info.sessions) applyStatus(state);
    renderDisplayInfo();
    statusText.textContent = t('displaySummary', { count: targets.length });
  } catch (cause) { showError(cause, 'inspectFailed'); }
}
async function begin(identity: string, desired?: StreamConfig, modeInstalled = false) {
  const card = cards.get(identity); if (!card) return;
  card.start.disabled = true; clearError();
  try {
    const config = desired ?? readConfig(card);
    if (!card.target.modes.some(mode => mode.width === config.width && mode.height === config.height && mode.frequency === config.fps)) {
      if (modeInstalled) throw new Error(t('modeNotApplied', { width: config.width, height: config.height, fps: config.fps }));
      card.state.textContent = t('addingMode');
      await api.installCustomMode(config.width, config.height, config.fps, language());
      await inspect();
      await begin(identity, config, true);
      return;
    }
    const result = await api.start(identity, network.value, config);
    localStorage.setItem('stream-config-' + identity, JSON.stringify(config));
    const current = cards.get(identity); if (!current) return;
    current.qr.src = result.qr; current.qr.hidden = false;
    current.url.textContent = result.url; current.code.textContent = new URL(result.url).pathname.slice(1);
  } catch (cause) { showError(cause); }
  finally { cards.get(identity)?.start.removeAttribute('disabled'); }
}
async function stopSession(identity: string) {
  try { await api.stop(identity); const card = cards.get(identity); if (card) clearPairing(card); }
  catch (cause) { showError(cause); }
}
function clearPeer(state: PeerState) { clearInterval(state.interval); state.peer.close(); }
function clearCapture(sessionId?: string) {
  const ids = sessionId ? [sessionId] : [...captures.keys()];
  for (const id of ids) {
    const capture = captures.get(id); if (!capture) continue;
    for (const state of capture.peers.values()) clearPeer(state);
    capture.stream.getTracks().forEach(track => track.stop()); captures.delete(id);
  }
}
window.webmonitorStartCapture = async (sessionId, chosen) => {
  clearCapture(sessionId);
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({ audio: false, video: {
      width: { ideal: chosen.width }, height: { ideal: chosen.height }, frameRate: { ideal: chosen.fps, max: chosen.fps }
    } });
    const capture: Capture = { stream, config: chosen, peers: new Map() }; captures.set(sessionId, capture);
    const track = stream.getVideoTracks()[0]; track.contentHint = 'motion';
    track.onended = () => { if (captures.get(sessionId) === capture) api.fail(sessionId, t('captureEnded')); };
    await api.ready(sessionId);
  } catch (cause) { api.fail(sessionId, t('captureFailed', { detail: String(cause) })); }
};
async function offer(sessionId: string, clientId: string) {
  const capture = captures.get(sessionId); if (!capture) return;
  const old = capture.peers.get(clientId); if (old) clearPeer(old);
  const peer = new RTCPeerConnection({ iceServers: [] }), negotiation = ++negotiationSequence;
  const state: PeerState = { peer, negotiation, pending: [], previousBytes: 0, previousTime: 0 }; capture.peers.set(clientId, state);
  let descriptionSent = false; const outgoing: RTCIceCandidateInit[] = [];
  peer.onicecandidate = event => {
    if (capture.peers.get(clientId) !== state || !event.candidate) return;
    const candidate = event.candidate.toJSON();
    if (descriptionSent) api.signal({ type: 'candidate', data: candidate, negotiation, clientId, sessionId }); else outgoing.push(candidate);
  };
  api.report({ sessionId, clientId, connection: 'connecting', encoder: '', codec: '', encoderKind: 'unknown' });
  const transceiver = peer.addTransceiver(capture.stream.getVideoTracks()[0], { direction: 'sendonly', streams: [capture.stream],
    sendEncodings: [{ maxBitrate: capture.config.bitrate, maxFramerate: capture.config.fps }] });
  const capabilities = RTCRtpSender.getCapabilities('video')?.codecs;
  if (capabilities?.length && transceiver.setCodecPreferences) {
    const probe = navigator.mediaCapabilities?.encodingInfo?.bind(navigator.mediaCapabilities) as EncodingProbe | undefined;
    const preferred = await preferHardwareCodecs(capabilities, capture.config, probe);
    if (capture.peers.get(clientId) !== state || captures.get(sessionId) !== capture) { clearPeer(state); return; }
    try { transceiver.setCodecPreferences(preferred.codecs); }
    catch { transceiver.setCodecPreferences([]); } // Keep the browser's compatible defaults if it rejects a preference.
    console.info('encoder-preference', JSON.stringify({ sessionId, config: capture.config, probes: preferred.probes }));
  }
  await peer.setLocalDescription(await peer.createOffer());
  if (capture.peers.get(clientId) !== state || captures.get(sessionId) !== capture) { clearPeer(state); return; }
  api.signal({ type: 'offer', data: peer.localDescription!.toJSON(), negotiation, clientId, sessionId }); descriptionSent = true;
  outgoing.forEach(candidate => api.signal({ type: 'candidate', data: candidate, negotiation, clientId, sessionId }));
  const parameters = transceiver.sender.getParameters(); parameters.encodings ??= [{}];
  for (const encoding of parameters.encodings) { encoding.maxBitrate = capture.config.bitrate; encoding.maxFramerate = capture.config.fps; }
  parameters.degradationPreference = 'maintain-framerate'; await transceiver.sender.setParameters(parameters);
  state.interval = setInterval(async () => {
    if (capture.peers.get(clientId) !== state || captures.get(sessionId) !== capture) return;
    try {
      const stats = await peer.getStats();
      if (capture.peers.get(clientId) !== state || captures.get(sessionId) !== capture) return;
      stats.forEach(report => {
        if (report.type !== 'outbound-rtp' || report.kind !== 'video') return;
        const elapsed = report.timestamp - state.previousTime;
        const mbps = state.previousTime && elapsed > 0 ? (report.bytesSent - state.previousBytes) * 8 / elapsed / 1000 : 0;
        state.previousBytes = report.bytesSent; state.previousTime = report.timestamp; const codec = stats.get(report.codecId);
        api.report({ sessionId, clientId, connection: peer.connectionState, fps: report.framesPerSecond ?? null,
          width: report.frameWidth, height: report.frameHeight, mbps: Math.round(mbps * 100) / 100,
          encoder: report.encoderImplementation ?? '', encoderKind: encoderKind(report.encoderImplementation),
          powerEfficientEncoder: report.powerEfficientEncoder ?? null,
          codec: codec?.mimeType ?? '', codecParameters: codec?.sdpFmtpLine ?? '',
          framesEncoded: report.framesEncoded, totalEncodeTime: report.totalEncodeTime,
          limitation: report.qualityLimitationReason ?? 'unknown' });
      });
    } catch {}
  }, 2000);
}
async function handleSignal(signal: Signal) {
  const sessionId = signal.sessionId, clientId = signal.clientId;
  if (!sessionId || !clientId) return;
  const capture = captures.get(sessionId); if (!capture) return;
  if (signal.type === 'restart') { await offer(sessionId, clientId); return; }
  const state = capture.peers.get(clientId); if (!state) return;
  if (signal.type === 'leave') { clearPeer(state); capture.peers.delete(clientId); return; }
  if (signal.negotiation !== state.negotiation) return;
  if (signal.type === 'answer') {
    await state.peer.setRemoteDescription(signal.data as RTCSessionDescriptionInit);
    for (const candidate of state.pending) await state.peer.addIceCandidate(candidate); state.pending = [];
  }
  if (signal.type === 'candidate') {
    if (state.peer.remoteDescription) await state.peer.addIceCandidate(signal.data as RTCIceCandidateInit);
    else state.pending.push(signal.data as RTCIceCandidateInit);
  }
}
function applyStatus(value: SessionStatus) {
  latestStatuses.set(value.sessionId, value);
  const card = cards.get(value.sessionId); if (!card) return;
  card.state.textContent = translateBackend(value.message);
  card.root.classList.toggle('live', value.state === 'streaming');
  card.clients.textContent = t('deviceCount', { count: value.clients ?? 0 });
  const sender = value.stats?.sender as Record<string, unknown> | undefined;
  const receiver = value.stats?.receiver as Record<string, unknown> | undefined;
  card.actualFps.textContent = receiver?.fps != null ? receiver.fps + ' fps' : sender?.fps != null ? sender.fps + ' fps' : '—';
  card.sent.textContent = sender?.mbps != null ? sender.mbps + ' Mbps' : '—';
  const active = value.connected && value.state === 'streaming';
  const kind = active ? encoderKind(sender?.encoder) : 'unknown';
  card.codec.textContent = active && sender ? (sender.codec || t('checking')) + ' / ' + (sender.encoder || t('unavailable')) : '—';
  card.encoding.textContent = t(!active ? 'gpuPreferred' : kind === 'hardware' ? 'gpuActive' : kind === 'software' ? 'cpuActive' : 'encoderUnknown');
  card.encoding.dataset.kind = kind;
  card.encoderWarning.hidden = kind !== 'software';
  card.encoderWarning.textContent = kind === 'software' ? t('cpuEncodingWarning') : '';
  if (['idle', 'error'].includes(value.state)) clearPairing(card);
  if (value.state === 'error') showError(value.message);
}

api.onSignal(signal => { signalQueue = signalQueue.then(() => handleSignal(signal)).catch(cause => showError(cause, 'connectionFailed')); });
api.onStop(sessionId => clearCapture(sessionId));
api.onStatus(applyStatus);
byId('refresh').onclick = () => void inspect();
byId('driver-help').onclick = () => void api.help();
byId('recover').onclick = async () => { try { await api.recover(); await inspect(); } catch (cause) { showError(cause); } };
byId('stop-all').onclick = async () => { try { await api.stop(); clearCapture(); for (const card of cards.values()) clearPairing(card); } catch (cause) { showError(cause); } };
byId('apply-count').onclick = async () => {
  const button = byId<HTMLButtonElement>('apply-count'); button.disabled = true; clearError();
  try { statusText.textContent = t('applyingCount'); await api.configureMonitorCount(Number(monitorCount.value), language()); await inspect(); }
  catch (cause) { showError(cause); await inspect(); }
  finally { button.disabled = false; }
};
languageSelect.onchange = () => { setLanguage(languageSelect.value === 'en' ? 'en' : 'ko'); refreshLanguage(); };
refreshLanguage();
void inspect();
