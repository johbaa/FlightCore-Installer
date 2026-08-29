'use strict';

const { app, BrowserWindow, WebContentsView, ipcMain, shell } = require('electron');
const { Client } = require('ssh2');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const crypto = require('node:crypto');
const {
  PROGRESS_PORT,
  normalizeHost,
  normalizeUsername,
  fingerprintLabel,
  buildRemoteInstallCommand,
  redactLine,
  progressUrl,
  firstSetupUrl,
  classifyInstallerUrl
} = require('./lib/core');

let mainWindow;
let activeClient = null;
let activeRun = false;
let activeLogPath = null;
let progressView = null;
let activeHost = '';
let firstSetupHandoffStarted = false;

function resizeProgressView() {
  if (!mainWindow || mainWindow.isDestroyed() || !progressView) return;
  const [width, height] = mainWindow.getContentSize();
  progressView.setBounds({ x: 0, y: 0, width, height });
}

async function handoffToFirstSetup(host) {
  if (firstSetupHandoffStarted) return;
  firstSetupHandoffStarted = true;
  const url = firstSetupUrl(host);
  appendLog(`Verified First Setup handoff: ${url}`);
  try {
    await shell.openExternal(url);
    appendLog('First Setup opened in the default browser. Native installer closing.');
    app.quit();
  } catch (error) {
    firstSetupHandoffStarted = false;
    const message = `Could not open FlightCore First Setup: ${error?.message || String(error)}`;
    appendLog(`FAIL: ${message}`);
    emit('failed', { message, logPath: activeLogPath });
  }
}

function handleEmbeddedNavigation(url) {
  const kind = classifyInstallerUrl(url, activeHost);
  if (kind === 'progress') return true;
  if (kind === 'first-setup') {
    void handoffToFirstSetup(activeHost);
    return false;
  }
  appendLog(`Blocked embedded navigation: ${String(url).slice(0, 500)}`);
  return false;
}

