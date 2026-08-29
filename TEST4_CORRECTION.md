# FlightCore Installer 1.0.0-test.4 correction

## Confirmed test.3 failure

Physical macOS testing on 29 August 2026 proved that the test.3 wrapper installed and enabled `flightcore-native-installer.service` across reboot. After the canonical RC11 installer rebooted the Pi, the native wrapper invoked the public installer again. That second invocation failed during `Preparing installer`, rolled back, and left the pre-reboot port-8090 page frozen at 87%.

Memory, swap and disk were healthy. This was lifecycle ownership failure, not a compiler or out-of-memory failure.

## Test.4 correction

The launcher now starts the verified public installer with `systemd-run` as a detached transient unit. It is collected after exit and has no unit file, boot target, enable operation or restart policy.

The transient unit:

- survives native-app closure and SSH disconnection during the current boot;
- must not relaunch after the Pi reboots;
- leaves reboot continuation exclusively to the canonical RC11 installer and `siyi-postinstall-verify.service`;
- preserves its bootstrap log for authenticated failure evidence.

Monitoring polls the canonical `http://HOST:8090/state` endpoint with a cache-busting query and includes `elapsed_seconds`, `updated_at`, progress, stage, error and log tail in the heartbeat signature. Frozen state, explicit failure, a vanished interface without accepted release evidence, or a failed/incomplete post-reboot status must fail visibly.

Success still requires authenticated version, build, accepted release status, active WebUI and exact First Setup readiness before external browser handoff.

## Mandatory regression gate

Static and packaged-source checks reject `systemctl enable`, `WantedBy=multi-user.target`, `ConditionPathExists` and restart policy in the native launcher. Physical acceptance must additionally prove exactly one public-installer invocation across the deliberate reboot.
