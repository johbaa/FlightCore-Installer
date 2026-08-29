# FlightCore Installer

Native macOS and Windows launcher for the existing FlightCore fresh-install workflow.

Current functional-test source: **1.0.0-test.5**.

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

Version 1.0.0-test.5 retains the test.3 UI scope: native paste shortcuts and an editable-field context menu, the FlightCore logo throughout, harmonized embedded progress styling, and adaptive window sizing.

Test.4 corrects the test.3 reboot defect. The public installer runs in a detached transient service that survives the app and SSH session but is not installed or enabled at boot. The canonical FlightCore installer and its post-reboot verifier exclusively own the deliberate Pi reboot.

Test.5 preserves a user-moved window position through every stage transition, removes the unnecessary outer document scrollbar, and shows a native elapsed clock that continues through temporary port-8090 polling interruptions.

## Build paths

- **Functional test:** run the `Build functional-test installers` GitHub workflow. It produces unsigned macOS and Windows artifacts for controlled testing.
- **Unsigned preview distribution:** publish only artifacts from a successful two-platform functional-test workflow, label them unsigned on the download page, and provide the required macOS and Windows opening instructions.

The public download page expects release artifacts named `FlightCore-Installer-mac-universal.dmg` and `FlightCore-Installer-win-x64.exe`.
