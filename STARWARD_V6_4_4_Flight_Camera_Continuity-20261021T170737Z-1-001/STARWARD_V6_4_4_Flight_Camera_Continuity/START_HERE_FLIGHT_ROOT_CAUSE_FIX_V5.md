# STARWARD Flight Root-Cause Repair V5

## Why V4 still looked broken

1. `updateFlightCamera()` used `canvasHeight * 0.42 / altitude`. That made the camera zoom proportional to `1/altitude`; consequently `altitude * zoom` stayed almost constant. Because the rocket is screen-anchored, the synthetic horizon barely moved and ascent appeared to freeze near the low-kilometre range. The later globe zoom could then feel like a jump.
2. `launch()` captured the pad as an absolute world coordinate while the Earth center is recomputed every physics step as it orbits the Sun. `renderer.launchPad()` then subtracted the body's *current* position from that stale world coordinate, changing the inferred surface angle. The pad could drift around Earth and re-enter the viewport.
3. The launch pad had a forced 24-pixel minimum width and altitude toggle. That contradicted world-space perspective: an object that should shrink below a pixel could remain visible, disappear, and be artificially restored by a small altitude fluctuation.
4. The planet transition was driven only by projected radius. It could leave a gap between the local horizon and globe rendering. V5 combines projected globe size with a continuous altitude reveal.

## Fixes

- Added `js/flight/flightCameraProfile.js`: camera framing now matches the close launch zoom, uses a sublinear local pullback that lets the screen-space horizon recede, and blends to planet-scale zoom across the climb. A shared smooth reveal combines the planet and local horizon without a hard threshold.
- Added `js/flight/launchSite.js`: launch pad is stored in body-local radial coordinates and resolved from the body's current position every render. Pad size is proportional to world zoom, has no forced minimum, and is culled when sub-pixel/offscreen; no altitude toggle can bring it back.
- Updated `game.js`, `renderer.js`, cache tokens and build ID.
- Added regression tests for zoom/horizon progression around 1500–1700m, smooth transition through 100km, and launch-site invariance as Earth translates.

## Run locally

1. Extract this ZIP into a new folder; keep previous versions as backup.
2. Open this extracted folder in VS Code.
3. Start Live Server from this folder's `index.html` (not an older browser tab/server folder).
4. Hard reload (`Ctrl+Shift+R`). In Console run `window.__STARWARD_BUILD_ID`; expected value is `STARWARD-MISSION-SYSTEMS-20261016-V6`.
5. Start Starter Rocket at 1× warp. Check the pad while crossing 1.5–1.7km, then inspect the horizon/globe handoff through 60–100km.
6. Run `npm test` in the project folder for the automated regression suite.

## Verification limits

Automated tests and source/package validation are included. Browser navigation in the build environment is blocked, so the full visual ascent still requires a local Live Server run to confirm the canvas appearance on the target computer.
