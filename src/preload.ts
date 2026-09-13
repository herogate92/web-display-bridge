import { contextBridge, ipcRenderer } from 'electron';
import type { HostApi } from './shared';
const api: HostApi = {
  inspect: () => ipcRenderer.invoke('inspect'), start: (identity, address, config) => ipcRenderer.invoke('start', identity, address, config),
  stop: identity => ipcRenderer.invoke('stop', identity), recover: () => ipcRenderer.invoke('recover'),
  configureMonitorCount: count => ipcRenderer.invoke('configure-monitor-count', count),
  signal: signal => ipcRenderer.send('signal', signal), report: stats => ipcRenderer.send('report', stats),
  ready: sessionId => ipcRenderer.invoke('ready', sessionId), fail: (sessionId, message) => ipcRenderer.send('failure', sessionId, message),
  onSignal: fn => ipcRenderer.on('signal', (_event, value) => fn(value)),
  onCapture: fn => ipcRenderer.on('capture', (_event, sessionId, value) => fn(sessionId, value)),
  onStop: fn => ipcRenderer.on('stop-capture', (_event, sessionId) => fn(sessionId)),
  onStatus: fn => ipcRenderer.on('status', (_event, value) => fn(value)),
  installCustomMode: (width, height, fps) => ipcRenderer.invoke('install-custom-mode', width, height, fps),
  help: () => ipcRenderer.invoke('help')
};
contextBridge.exposeInMainWorld('webmonitor', api);