function showEmbeddedProgress(host) {
  if (!mainWindow || mainWindow.isDestroyed()) throw new Error('The installer window is unavailable.');
  activeHost = normalizeHost(host);
  firstSetupHandoffStarted = false;
  if (progressView) {
    try { mainWindow.contentView.removeChildView(progressView); } catch {}
    try { progressView.webContents.close(); } catch {}
  }
  progressView = new WebContentsView({
    webPreferences: {
      partition: 'flightcore-progress',
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  });
  progressView.setBackgroundColor('#07111f');
  progressView.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  progressView.webContents.on('will-attach-webview', event => event.preventDefault());
  progressView.webContents.on('will-navigate', (event, url) => {
    if (!handleEmbeddedNavigation(url)) event.preventDefault();
  });
  progressView.webContents.on('will-redirect', (event, url) => {
    if (!handleEmbeddedNavigation(url)) event.preventDefault();
  });
  progressView.webContents.setWindowOpenHandler(({ url }) => {
    handleEmbeddedNavigation(url);
    return { action: 'deny' };
  });
  mainWindow.contentView.addChildView(progressView);
  resizeProgressView();
  const url = progressUrl(activeHost);
  appendLog(`Loading isolated embedded progress UI: ${url}`);
  progressView.webContents.loadURL(url);
}

function createWindow() {
  const capturePath = process.env.FLIGHTCORE_CAPTURE_UI || '';
  mainWindow = new BrowserWindow({
    width: 760,
    height: 720,
    minWidth: 680,
    minHeight: 620,
    backgroundColor: '#07111f',
    title: 'FlightCore Installer',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      offscreen: Boolean(capturePath)
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => {
    if (!capturePath) mainWindow.show();
  });
  if (capturePath) {
    mainWindow.webContents.once('did-finish-load', async () => {
      const image = await mainWindow.webContents.capturePage();
      fs.writeFileSync(capturePath, image.toPNG());
      app.quit();
    });
  }
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.on('resize', resizeProgressView);
}

function emit(type, payload = {}) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('installer-event', { type, ...payload });
}

function timestamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function beginLog(host, username) {
  activeLogPath = path.join(app.getPath('downloads'), `FLIGHTCORE_FRESH_INSTALL_${timestamp()}.log`);
  fs.writeFileSync(activeLogPath, [
    'FlightCore Fresh Installer',
    `Started: ${new Date().toISOString()}`,
    `Target: ${username}@${host}`,
    `Launcher: ${app.getVersion()}`,
    ''
  ].join('\n'), { mode: 0o600 });
  return activeLogPath;
}

function appendLog(line) {
  if (!activeLogPath) return;
  const safe = redactLine(line);
  fs.appendFileSync(activeLogPath, `${safe.endsWith('\n') ? safe : `${safe}\n`}`);
}

function knownHostsPath() {
  return path.join(app.getPath('userData'), 'known-hosts.json');
}

function readKnownHosts() {
  try {
    const parsed = JSON.parse(fs.readFileSync(knownHostsPath(), 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveKnownHost(host, fingerprint) {
  const hosts = readKnownHosts();
  hosts[host] = { fingerprint, trustedAt: new Date().toISOString() };
  fs.mkdirSync(path.dirname(knownHostsPath()), { recursive: true });
  const temp = `${knownHostsPath()}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(hosts, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temp, knownHostsPath());
}

function connectionOptions({ host, username, password, hostVerifier }) {
  return {
    host,
    port: 22,
    username,
    password,
    readyTimeout: 15000,
    keepaliveInterval: 5000,
    keepaliveCountMax: 3,
    hostHash: 'sha256',
    hostVerifier,
    algorithms: {
      serverHostKey: ['ssh-ed25519', 'ecdsa-sha2-nistp256', 'rsa-sha2-512', 'rsa-sha2-256']
    }
  };
}

function friendlySshError(error) {
  const raw = error?.message || String(error);
  if (/authentication methods failed|authentication failure/i.test(raw)) return new Error('The Raspberry Pi password was not accepted.');
  if (/timed out|timeout/i.test(raw)) return new Error('The Raspberry Pi did not answer on SSH port 22.');
  if (/getaddrinfo|ENOTFOUND/i.test(raw)) return new Error('The Raspberry Pi address could not be found.');
  if (/ECONNREFUSED/i.test(raw)) return new Error('The Raspberry Pi refused the SSH connection. Confirm that SSH is enabled.');
  if (/EHOSTUNREACH|ENETUNREACH/i.test(raw)) return new Error('The Raspberry Pi is not reachable from this computer.');
  return new Error(raw);
}

function probeFingerprint(input) {
  const host = normalizeHost(input.host);
  const username = normalizeUsername(input.username);
  const password = String(input.password || '');
  if (!password) throw new Error('Enter the Raspberry Pi password.');

  return new Promise((resolve, reject) => {
    const client = new Client();
    let digest = null;
    let settled = false;
    const finish = (err) => {
      if (settled) return;
      settled = true;
      client.end();
      if (err) return reject(friendlySshError(err));
      if (!digest) return reject(err || new Error('Could not read the Raspberry Pi SSH identity.'));
      const known = readKnownHosts()[host]?.fingerprint || null;
      const matchesKnown = Boolean(known && known.length === digest.length && crypto.timingSafeEqual(Buffer.from(known), Buffer.from(digest)));
      resolve({
        host,
        username,
        fingerprint: digest,
        fingerprintLabel: fingerprintLabel(digest),
        trustState: !known ? 'new' : matchesKnown ? 'trusted' : 'changed',
        previousFingerprintLabel: known ? fingerprintLabel(known) : null
      });
    };
    client.on('ready', () => finish());
    client.on('error', err => finish(err));
    client.connect(connectionOptions({
      host,
      username,
      password,
      hostVerifier: hash => {
        digest = String(hash).toLowerCase();
        return true;
      }
    }));
  });
}

function waitForPort(host, port, timeoutMs, onReady, onTimeout) {
  const started = Date.now();
  let stopped = false;
  const attempt = () => {
    if (stopped) return;
    const socket = net.createConnection({ host, port });
    const retry = () => {
      socket.destroy();
      if (Date.now() - started >= timeoutMs) {
        stopped = true;
        if (onTimeout) onTimeout();
        return;
      }
      setTimeout(attempt, 800);
    };
    socket.setTimeout(1200);
    socket.once('connect', () => {
      stopped = true;
      socket.destroy();
      onReady();
    });
    socket.once('timeout', retry);
    socket.once('error', retry);
  };
  attempt();
  return () => { stopped = true; };
}

async function runInstall(input) {
  if (activeRun) throw new Error('An installation is already running.');
  const host = normalizeHost(input.host);
  const username = normalizeUsername(input.username);
  const password = String(input.password || '');
  const approvedFingerprint = String(input.fingerprint || '').toLowerCase();
  if (!password) throw new Error('Enter the Raspberry Pi password.');
  fingerprintLabel(approvedFingerprint);

  activeRun = true;
  const logPath = beginLog(host, username);
  appendLog(`Approved SSH fingerprint: ${fingerprintLabel(approvedFingerprint)}`);
  emit('run-started', { host, logPath });

  return new Promise((resolve, reject) => {
    const client = new Client();
    activeClient = client;
    let openedProgress = false;
    let commandStarted = false;
    let terminalFailure = false;
    const stopPolling = waitForPort(host, PROGRESS_PORT, 120000, () => {
      if (openedProgress) return;
      openedProgress = true;
      const url = progressUrl(host);
      appendLog(`Progress WebUI ready: ${url}`);
      emit('progress-ready', { url, embedded: true });
      showEmbeddedProgress(host);
    }, () => {
      if (!openedProgress) fail(new Error('The FlightCore installation interface did not become ready on port 8090.'));
    });
    const fail = err => {
      if (terminalFailure || openedProgress) return;
      terminalFailure = true;
      stopPolling();
      activeRun = false;
      activeClient = null;
      const message = friendlySshError(err).message;
      appendLog(`FAIL: ${message}`);
      emit('failed', { message, logPath });
      reject(new Error(message));
    };

    client.on('ready', () => {
      saveKnownHost(host, approvedFingerprint);
      appendLog('SSH authentication: PASS');
      emit('connected');
      commandStarted = true;
      client.exec(buildRemoteInstallCommand(), { pty: false }, (err, stream) => {
        if (err) return fail(err);
        emit('installer-started');
        appendLog('Remote FlightCore public installer started.');
        stream.on('data', data => {
          const text = data.toString('utf8');
          appendLog(text);
          emit('output', { stream: 'stdout', text: redactLine(text) });
        });
        stream.stderr.on('data', data => {
          const text = data.toString('utf8');
          appendLog(text);
          emit('output', { stream: 'stderr', text: redactLine(text) });
        });
        stream.on('close', (code, signal) => {
          client.end();
          activeClient = null;
          if (openedProgress) {
            activeRun = false;
            appendLog(`Remote SSH command ended (code=${code ?? 'unknown'}, signal=${signal || 'none'}); embedded installation UI remains authoritative.`);
            emit('command-ended', { code, signal, logPath });
            resolve({ ok: true, code, openedProgress, logPath });
            return;
          }
          if (code === 0) return;
          if (code !== null && code !== undefined) fail(new Error(`The FlightCore installer stopped with exit code ${code}.`));
          else appendLog('Remote SSH command ended without an exit code; continuing to wait for the port-8090 installation interface.');
        });
      });
    });
    client.on('error', err => {
      if (!commandStarted) fail(err);
    });
    client.connect(connectionOptions({
      host,
      username,
      password,
      hostVerifier: hash => {
        const received = String(hash).toLowerCase();
        return received.length === approvedFingerprint.length && crypto.timingSafeEqual(Buffer.from(received), Buffer.from(approvedFingerprint));
      }
    }));
  });
}

ipcMain.handle('probe-host', async (_event, input) => probeFingerprint(input));
ipcMain.handle('start-install', async (_event, input) => runInstall(input));
ipcMain.handle('open-progress', async (_event, host) => shell.openExternal(progressUrl(host)));
ipcMain.handle('show-log', async () => activeLogPath ? shell.showItemInFolder(activeLogPath) : false);
ipcMain.handle('get-app-info', async () => ({ version: app.getVersion(), platform: process.platform }));

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
app.on('before-quit', () => {
  if (activeClient) activeClient.end();
  if (progressView) {
    try { progressView.webContents.close(); } catch {}
  }
});
