'use strict';

const INSTALLER_URL = 'https://raw.githubusercontent.com/johbaa/SIYI_PI_Installer/main/install.sh';
const PROGRESS_PORT = 8090;
const SETUP_PORT = 8080;
const REMOTE_UNIT = 'flightcore-native-installer.service';
const REMOTE_ROOT = '/var/lib/flightcore-native-installer';
const REMOTE_BOOTSTRAP = `${REMOTE_ROOT}/install.sh`;
const REMOTE_BOOTSTRAP_LOG = '/var/log/flightcore-native-installer-bootstrap.log';

function normalizeHost(value) {
  const host = String(value || '').trim();
  if (!host || host.length > 253) throw new Error('Enter the Raspberry Pi IP address or host name.');
  if (/\s|[\/@'"`$;&|<>()[\]{}]/.test(host)) throw new Error('The Raspberry Pi address contains unsupported characters.');
  if (host.startsWith('-') || host.endsWith('.')) throw new Error('The Raspberry Pi address is not valid.');
  if (!/^[A-Za-z0-9:._-]+$/.test(host)) throw new Error('The Raspberry Pi address is not valid.');
  return host;
}

function normalizeUsername(value) {
  const username = String(value || 'pi').trim();
  if (!/^[a-z_][a-z0-9_-]{0,31}$/i.test(username)) throw new Error('The SSH user name is not valid.');
  return username;
}

function hostForUrl(value) {
  const host = normalizeHost(value);
  return host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
}

function progressUrl(host) { return `http://${hostForUrl(host)}:${PROGRESS_PORT}/`; }
function progressStateUrl(host) { return `http://${hostForUrl(host)}:${PROGRESS_PORT}/state`; }
function firstSetupUrl(host) { return `http://${hostForUrl(host)}:${SETUP_PORT}/first_setup`; }

function classifyInstallerUrl(value, host) {
  let candidate;
  try { candidate = new URL(String(value || '')); } catch { return 'blocked'; }
  const expectedProgress = new URL(progressUrl(host));
  const expectedSetup = new URL(firstSetupUrl(host));
  if (candidate.username || candidate.password) return 'blocked';
  if (candidate.protocol !== 'http:' || candidate.hostname !== expectedProgress.hostname) return 'blocked';
  if (candidate.port === expectedProgress.port) return 'progress';
  if (candidate.port === expectedSetup.port && candidate.pathname === expectedSetup.pathname) return 'first-setup';
  return 'blocked';
}

function fingerprintLabel(hexDigest) {
  const clean = String(hexDigest || '').replace(/[^a-fA-F0-9]/g, '').toLowerCase();
  if (clean.length !== 64) throw new Error('The Raspberry Pi returned an invalid SSH fingerprint.');
  return `SHA256 ${clean.match(/.{1,4}/g).join(' ')}`;
}

function buildRemoteInstallCommand() {
  return [
    'set -eu',
    'umask 077',
    `unit='${REMOTE_UNIT}'`,
    `root='${REMOTE_ROOT}'`,
    `script='${REMOTE_BOOTSTRAP}'`,
    `log='${REMOTE_BOOTSTRAP_LOG}'`,
    'if sudo -n systemctl is-active --quiet "$unit"; then echo "FlightCore installer transaction is already active"; exit 75; fi',
    'if sudo -n test -s /etc/siyi/release_version || test -e /home/pi/siyi-webui/server.py; then echo "FlightCore installation markers already exist"; exit 3; fi',
    'tmp="$(mktemp /tmp/flightcore-public-install.XXXXXX)"',
    'cleanup(){ rm -f "$tmp"; }',
    'trap cleanup EXIT HUP INT TERM',
    `curl -fsSL --connect-timeout 15 --max-time 120 '${INSTALLER_URL}' -o "$tmp"`,
    'test -s "$tmp"',
    "head -n 1 \"$tmp\" | grep -Eq '^#!.*(ba)?sh'",
    'sudo -n install -d -m 700 "$root"',
    'sudo -n install -m 700 "$tmp" "$script"',
    'sudo -n touch "$log"',
    'sudo -n chmod 600 "$log"',
    '# A transient unit survives the app and SSH session, but is not installed or enabled at boot.',
    '# The canonical installer exclusively owns its deliberate reboot and post-reboot verifier.',
    'sudo -n systemctl reset-failed "$unit" >/dev/null 2>&1 || true',
    'sudo -n systemd-run --unit="$unit" --collect --no-block --property=Type=exec --property=TimeoutStartSec=infinity --property="StandardOutput=append:$log" --property="StandardError=append:$log" /bin/bash "$script" >/dev/null',
    'state=""',
    'for _try in $(seq 1 50); do',
    '  state="$(sudo -n systemctl is-active "$unit" 2>/dev/null || true)"',
    '  case "$state" in active|activating) break;; failed) break;; esac',
    '  sleep 0.1',
    'done',
    'case "$state" in active|activating) ;; *) echo "Detached installer failed to start: ${state:-unknown}"; exit 1;; esac',
    'echo "Detached FlightCore installer started: $state"'
  ].join('\n');
}

function buildRemoteInspectionCommand() {
  return [
    'set +e',
    'read_first(){ for f in "$@"; do if sudo -n test -s "$f"; then sudo -n head -n 1 "$f"; return; fi; done; }',
    'printf "VERSION=%s\\n" "$(read_first /etc/siyi/release_version)"',
    'printf "BUILD=%s\\n" "$(read_first /etc/siyi/release_build /etc/siyi/build_id /etc/siyi/build)"',
    'printf "STATUS=%s\\n" "$(read_first /etc/siyi/release_status /etc/siyi/install_status /var/lib/siyi/release_status)"',
    'printf "WEBUI=%s\\n" "$(sudo -n systemctl is-active siyi-webui 2>/dev/null || true)"',
    'printf "POSTINSTALL=%s\\n" "$(sudo -n systemctl is-active siyi-postinstall-verify.service 2>/dev/null || true)"',
    `printf "JOB=%s\\n" "$(sudo -n systemctl is-active ${REMOTE_UNIT} 2>/dev/null || true)"`,
    `printf "RESULT=%s\\n" "$(sudo -n systemctl show ${REMOTE_UNIT} -p Result --value 2>/dev/null || true)"`
  ].join('\n');
}

function parseRemoteInspection(text) {
  const result = { version: '', build: '', status: '', webui: '', postinstall: '', job: '', result: '' };
  const keys = { VERSION: 'version', BUILD: 'build', STATUS: 'status', WEBUI: 'webui', POSTINSTALL: 'postinstall', JOB: 'job', RESULT: 'result' };
  for (const line of String(text || '').split(/\r?\n/)) {
    const match = line.match(/^([A-Z]+)=(.*)$/);
    if (match && keys[match[1]]) result[keys[match[1]]] = match[2].trim();
  }
  return result;
}

function classifyRemoteInspection(report) {
  const versionValid = /^\d+\.\d+\.\d+(?:-rc\.\d+)?$/.test(report.version || '');
  const buildValid = Boolean(String(report.build || '').trim());
  const accepted = ['accepted', 'core_accepted_hardware_pending'].includes(report.status);
  if (accepted && versionValid && buildValid && report.webui === 'active') return 'accepted';
  if (accepted) return 'failed';
  if (['rollback_failed', 'failed_post_reboot'].includes(report.status)) return 'failed';
  if (report.job === 'failed') return 'failed';
  if (report.result && !['success', ''].includes(report.result)) return 'failed';
  if (['active', 'activating'].includes(report.job) || ['active', 'activating'].includes(report.postinstall) || report.status === 'pending_reboot') return 'working';
  if (!report.version && !report.status && ['', 'inactive', 'unknown', 'failed'].includes(report.job)) return 'failed';
  return 'incomplete';
}

function progressStateSignature(state) {
  if (!state || typeof state !== 'object') return '';
  return JSON.stringify({
    status: state.status ?? null, progress: state.progress ?? null, stage: state.stage ?? null,
    elapsed_seconds: state.elapsed_seconds ?? state.elapsed ?? null, updated_at: state.updated_at ?? null,
    error: state.error ?? null, log_tail: state.log_tail ?? null
  });
}

function clampWindowPosition(currentBounds, nextBounds, workArea) {
  const current = currentBounds || {};
  const next = nextBounds || {};
  const work = workArea || {};
  const workX = Number(work.x) || 0;
  const workY = Number(work.y) || 0;
  const workWidth = Math.max(0, Number(work.width) || 0);
  const workHeight = Math.max(0, Number(work.height) || 0);
  const nextWidth = Math.max(0, Number(next.width) || 0);
  const nextHeight = Math.max(0, Number(next.height) || 0);
  const maximumX = workX + Math.max(0, workWidth - nextWidth);
  const maximumY = workY + Math.max(0, workHeight - nextHeight);
  return {
    x: Math.round(Math.min(maximumX, Math.max(workX, Number(current.x) || 0))),
    y: Math.round(Math.min(maximumY, Math.max(workY, Number(current.y) || 0)))
  };
}

function projectedElapsedSeconds(baseSeconds, sampledAtMs, nowMs) {
  const base = Math.max(0, Math.floor(Number(baseSeconds) || 0));
  const sampledAt = Number(sampledAtMs);
  const now = Number(nowMs);
  if (!Number.isFinite(sampledAt) || !Number.isFinite(now) || now <= sampledAt) return base;
  return base + Math.floor((now - sampledAt) / 1000);
}

function redactLine(line) {
  return String(line || '')
    .replace(/(password\s*[:=]\s*)\S+/ig, '$1[REDACTED]')
    .replace(/(token\s*[:=]\s*)\S+/ig, '$1[REDACTED]');
}

module.exports = {
  INSTALLER_URL, PROGRESS_PORT, SETUP_PORT, REMOTE_UNIT, REMOTE_ROOT,
  REMOTE_BOOTSTRAP, REMOTE_BOOTSTRAP_LOG, normalizeHost, normalizeUsername,
  hostForUrl, progressUrl, progressStateUrl, firstSetupUrl, classifyInstallerUrl,
  fingerprintLabel, buildRemoteInstallCommand, buildRemoteInspectionCommand,
  parseRemoteInspection, classifyRemoteInspection, progressStateSignature,
  clampWindowPosition, projectedElapsedSeconds, redactLine
};
