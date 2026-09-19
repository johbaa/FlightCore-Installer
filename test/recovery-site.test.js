'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('Spark recovery page documents the verified connector map', () => {
  const html = read('site/spark-recovery.html');
  assert.doesNotMatch(html, /FlightCore/i);
  assert.match(html, /A5 \/ SCL[\s\S]*1 — SCL/);
  assert.match(html, /Nano GND[\s\S]*2 — GND/);
  assert.match(html, /9 V red \/ \+[\s\S]*4 — PACK\+/);
  assert.match(html, /9 V black \/ −[\s\S]*5 — GND/);
  assert.match(html, /A4 \/ SDA[\s\S]*6 — SDA/);
  assert.match(html, /Do not connect the DJI charger during recovery/);
  assert.match(html, /spark-connector\.svg/);
  assert.match(html, /spark-wiring\.svg/);
  assert.match(read('site/spark-assets/spark-connector.svg'), /HOLD THE BATTERY THIS WAY/);
  assert.match(read('site/spark-assets/spark-wiring.svg'), /CONNECT THESE FIVE WIRES/);
  assert.match(read('site/spark-assets/spark-wiring.svg'), /NO WIRE/);
});

test('browser control requires local helper token and explicit wiring confirmation', () => {
  const js = read('site/spark-recovery.js');
  const html = read('site/spark-recovery.html');
  assert.match(js, /http:\/\/127\.0\.0\.1:8765/);
  assert.match(js, /encodeURIComponent\(token\)/);
  assert.match(js, /location\.hash/);
  assert.match(js, /confirmation\.checked/);
  assert.match(js, /PFStatus cleared to zero and the gauge was resealed/);
  assert.match(html, /id="wiringConfirmed"/);
  assert.match(html, /id="runButton" disabled/);
});

test('Mac helper is loopback-only and delegates to guarded recovery engine', () => {
  const helper = read('site/helper/DJI-Spark-Recovery-Mac.command');
  const engine = read('site/helper/recovery-engine.command');
  assert.match(helper, /ThreadingHTTPServer\(\("127\.0\.0\.1", port\)/);
  assert.match(helper, /supplied == token/);
  assert.match(helper, /route == "\/bootstrap"/);
  assert.match(helper, /Origin[\s\S]*https:\/\/johbaa\.github\.io/);
  assert.doesNotMatch(helper, /open "\$PAGE"/);
  assert.match(helper, /DJI_SPARK_WEB_CONFIRMED/);
  assert.match(engine, /cell_spread > 300/);
  assert.match(engine, /pack_mv < 5400/);
  assert.match(engine, /min\(cells\) < 1800/);
  assert.match(engine, /min\(cells\) < 2500/);
  assert.match(engine, /safety_before & 1/);
  assert.match(engine, /command\("WW 00 0029"\)/);
  assert.match(engine, /command\("WW 00 0030"\)/);
  assert.match(engine, /DJI_SPARK_WEB_CONFIRMED/);
});
