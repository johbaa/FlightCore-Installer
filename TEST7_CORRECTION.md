# FlightCore Installer 1.0.0-test.7 correction

Test.6 physical testing established two launcher defects and one separate Pi interruption:

- The embedded installation view showed no visible elapsed clock.
- The launcher treated one empty authenticated snapshot as immediate terminal failure.
- The Raspberry Pi actually rebooted during MAVLink Router compilation. The canonical log ended at object 14/25 with no accepted release, while power flags showed no undervoltage and the previous boot journal was unavailable.

Test.7 does not change or relaunch the canonical FlightCore installer. It corrects the launcher by:

- Rendering elapsed time beside the embedded progress title and continuously in the native window title as a visible fallback.
- Limiting authenticated SSH inspections during heavy compilation.
- Running the unchanged canonical installer at a lower CPU scheduling priority so systemd and the hardware-watchdog manager remain responsive during native compilation.
- Treating an empty post-reboot snapshot as transitional unless explicit failure evidence exists.
- Tracking the authenticated boot identity and active canonical-log age.
- Reporting a reboot that never reaches authenticated acceptance as an interrupted installation after the recovery window.
- Capturing the canonical installer log and boot evidence automatically on failure.

The partially installed test.6 SD card must be reimaged before another fresh-install test.
