# FlightCore Installer 1.0.0-test.9 build-manifest correction

Test.8 was pushed to GitHub but both functional-test jobs correctly stopped at `npm test`. No macOS or Windows installer artifact was produced.

The test.8 source archive contained Electron Builder's stripped packaged-app `package.json` instead of the complete source manifest. That copy omitted the npm scripts, development dependencies and build configuration required by GitHub Actions.

Test.9 restores the complete source manifest and adds assertions that require:

- the exact test.9 version;
- the Node test command;
- both macOS and Windows distribution commands;
- the Electron application identifier and build configuration.

The SSH readiness wait, single elapsed clock, embedded scrollbar correction, transaction-only single-job Ninja wrapper, authenticated reboot monitoring and First Setup handoff are otherwise unchanged from the corrected test.8 source.
