'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeHost, normalizeUsername, fingerprintLabel, buildRemoteInstallCommand,
  redactLine, INSTALLER_URL, progressUrl, firstSetupUrl, classifyInstallerUrl
} = require('../src/lib/core');

test('accepts normal Pi addresses and host names', () => {
  assert.equal(normalizeHost(' 192.168.193.51 '), '192.168.193.51');
  assert.equal(normalizeHost('flightcore.local'), 'flightcore.local');
  assert.equal(normalizeHost('fd00::51'), 'fd00::51');
});

test('rejects shell metacharacters in host input', () => {
  for (const value of ['host;reboot', '$(id)', 'a b', '-oProxyCommand=x', 'name/path']) assert.throws(() => normalizeHost(value));
});

test('validates the SSH user', () => {
  assert.equal(normalizeUsername('pi'), 'pi');
  assert.throws(() => normalizeUsername('pi;id'));
});

test('formats fingerprints and rejects malformed values', () => {
  assert.match(fingerprintLabel('a'.repeat(64)), /^SHA256 (aaaa ){15}aaaa$/);
  assert.throws(() => fingerprintLabel('abc'));
});

test('remote command uses the canonical public installer and fixed quoting', () => {
  const command = buildRemoteInstallCommand();
  assert.match(command, new RegExp(INSTALLER_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(command, /sudo -n \/bin\/bash \"\$tmp\"/);
  assert.doesNotMatch(command, /password/i);
});

test('redacts password and token output', () => {
  assert.equal(redactLine('password: secret'), 'password: [REDACTED]');
  assert.equal(redactLine('token=abc123'), 'token=[REDACTED]');
});

test('builds exact progress and First Setup URLs including IPv6 brackets', () => {
  assert.equal(progressUrl('192.168.1.115'), 'http://192.168.1.115:8090/');
  assert.equal(firstSetupUrl('192.168.1.115'), 'http://192.168.1.115:8080/first_setup');
  assert.equal(progressUrl('fd00::51'), 'http://[fd00::51]:8090/');
});

test('isolates embedded navigation and permits only the exact Pi First Setup handoff', () => {
  const host = '192.168.1.115';
  assert.equal(classifyInstallerUrl('http://192.168.1.115:8090/status?run=1', host), 'progress');
  assert.equal(classifyInstallerUrl('http://192.168.1.115:8080/first_setup', host), 'first-setup');
  assert.equal(classifyInstallerUrl('http://192.168.1.115:8080/', host), 'blocked');
  assert.equal(classifyInstallerUrl('http://192.168.1.116:8080/first_setup', host), 'blocked');
  assert.equal(classifyInstallerUrl('https://example.com/first_setup', host), 'blocked');
  assert.equal(classifyInstallerUrl('http://user:pass@192.168.1.115:8090/', host), 'blocked');
});
