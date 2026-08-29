# FlightCore Installer

Native macOS and Windows launcher for the existing FlightCore fresh-install workflow.

Current functional-test source: **1.0.0-test.3**.

## User flow

1. Open the FlightCore installation URL.
2. Download the macOS or Windows application.
3. Double-click it.
4. Enter the Raspberry Pi address and password.
5. Confirm the Pi SSH fingerprint.
6. Continue in the existing FlightCore port-8090 installation UI, visually harmonized and embedded securely inside the app.
7. The launcher independently checks progress heartbeats and authenticated release evidence through restarts.
8. Only after the Pi reports an accepted release and the exact `/first_setup` route responds does First Setup open in the normal browser.

The launcher does not store the Raspberry Pi password. It remembers only the SSH fingerprint associated with each address and writes a redacted diagnostic log to Downloads.

The embedded installation page runs in a separate sandboxed Electron view without access to the password, SSH connection, Node.js or privileged launcher functions.

Version 1.0.0-test.3 also restores native paste shortcuts and an editable-field context menu, uses the FlightCore logo throughout, and sizes the native window to its current content without permanent outer scrollbars.

## Build paths

- **Functional test:** run the `Build functional-test installers` GitHub workflow. It produces unsigned macOS and Windows artifacts for controlled testing.
- **Production:** add the signing secrets described in `TESTING_AND_RELEASE.md`, then push an `installer-v*` tag. The production workflow signs, notarizes, tests and publishes both installers in one GitHub release.

The public download page expects release artifacts named `FlightCore-Installer-mac-universal.dmg` and `FlightCore-Installer-win-x64.exe`.
