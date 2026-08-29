'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('flightcore', {
  probeHost: input => ipcRenderer.invoke('probe-host', input),
  startInstall: input => ipcRenderer.invoke('start-install', input),
  showLog: () => ipcRenderer.invoke('show-log'),
  fitWindow: size => ipcRenderer.invoke('fit-window', size),
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  onEvent: callback => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('installer-event', listener);
    return () => ipcRenderer.removeListener('installer-event', listener);
  }
});
