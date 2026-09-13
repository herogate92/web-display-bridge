import type { DisplayInfo, HostApi, Signal, StreamConfig, SessionStatus } from '../shared';

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
const IPAD_MODES = [
  { width: 1080, height: 810, label: '아이패드 9 · 빠름' },
  { width: 1440, height: 1080, label: '아이패드 9 · 권장' },
  { width: 2160, height: 1620, label: '아이패드 9 · 패널 해상도' }
] as const;

type Card = {
  target: DisplayInfo; root: HTMLElement; state: HTMLElement; resolution: HTMLSelectElement;
  fps: HTMLSelectElement; bitrate: HTMLInputElement; start: HTMLButtonElement;
  qr: HTMLImageElement; code: HTMLElement; url: HTMLElement; clients: HTMLElement;
  actualFps: HTMLElement; sent: HTMLElement; codec: HTMLElement;
};
type PeerState = {
  peer: RTCPeerConnection; negotiation: number; pending: RTCIceCandidateInit[];
  interval?: ReturnType<typeof setInterval>; previousBytes: number; previousTime: number;
};
type Capture = { stream: MediaStream; config: StreamConfig; peers: Map<string, PeerState> };

let targets: DisplayInfo[] = [];
const cards = new Map<string, Card>();
const captures = new Map<string, Capture>();
let signalQueue = Promise.resolve();
let negotiationSequence = 0;

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const value = document.createElement(tag); if (className) value.className = className; if (text != null) value.textContent = text; return value;
}
function showError(value: unknown) { error.textContent = String(value); error.hidden = false; }
function clearError() { error.hidden = true; error.textContent = ''; }
function remembered(identity: string): StreamConfig {
  try {
    const value = JSON.parse(localStorage.getItem('stream-config-' + identity) ?? 'null') as StreamConfig | null;
    if (value && [value.width, value.height, value.fps, value.bitrate].every(Number.isSafeInteger)) return value;
  } catch {}
  return { width: 1440, height: 1080, fps: 60, bitrate: 8_000_000 };
}
function clearPairing(card: Card) {
  card.qr.hidden = true; card.qr.removeAttribute('src'); card.code.textContent = '— — — —';
  card.url.textContent = '연결 시작 후 주소가 표시됩니다.';
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
    throw new Error('화면 설정을 확인하세요.');
  return config;
}
function field(labelText: string, control: HTMLElement) {
  const label = node('label'); label.append(labelText, control); return label;
}
function createCard(target: DisplayInfo, index: number) {
  const saved = remembered(target.identity);
  const root = node('article', 'card session-card');
  const heading = node('div', 'session-heading');
  heading.append(node('h2', '', '가상 화면 ' + (index + 1)), node('span', 'session-state', target.active ? '화면 활성 · 연결 대기' : '연결 준비'));
  root.append(heading);
  const layout = node('div', 'session-layout');
  const settings = node('div', 'session-settings');
  const fields = node('div', 'fields');
  const resolution = node('select') as HTMLSelectElement;
  for (const mode of IPAD_MODES) resolution.add(new Option(mode.label + ' · ' + mode.width + ' × ' + mode.height, mode.width + 'x' + mode.height));
  for (const mode of availableModes(target)) {
    if (!IPAD_MODES.some(ipad => ipad.width === mode.width && ipad.height === mode.height))
      resolution.add(new Option(mode.width + ' × ' + mode.height, mode.width + 'x' + mode.height));
  }
  const desired = saved.width + 'x' + saved.height;
  resolution.value = [...resolution.options].some(option => option.value === desired) ? desired : '1440x1080';
  const fps = node('select') as HTMLSelectElement;
  const bitrate = node('input') as HTMLInputElement; bitrate.type = 'number'; bitrate.min = '1'; bitrate.max = '40'; bitrate.step = '1'; bitrate.value = String(saved.bitrate / 1_000_000);
  fields.append(field('해상도', resolution), field('프레임률', fps), field('최대 전송량 (Mbps)', bitrate));
  settings.append(fields);

  const custom = node('details', 'custom-mode');
  const summary = node('summary', '', '해상도 직접 입력');
  const customFields = node('div', 'fields');
  const width = node('input') as HTMLInputElement; width.type = 'number'; width.min = '640'; width.max = '3840'; width.step = '2'; width.value = '1280';
  const height = node('input') as HTMLInputElement; height.type = 'number'; height.min = '480'; height.max = '2160'; height.step = '2'; height.value = '960';
  const customFps = node('input') as HTMLInputElement; customFps.type = 'number'; customFps.min = '24'; customFps.max = '60'; customFps.value = '60';
  customFields.append(field('가로', width), field('세로', height), field('fps', customFps));
  const customStart = node('button', 'primary', '입력값으로 연결') as HTMLButtonElement;
  custom.append(summary, customFields, customStart);
  settings.append(custom);

  const actions = node('div', 'actions');
  const start = node('button', 'primary', '이 화면 연결 시작') as HTMLButtonElement;
  const stop = node('button', '', '이 화면 종료') as HTMLButtonElement;
  actions.append(start, stop); settings.append(actions);

  const pairing = node('div', 'pairing');
  pairing.append(node('span', 'code-label', '4자리 인증번호'));
  const code = node('p', 'connect-code', '— — — —');
  const qr = node('img') as HTMLImageElement; qr.width = 120; qr.height = 120; qr.alt = '이 화면 연결 QR'; qr.hidden = true;
  const url = node('p', 'url', '연결 시작 후 주소가 표시됩니다.');
  pairing.append(code, qr, url, node('p', 'muted small', '같은 Wi-Fi · 이 화면에는 기기 한 대 연결'));
  layout.append(settings, pairing); root.append(layout);

  const metrics = node('div', 'session-metrics');
  const metric = (label: string) => { const box = node('div'); box.append(node('span', '', label)); const value = node('strong', '', '—'); box.append(value); metrics.append(box); return value; };
  const clients = metric('연결 기기'), actualFps = metric('실제 fps'), sent = metric('전송량'), codec = metric('코덱 / 인코더');
  clients.textContent = '0대'; root.append(metrics);
  const card: Card = { target, root, state: heading.lastElementChild as HTMLElement, resolution, fps, bitrate, start, qr, code, url, clients, actualFps, sent, codec };
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
async function inspect() {
  try {
    clearError();
    const info = await api.inspect();
    targets = info.displays.filter(item => item.virtual && !item.primary);
    const selectedNetwork = network.value; network.replaceChildren();
    for (const address of info.addresses) network.add(new Option(address, address));
    if (info.addresses.includes(selectedNetwork)) network.value = selectedNetwork;
    monitorCount.value = String(Math.max(1, Math.min(4, info.monitorCount || 1)));
    byId('recovery').hidden = !info.recovery || info.sessions.length > 0;
    byId('driver-warning').hidden = targets.length > 0;
    renderTargets();
    for (const state of info.sessions) applyStatus(state);
    byId('display-info').textContent = info.displays.map(item => (item.primary ? '기본' : item.virtual ? '가상' : '일반') + ' · ' + item.description + ' · ' + item.bounds.width + '×' + item.bounds.height).join('\n');
    statusText.textContent = targets.length + '개의 가상 모니터 · 화면별로 연결할 수 있습니다.';
  } catch (cause) { showError('모니터 조회 실패: ' + cause); }
}
async function begin(identity: string, desired?: StreamConfig, modeInstalled = false) {
  const card = cards.get(identity); if (!card) return;
  card.start.disabled = true; clearError();
  try {
    const config = desired ?? readConfig(card);
    if (!card.target.modes.some(mode => mode.width === config.width && mode.height === config.height && mode.frequency === config.fps)) {
      if (modeInstalled) throw new Error(config.width + '×' + config.height + ' ' + config.fps + 'fps 모드가 VDD에 적용되지 않았습니다.');
      card.state.textContent = '사용자 해상도를 VDD에 추가하고 있습니다.';
      await api.installCustomMode(config.width, config.height, config.fps);
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
    track.onended = () => { if (captures.get(sessionId) === capture) api.fail(sessionId, '가상 화면 캡처가 종료되었습니다.'); };
    await api.ready(sessionId);
  } catch (cause) { api.fail(sessionId, '화면 캡처 실패: ' + cause); }
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
  const transceiver = peer.addTransceiver(capture.stream.getVideoTracks()[0], { direction: 'sendonly', streams: [capture.stream] });
  const capabilities = RTCRtpSender.getCapabilities('video')?.codecs;
  if (capabilities && transceiver.setCodecPreferences)
    transceiver.setCodecPreferences([...capabilities].sort((a, b) => Number(b.mimeType.toLowerCase() === 'video/h264') - Number(a.mimeType.toLowerCase() === 'video/h264')));
  await peer.setLocalDescription(await peer.createOffer());
  if (capture.peers.get(clientId) !== state) return;
  api.signal({ type: 'offer', data: peer.localDescription!.toJSON(), negotiation, clientId, sessionId }); descriptionSent = true;
  outgoing.forEach(candidate => api.signal({ type: 'candidate', data: candidate, negotiation, clientId, sessionId }));
  const parameters = transceiver.sender.getParameters(); parameters.encodings ??= [{}];
  for (const encoding of parameters.encodings) { encoding.maxBitrate = capture.config.bitrate; encoding.maxFramerate = capture.config.fps; }
  parameters.degradationPreference = 'maintain-framerate'; await transceiver.sender.setParameters(parameters);
  state.interval = setInterval(async () => {
    if (capture.peers.get(clientId) !== state) return;
    try {
      const stats = await peer.getStats(); stats.forEach(report => {
        if (report.type !== 'outbound-rtp' || report.kind !== 'video') return;
        const elapsed = report.timestamp - state.previousTime;
        const mbps = state.previousTime && elapsed > 0 ? (report.bytesSent - state.previousBytes) * 8 / elapsed / 1000 : 0;
        state.previousBytes = report.bytesSent; state.previousTime = report.timestamp; const codec = stats.get(report.codecId);
        api.report({ sessionId, clientId, connection: peer.connectionState, fps: report.framesPerSecond ?? null,
          width: report.frameWidth, height: report.frameHeight, mbps: Math.round(mbps * 100) / 100,
          encoder: report.encoderImplementation ?? '확인 불가', codec: codec?.mimeType ?? '확인 중', limitation: report.qualityLimitationReason ?? 'unknown' });
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
  const card = cards.get(value.sessionId); if (!card) return;
  card.state.textContent = value.message;
  card.root.classList.toggle('live', value.state === 'streaming');
  card.clients.textContent = (value.clients ?? 0) + '대';
  const sender = value.stats?.sender as Record<string, unknown> | undefined;
  const receiver = value.stats?.receiver as Record<string, unknown> | undefined;
  card.actualFps.textContent = receiver?.fps != null ? receiver.fps + ' fps' : sender?.fps != null ? sender.fps + ' fps' : '—';
  card.sent.textContent = sender?.mbps != null ? sender.mbps + ' Mbps' : '—';
  card.codec.textContent = sender ? sender.codec + ' / ' + sender.encoder : '—';
  if (['idle', 'error'].includes(value.state)) clearPairing(card);
  if (value.state === 'error') showError(value.message);
}

api.onSignal(signal => { signalQueue = signalQueue.then(() => handleSignal(signal)).catch(cause => showError('영상 연결 실패: ' + cause)); });
api.onStop(sessionId => clearCapture(sessionId));
api.onStatus(applyStatus);
byId('refresh').onclick = () => void inspect();
byId('driver-help').onclick = () => void api.help();
byId('recover').onclick = async () => { try { await api.recover(); await inspect(); } catch (cause) { showError(cause); } };
byId('stop-all').onclick = async () => { try { await api.stop(); clearCapture(); for (const card of cards.values()) clearPairing(card); } catch (cause) { showError(cause); } };
byId('apply-count').onclick = async () => {
  const button = byId<HTMLButtonElement>('apply-count'); button.disabled = true; clearError();
  try { statusText.textContent = '가상 모니터 수를 변경하고 있습니다…'; await api.configureMonitorCount(Number(monitorCount.value)); await inspect(); }
  catch (cause) { showError(cause); await inspect(); }
  finally { button.disabled = false; }
};
void inspect();
