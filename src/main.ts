import { app, BrowserWindow, desktopCapturer, ipcMain, screen, session, powerSaveBlocker, shell, powerMonitor } from 'electron';
import path from 'node:path';
import { existsSync, mkdirSync, appendFileSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { spawn } from 'node:child_process';
import QRCode from 'qrcode';
import { DisplayHelper, matchRect, selectVirtual } from './display';
import { startServer } from './server';
import { validateSignal } from './signals';
import { mayRequestPermission } from './permissions';
import type { StreamConfig, SessionStatus } from './shared';

app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
if (process.env.WEBMONITOR_DATA_DIR) app.setPath('userData', path.resolve(process.env.WEBMONITOR_DATA_DIR));
const single = app.requestSingleInstanceLock();
if (!single) app.quit();

type Runtime = {
  identity: string; config: StreamConfig; sourceId: string; captureReady: boolean;
  disconnected?: NodeJS.Timeout; captureTimeout?: NodeJS.Timeout;
};

let win: BrowserWindow;
let helper: DisplayHelper;
let recoveryPath = '';
let server: Awaited<ReturnType<typeof startServer>> | undefined;
let serverAddress = '';
let blocker: number | undefined;
let pendingCapture = '';
let closing = false, ending = false, topologyChanging = false;
let topologyTimer: NodeJS.Timeout | undefined;
let logPath = '';
const runtimes = new Map<string, Runtime>();
const states = new Map<string, SessionStatus>();
let queue = Promise.resolve();
let captureQueue = Promise.resolve();

function serial<T>(fn: () => Promise<T>): Promise<T> {
  const result = queue.then(fn, fn); queue = result.then(() => undefined, () => undefined); return result;
}
function log(event: string, details: unknown = {}) {
  if (logPath) appendFileSync(logPath, JSON.stringify({ at: new Date().toISOString(), event, details }) + '\n');
}
function publish(sessionId: string, next: Partial<SessionStatus>) {
  const runtime = runtimes.get(sessionId);
  const previous = states.get(sessionId);
  const fallback: SessionStatus = {
    sessionId, state: 'idle', message: '연결 준비', config: runtime?.config ?? previous?.config ??
      { width: 1366, height: 768, fps: 60, bitrate: 8_000_000 }, connected: false, clients: 0
  };
  const value = { ...fallback, ...previous, ...next, sessionId, config: runtime?.config ?? next.config ?? previous?.config ?? fallback.config };
  states.set(sessionId, value);
  if (logPath) writeFileSync(path.join(app.getPath('userData'), 'status.json'), JSON.stringify([...states.values()], null, 2));
  if (win && !win.isDestroyed()) win.webContents.send('status', value);
}
function runInstaller(script: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, ...args], { windowsHide: true });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error('VDD 설정 작업이 완료되지 않았습니다 (코드 ' + (code ?? -1) + ').')));
  });
}
function addresses() {
  return [...new Set(Object.values(networkInterfaces()).flat().filter(v => v && v.family === 'IPv4' && !v.internal && !v.address.startsWith('169.254.')).map(v => v!.address))];
}
function trusted(event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent) {
  if (event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) throw new Error('Untrusted sender');
}
function validConfig(chosen: StreamConfig) {
  return !!chosen && [chosen.width, chosen.height, chosen.fps, chosen.bitrate].every(Number.isSafeInteger) &&
    chosen.width >= 640 && chosen.width <= 3840 && chosen.height >= 480 && chosen.height <= 2160 &&
    chosen.fps >= 24 && chosen.fps <= 60 && chosen.bitrate >= 1_000_000 && chosen.bitrate <= 40_000_000;
}
async function selectedSource(identity: string) {
  const target = selectVirtual(await helper.list(), identity);
  if (!target.active) throw new Error('가상 모니터가 비활성화되었습니다.');
  const dipBounds = screen.screenToDipRect(null, target.bounds);
  const electronDisplay = matchRect(dipBounds, screen.getAllDisplays());
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } });
  const found = sources.filter(source => source.display_id === String(electronDisplay.id));
  log('capture-displays', { identity, target: target.bounds, dipBounds, electronDisplay: electronDisplay.id, sources: found.map(source => source.id) });
  if (found.length !== 1) throw new Error('가상 모니터의 캡처 소스를 찾지 못했습니다.');
  return found[0];
}
async function waitForSource(identity: string) {
  let last: unknown;
  for (let attempt = 0; attempt < 12; attempt++) {
    try { return await selectedSource(identity); } catch (error) { last = error; await new Promise(resolve => setTimeout(resolve, 250)); }
  }
  throw last;
}
async function triggerCapture(sessionId: string) {
  const runtime = runtimes.get(sessionId);
  if (!runtime || !win || win.isDestroyed()) throw new Error('화면 세션이 종료되었습니다.');
  pendingCapture = sessionId;
  try {
    await win.webContents.executeJavaScript('window.webmonitorStartCapture(' + JSON.stringify(sessionId) + ',' + JSON.stringify(runtime.config) + ')', true);
  } finally {
    if (pendingCapture === sessionId) pendingCapture = '';
  }
}
function scheduleCapture(sessionId: string) {
  const result = captureQueue.then(() => triggerCapture(sessionId));
  captureQueue = result.then(() => undefined, () => undefined);
  return result;
}
async function ensureServer(ip: string) {
  if (server) {
    if (serverAddress !== ip) throw new Error('실행 중인 다른 화면과 같은 PC 네트워크 주소를 선택하세요.');
    return server;
  }
  serverAddress = ip;
  server = await startServer({
    address: ip, publicDir: path.join(app.getAppPath(), 'public'),
    onSignal: (sessionId, signal) => {
      const runtime = runtimes.get(sessionId); if (!runtime) return;
      if (signal.type === 'stats') {
        publish(sessionId, { stats: { ...states.get(sessionId)?.stats, receiver: signal.data } });
        log('receiver-stats', { sessionId, stats: signal.data });
      } else if (runtime.captureReady) win.webContents.send('signal', signal);
    },
    onConnect: (sessionId, count) => {
      const runtime = runtimes.get(sessionId); if (!runtime) return;
      clearTimeout(runtime.disconnected);
      publish(sessionId, { connected: true, clients: count, state: 'connecting', message: '모바일 기기와 영상 연결 중입니다.' });
    },
    onDisconnect: (sessionId, count) => {
      const runtime = runtimes.get(sessionId); if (!runtime) return;
      if (count > 0) { publish(sessionId, { connected: true, clients: count, state: 'streaming', message: '확장 화면 전송 중입니다.' }); return; }
      publish(sessionId, { connected: false, clients: 0, state: 'reconnecting', message: '연결이 끊겼습니다. 60초 동안 재연결을 기다립니다.' });
      runtime.disconnected = setTimeout(() => {
        void serial(() => stopSession(sessionId, '재연결 대기 시간이 지나 해당 화면을 종료했습니다.')).catch(error => log('session-stop-error', String(error)));
      }, 60_000);
    }
  });
  return server;
}
async function stopSession(sessionId: string, message = '해당 확장 화면 연결을 종료했습니다.') {
  const runtime = runtimes.get(sessionId);
  if (!runtime) return;
  runtimes.delete(sessionId);
  clearTimeout(runtime.disconnected); clearTimeout(runtime.captureTimeout);
  if (win && !win.isDestroyed()) win.webContents.send('stop-capture', sessionId);
  server?.removeSession(sessionId);
  try {
    topologyChanging = true;
    if (runtimes.size === 0) {
      const old = server; server = undefined; serverAddress = ''; await old?.close();
      if (existsSync(recoveryPath)) await helper.restore();
      if (blocker !== undefined && powerSaveBlocker.isStarted(blocker)) powerSaveBlocker.stop(blocker);
      blocker = undefined;
    } else {
      await helper.deactivate(sessionId);
    }
    publish(sessionId, { state: 'idle', connected: false, clients: 0, message, stats: {} });
  } catch (error) {
    publish(sessionId, { state: 'recovery', connected: false, message: '화면 복구가 필요합니다: ' + String(error) });
    throw error;
  } finally {
    topologyChanging = false; log('stop-session', { sessionId });
  }
}
async function stopAll(message = '모든 연결을 종료하고 화면을 복구했습니다.') {
  clearTimeout(topologyTimer);
  const ids = [...runtimes.keys()];
  for (const runtime of runtimes.values()) { clearTimeout(runtime.disconnected); clearTimeout(runtime.captureTimeout); }
  runtimes.clear();
  if (win && !win.isDestroyed()) win.webContents.send('stop-capture');
  const old = server; server = undefined; serverAddress = ''; await old?.close();
  if (blocker !== undefined && powerSaveBlocker.isStarted(blocker)) powerSaveBlocker.stop(blocker);
  blocker = undefined;
  try {
    topologyChanging = true;
    if (helper && existsSync(recoveryPath)) await helper.restore();
    for (const id of ids) publish(id, { state: 'idle', connected: false, clients: 0, message, stats: {} });
  } catch (error) {
    for (const id of ids) publish(id, { state: 'recovery', connected: false, message: '화면 복구가 필요합니다: ' + String(error) });
    throw error;
  } finally { topologyChanging = false; log('stop-all'); }
}
async function failSession(sessionId: string, error: unknown) {
  log('error', { sessionId, error: String(error) });
  try { await stopSession(sessionId); } catch { return; }
  publish(sessionId, { state: 'error', connected: false, message: String(error) });
}
async function startSession(identity: string, ip: string, chosen: StreamConfig) {
  if (!addresses().includes(ip) || typeof identity !== 'string' || !validConfig(chosen)) throw new Error('연결 설정이 올바르지 않습니다.');
  if (runtimes.has(identity)) await stopSession(identity);
  const existing = selectVirtual(await helper.list(), identity);
  if (!existing.modes.some(mode => mode.width === chosen.width && mode.height === chosen.height && mode.frequency === chosen.fps))
    throw new Error('드라이버가 ' + chosen.width + '×' + chosen.height + ' ' + chosen.fps + 'Hz를 지원하지 않습니다.');
  const runtime: Runtime = { identity, config: chosen, sourceId: '', captureReady: false };
  let displayChanged = false;
  try {
    publish(identity, { state: 'starting', message: '가상 화면을 준비하고 있습니다.', config: chosen, connected: false });
    topologyChanging = true;
    if (!existing.active || existing.bounds.width !== chosen.width || existing.bounds.height !== chosen.height || existing.frequency !== chosen.fps) {
      await helper.activate(identity, chosen.width, chosen.height, chosen.fps);
      displayChanged = true;
    }
    topologyChanging = false;
    runtime.sourceId = (await waitForSource(identity)).id;
    runtimes.set(identity, runtime);
    const activeServer = await ensureServer(ip);
    const invitation = activeServer.addSession(identity);
    if (blocker === undefined) blocker = powerSaveBlocker.start('prevent-app-suspension');
    void scheduleCapture(identity).catch(error => {
      if (runtimes.has(identity)) void serial(() => failSession(identity, '화면 캡처 실패: ' + String(error)));
    });
    runtime.captureTimeout = setTimeout(() => {
      if (!runtime.captureReady && runtimes.has(identity)) void serial(() => failSession(identity, '화면 캡처 시작 시간이 초과되었습니다.'));
    }, 20_000);
    log('start-session', { identity, config: chosen, gpuFeatures: app.getGPUFeatureStatus() });
    return { url: invitation.url, qr: await QRCode.toDataURL(invitation.url), sessionId: identity };
  } catch (error) {
    topologyChanging = false;
    if (runtimes.has(identity)) await failSession(identity, error);
    else {
      if (displayChanged) {
        try {
          topologyChanging = true;
          if (runtimes.size === 0 && existsSync(recoveryPath)) await helper.restore();
          else await helper.deactivate(identity);
        } catch (rollback) { log('start-rollback-error', { identity, rollback: String(rollback) }); }
        finally { topologyChanging = false; }
      }
      publish(identity, { state: 'error', message: String(error), config: chosen, connected: false });
    }
    throw error;
  }
}
async function configureMonitorCount(count: number) {
  if (!Number.isSafeInteger(count) || count < 1 || count > 4) throw new Error('가상 모니터 수는 1~4대만 가능합니다.');
  const before = (await helper.list()).filter(display => display.virtual && !display.primary).length;
  if (before === count) return;
  await stopAll('가상 모니터 수 변경을 위해 연결을 종료했습니다.');
  const script = app.isPackaged ? path.join(process.resourcesPath, 'docs', 'set-vdd-monitor-count.ps1') : path.join(app.getAppPath(), 'docs', 'set-vdd-monitor-count.ps1');
  await runInstaller(script, ['-Count', String(count)]);
  for (let attempt = 0; attempt < 20; attempt++) {
    if ((await helper.list()).filter(display => display.virtual && !display.primary).length === count) return;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  try { await runInstaller(script, ['-Count', String(before)]); } catch (rollback) { log('vdd-count-rollback-error', String(rollback)); }
  throw new Error('가상 모니터 수가 적용되지 않아 이전 개수로 복구했습니다.');
}

if (single) app.whenReady().then(async () => {
  const dir = app.getPath('userData'); mkdirSync(dir, { recursive: true });
  recoveryPath = path.join(dir, 'display-recovery.json');
  const logs = path.join(dir, 'logs'); mkdirSync(logs, { recursive: true }); logPath = path.join(logs, 'session-' + Date.now() + '.jsonl');
  helper = new DisplayHelper(app.isPackaged ? path.join(process.resourcesPath, 'native', 'DisplayHelper.exe') : path.join(app.getAppPath(), 'native', 'publish', 'DisplayHelper.exe'), recoveryPath);

  session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) => {
    const mediaTypes = 'mediaTypes' in details ? details.mediaTypes : undefined;
    const allowed = mayRequestPermission(runtimes.size > 0, !!win && wc === win.webContents, details.isMainFrame, permission, details.requestingUrl, win?.webContents.getURL() ?? '', mediaTypes);
    callback(allowed);
  });
  session.defaultSession.setPermissionCheckHandler((wc, permission, _origin, details) => {
    const mediaTypes = details.mediaType ? [details.mediaType] : undefined;
    return mayRequestPermission(runtimes.size > 0, !!win && wc === win.webContents, details.isMainFrame, permission, details.requestingUrl, win?.webContents.getURL() ?? '', mediaTypes);
  });
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    const sessionId = pendingCapture;
    try {
      const runtime = runtimes.get(sessionId);
      const allowed = !!runtime && request.frame === win.webContents.mainFrame && request.videoRequested && !request.audioRequested;
      if (!allowed) { callback({}); return; }
      const source = await selectedSource(sessionId);
      if (source.id !== runtime.sourceId || pendingCapture !== sessionId) { callback({}); return; }
      callback({ video: source });
    } catch (error) { callback({}); if (sessionId) void serial(() => failSession(sessionId, error)); }
  });

  const workArea = screen.getPrimaryDisplay().workArea;
  const width = Math.min(1180, workArea.width), height = Math.min(900, workArea.height);
  win = new BrowserWindow({
    x: workArea.x + Math.floor((workArea.width - width) / 2), y: workArea.y + Math.floor((workArea.height - height) / 2),
    width, height, minWidth: Math.min(900, width), minHeight: Math.min(650, height), show: false, title: 'WebDisplay Bridge', backgroundColor: '#111923',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false }
  });
  win.removeMenu();
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.webContents.on('console-message', (_event, level, message) => log('renderer-console', { level, message }));

  ipcMain.handle('inspect', async event => {
    trusted(event); const displays = await helper.list();
    return { displays, addresses: addresses(), recovery: existsSync(recoveryPath), monitorCount: displays.filter(d => d.virtual && !d.primary).length, sessions: [...states.values()] };
  });
  ipcMain.handle('start', (event, identity, ip, chosen) => { trusted(event); return serial(() => startSession(identity, ip, chosen)); });
  ipcMain.handle('stop', (event, identity?: string) => { trusted(event); return serial(() => identity ? stopSession(identity) : stopAll()); });
  ipcMain.handle('recover', event => { trusted(event); return serial(() => stopAll()); });
  ipcMain.handle('configure-monitor-count', (event, count) => { trusted(event); return serial(() => configureMonitorCount(count)); });
  ipcMain.handle('ready', (event, sessionId) => {
    trusted(event); const runtime = runtimes.get(sessionId); if (!runtime) return;
    clearTimeout(runtime.captureTimeout); runtime.captureReady = true;
    publish(sessionId, { state: 'waiting', message: '준비되었습니다. 이 화면의 QR 또는 번호로 연결하세요.' });
    server?.requestOffers(sessionId);
  });
  ipcMain.handle('help', event => { trusted(event); return shell.openExternal('https://github.com/VirtualDrivers/Virtual-Display-Driver/releases/tag/25.7.23'); });
  ipcMain.handle('install-custom-mode', (event, width, height, fps) => { trusted(event); return serial(async () => {
    const chosen = { width, height, fps, bitrate: 1_000_000 };
    if (!validConfig(chosen) || width % 2 || height % 2) throw new Error('가로 640~3840, 세로 480~2160의 짝수와 24~60fps를 입력하세요.');
    await stopAll('사용자 해상도 추가를 위해 전송을 종료했습니다.');
    const script = app.isPackaged ? path.join(process.resourcesPath, 'docs', 'add-ipad9-modes.ps1') : path.join(app.getAppPath(), 'docs', 'add-ipad9-modes.ps1');
    await runInstaller(script, ['-Width', String(width), '-Height', String(height), '-RefreshRate', String(fps)]);
  }); });
  ipcMain.on('signal', (event, value: unknown) => {
    trusted(event); if (validateSignal(value, 'host') && value.sessionId && runtimes.has(value.sessionId)) server?.send(value);
  });
  ipcMain.on('report', (event, stats) => {
    trusted(event); const sessionId = String(stats?.sessionId ?? '');
    if (!runtimes.has(sessionId) || JSON.stringify(stats).length > 4096) return;
    const clean = { ...stats }; delete clean.sessionId;
    publish(sessionId, { state: clean.connection === 'connected' ? 'streaming' : states.get(sessionId)?.state ?? 'connecting',
      message: clean.connection === 'connected' ? '확장 화면 전송 중입니다.' : states.get(sessionId)?.message ?? '', stats: { ...states.get(sessionId)?.stats, sender: clean } });
    log('sender-stats', { sessionId, stats: clean });
  });
  ipcMain.on('failure', (event, sessionId, message) => {
    trusted(event); if (runtimes.has(sessionId)) void serial(() => failSession(sessionId, String(message).slice(0, 1000)));
  });

  const topologyChanged = () => {
    if (topologyChanging || runtimes.size === 0) return;
    win.webContents.send('stop-capture');
    for (const runtime of runtimes.values()) runtime.captureReady = false;
    clearTimeout(topologyTimer);
    topologyTimer = setTimeout(() => { void serial(async () => {
      for (const [sessionId, runtime] of runtimes) {
        try { runtime.sourceId = (await waitForSource(sessionId)).id; await scheduleCapture(sessionId); }
        catch (error) { await failSession(sessionId, error); }
      }
    }); }, 700);
  };
  screen.on('display-added', topologyChanged); screen.on('display-removed', topologyChanged); screen.on('display-metrics-changed', topologyChanged);
  powerMonitor.on('suspend', () => { void serial(() => stopAll('PC 절전으로 연결을 종료했습니다. 복귀 후 다시 연결하세요.')).catch(error => log('suspend-error', String(error))); });
  win.webContents.on('render-process-gone', () => { void serial(() => stopAll('화면 전송 프로세스가 종료되었습니다.')).catch(error => log('renderer-restore-error', String(error))); });
  win.on('close', event => {
    if (closing) return; event.preventDefault(); if (ending) return; ending = true;
    void serial(() => stopAll()).catch(error => log('exit-restore-error', String(error))).finally(() => { closing = true; win.close(); app.quit(); });
  });

  await win.loadFile(path.join(app.getAppPath(), 'public', 'host.html'));
  if (process.env.WEBMONITOR_SMOKE !== '1') { win.show(); win.focus(); }
  if (existsSync(recoveryPath)) {
    try { await helper.restore(); } catch (error) { log('startup-recovery-error', String(error)); }
  }
  if (process.env.WEBMONITOR_SMOKE === '1') setTimeout(() => { closing = true; win.close(); }, 2500);
}).catch(async error => {
  console.error(error); try { await stopAll('앱 시작 실패로 화면 설정을 복구했습니다.'); } catch {}
  app.exit(1);
});

app.on('second-instance', () => {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show(); win.focus();
});
app.on('window-all-closed', () => app.quit());
