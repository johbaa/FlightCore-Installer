# FlightCore Installer — testing and release

## Safety boundary

Use a freshly prepared **bench/test Raspberry Pi**, never an aircraft that is in operation. The launcher invokes the current public FlightCore `install.sh`; a successful functional test therefore performs a real fresh installation on the selected Pi.

## Functional test build

The `Build functional-test installers` workflow creates native unsigned test applications on genuine macOS and Windows build hosts. No local developer tools are required on the test computers.

Unsigned builds are only for controlled functional testing:

- macOS will require **Control-click → Open** for the first launch.
- Windows SmartScreen may require **More info → Run anyway**.

These warnings disappear only after the production apps are signed; the application behavior is otherwise the same.

## macOS functional test

1. In the GitHub repository, open **Actions → Build functional-test installers → Run workflow**.
2. Wait for both jobs to pass.
3. Download `flightcore-installer-macos-functional-test` from the workflow run and unzip it.
4. Open the DMG and double-click **FlightCore Installer**. For this unsigned test only, use **Control-click → Open** if macOS blocks it.
5. Enter the test Pi address, SSH user `pi`, and password.
6. Confirm that the app shows the Pi SSH fingerprint before installation.
7. Confirm the existing FlightCore progress UI automatically opens at `http://<Pi-IP>:8090`.
8. Complete installation, reboot and `/first_setup` in the existing browser UI.
9. In Downloads, preserve `FLIGHTCORE_FRESH_INSTALL_*.log`.

## Windows functional test

1. Download `flightcore-installer-windows-functional-test` from the same successful workflow run and unzip it on Windows.
2. Double-click `FlightCore-Installer-win-x64.exe`. For this unsigned test only, use **More info → Run anyway** if SmartScreen blocks it.
3. Enter the same test Pi address, SSH user `pi`, and password.
4. Confirm that the same fingerprint, status language and four-stage launcher flow appear.
5. Confirm the default browser automatically opens `http://<Pi-IP>:8090`.
6. Complete installation, reboot and `/first_setup` in the existing browser UI.
7. In Downloads, preserve `FLIGHTCORE_FRESH_INSTALL_*.log`.

## Required acceptance results on both platforms

- No Terminal, PowerShell, command prompt or external SSH client appears.
- Incorrect passwords fail before installation starts.
- An unknown Pi requires explicit fingerprint confirmation.
- Reusing the same Pi address shows it as previously trusted.
- Reimaging the Pi produces a changed-fingerprint warning rather than silently trusting it.
- The browser opens port 8090 exactly once.
- The existing FlightCore progress UI reaches 100%, survives the controlled reboot, and continues to `/first_setup`.
- The launcher log contains the target and installer output but no password.
- A failed SSH connection or installer exit produces a clear failure and retains its log.

## Production signing

The production workflow requires these repository secrets:

### Apple

- `MAC_CSC_LINK`: exported Developer ID Application certificate (`.p12`) as a base64 string or secure file reference supported by electron-builder.
- `MAC_CSC_KEY_PASSWORD`: password for that certificate.
- `APPLE_ID`: Apple Developer account email.
- `APPLE_APP_SPECIFIC_PASSWORD`: app-specific Apple password.
- `APPLE_TEAM_ID`: Apple Developer Team ID.

### Windows

- `WIN_CSC_LINK`: Authenticode certificate (`.pfx`) as a base64 string or secure file reference supported by electron-builder.
- `WIN_CSC_KEY_PASSWORD`: password for that certificate.

After the secrets exist, publish an `installer-v*` tag. Both signed applications are created and attached to one GitHub release. Publish the download page only after verifying both release files and their signatures.
