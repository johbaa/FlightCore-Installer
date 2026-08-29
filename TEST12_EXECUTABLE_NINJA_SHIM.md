# FlightCore Installer 1.0.0-test.12 — executable Ninja shim correction

Physical test.11 reached the MAVLink Router Meson configure stage but failed before compilation with:

`ERROR: Could not detect Ninja v1.8.2 or newer`

The test.11 serialization design bind-mounted a wrapper whose source lived under `/run`. On the target Pi this was not a suitable executable backing location for Meson/Ninja detection.

Test.12 retains the proven design goals but moves both the copied real Ninja binary and the `-j1` wrapper to the installer-owned executable root filesystem:

- `/var/lib/flightcore-native-installer/ninja-real`
- `/var/lib/flightcore-native-installer/ninja-wrapper`

The transient systemd unit still bind-mounts only `ninja-wrapper` over `/usr/bin/ninja` inside its private mount namespace. The wrapper executes `ninja-real -j1 "$@"`. This means direct `/usr/bin/ninja`, PATH lookup, and `sudo ninja` inside the canonical installer all remain serialized without changing the host `/usr/bin/ninja`.

The test.11 authenticated boot-ID recovery correction and transaction-only watchdog guard are retained. No Mac or Windows renderer/UI flow is changed.
