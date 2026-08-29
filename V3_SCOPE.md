# FlightCore Installer test.3 UI scope — lifecycle superseded by test.4

## Reliability fix

The test.3 persistent boot-enabled launcher design failed physical testing because it could relaunch the public installer after the Pi reboot. It is prohibited and replaced by the transient test.4 design documented in `TEST4_CORRECTION.md`.

The native launcher no longer owns the installation through one SSH stream. It downloads the canonical public installer, stores it under `/var/lib/flightcore-native-installer`, and starts a detached transient systemd transaction. The transaction survives the app and SSH session but cannot start at boot. The canonical installer and `siyi-postinstall-verify.service` exclusively own reboot continuation.

The native app monitors port 8090 independently from the SSH launcher. A changing state signature is treated as a heartbeat. A failed state, a frozen heartbeat, a disappearing progress service, or a transaction that ends without complete release evidence produces an explicit failure and preserves local plus remote diagnostics.

Success requires all of the following authenticated Pi evidence:

- a syntactically valid `/etc/siyi/release_version`;
- a non-empty build identifier;
- release status `accepted` or `core_accepted_hardware_pending`;
- active `siyi-webui`;
- the exact `http://HOST:8080/first_setup` route responding.

Only then is the temporary launcher service removed and First Setup opened in the default browser. Embedded navigation cannot bypass this acceptance gate.

## UI scope

- Restore Cmd-V, Ctrl-V and editable-field right-click Paste.
- Show the FlightCore logo on every native screen and the embedded progress header.
- Harmonize port-8090 colors, typography, cards, controls and spacing with the native app by injecting CSS only.
- Keep port 8090 in an isolated sandboxed `WebContentsView` without preload, Node.js, credentials or privileged APIs.
- Adapt the native window to each stage, clamped to the current display work area, with no unnecessary outer scrollbar.

## Required release tests

Both macOS and Windows functional-test jobs must pass. A fresh bench Pi must then pass the full installation, controlled reboot, accepted-release check and First Setup handoff. Failure-injection tests must cover a frozen state, vanished port 8090, failed systemd transaction and incomplete release marker set.
