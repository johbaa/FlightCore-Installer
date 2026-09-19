'use strict';

const byId = id => document.getElementById(id);
const helperState = byId('helperState');
const confirmation = byId('wiringConfirmed');
const runButton = byId('runButton');
const output = byId('recoveryOutput');
const runState = byId('runState');
const result = byId('resultBanner');
const afterSuccess = byId('afterSuccess');
const endpoint = 'http://127.0.0.1:8765';

const fragmentToken = new URLSearchParams(location.hash.slice(1)).get('helper');
if (fragmentToken) sessionStorage.setItem('sparkRecoveryHelperToken', fragmentToken);
const token = fragmentToken || sessionStorage.getItem('sparkRecoveryHelperToken') || '';
if (fragmentToken) history.replaceState({}, '', location.pathname);

let connected = false;
let latest = null;
let polling = false;

function api(path, options) {
  return fetch(`${endpoint}${path}?token=${encodeURIComponent(token)}`, { cache: 'no-store', ...options });
}

function setConnected(value) {
  connected = value;
  helperState.classList.toggle('connected', value);
  helperState.classList.toggle('disconnected', !value);
  helperState.querySelector('b').textContent = value ? 'Local helper connected' : 'Local helper not connected';
  refreshButton();
}

function refreshButton() {
  const running = Boolean(latest?.running);
  runButton.disabled = !connected || !confirmation.checked || running;
  runButton.textContent = !connected ? 'Connect helper to continue' : running ? 'Recovery running…' : 'Start battery revival';
}

function showResult(kind, text) {
  result.hidden = false;
  result.className = `result-banner ${kind}`;
  result.textContent = text;
}

function render(state) {
  latest = state;
  setConnected(true);
  if (state.output) {
    const wasAtBottom = output.scrollHeight - output.scrollTop - output.clientHeight < 70;
    output.textContent = state.output;
    if (wasAtBottom) output.scrollTop = output.scrollHeight;
  } else if (!state.running && !state.finished) {
    output.textContent = 'Helper connected. Confirm the wiring, then start recovery.';
  }
  runState.textContent = state.running ? 'Running' : state.finished ? (state.exitCode === 0 ? 'Finished' : 'Stopped') : 'Ready';
  afterSuccess.hidden = true;
  if (state.finished) {
    const verified = state.exitCode === 0 && /PASS: PFStatus cleared to zero and the gauge was resealed\./.test(state.output);
    if (verified) {
      showResult('success', 'PASS — PFStatus is zero and the battery gauge is sealed.');
      afterSuccess.hidden = false;
    } else if (state.exitCode === 0 && /PFStatus is already zero/.test(state.output)) {
      showResult('success', 'PASS — PFStatus was already zero; no reset was needed.');
      afterSuccess.hidden = false;
    } else {
      showResult('failure', 'Recovery stopped. Read the final FAIL or BLOCKED message below; do not charge this pack until the cause is resolved.');
    }
  }
  refreshButton();
}

async function poll() {
  if (!token || polling) return;
  polling = true;
  try {
    const response = await api('/status');
    if (!response.ok) throw new Error('helper rejected request');
    render(await response.json());
  } catch {
    setConnected(false);
  } finally {
    polling = false;
  }
}

confirmation.addEventListener('change', refreshButton);
runButton.addEventListener('click', async () => {
  if (!connected || !confirmation.checked || latest?.running) return;
  result.hidden = true;
  afterSuccess.hidden = true;
  output.textContent = 'Starting recovery…\n';
  runState.textContent = 'Starting';
  runButton.disabled = true;
  try {
    const response = await api('/run', { method: 'POST' });
    if (!response.ok) throw new Error((await response.json()).error || 'start failed');
    latest = { running: true, finished: false, output: output.textContent };
    refreshButton();
  } catch (error) {
    showResult('failure', `Could not start recovery: ${error.message}`);
    await poll();
  }
});

poll();
setInterval(poll, 700);
