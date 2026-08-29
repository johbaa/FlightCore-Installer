'use strict';

const INSTALLER_URL = 'https://raw.githubusercontent.com/johbaa/SIYI_PI_Installer/main/install.sh';
const PROGRESS_PORT = 8090;

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

function fingerprintLabel(hexDigest) {
  const clean = String(hexDigest || '').replace(/[^a-fA-F0-9]/g, '').toLowerCase();
  if (clean.length !== 64) throw new Error('The Raspberry Pi returned an invalid SSH fingerprint.');
  return `SHA256 ${clean.match(/.{1,4}/g).join(' ')}`;
}

function buildRemoteInstallCommand() {
  return [
    'set -eu',
    'umask 077',
    'tmp="$(mktemp /tmp/flightcore-public-install.XXXXXX)"',
    'cleanup(){ rm -f "$tmp"; }',
    'trap cleanup EXIT HUP INT TERM',
    `curl -fsSL --connect-timeout 15 --max-time 120 '${INSTALLER_URL}' -o "$tmp"`,
    'test -s "$tmp"',
    "head -n 1 \"$tmp\" | grep -Eq '^#!.*(ba)?sh'",
    'chmod 700 "$tmp"',
    'sudo -n /bin/bash "$tmp"'
  ].join('\n');
}

function redactLine(line) {
  return String(line || '')
    .replace(/(password\s*[:=]\s*)\S+/ig, '$1[REDACTED]')
    .replace(/(token\s*[:=]\s*)\S+/ig, '$1[REDACTED]');
}

module.exports = {
  INSTALLER_URL,
  PROGRESS_PORT,
  normalizeHost,
  normalizeUsername,
  fingerprintLabel,
  buildRemoteInstallCommand,
  redactLine
};
