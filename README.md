# FlightCore Installer

Native macOS and Windows launcher for the existing FlightCore fresh-install workflow.

Current functional-test source: **1.0.0-test.2**.

## User flow

1. Open the FlightCore installation URL.
2. Download the macOS or Windows application.
3. Double-click it.
4. Enter the Raspberry Pi address and password.
5. Confirm the Pi SSH fingerprint.
6. Continue in the existing FlightCore port-8090 installation UI embedded securely inside the app.
7. When installation finishes, the exact Raspberry Pi `/first_setup` page opens in the normal browser and the native installer closes.

The launcher does not store the Raspberry Pi password. It remembers only the SSH fingerprint associated with each address and writes a redacted diagnostic log to Downloads.

The embedded installation page runs in a separate sandboxed Electron view without access to the password, SSH connection, Node.js or privileged launcher functions.

## Build paths

- **Functional test:** run the `Build functional-test installers` GitHub workflow. It produces unsigned macOS and Windows artifacts for controlled testing.
- **Production:** add the signing secrets described in `TESTING_AND_RELEASE.md`, then push an `installer-v*` tag. The production workflow signs, notarizes, tests and publishes both installers in one GitHub release.

The public download page expects release artifacts named `FlightCore-Installer-mac-universal.dmg` and `FlightCore-Installer-win-x64.exe`.
