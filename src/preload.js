'use strict';

const { contextBridge, ipcRenderer } = require('electron');
const { projectedElapsedSeconds } = require('./lib/core');

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
