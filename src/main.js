'use strict';

const { app, BrowserWindow, WebContentsView, Menu, ipcMain, shell, screen } = require('electron');
const { Client } = require('ssh2');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const http = require('node:http');
const crypto = require('node:crypto');
const {
  PROGRESS_PORT, REMOTE_UNIT, REMOTE_ROOT, REMOTE_BOOTSTRAP_LOG,
  normalizeHost, normalizeUsername, fingerprintLabel, buildRemoteInstallCommand,
  buildRemoteInspectionCommand, parseRemoteInspection, classifyRemoteInspection,
  progressStateSignature, redactLine, progressUrl, progressStateUrl, firstSetupUrl,
  classifyInstallerUrl
} = require('./lib/core');

const EMBEDDED_HEADER_HEIGHT = 82;
const PROGRESS_READY_TIMEOUT_MS = 120000;
const INSTALL_TIMEOUT_MS = 30 * 60 * 1000;
const STATE_STALE_MS = 20000;
const REBOOT_GRACE_MS = 5 * 60 * 1000;

let mainWindow;
let activeClient = null;
let activeRun = false;
let activeLogPath = null;
let progressView = null;
let activeHost = '';
let activeCredentials = null;
let firstSetupHandoffStarted = false;

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function emit(type, payload = {}) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('installer-event', { type, ...payload });
}

function resizeProgressView() {
  if (!mainWindow || mainWindow.isDestroyed() || !progressView) return;
  const [width, height] = mainWindow.getContentSize();
  progressView.setBounds({ x: 0, y: EMBEDDED_HEADER_HEIGHT, width, height: Math.max(0, height - EMBEDDED_HEADER_HEIGHT) });
}

function hideEmbeddedProgress() {
  if (!progressView || !mainWindow || mainWindow.isDestroyed()) return;
  try { mainWindow.contentView.removeChildView(progressView); } catch {}
  try { progressView.webContents.close(); } catch {}
  progressView = null;
  emit('embedded-hidden');
}

function fitWindow(request = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const display = screen.getDisplayMatching(mainWindow.getBounds());
  const work = display.workAreaSize;
  const width = Math.min(work.width, Math.max(680, Math.ceil(Number(request.width) || 760)));
  const height = Math.min(work.height, Math.max(620, Math.ceil(Number(request.height) || 720)));
  mainWindow.setMinimumSize(Math.min(680, work.width), Math.min(620, work.height));
  mainWindow.setContentSize(width, height, true);
  mainWindow.center();
}

