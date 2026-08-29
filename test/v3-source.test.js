'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('embedded progress remains sandboxed and First Setup requires authenticated acceptance', () => {
  const main = read('src/main.js');
  assert.match(main, /sandbox:\s*true/);
  assert.match(main, /classifyRemoteInspection/);
  assert.match(main, /requestUrl\(firstSetupUrl\(host\)/);
  assert.doesNotMatch(main, /executeJavaScript/);
  assert.doesNotMatch(read('src/preload.js'), /open-progress|openProgress/);
});

test('v3 includes paste support, logos, adaptive sizing and harmonized embedded CSS', () => {
  const main = read('src/main.js');
  const html = read('src/renderer/index.html');
  assert.match(main, /role: 'paste'/);
  assert.match(main, /insertCSS\(embeddedCss\(\)\)/);
  assert.match(main, /fitWindow/);
  assert.match(html, /flightcore-logo\.svg/g);
  assert.equal(fs.existsSync(path.join(root, 'src/renderer/flightcore-logo.svg')), true);
});

test('test.5 preserves window position, removes outer scrolling and owns a live elapsed clock', () => {
  const main = read('src/main.js');
  const renderer = read('src/renderer/renderer.js');
  const styles = read('src/renderer/styles.css');
  const html = read('src/renderer/index.html');
  assert.match(main, /clampWindowPosition/);
  assert.match(main, /setContentSize\(width, height, false\)/);
  assert.equal((main.match(/\.center\(\)/g) || []).length, 1);
  assert.match(main, /if \(initialWindowFit\)/);
  assert.match(renderer, /lastRemoteSeconds/);
  assert.match(renderer, /projectedElapsedSeconds/);
  assert.match(styles, /body\{[^}]*overflow:hidden/);
  assert.match(styles, /\.shell\{[^}]*overflow-y:auto/);
  assert.match(html, /id="embeddedElapsed"/);
  assert.match(main, /#elapsed\{visibility:hidden!important\}/);
});

test('test.6 sandboxed preload contains no unsupported local module import', () => {
  const preload = read('src/preload.js');
  assert.doesNotMatch(preload, /require\(['"]\.\//);
  assert.match(preload, /function projectedElapsedSeconds/);
  assert.match(preload, /contextBridge\.exposeInMainWorld/);
});

test('test.7 reboot evidence remains authenticated without retaining its duplicate title clock', () => {
  const main = read('src/main.js');
  const renderer = read('src/renderer/renderer.js');
  const core = read('src/lib/core.js');
  assert.doesNotMatch(main, /FlightCore Installer — Elapsed/);
  assert.match(main, /AUTH_INSPECTION_INTERVAL_MS/);
  assert.match(main, /restarted before FlightCore produced an authenticated accepted release/);
  assert.match(renderer, /case 'embedded-visible'/);
  assert.match(core, /BOOT_ID/);
  assert.match(core, /LOG_AGE/);
  assert.match(core, /transitional, not proof of/);
});

test('test.8 waits once for SSH readiness, owns one clock and limits native build load', () => {
  const main = read('src/main.js');
  const renderer = read('src/renderer/renderer.js');
  const html = read('src/renderer/index.html');
  const core = read('src/lib/core.js');
  assert.match(main, /SSH_READY_TIMEOUT_MS = 10 \* 60 \* 1000/);
  assert.match(main, /async function waitForSshReady/);
  assert.match(main, /probePort\(host, 22, 1200\)/);
  assert.match(main, /emit\('ssh-waiting'/);
  assert.match(main, /emit\('ssh-ready'/);
  assert.match(main, /password was not accepted[^\n]+return false/);
  assert.match(renderer, /case 'ssh-waiting'/);
  assert.match(renderer, /Waiting for SSH —/);
  assert.match(html, /app will wait for SSH/);
  assert.match(renderer, /startElapsedClock/);
  assert.equal((html.match(/id="embeddedElapsed"/g) || []).length, 1);
  assert.doesNotMatch(main, /FlightCore Installer — Elapsed/);
  assert.match(main, /body\{[^}]*overflow:hidden!important/);
  assert.doesNotMatch(main, /min-height:100vh/);
  assert.match(core, /exec \/run\/flightcore-native-installer-ninja-real -j1/);
  assert.match(core, /BindReadOnlyPaths=\$ninja_wrapper:\/usr\/bin\/ninja/);
});

test('test.11 retains the complete build manifest and cannot relaunch after reboot', () => {
  const core = read('src/lib/core.js');
  const scope = read('TEST4_CORRECTION.md');
  assert.match(core, /systemd-run/);
  assert.match(core, /--collect/);
  assert.doesNotMatch(core, /systemctl enable --now/);
  assert.doesNotMatch(core, /WantedBy=multi-user\.target/);
  assert.match(scope, /must not relaunch/i);
  assert.match(scope, /frozen/i);
  const manifest = require('../package.json');
  assert.equal(manifest.version, '1.0.0-test.11');
  assert.equal(manifest.scripts.test, 'node --test test/*.test.js');
  assert.equal(manifest.scripts['dist:mac'], 'electron-builder --mac dmg --universal');
  assert.equal(manifest.scripts['dist:win'], 'electron-builder --win nsis --x64');
  assert.equal(manifest.build.appId, 'se.flightcore.installer');
  assert.match(read('scripts/capture-ui.js'), /version: '1\.0\.0-test\.11'/);
});


test('test.11 retains the transaction-only watchdog guard', () => {
  const core = read('src/lib/core.js');
  assert.match(core, /RuntimeWatchdogSec=0/);
  assert.match(core, /RebootWatchdogSec=0/);
  assert.match(core, /\/run\/systemd\/system\.conf\.d\/90-flightcore-installer-watchdog\.conf/);
  assert.match(core, /systemctl daemon-reexec/);
  assert.match(core, /trap cleanup_watchdog EXIT/);
  assert.match(core, /systemctl is-system-running/);
  assert.doesNotMatch(core, /\/etc\/systemd\/system\.conf\.d\/90-flightcore-installer-watchdog/);
  assert.match(read('TEST10_WATCHDOG_GUARD.md'), /60-second timeout/);
});


test('test.11 serializes Ninja inside the transient unit and does not misclassify SSH loss as reboot', () => {
  const core = read('src/lib/core.js');
  const main = read('src/main.js');
  assert.match(core, /flightcore-native-installer-ninja-real/);
  assert.match(core, /exec \/run\/flightcore-native-installer-ninja-real -j1/);
  assert.match(core, /BindReadOnlyPaths=\$ninja_wrapper:\/usr\/bin\/ninja/);
  assert.doesNotMatch(core, /flightcore-native-installer-bin/);
  assert.doesNotMatch(main, /did not return within the installation recovery window/);
  assert.match(main, /Only an[\s\S]*authenticated boot-ID change starts the reboot grace timer/);
  assert.match(read('TEST11_SERIAL_BUILD_RECOVERY.md'), /swap reached 0 kB free/i);
});
