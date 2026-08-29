'use strict';

const { chromium } = require('playwright');
const path = require('node:path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 900, height: 850 }, deviceScaleFactor: 1 });
  await page.addInitScript(() => {
    window.flightcore = {
      probeHost: async () => ({
        fingerprint: 'a'.repeat(64),
        fingerprintLabel: 'SHA256 aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa',
        trustState: 'new',
        previousFingerprintLabel: null
      }),
      startInstall: async () => ({ ok: true }),
      fitWindow: async () => true,
      showLog: async () => true,
      getAppInfo: async () => ({ version: '1.0.0-test.6', platform: 'darwin' }),
      projectedElapsedSeconds: (base, sampledAt, now) => Math.max(0, Math.floor(Number(base) || 0)) + Math.max(0, Math.floor((Number(now) - Number(sampledAt)) / 1000)),
      onEvent: () => () => {}
    };
  });
  const target = `file://${path.resolve(__dirname, '../src/renderer/index.html')}`;
  await page.goto(target);
  await page.screenshot({ path: path.resolve(__dirname, '../dist/launcher-ui.png'), fullPage: true });
  const title = await page.title();
  const heading = await page.locator('h1').textContent();
  if (title !== 'FlightCore Installer' || heading !== 'Fresh installation') throw new Error('Launcher UI smoke test failed.');
  await browser.close();
})();
