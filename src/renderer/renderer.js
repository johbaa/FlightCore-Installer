'use strict';

const $ = id => document.getElementById(id);
const state = { host: '', username: 'pi', password: '', fingerprint: '', progressUrl: '' };

function setStep(step) {
  document.querySelectorAll('.rail-step').forEach(node => {
    const n = Number(node.dataset.step);
    node.classList.toggle('done', n < step);
    node.classList.toggle('active', n === step);
  });
  $('railFill').style.width = `${Math.max(0, Math.min(3, step - 1)) * 25}%`;
}

function show(panel) {
  ['connectPanel', 'trustPanel', 'runPanel'].forEach(id => $(id).classList.toggle('hidden', id !== panel));
}

function busy(button, text) {
  button.disabled = true;
  button.querySelector('span').textContent = text;
}

function appendOutput(text) {
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
    $('installButton').disabled = !($('trustCheck').checked);
    setStep(2);
    show('trustPanel');
  } catch (error) {
    $('formError').textContent = error.message || String(error);
  } finally {
    $('connectButton').disabled = false;
    $('connectButton').querySelector('span').textContent = 'Connect and verify';
  }
});

$('trustCheck').addEventListener('change', () => $('installButton').disabled = !$('trustCheck').checked);
$('backButton').addEventListener('click', () => { state.password = ''; $('password').value = ''; setStep(1); show('connectPanel'); });
$('installButton').addEventListener('click', async () => {
  $('trustError').textContent = '';
  setStep(3);
  show('runPanel');
  try {
    await window.flightcore.startInstall(state);
  } catch (error) {
    if (!$('runError').textContent) $('runError').textContent = error.message || String(error);
  }
});

$('openButton').addEventListener('click', () => window.flightcore.openProgress(state.host));
$('logButton').addEventListener('click', () => window.flightcore.showLog());

window.flightcore.onEvent(event => {
  switch (event.type) {
    case 'run-started':
      $('activityTitle').textContent = 'Connecting securely';
      $('activityText').textContent = `Authenticating with ${event.host}…`;
      break;
    case 'connected':
      $('activityTitle').textContent = 'Raspberry Pi connected';
      $('activityText').textContent = 'Starting the verified public FlightCore installer…';
      break;
    case 'installer-started':
      $('activityTitle').textContent = 'FlightCore installer started';
      $('activityText').textContent = 'Waiting for the existing installation interface on port 8090…';
      break;
    case 'output': appendOutput(event.text); break;
    case 'progress-ready':
      state.progressUrl = event.url;
      state.password = '';
      $('password').value = '';
      setStep(4);
      $('runTitle').textContent = 'Installation in progress';
      $('activityTitle').textContent = 'Installation interface is ready';
      $('activityText').textContent = 'The FlightCore installation interface is loading securely in this window.';
      break;
    case 'command-ended':
      appendOutput(`\nSSH launcher ended with code ${event.code ?? 'unknown'}; installation status remains in the embedded interface.\n`);
      break;
    case 'failed':
      $('spinner').classList.add('hidden');
      $('runStatus').textContent = 'Failed';
      $('runStatus').classList.remove('working');
      $('runTitle').textContent = 'Installation could not be started';
      $('runError').textContent = event.message;
      $('logButton').classList.remove('hidden');
      break;
  }
});

window.flightcore.getAppInfo().then(info => { $('version').textContent = `v${info.version}`; });
setStep(1);
