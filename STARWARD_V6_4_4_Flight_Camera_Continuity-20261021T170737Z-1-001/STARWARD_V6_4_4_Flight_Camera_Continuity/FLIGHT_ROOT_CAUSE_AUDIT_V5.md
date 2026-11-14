# Flight Root-Cause Audit V5

## Confirmed source-level root causes

- Low-altitude camera pullback was exactly inverse-altitude, preserving `altitude × zoom`; with a fixed screen-space rocket anchor this pinned the local horizon and made ascent look stationary in the 1.5–1.7 km window.
- The launch site's saved position was in inertial/world coordinates while the parent body's position changed every `updateOrbits()` step. Subtracting the moving body center from the stale launch position changed the computed surface angle.
- The old launch-pad renderer imposed a 24px minimum width and an altitude cutoff. Those can make a world landmark reappear as the camera changes scale or altitude oscillates.
- Planet rendering was transitioned only from the projected planet radius, leaving a possible interval where the local horizon was nearly offscreen and the planet overlay was not yet visible.

## V5 implementation

- Camera zoom target is a monotonic profile calibrated to the local reference scale at 1.5km, with exponent 0.62 to make `altitude × zoom` increase during local ascent, then uses smooth logarithmic blending into planet framing. The renderer consumes the exact same reveal signal.
- Launch-site coordinates are stored as `(bodyId, local radial angle, surface radius)` and reprojected against the body's current position. Because current body simulation does not implement spin, this body-local coordinate is stable under orbital translation.
- Pad screen size is based on its world width and current zoom. It is not hidden by altitude; it simply becomes subpixel/offscreen and cannot pop back via a hard height gate.
- Added `launchPadRegressionTest.js` and `flightCameraProfileTest.js` to `npm test`.

## Automated verification

Run `npm test`; expected to cover budget, solar-system, map, art pack, starter ascent, camera stability, transition, warp policy, body-local launch pad and 1.5–1.7km camera profile.

This environment blocked browser navigation with `ERR_BLOCKED_BY_ADMINISTRATOR`, so I did not claim a live browser flight test. Browser verification must still be performed on the target computer.
