# FlightCore Installer — testing and release

## 1.0.0-test.5 acceptance focus

- The port-8090 installer remains inside the native application window.
- The embedded page has no preload, Node.js, SSH, password or privileged installer access.
- Navigation outside the exact target Pi port-8090 origin is blocked.
- Only the exact target Pi `http://HOST:8080/first_setup` handoff may open in the default browser.
- The app closes after that browser handoff.
- An SSH stream ending without a numeric exit code after port 8090 is ready is not reported as installation failure.
- macOS contains the Local Network permission description.
- Cmd-V on macOS, Ctrl-V on Windows and right-click Paste work in editable connection fields.
- The FlightCore logo is visible on each native stage and the embedded progress stage.
- The native window fits the active stage without an unnecessary outer scrollbar.
- A user-moved native window keeps its position through Verify, Start and embedded-progress transitions.
- The embedded-header elapsed clock continues through temporary port-8090 polling interruptions.
- Port 8090 uses the native visual language while remaining in a separate sandboxed view.
- The Pi installation runs in a detached transient systemd transaction and survives an installer-app or SSH disconnect.
- The native launcher unit is never installed or enabled at boot and therefore cannot execute the public installer twice after the canonical installer reboots the Pi.
- RC11's own post-reboot verifier is the sole reboot-continuation owner.
- Frozen or disappearing port-8090 state never counts as success.
- First Setup opens only after authenticated version, build, accepted status and active WebUI checks pass.

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
7. Confirm the existing FlightCore progress UI appears inside the native installer window; no second browser window opens for port 8090.
8. Complete installation and confirm `/first_setup` opens in the normal browser while the native installer closes.
9. In Downloads, preserve `FLIGHTCORE_FRESH_INSTALL_*.log`.

## Windows functional test

1. Download `flightcore-installer-windows-functional-test` from the same successful workflow run and unzip it on Windows.
2. Double-click `FlightCore-Installer-win-x64.exe`. For this unsigned test only, use **More info → Run anyway** if SmartScreen blocks it.
3. Enter the same test Pi address, SSH user `pi`, and password.
4. Confirm that the same fingerprint, status language and four-stage launcher flow appear.
5. Confirm the port-8090 UI appears inside the native installer window.
6. Complete installation and confirm `/first_setup` opens in the normal browser while the native installer closes.
7. In Downloads, preserve `FLIGHTCORE_FRESH_INSTALL_*.log`.

## Required acceptance results on both platforms

- No Terminal, PowerShell, command prompt or external SSH client appears.
- Incorrect passwords fail before installation starts.
- An unknown Pi requires explicit fingerprint confirmation.
- Reusing the same Pi address shows it as previously trusted.
- Reimaging the Pi produces a changed-fingerprint warning rather than silently trusting it.
- Port 8090 loads in the isolated native window and does not open in the external browser.
- The existing FlightCore progress UI reaches 100%, survives the controlled reboot, and continues to `/first_setup`.
- The launcher log contains the target and installer output but no password.
- A failed SSH connection or installer exit produces a clear failure and retains its log.
- Freeze port-8090 state deliberately and confirm the app reports a failure rather than waiting forever.
- During a controlled install reboot, confirm monitoring resumes and the guarded transaction does not run again after `/etc/siyi/release_version` is committed.
- Confirm the native transient unit is absent after reboot and the bootstrap log contains exactly one public-installer invocation.
- Move the app off-center before connecting and confirm no later stage recenters it.
- Confirm the native shell has no scrollbar when its complete active panel fits the display.
- Confirm the native elapsed clock continues while port-8090 state is temporarily unchanged or unavailable.

## Signing status

Signing is intentionally deferred at this stage. Functional-test and preview-distribution installers remain unsigned and the download page must clearly explain the platform warnings and opening steps.

No Apple or Windows signing credentials are required for the current preview workflow. Signing may be added later without changing the Pi installation transaction.
