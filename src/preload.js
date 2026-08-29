'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Sandboxed Electron preloads may use the Electron API but cannot require
// arbitrary local modules. Keep this small deterministic projection here.
function projectedElapsedSeconds(baseSeconds, sampledAtMs, nowMs) {
  const base = Math.max(0, Math.floor(Number(baseSeconds) || 0));
  const sampledAt = Number(sampledAtMs);
  const now = Number(nowMs);
  if (!Number.isFinite(sampledAt) || !Number.isFinite(now) || now <= sampledAt) return base;
  return base + Math.floor((now - sampledAt) / 1000);
}

contextBridge.exposeInMainWorld('flightcore', {
  probeHost: input => ipcRenderer.invoke('probe-host', input),
  startInstall: input => ipcRenderer.invoke('start-install', input),
  showLog: () => ipcRenderer.invoke('show-log'),
  fitWindow: size => ipcRenderer.invoke('fit-window', size),
  projectedElapsedSeconds: (baseSeconds, sampledAtMs, nowMs) => projectedElapsedSeconds(baseSeconds, sampledAtMs, nowMs),
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  onEvent: callback => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('installer-event', listener);
    return () => ipcRenderer.removeListener('installer-event', listener);
  }
});
