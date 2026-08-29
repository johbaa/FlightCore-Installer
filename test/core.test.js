'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeHost, normalizeUsername, fingerprintLabel, buildRemoteInstallCommand,
  buildRemoteInspectionCommand, parseRemoteInspection, classifyRemoteInspection,
  progressStateSignature, redactLine, INSTALLER_URL, progressUrl, progressStateUrl,
  firstSetupUrl, classifyInstallerUrl, clampWindowPosition, projectedElapsedSeconds
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

test('remote command starts the canonical installer in a transient detached service', () => {
  const command = buildRemoteInstallCommand();
  assert.ok(command.includes(INSTALLER_URL));
  assert.match(command, /flightcore-native-installer\.service/);
  assert.match(command, /systemd-run/);
  assert.match(command, /--collect/);
  assert.match(command, /--no-block/);
  assert.doesNotMatch(command, /systemctl enable/);
  assert.doesNotMatch(command, /WantedBy=|ConditionPathExists=|Restart=/);
  assert.doesNotMatch(command, /password/i);
});

test('redacts password and token output', () => {
  assert.equal(redactLine('password: secret'), 'password: [REDACTED]');
  assert.equal(redactLine('token=abc123'), 'token=[REDACTED]');
});

test('builds exact progress and First Setup URLs including IPv6 brackets', () => {
  assert.equal(progressUrl('192.168.1.115'), 'http://192.168.1.115:8090/');
  assert.equal(progressStateUrl('192.168.1.115'), 'http://192.168.1.115:8090/state');
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

test('parses authenticated remote release evidence', () => {
  const report = parseRemoteInspection('VERSION=4.3.0-rc.12\nBUILD=abc123\nSTATUS=accepted\nWEBUI=active\nPOSTINSTALL=inactive\nJOB=inactive\nRESULT=success\n');
  assert.deepEqual(report, { version: '4.3.0-rc.12', build: 'abc123', status: 'accepted', webui: 'active', postinstall: 'inactive', job: 'inactive', result: 'success' });
  assert.match(buildRemoteInspectionCommand(), /release_version/);
});

test('accepts only a complete, active release', () => {
  assert.equal(classifyRemoteInspection({ version: '4.3.0', build: 'abc', status: 'accepted', webui: 'active', postinstall: 'inactive', job: 'inactive', result: 'success' }), 'accepted');
  assert.equal(classifyRemoteInspection({ version: '', build: '', status: 'accepted', webui: 'active', postinstall: '', job: 'inactive', result: 'success' }), 'failed');
});

test('distinguishes a running transaction from terminal failure', () => {
  assert.equal(classifyRemoteInspection({ version: '', build: '', status: '', webui: 'inactive', postinstall: 'inactive', job: 'active', result: '' }), 'working');
  assert.equal(classifyRemoteInspection({ version: '', build: '', status: '', webui: 'inactive', postinstall: 'inactive', job: 'failed', result: 'exit-code' }), 'failed');
});

test('progress heartbeat signatures change only with authoritative fields', () => {
  const first = progressStateSignature({ status: 'installing', progress: 87, elapsed_seconds: 352, updated_at: '2026-08-29T15:00:00+02:00', ignored: 1 });
  const same = progressStateSignature({ status: 'installing', progress: 87, elapsed_seconds: 352, updated_at: '2026-08-29T15:00:00+02:00', ignored: 2 });
  const changed = progressStateSignature({ status: 'installing', progress: 87, elapsed_seconds: 353, updated_at: '2026-08-29T15:00:01+02:00' });
  assert.equal(first, same);
  assert.notEqual(first, changed);
});

test('window fitting preserves the user position and clamps only at a display edge', () => {
  const work = { x: 0, y: 25, width: 1440, height: 850 };
  assert.deepEqual(
    clampWindowPosition({ x: 160, y: 90 }, { width: 900, height: 780 }, work),
    { x: 160, y: 90 }
  );
  assert.deepEqual(
    clampWindowPosition({ x: 1000, y: 400 }, { width: 900, height: 780 }, work),
    { x: 540, y: 95 }
  );
});

test('native elapsed projection continues while remote polling is interrupted', () => {
  assert.equal(projectedElapsedSeconds(352, 1000, 301000), 652);
  assert.equal(projectedElapsedSeconds(352, 1000, 500), 352);
  assert.equal(projectedElapsedSeconds(-1, 1000, 2000), 1);
});
