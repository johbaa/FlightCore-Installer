# FlightCore Installer 1.0.0-test.13 — remote path quoting correction

## Physical finding from test.12

The test.12 native launcher failed before the detached installer service could start:

```text
install: cannot create regular file '$root/ninja-real': No such file or directory
```

The generated shell command assigned `ninja_real` and `ninja_wrapper` with single quotes around `$root`, preserving the dollar expression literally instead of expanding the already-defined installer root.

## Correction

The remote transaction now assigns:

```sh
ninja_real="$root/ninja-real"
ninja_wrapper="$root/ninja-wrapper"
```

A semantic regression gate executes the generated assignment prefix in Bash and verifies the resulting values are exactly:

```text
/var/lib/flightcore-native-installer/ninja-real
/var/lib/flightcore-native-installer/ninja-wrapper
```

The existing test.12 design is otherwise retained: executable Ninja shim on `/var/lib`, `--version` passthrough, forced `-j1`, transaction-only bind mount, watchdog guard, and authenticated boot-ID reboot classification.
