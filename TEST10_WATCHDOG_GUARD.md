# FlightCore Installer 1.0.0-test.10 RC11 watchdog guard

Physical RC11 fresh-install tests on the 1 GB Raspberry Pi continued to reset during MAVLink Router compilation after test.8/test.9 had already forced Ninja to `-j1`. The canonical installer log ended abruptly after `[15/25]` with no compiler error, installer failure, release finalization or deliberate reboot.

A preserved fresh-boot baseline then proved that Raspberry Pi OS systemd had the Broadcom BCM2835 hardware watchdog open with a 60-second timeout during this test path. This creates a software reset path that remains independent of Ninja parallelism.

Test.10 therefore keeps every accepted test.9 Windows/macOS launcher behavior and adds one narrow Pi-side transaction guard:

- The existing `ninja -j1` wrapper remains in `/run`.
- Before the detached canonical installer starts, a wrapper writes `/run/systemd/system.conf.d/90-flightcore-installer-watchdog.conf`.
- The drop-in sets `RuntimeWatchdogSec=0` and `RebootWatchdogSec=0`, then performs `systemctl daemon-reexec`.
- The guard applies only to the fresh-install transaction. It is not written to `/etc` and cannot persist across reboot because `/run` is volatile.
- If the installer exits without reboot, the wrapper removes the drop-in and reexecs systemd to restore the normal watchdog policy.
- If the canonical installer performs its intended reboot, `/run` is cleared and the normal boot configuration resumes automatically.
- No flight-control, MAVLink, video, registry, cloud or First Setup behavior is changed.

Acceptance requires the build to pass beyond the former `[14/25]`/`[15/25]` boundary without an unplanned reset and to reach the canonical reboot and authenticated `/first_setup` handoff on both macOS and Windows launch paths.
