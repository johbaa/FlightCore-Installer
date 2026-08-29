'use strict';

const $ = id => document.getElementById(id);
const state = { host: '', username: 'pi', password: '', fingerprint: '' };
const elapsedClock = { baseSeconds: 0, sampledAtMs: 0, lastRemoteSeconds: null, running: false };

function formatElapsed(seconds) {
  const value = Math.max(0, Math.floor(Number(seconds) || 0));
  return `Elapsed ${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

function displayedElapsed(nowMs = Date.now()) {
  if (!elapsedClock.running) return elapsedClock.baseSeconds;
  return window.flightcore.projectedElapsedSeconds(elapsedClock.baseSeconds, elapsedClock.sampledAtMs, nowMs);
}

function renderElapsed(nowMs = Date.now()) {
  $('embeddedElapsed').textContent = formatElapsed(displayedElapsed(nowMs));
}

function startElapsedClock() {
  elapsedClock.baseSeconds = 0;
  elapsedClock.sampledAtMs = Date.now();
  elapsedClock.lastRemoteSeconds = null;
  elapsedClock.running = true;
  renderElapsed();
}

function syncElapsedClock(remoteState) {
  const now = Date.now();
  const value = Number(remoteState?.elapsed_seconds ?? remoteState?.elapsed);
  if (Number.isFinite(value) && value >= 0 && (elapsedClock.lastRemoteSeconds === null || value > elapsedClock.lastRemoteSeconds)) {
    elapsedClock.baseSeconds = Math.max(Math.floor(value), displayedElapsed(now));
    elapsedClock.sampledAtMs = now;
    elapsedClock.lastRemoteSeconds = value;
  }
  const status = String(remoteState?.status || '').toLowerCase();
  if (/complete|completed|success|done|fail|error|rollback/.test(status)) {
    elapsedClock.baseSeconds = displayedElapsed(now);
    elapsedClock.sampledAtMs = now;
    elapsedClock.running = false;
  }
  renderElapsed(now);
}

function setStep(step) {
  document.querySelectorAll('.rail-step').forEach(node => {
    const n = Number(node.dataset.step);
    node.classList.toggle('done', n < step);
    node.classList.toggle('active', n === step);
  });
  $('railFill').style.width = `${Math.max(0, Math.min(3, step - 1)) * 25}%`;
}

function fitCurrentPanel(preferred = {}) {
  requestAnimationFrame(() => {
    const shell = document.querySelector('.shell');
    const natural = Math.ceil(shell.scrollHeight + 2);
    window.flightcore.fitWindow({ width: preferred.width || 780, height: preferred.height || Math.max(660, natural) });
  });
}

function show(panel) {
  ['connectPanel', 'trustPanel', 'runPanel'].forEach(id => $(id).classList.toggle('hidden', id !== panel));
  fitCurrentPanel();
}

function showEmbeddedHeader(visible) {
  document.body.classList.toggle('embedded-stage', visible);
  $('embeddedBrandbar').classList.toggle('hidden', !visible);
  if (visible) window.flightcore.fitWindow({ width: 900, height: 780 });
  else fitCurrentPanel();
}

function busy(button, text) {
  button.disabled = true;
  button.querySelector('span').textContent = text;
}

function appendOutput(text) {
  if (!text) return;
  const output = $('technicalOutput');
  output.textContent += text;
  if (output.textContent.length > 30000) output.textContent = output.textContent.slice(-30000);
  output.scrollTop = output.scrollHeight;
}

$('connectForm').addEventListener('submit', async event => {
  event.preventDefault();
  $('formError').textContent = '';
  state.host = $('host').value.trim();
  state.username = $('username').value.trim();
  state.password = $('password').value;
  busy($('connectButton'), 'Checking connection…');
  try {
    const result = await window.flightcore.probeHost(state);
    state.fingerprint = result.fingerprint;
    $('fingerprint').textContent = result.fingerprintLabel;
    $('previousBlock').classList.toggle('hidden', result.trustState !== 'changed');
    $('previousFingerprint').textContent = result.previousFingerprintLabel || '';
    if (result.trustState === 'changed') {
      $('trustTitle').textContent = 'The Raspberry Pi identity changed';
      $('trustMessage').textContent = 'This can be expected after preparing a fresh SD card, but it can also indicate that the address belongs to a different device. Compare the fingerprints before replacing the trusted identity.';
      $('trustCheckText').textContent = 'I confirm the Raspberry Pi was rebuilt or replaced and I trust this new identity.';
      $('installButton').querySelector('span').textContent = 'Trust replacement and install';
    } else if (result.trustState === 'trusted') {
      $('trustTitle').textContent = 'Raspberry Pi verified';
      $('trustMessage').textContent = 'The SSH identity matches the unit previously trusted at this address.';
      $('trustCheckText').textContent = 'I confirm that this is the intended Raspberry Pi.';
      $('installButton').querySelector('span').textContent = 'Start installation';
    } else {
      $('trustTitle').textContent = 'Confirm this Raspberry Pi';
      $('trustMessage').textContent = 'This is the first time FlightCore Installer has seen this unit. Confirm its SSH identity before installation starts.';
      $('trustCheckText').textContent = 'I confirm that this is the intended Raspberry Pi.';
      $('installButton').querySelector('span').textContent = 'Trust and start installation';
    }
    $('trustCheck').checked = result.trustState === 'trusted';
    $('installButton').disabled = !$('trustCheck').checked;
    setStep(2);
    show('trustPanel');
  } catch (error) {
    $('formError').textContent = error.message || String(error);
    fitCurrentPanel();
  } finally {
    $('connectButton').disabled = false;
    $('connectButton').querySelector('span').textContent = 'Connect and verify';
  }
});

$('trustCheck').addEventListener('change', () => { $('installButton').disabled = !$('trustCheck').checked; });
$('backButton').addEventListener('click', () => {
  state.password = '';
  $('password').value = '';
  setStep(1);
  show('connectPanel');
});
$('installButton').addEventListener('click', async () => {
  $('trustError').textContent = '';
  setStep(3);
  show('runPanel');
  try { await window.flightcore.startInstall(state); }
  catch (error) { if (!$('runError').textContent) $('runError').textContent = error.message || String(error); }
});
$('logButton').addEventListener('click', () => window.flightcore.showLog());

window.flightcore.onEvent(event => {
  switch (event.type) {
    case 'run-started':
      $('activityTitle').textContent = 'Connecting securely';
      $('activityText').textContent = `Authenticating with ${event.host}…`;
      break;
    case 'connected':
      $('activityTitle').textContent = 'Raspberry Pi connected';
      $('activityText').textContent = 'Starting an isolated installation transaction…';
      break;
    case 'installer-started':
      $('activityTitle').textContent = 'FlightCore installer started';
      $('activityText').textContent = 'Waiting for the installation interface on port 8090…';
      break;
    case 'output': appendOutput(event.text); break;
    case 'progress-ready':
      state.password = '';
      $('password').value = '';
      setStep(4);
      $('runTitle').textContent = 'Installation in progress';
      $('activityTitle').textContent = 'Installation interface is ready';
      $('activityText').textContent = 'Progress and authenticated release acceptance are being monitored independently.';
      startElapsedClock();
      showEmbeddedHeader(true);
      break;
    case 'monitor-state': {
      const remote = event.state || {};
      syncElapsedClock(remote);
      const label = remote.stage || remote.message || remote.status;
      if (label) $('activityText').textContent = String(label);
      break;
    }
    case 'monitor-status':
      if (event.message) $('activityText').textContent = event.message;
      break;
    case 'accepted':
      showEmbeddedHeader(false);
      setStep(4);
      $('spinner').classList.add('hidden');
      $('runStatus').textContent = 'Accepted';
      $('runTitle').textContent = 'FlightCore installation accepted';
      $('handoff').classList.remove('hidden');
      fitCurrentPanel();
      break;
    case 'embedded-hidden':
      showEmbeddedHeader(false);
      break;
    case 'failed':
      showEmbeddedHeader(false);
      show('runPanel');
      $('spinner').classList.add('hidden');
      $('runStatus').textContent = 'Failed';
      $('runStatus').classList.remove('working');
      $('runTitle').textContent = 'Installation did not complete';
      $('runError').textContent = event.message;
      $('logButton').classList.remove('hidden');
      fitCurrentPanel();
      break;
  }
});

window.flightcore.getAppInfo().then(info => { $('version').textContent = `v${info.version}`; });
setInterval(() => { if (elapsedClock.running) renderElapsed(); }, 1000);
window.addEventListener('load', () => fitCurrentPanel());
window.addEventListener('resize', () => {
  if (!document.body.classList.contains('embedded-stage')) document.body.classList.toggle('compact', window.innerWidth < 620);
});
setStep(1);
