# FlightCore Installer 1.0.0-test.5 UI correction

Physical macOS and Windows test.4 installations completed successfully. The installation engine, transient launcher, authenticated acceptance and First Setup handoff are unchanged in test.5.

Test.5 corrects three UI findings from those physical tests:

- The embedded header owns a monotonic elapsed clock. It synchronizes forward from authenticated port-8090 state but continues locally when that state temporarily stops advancing during a reboot or polling interruption. The stale remote elapsed label is hidden to prevent contradictory times.
- The native document no longer creates a collapsed-margin outer scrollbar. The stage shell scrolls internally only when the available display height genuinely cannot contain its content.
- Stage fitting preserves the current user-selected window position. Resizing is non-animated and changes the position only by the minimum amount required to keep the window inside the active display work area. Initial launch remains centered.

Required focused acceptance:

1. Move the native window away from the center before connecting and verify that Connect → Verify → Start → embedded progress does not recenter it.
2. Confirm no outer scrollbar appears when the complete active panel fits the display.
3. Confirm the native embedded-header elapsed clock advances once per second while the Pi progress state is unchanged or temporarily unavailable.
4. Confirm the existing authenticated 100% acceptance, First Setup browser handoff and automatic native-app closure remain unchanged.