function installApplicationMenu() {
  const template = [];
  if (process.platform === 'darwin') template.push({ label: app.name, submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] });
  template.push({
    label: 'Edit',
    submenu: [
      { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
      { role: 'cut' }, { role: 'copy' }, { role: 'paste' },
      { role: 'selectAll' }
    ]
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function installEditableContextMenu(contents) {
  contents.on('context-menu', (_event, params) => {
    if (!params.isEditable) return;
    Menu.buildFromTemplate([
      { role: 'undo', enabled: params.editFlags.canUndo },
      { role: 'redo', enabled: params.editFlags.canRedo },
      { type: 'separator' },
      { role: 'cut', enabled: params.editFlags.canCut },
      { role: 'copy', enabled: params.editFlags.canCopy },
      { role: 'paste', enabled: params.editFlags.canPaste },
      { role: 'selectAll', enabled: params.editFlags.canSelectAll }
    ]).popup({ window: mainWindow });
  });
}

function embeddedCss() {
  const logoPath = path.join(__dirname, 'renderer', 'flightcore-logo.svg');
  const logo = fs.readFileSync(logoPath).toString('base64');
  return `
    :root{color-scheme:dark!important;--fc-bg:#07111f;--fc-panel:#0b192b;--fc-border:#29425f;--fc-text:#edf5ff;--fc-muted:#9eb0c5;--fc-blue:#278cff}
    html,body{background:radial-gradient(circle at 18% 0%,#12325a 0,transparent 33%),linear-gradient(145deg,#06101d,#091525 55%,#06101b)!important;color:var(--fc-text)!important;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,Helvetica,Arial,sans-serif!important}
    body{margin:0!important;padding:24px!important;min-height:100vh!important;overflow:auto!important}
    body>main,body>.container,body>.wrap,body>.card{width:min(920px,100%)!important;margin:0 auto!important;border:1px solid var(--fc-border)!important;border-radius:18px!important;background:linear-gradient(160deg,rgba(15,32,53,.98),rgba(8,22,38,.98))!important;box-shadow:0 24px 70px rgba(0,0,0,.38)!important;padding:28px!important}
    body>main:before,body>.container:before,body>.wrap:before,body>.card:before{content:"";display:block;width:46px;height:46px;margin:0 0 12px;background:url("data:image/svg+xml;base64,${logo}") center/contain no-repeat}
    h1,h2,h3,strong,label,summary{color:var(--fc-text)!important}p,span,small{color:var(--fc-muted)}
    button{border:0!important;border-radius:10px!important;background:linear-gradient(135deg,#147be9,#299cff)!important;color:white!important;font-weight:800!important;padding:12px 18px!important}
    input,select,textarea,pre{border:1px solid var(--fc-border)!important;border-radius:10px!important;background:#071423!important;color:white!important}
    progress{accent-color:var(--fc-blue)!important;width:100%!important}a{color:#67baff!important}
    @media(max-width:700px){body{padding:12px!important}body>main,body>.container,body>.wrap,body>.card{padding:18px!important}}
  `;
}

function handleEmbeddedNavigation(url) {
  const kind = classifyInstallerUrl(url, activeHost);
  if (kind === 'progress') return true;
  if (kind === 'first-setup') {
    appendLog(`Held unauthenticated embedded First Setup navigation until authenticated acceptance: ${url}`);
    return false;
  }
  appendLog(`Blocked embedded navigation: ${String(url).slice(0, 500)}`);
  return false;
}

function showEmbeddedProgress(host) {
  if (!mainWindow || mainWindow.isDestroyed()) throw new Error('The installer window is unavailable.');
  activeHost = normalizeHost(host);
  hideEmbeddedProgress();
  progressView = new WebContentsView({
    webPreferences: {
      partition: 'flightcore-progress', contextIsolation: true, nodeIntegration: false,
      sandbox: true, webSecurity: true, allowRunningInsecureContent: false
    }
  });
  progressView.setBackgroundColor('#07111f');
  progressView.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  progressView.webContents.on('will-attach-webview', event => event.preventDefault());
  progressView.webContents.on('will-navigate', (event, url) => { if (!handleEmbeddedNavigation(url)) event.preventDefault(); });
  progressView.webContents.on('will-redirect', (event, url) => { if (!handleEmbeddedNavigation(url)) event.preventDefault(); });
  progressView.webContents.setWindowOpenHandler(({ url }) => { handleEmbeddedNavigation(url); return { action: 'deny' }; });
  progressView.webContents.on('did-finish-load', () => { progressView?.webContents.insertCSS(embeddedCss()).catch(() => {}); });
  mainWindow.contentView.addChildView(progressView);
  resizeProgressView();
  emit('embedded-visible');
  const url = progressUrl(activeHost);
  appendLog(`Loading isolated embedded progress UI: ${url}`);
  progressView.webContents.loadURL(url);
}

function createWindow() {
  const capturePath = process.env.FLIGHTCORE_CAPTURE_UI || '';
  mainWindow = new BrowserWindow({
    width: 780, height: 760, minWidth: 680, minHeight: 620,
    backgroundColor: '#07111f', title: 'FlightCore Installer', show: false,
    autoHideMenuBar: process.platform !== 'darwin',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), contextIsolation: true,
      nodeIntegration: false, sandbox: true, offscreen: Boolean(capturePath)
    }
  });
  installEditableContextMenu(mainWindow.webContents);
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => { if (!capturePath) mainWindow.show(); });
  if (capturePath) {
    mainWindow.webContents.once('did-finish-load', async () => {
      const image = await mainWindow.webContents.capturePage();
      fs.writeFileSync(capturePath, image.toPNG());
      app.quit();
    });
  }
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.on('resize', resizeProgressView);
  mainWindow.on('maximize', resizeProgressView);
  mainWindow.on('unmaximize', resizeProgressView);
}

function timestamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function beginLog(host, username) {
  activeLogPath = path.join(app.getPath('downloads'), `FLIGHTCORE_FRESH_INSTALL_${timestamp()}.log`);
  fs.writeFileSync(activeLogPath, [
    'FlightCore Fresh Installer', `Started: ${new Date().toISOString()}`,
    `Target: ${username}@${host}`, `Launcher: ${app.getVersion()}`, ''
  ].join('\n'), { mode: 0o600 });
  return activeLogPath;
}

function appendLog(line) {
  if (!activeLogPath) return;
  const safe = redactLine(line);
  fs.appendFileSync(activeLogPath, safe.endsWith('\n') ? safe : `${safe}\n`);
}

function knownHostsPath() { return path.join(app.getPath('userData'), 'known-hosts.json'); }
function readKnownHosts() {
  try {
    const parsed = JSON.parse(fs.readFileSync(knownHostsPath(), 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch { return {}; }
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
    host, port: 22, username, password, readyTimeout: 15000,
    keepaliveInterval: 5000, keepaliveCountMax: 3, hostHash: 'sha256', hostVerifier,
    algorithms: { serverHostKey: ['ssh-ed25519', 'ecdsa-sha2-nistp256', 'rsa-sha2-512', 'rsa-sha2-256'] }
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
    const finish = err => {
      if (settled) return;
      settled = true;
      client.end();
      if (err) return reject(friendlySshError(err));
      if (!digest) return reject(new Error('Could not read the Raspberry Pi SSH identity.'));
      const known = readKnownHosts()[host]?.fingerprint || null;
      const matchesKnown = Boolean(known && known.length === digest.length && crypto.timingSafeEqual(Buffer.from(known), Buffer.from(digest)));
      resolve({ host, username, fingerprint: digest, fingerprintLabel: fingerprintLabel(digest), trustState: !known ? 'new' : matchesKnown ? 'trusted' : 'changed', previousFingerprintLabel: known ? fingerprintLabel(known) : null });
    };
    client.on('ready', () => finish());
    client.on('error', finish);
    client.connect(connectionOptions({ host, username, password, hostVerifier: hash => { digest = String(hash).toLowerCase(); return true; } }));
  });
}

function verifiedHost(received, approved) {
  const got = String(received).toLowerCase();
  return got.length === approved.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(approved));
}

function executeSsh(credentials, command, timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    const client = new Client();
    activeClient = client;
    let settled = false;
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => finish(new Error('The authenticated Raspberry Pi check timed out.')), timeoutMs);
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      client.end();
      if (activeClient === client) activeClient = null;
      if (error) reject(friendlySshError(error)); else resolve(result);
    };
    client.on('ready', () => {
      client.exec(command, { pty: false }, (error, stream) => {
        if (error) return finish(error);
        stream.on('data', data => { stdout += data.toString('utf8'); });
        stream.stderr.on('data', data => { stderr += data.toString('utf8'); });
        stream.on('close', (code, signal) => finish(null, { stdout, stderr, code, signal }));
      });
    });
    client.on('error', error => finish(error));
    client.connect(connectionOptions({ ...credentials, hostVerifier: hash => verifiedHost(hash, credentials.fingerprint) }));
  });
}

function probePort(host, port, timeoutMs = 1200) {
  return new Promise(resolve => {
    const socket = net.createConnection({ host, port });
    const finish = value => { socket.destroy(); resolve(value); };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

async function waitForPort(host, port, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await probePort(host, port)) return true;
    await delay(900);
  }
  return false;
}

function requestUrl(url, { json = false, timeoutMs = 4000 } = {}) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, { timeout: timeoutMs, headers: { Accept: json ? 'application/json' : 'text/html' } }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { if (body.length < 1024 * 1024) body += chunk; });
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 400) return reject(new Error(`HTTP ${response.statusCode}`));
        if (!json) return resolve({ statusCode: response.statusCode, body });
        try { resolve(JSON.parse(body)); } catch { reject(new Error('Port 8090 returned invalid status data.')); }
      });
    });
    request.on('timeout', () => request.destroy(new Error('Request timed out.')));
    request.on('error', reject);
  });
}

