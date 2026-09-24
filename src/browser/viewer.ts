import type { Signal } from '../shared';
import { language, setLanguage, t, translateBackend } from './i18n';
import type { TranslationKey } from './i18n';
const video = document.getElementById('screen') as HTMLVideoElement;
const message = document.getElementById('message')!;
const connect = document.getElementById('connect') as HTMLButtonElement;
const overlay = document.getElementById('overlay')!;
const statsEl = document.getElementById('viewer-stats')!;
const codeEntry = document.getElementById('code-entry')!;
const codeInput = document.getElementById('connection-code') as HTMLInputElement;
const languageSelects = [...document.querySelectorAll<HTMLSelectElement>('.language-select')];
let ws: WebSocket | undefined, peer: RTCPeerConnection | undefined;
let retry: ReturnType<typeof setTimeout> | undefined, statsTimer: ReturnType<typeof setInterval> | undefined;
let signalQueue = Promise.resolve(), candidates: RTCIceCandidateInit[] = [];
let started = false, retries = 0, manualStop = false, lastFrames = 0, lastTime = 0;
let negotiation = 0;
let invitation = /^\/(\d{4})$/.exec(location.pathname)?.[1] ?? '';
let paired = false;
if (invitation) { codeEntry.hidden = true; history.replaceState(null, '', '/'); }
let lastMessage: TranslationKey | undefined;
let lastError: unknown;
let connectLabel: TranslationKey = 'connectPlay';
let hasStats = false;
function say(key: TranslationKey) { lastMessage = key; lastError = undefined; message.textContent = t(key); }
function sayError(value: unknown) { lastMessage = undefined; lastError = value; message.textContent = translateBackend(value); }
function setConnectLabel(key: TranslationKey) { connectLabel = key; connect.textContent = t(key); }
function refreshLanguage() {
  document.documentElement.lang = language(); languageSelects.forEach(select => { select.value = language(); });
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach(element => {
    if (element === connect || (element === statsEl && hasStats)) return;
    element.textContent = t(element.dataset.i18n as TranslationKey);
  });
  setConnectLabel(connectLabel);
  if (lastMessage) message.textContent = t(lastMessage);
  else if (lastError) message.textContent = translateBackend(lastError);
}
function send(value: Signal) { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(value)); }
function clearPeer() { peer?.close(); peer = undefined; clearInterval(statsTimer); video.srcObject = null; candidates = []; lastFrames = lastTime = 0; }
async function play() {
  try { await video.play(); overlay.hidden = true; }
  catch { overlay.hidden = false; say('pressPlay'); setConnectLabel('play'); }
}
async function receive(signal: Signal, socket: WebSocket) {
  if (ws !== socket) return;
  if (signal.type === 'offer') {
    negotiation = signal.negotiation!; const ownNegotiation = negotiation;
    clearPeer(); const pc = new RTCPeerConnection({ iceServers: [] }); peer = pc;
    let sent = false; const outgoing: RTCIceCandidateInit[] = [];
    pc.onicecandidate = event => { if (peer !== pc || !event.candidate) return; const c = event.candidate.toJSON(); if (sent) send({ type: 'candidate', data: c, negotiation: ownNegotiation }); else outgoing.push(c); };
    pc.ontrack = event => { video.srcObject = event.streams[0] ?? new MediaStream([event.track]); void play(); };
    pc.onconnectionstatechange = () => {
      if (peer !== pc) return;
      if (pc.connectionState === 'connected') { retries = 0; say('connected'); }
      if (pc.connectionState === 'failed') { overlay.hidden = false; say('pathLost'); send({ type: 'restart' }); }
    };
    await pc.setRemoteDescription(signal.data as RTCSessionDescriptionInit);
    for (const c of candidates) await pc.addIceCandidate(c); candidates = [];
    await pc.setLocalDescription(await pc.createAnswer());
    if (peer !== pc || ws !== socket) return;
    send({ type: 'answer', data: pc.localDescription!.toJSON(), negotiation: ownNegotiation }); sent = true; outgoing.forEach(c => send({ type: 'candidate', data: c, negotiation: ownNegotiation }));
    statsTimer = setInterval(async () => {
      if (peer !== pc) return;
      try {
        const report = await pc.getStats();
        report.forEach(r => {
          if (r.type !== 'inbound-rtp' || r.kind !== 'video') return;
          const elapsed = r.timestamp - lastTime;
          const fps = r.framesPerSecond ?? (lastTime && elapsed > 0 ? Math.round((r.framesDecoded - lastFrames) * 1000 / elapsed) : null);
          lastTime = r.timestamp; lastFrames = r.framesDecoded;
          hasStats = true; statsEl.textContent = `${r.frameWidth ?? '—'}×${r.frameHeight ?? '—'} · ${fps ?? '—'} fps`;
          send({ type: 'stats', data: { fps, framesDecoded: r.framesDecoded, framesDropped: r.framesDropped, width: r.frameWidth, height: r.frameHeight,
            decoder: r.decoderImplementation ?? t('unavailable'), userAgent: navigator.userAgent } });
        });
      } catch { /* Peer replaced during statistics polling. */ }
    }, 2000);
  } else if (signal.type === 'candidate') {
    if (signal.negotiation !== negotiation) return;
    if (peer?.remoteDescription) await peer.addIceCandidate(signal.data as RTCIceCandidateInit); else candidates.push(signal.data as RTCIceCandidateInit);
  }
}
function openSocket() {
  if (manualStop || document.hidden || ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) return;
  clearTimeout(retry); clearPeer();
  const socket = new WebSocket(`ws://${location.host}/signal`); ws = socket;
  socket.onopen = () => { say('connecting'); };
  socket.onmessage = event => { signalQueue = signalQueue.then(() => receive(JSON.parse(event.data), socket)).catch(() => { say('retryVideo'); socket.close(); }); };
  socket.onerror = () => say('checkConnection');
  socket.onclose = () => {
    if (ws !== socket) return; ws = undefined; clearPeer(); overlay.hidden = false;
    if (manualStop) return;
    if (++retries > 12) { say('newQr'); setConnectLabel('reconnect'); return; }
    say('waitForPc');
    retry = setTimeout(openSocket, Math.min(1000 * retries, 5000));
  };
}
connect.onclick = async () => {
  if (video.srcObject) { await play(); return; }
  manualStop = false; retries = 0; connect.disabled = true;
  try {
    if (!window.RTCPeerConnection) { say('unsupportedWebRtc'); return; }
    if (!invitation && !paired) {
      const typed = codeInput.value.replace(/\D/g, '');
      if (!/^\d{4}$/.test(typed)) { say('enterCode'); return; }
      invitation = typed;
    }
    if (invitation) {
      const response = await fetch('/pair', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: invitation }) });
      if (!response.ok) { invitation = ''; sayError(await response.text()); return; }
      invitation = ''; paired = true; codeEntry.hidden = true; codeInput.value = '';
    }
    started = true; openSocket();
  } catch (e) { sayError(e); }
  finally { connect.disabled = false; }
};
codeInput.addEventListener('input', () => { codeInput.value = codeInput.value.replace(/\D/g, '').slice(0, 4); });
codeInput.addEventListener('keydown', event => { if (event.key === 'Enter') connect.click(); });
document.getElementById('fullscreen')!.onclick = async () => {
  try {
    if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
    else { const v = video as HTMLVideoElement & { webkitEnterFullscreen?: () => void }; if (v.webkitEnterFullscreen) v.webkitEnterFullscreen(); else say('fitSafari'); }
  } catch { say('fitSafari'); }
};
document.getElementById('disconnect')!.onclick = () => {
  manualStop = true; started = false; clearTimeout(retry); ws?.close(); ws = undefined; clearPeer(); overlay.hidden = false; say('viewerStopped');
};
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { clearTimeout(retry); ws?.close(); }
  else if (started) { retries = 0; openSocket(); }
});
window.addEventListener('online', () => { if (started) openSocket(); });
window.addEventListener('pagehide', () => { ws?.close(); });
void fetch('/session').then(response => response.json()).then(value => {
  if (value.paired === true) { paired = true; codeEntry.hidden = true; }
}).catch(() => undefined);
languageSelects.forEach(select => { select.onchange = () => { setLanguage(select.value === 'en' ? 'en' : 'ko'); refreshLanguage(); }; });
refreshLanguage();
say(invitation ? 'pressConnect' : 'enterCode');
