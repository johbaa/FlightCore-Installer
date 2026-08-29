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

test('test.4 cannot relaunch the public installer after the Pi reboots', () => {
  const core = read('src/lib/core.js');
  const scope = read('TEST4_CORRECTION.md');
  assert.match(core, /systemd-run/);
  assert.match(core, /--collect/);
  assert.doesNotMatch(core, /systemctl enable --now/);
  assert.doesNotMatch(core, /WantedBy=multi-user\.target/);
  assert.match(scope, /must not relaunch/i);
  assert.match(scope, /frozen/i);
  assert.equal(require('../package.json').version, '1.0.0-test.4');
});