async function inspectRemote() {
  const result = await executeSsh(activeCredentials, buildRemoteInspectionCommand(), 30000);
  if (result.code !== 0 || !/^VERSION=/m.test(result.stdout)) throw new Error('Authenticated installation status check was interrupted.');
  const report = parseRemoteInspection(result.stdout);
  appendLog(`Authenticated status: ${JSON.stringify(report)}`);
  return { report, classification: classifyRemoteInspection(report) };
}

async function appendRemoteFailureEvidence() {
  if (!activeCredentials) return;
  const command = [
    'set +e',
    `echo '--- ${REMOTE_BOOTSTRAP_LOG} ---'`,
    `sudo -n tail -n 180 '${REMOTE_BOOTSTRAP_LOG}' 2>&1`,
    `echo '--- journal ${REMOTE_UNIT} ---'`,
    `sudo -n journalctl -u '${REMOTE_UNIT}' -n 120 --no-pager 2>&1`
  ].join('\n');
  try {
    const result = await executeSsh(activeCredentials, command, 30000);
    appendLog(result.stdout);
    appendLog(result.stderr);
  } catch (error) { appendLog(`Could not collect remote failure evidence: ${error.message}`); }
}

async function cleanupRemoteLauncher() {
  const command = [
    'set +e',
    `sudo -n systemctl disable --now '${REMOTE_UNIT}' >/dev/null 2>&1`,
    `sudo -n rm -f '/etc/systemd/system/${REMOTE_UNIT}'`,
    `sudo -n rm -rf '${REMOTE_ROOT}'`,
    'sudo -n systemctl daemon-reload'
  ].join('\n');
  try {
    const result = await executeSsh(activeCredentials, command, 30000);
    appendLog(`Remote launcher cleanup finished with code ${result.code ?? 'unknown'}.`);
  } catch (error) { appendLog(`Remote launcher cleanup deferred: ${error.message}`); }
}

async function handoffToFirstSetup(host) {
  if (firstSetupHandoffStarted) return;
  firstSetupHandoffStarted = true;
  const url = firstSetupUrl(host);
  appendLog(`Authenticated release acceptance and First Setup readiness verified: ${url}`);
  emit('accepted', { url });
  try {
    await shell.openExternal(url);
    appendLog('First Setup opened in the default browser. Native installer closing.');
    app.quit();
  } catch (error) {
    firstSetupHandoffStarted = false;
    throw new Error(`Could not open FlightCore First Setup: ${error?.message || String(error)}`);
  }
}

async function finalizeIfAccepted(host) {
  const inspection = await inspectRemote();
  if (inspection.classification !== 'accepted') return inspection;
  await requestUrl(firstSetupUrl(host), { timeoutMs: 5000 });
  await cleanupRemoteLauncher();
  await handoffToFirstSetup(host);
  return inspection;
}

async function monitorInstallation(host) {
  const deadline = Date.now() + INSTALL_TIMEOUT_MS;
  let signature = '';
  let lastChange = Date.now();
  let outageStarted = 0;
  let completionSeen = false;

  while (Date.now() < deadline && activeRun && !firstSetupHandoffStarted) {
    await delay(2000);
    try {
      const state = await requestUrl(progressStateUrl(host), { json: true, timeoutMs: 4500 });
      outageStarted = 0;
      const nextSignature = progressStateSignature(state);
      if (nextSignature && nextSignature !== signature) {
        signature = nextSignature;
        lastChange = Date.now();
      }
      emit('monitor-state', { state });
      const status = String(state.status || '').toLowerCase();
      if (/fail|error|rollback/.test(status) || state.error) throw new Error(`Remote installer failure: ${state.error || status}.`);
      if (/complete|completed|success|done/.test(status)) completionSeen = true;

      if (completionSeen) {
        const result = await finalizeIfAccepted(host);
        if (result.classification === 'failed' || result.classification === 'incomplete') throw new Error('FlightCore reported completion without a valid accepted release.');
      }

      if (Date.now() - lastChange > STATE_STALE_MS) {
        const result = await finalizeIfAccepted(host);
        if (result.classification === 'accepted') return;
        throw new Error('FlightCore installation stopped updating on port 8090. The installer did not accept an incomplete or frozen release.');
      }
    } catch (error) {
      if (/Remote installer failure|stopped updating|without a valid accepted release/.test(error.message)) throw error;
      if (!outageStarted) outageStarted = Date.now();
      emit('monitor-status', { message: 'Progress interface unavailable; checking the Raspberry Pi securely…' });
      try {
        const result = await finalizeIfAccepted(host);
        if (result.classification === 'accepted') return;
        if (result.classification === 'failed') throw new Error('The authenticated Raspberry Pi status shows that installation failed.');
        if (result.classification === 'incomplete' && Date.now() - outageStarted > 30000) throw new Error('The progress interface disappeared before FlightCore produced an accepted release.');
      } catch (inspectionError) {
        if (/shows that installation failed|disappeared before/.test(inspectionError.message)) throw inspectionError;
        appendLog(`Transient monitoring interruption: ${inspectionError.message}`);
      }
      if (Date.now() - outageStarted > REBOOT_GRACE_MS) throw new Error('The Raspberry Pi did not return after the installation restart window.');
    }
  }
  if (!firstSetupHandoffStarted) throw new Error('FlightCore installation exceeded the 30-minute safety limit.');
}

