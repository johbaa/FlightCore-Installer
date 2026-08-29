'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('flightcore', {
  probeHost: input => ipcRenderer.invoke('probe-host', input),
  startInstall: input => ipcRenderer.invoke('start-install', input),
  openProgress: host => ipcRenderer.invoke('open-progress', host),
  showLog: () => ipcRenderer.invoke('show-log'),
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  onEvent: callback => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('installer-event', listener);
    return () => ipcRenderer.removeListener('installer-event', listener);
  }
});
