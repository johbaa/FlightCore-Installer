# FlightCore Installer 1.0.0-test.11

## Physical test.10 finding

The Raspberry Pi 3B+ did not reboot during the failed test.10 run. The watchdog guard was active (`RuntimeWatchdogUSec=0`), but multiple `cc1plus` compiler processes still ran concurrently because the PATH-based Ninja wrapper was bypassed. Swap reached 0 kB free and the kernel invoked the OOM killer. SSH/8090 then became unavailable long enough for the native launcher to misclassify the same-boot resource stall as a reboot/recovery failure.

## test.11 correction

1. Copy the real `/usr/bin/ninja` to a transaction-only file under `/run`.
2. Create a transaction-only wrapper that always executes the copied binary with `-j1`.
3. Bind-mount that wrapper read-only over `/usr/bin/ninja` only inside the transient installer service using `BindReadOnlyPaths=`. This covers relative calls, absolute `/usr/bin/ninja` calls, and `sudo` secure-path resolution without changing the host filesystem.
4. Retain the already-proven transaction-only watchdog guard.
5. Do not treat loss of SSH alone as proof of reboot. Only an authenticated boot-ID change starts the reboot recovery timer; same-boot monitoring outages continue until the overall installation safety limit.

The macOS/Windows UI, embedded port-8090 view, SSH verification flow and `/first_setup` handoff are otherwise unchanged from test.10.
