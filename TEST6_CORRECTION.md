# FlightCore Installer 1.0.0-test.6 correction

Physical launch of test.5 showed a blank footer version. Packaged-app diagnostics confirmed that Electron's sandboxed preload rejected `require('./lib/core')`, preventing the complete native bridge from initializing. No Raspberry Pi connection or installation was started with test.5.

Test.6 keeps the elapsed projection inside the sandboxed preload and requires no local-module import there. The test.5 UI corrections and the previously accepted test.4 installation transaction remain unchanged.

Release gate:

- Packaged application logs contain no `Unable to load preload script` or `module not found` error.
- The footer renders `v1.0.0-test.6`.
- The connection form can call the exposed native bridge.
- Source tests reject any relative local-module import from the sandboxed preload.
