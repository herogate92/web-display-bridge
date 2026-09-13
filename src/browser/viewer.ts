import type { Signal } from '../shared';
const video = document.getElementById('screen') as HTMLVideoElement;
const message = document.getElementById('message')!;
const connect = document.getElementById('connect') as HTMLButtonElement;
const overlay = document.getElementById('overlay')!;
const statsEl = document.getElementById('viewer-stats')!;
const codeEntry = document.getElementById('code-entry')!;
const codeInput = document.getElementById('connection-code') as HTMLInputElement;
let ws: WebSocket | undefined, peer: RTCPeerConnection | undefined;
let retry: ReturnType<typeof setTimeout> | undefined, statsTimer: ReturnType<typeof setInterval> | undefined;
let signalQueue = Promise.resolve(), candidates: RTCIceCandidateInit[] = [];
let started = false, retries = 0, manualStop = false, lastFrames = 0, lastTime = 0;
let negotiation = 0;
let invitation = /^\/(\d{4})$/.exec(location.pathname)?.[1] ?? '';
let paired = false;
if (invitation) { codeEntry.hidden = true; history.replaceState(null, '', '/'); }
const say = (text: string) => { message.textContent = text; };
function send(value: Signal) { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(value)); }
function clearPeer() { peer?.close(); peer = undefined; clearInterval(statsTimer); video.srcObject = null; candidates = []; lastFrames = lastTime = 0; }
async function play() {
  try { await video.play(); overlay.hidden = true; }
  catch { overlay.hidden = false; say('재생 버튼을 눌러 화면을 표시하세요.'); connect.textContent = '재생'; }
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
      if (pc.connectionState === 'connected') { retries = 0; say('확장 화면 연결됨'); }
      if (pc.connectionState === 'failed') { overlay.hidden = false; say('영상 경로가 끊겼습니다. 다시 연결 중…'); send({ type: 'restart' }); }
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
          statsEl.textContent = `${r.frameWidth ?? '—'}×${r.frameHeight ?? '—'} · ${fps ?? '—'} fps`;
          send({ type: 'stats', data: { fps, framesDecoded: r.framesDecoded, framesDropped: r.framesDropped, width: r.frameWidth, height: r.frameHeight,
            decoder: r.decoderImplementation ?? '확인 불가', userAgent: navigator.userAgent } });
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
  socket.onopen = () => { say('가상 화면 연결 중…'); };
  socket.onmessage = event => { signalQueue = signalQueue.then(() => receive(JSON.parse(event.data), socket)).catch(() => { say('영상 연결을 다시 시도합니다.'); socket.close(); }); };
  socket.onerror = () => say('연결을 확인하세요. 연결 코드가 만료되었거나 네트워크 연결이 끊겼을 수 있습니다.');
  socket.onclose = () => {
    if (ws !== socket) return; ws = undefined; clearPeer(); overlay.hidden = false;
    if (manualStop) return;
    if (++retries > 12) { say('PC에서 연결을 다시 시작하고 새 QR을 스캔하세요.'); connect.textContent = '다시 연결'; return; }
    say('PC 연결을 기다립니다. 같은 Wi-Fi인지 확인하세요.');
    retry = setTimeout(openSocket, Math.min(1000 * retries, 5000));
  };
}
connect.onclick = async () => {
  if (video.srcObject) { await play(); return; }
  manualStop = false; retries = 0; connect.disabled = true;
  try {
    if (!window.RTCPeerConnection) throw new Error('이 Safari 버전은 WebRTC 화면 수신을 지원하지 않습니다.');
    if (!invitation && !paired) {
      const typed = codeInput.value.replace(/\D/g, '');
      if (!/^\d{4}$/.test(typed)) throw new Error('PC 화면의 4자리 연결 번호를 입력하세요.');
      invitation = typed;
    }
    if (invitation) {
      const response = await fetch('/pair', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: invitation }) });
      if (!response.ok) throw new Error(await response.text()); invitation = ''; paired = true; codeEntry.hidden = true; codeInput.value = '';
    }
    started = true; openSocket();
  } catch (e) { say(String(e)); }
  finally { connect.disabled = false; }
};
codeInput.addEventListener('input', () => { codeInput.value = codeInput.value.replace(/\D/g, '').slice(0, 4); });
codeInput.addEventListener('keydown', event => { if (event.key === 'Enter') connect.click(); });
document.getElementById('fullscreen')!.onclick = async () => {
  try {
    if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
    else { const v = video as HTMLVideoElement & { webkitEnterFullscreen?: () => void }; if (v.webkitEnterFullscreen) v.webkitEnterFullscreen(); else say('Safari 화면 크기에 맞춰 표시합니다.'); }
  } catch { say('Safari 화면 크기에 맞춰 표시합니다.'); }
};
document.getElementById('disconnect')!.onclick = () => {
  manualStop = true; started = false; clearTimeout(retry); ws?.close(); ws = undefined; clearPeer(); overlay.hidden = false; say('모바일 기기 연결을 종료했습니다. PC에서 연결 종료를 누르면 화면 배치가 복구됩니다.');
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
say(invitation ? '연결 / 재생을 누르세요.' : 'PC 화면의 4자리 연결 번호를 입력하세요.');
