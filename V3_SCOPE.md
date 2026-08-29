# FlightCore Installer 1.0.0-test.3 scope

## Reliability fix

The native launcher no longer owns the lifetime of the Pi installation through one SSH stream. It downloads the canonical public installer, installs it under `/var/lib/flightcore-native-installer`, and starts a persistent systemd transaction. The unit is guarded by `ConditionPathExists=!/etc/siyi/release_version`, so a controlled reboot can resume an unfinished installation while a committed release cannot be installed twice.

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