async function failRun(error) {
  const message = error?.message || String(error);
  await appendRemoteFailureEvidence();
  activeRun = false;
  appendLog(`FAIL: ${message}`);
  hideEmbeddedProgress();
  emit('failed', { message, logPath: activeLogPath });
  throw new Error(message);
}

async function runInstall(input) {
  if (activeRun) throw new Error('An installation is already running.');
  const host = normalizeHost(input.host);
  const username = normalizeUsername(input.username);
  const password = String(input.password || '');
  const fingerprint = String(input.fingerprint || '').toLowerCase();
  if (!password) throw new Error('Enter the Raspberry Pi password.');
  fingerprintLabel(fingerprint);
  activeRun = true;
  firstSetupHandoffStarted = false;
  activeCredentials = { host, username, password, fingerprint };
  const logPath = beginLog(host, username);
  appendLog(`Approved SSH fingerprint: ${fingerprintLabel(fingerprint)}`);
  emit('run-started', { host, logPath });

  try {
    saveKnownHost(host, fingerprint);
    emit('connected');
    const launcher = await executeSsh(activeCredentials, buildRemoteInstallCommand(), 120000);
    appendLog(launcher.stdout);
    appendLog(launcher.stderr);
    emit('output', { stream: 'stdout', text: redactLine(launcher.stdout) });
    emit('output', { stream: 'stderr', text: redactLine(launcher.stderr) });
    if (launcher.code !== 0) throw new Error(`The detached FlightCore installer could not be started (exit ${launcher.code ?? 'unknown'}).`);
    emit('installer-started');
    appendLog('Persistent guarded installer service started; SSH launcher detached.');

    const ready = await waitForPort(host, PROGRESS_PORT, PROGRESS_READY_TIMEOUT_MS);
    if (!ready) {
      const result = await finalizeIfAccepted(host);
      if (result.classification === 'accepted') return { ok: true, logPath };
      throw new Error('The FlightCore installation interface did not become ready on port 8090.');
    }

    emit('progress-ready', { url: progressUrl(host), embedded: true });
    showEmbeddedProgress(host);
    await monitorInstallation(host);
    return { ok: true, logPath };
  } catch (error) {
    return failRun(error);
  }
}

ipcMain.handle('probe-host', async (_event, input) => probeFingerprint(input));
ipcMain.handle('start-install', async (_event, input) => runInstall(input));
ipcMain.handle('show-log', async () => activeLogPath ? shell.showItemInFolder(activeLogPath) : false);
ipcMain.handle('get-app-info', async () => ({ version: app.getVersion(), platform: process.platform }));
ipcMain.handle('fit-window', async (_event, size) => fitWindow(size));

app.whenReady().then(() => { installApplicationMenu(); createWindow(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on('before-quit', () => {
  if (activeClient) activeClient.end();
  if (progressView) { try { progressView.webContents.close(); } catch {} }
});
