# STARWARD V6.4.2 — Flight Refinement

## Scope

Focused flight presentation refinement on top of V6.4.1. Rocket construction, mission systems, deployment, save/load, orbital-map controls, and debrief logic were left intact.

## Defects identified in V6.4.1

- The camera's local pullback exponent (`altitude^-0.62`) allowed the projected ground gap to grow beyond the viewport before Earth became visible. The resulting frame could show only sky, with neither the local horizon nor the globe — a dead band.
- The altitude-driven globe reveal completed at 12% of the configured atmosphere, pulling the globe into dominance too early and concentrating the large zoom transition into the lower atmosphere.
- The atmospheric overlay retained a fixed top opacity after its other stops had faded, causing a small opacity discontinuity when the overlay stopped drawing.
- The starfield was drawn twice during part of the atmospheric transition.
- The rocket's detailed sprite stayed at essentially the same oversized display scale throughout the reveal, while the separate marker could appear early and compete with it.
- Renderer imports still used V6.0 cache keys while the entry path used V6.4.1, allowing stale duplicate module instances in a browser cache.

## Changes

- Increased the local camera pullback exponent to `0.90`, retaining the 1.5 km reference framing while keeping the local horizon visible longer. This is camera-only and does not change the physical trajectory.
- Extended the smooth globe handoff to 92% of the configured atmosphere height. The Earth reveal remains monotonic and transitions gradually instead of completing near 10–12 km.
- Added `atmosphereVisualProfile()` to provide one shared exponential visual-scattering envelope and a gradual 18–83 km star visibility ramp. These are rendering approximations, not a full radiative-transfer or standard-atmosphere model.
- Made all atmospheric color-stop opacities fade with the same exponential envelope; removed duplicate star drawing.
- Added `rocketDisplayScale()` so the detailed vehicle recedes smoothly from close launch framing toward a small high-altitude representation. This scale is presentation-only and never feeds back into physics.
- Delayed the additional tracking ring until the reveal is well advanced or the true projected vehicle size is small.
- Updated renderer sub-import cache identifiers and the runtime build identifier to V6.4.2.
- Extended camera/launch-pad regression tests to cover reveal progression, monotonic atmosphere and star fade, display-scale bounds, and the revised 1.5–1.7 km framing behavior.

## Scientific basis and assumptions

- NASA Glenn's generalized rocket thrust equation includes exhaust momentum and the nozzle exit-pressure/ambient-pressure term. The existing flight model uses simplified thrust and Isp data; it does not solve nozzle flow or the full generalized thrust equation dynamically.
- NASA Glenn's ideal rocket equation explains the effect of changing mass during propellant consumption. The existing model burns fuel and updates mass, but its engine values and component stats are illustrative game parameters, not a certified real launch vehicle.
- The atmospheric visual scale height uses an Earth-like approximate value of 8.5 km. It is not a full US Standard Atmosphere or wavelength-dependent scattering calculation.
- 100 km is a commonly used convention for the boundary of space, not a physical discontinuity. The sky/star transition is gradual and is deliberately distinct from the HUD's mission-phase labels.
- No NASA endorsement or validation of STARWARD is implied.

## Verification summary

- `npm test`: all 18 scripts pass.
- JavaScript syntax: all 66 JavaScript files pass `node --check`.
- Static local-reference audit: 127 references resolve.
- HTTP resource smoke check: all 216 project files returned successful responses from the local static server.
- Browser route-interception run: 124 resource requests, no failed requests, no console errors, and no page errors. Actual game controls launched the starter vehicle. Live ascent was observed to 5.0 km, 25.4 km, and 69.1 km in separate browser runs; Earth/horizon continuity and the globe reveal were visually inspected in the included screenshots.
- The 69.1 km sample had a finite upward trajectory, a live engine, no crash, and an Earth disk visible behind the vehicle. This was powered ascent, not orbital insertion.
- Direct Chromium navigation to localhost and file URLs was blocked by the environment's browser policy. The app was therefore loaded in Chromium using a Playwright interception harness that mapped HTTP-style module/resource requests to the exact extracted project files. This is genuine browser rendering and interaction, but not certification of the VS Code Live Server extension itself.

## Not claimed as verified

- Complete launch-to-orbit success or orbital insertion from this launch.
- Full end-to-end stage separation, because the observed starter design was single-stage.
- A complete burnout/coast/deployment sequence in a live browser.
- Realistic max-Q/g-limit guidance, six-degree-of-freedom aerodynamics, real engine/nozzle performance, or a full standard-atmosphere model.
- Lunar/planetary transfer or arrival mechanics.
