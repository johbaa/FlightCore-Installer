# FlightCore Installer 1.0.0-test.8 SSH readiness wait

Test.8 adds a single-click readiness wait before SSH identity verification.

- The user enters the Pi address, SSH user and password once.
- Connect and verify waits up to ten minutes for TCP port 22.
- While SSH is unavailable, the UI shows a live countdown and performs no password-authentication attempt.
- When port 22 becomes ready, the normal SSH fingerprint and password verification begins automatically.
- A transient refusal, reset, timeout or handshake interruption returns to readiness waiting within the original deadline.
- A wrong password or unresolvable address fails without retrying authentication.
- The password remains process-memory only and is cleared at the existing progress handoff.

Test.8 also includes the corrections found during the test.7 physical run:

- The duplicate native-title elapsed timer is removed. Exactly one elapsed timer remains in the embedded app header.
- The embedded progress document no longer creates an unnecessary outer scrollbar.
- MAVLink Router compilation is limited to one Ninja job through a transaction-only wrapper in `/run`. This reduces the 1 GB Pi's peak CPU and memory pressure at the repeatable `[14/25]` restart point. The wrapper disappears automatically at reboot.

The canonical FlightCore installer, trust confirmation, installation transaction, port-8090 isolation, authenticated acceptance and First Setup handoff are unchanged.
