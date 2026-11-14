# STARWARD V6.4.1 — Testing and Verification Report

Date: 2026-10-16

## Executive result

V6.4.1 is a tested hardening release based on V6.3/V6.4. The actual rendered game and early ascent were inspected in Chromium through Playwright, and a separate controlled browser workflow exercised physical payload separation, post-deployment science, downlink and mission debrief. **The complete launch-to-orbit flight was not verified.** The starter rocket remained suborbital in the observed live flight, and the successful debrief workflow used a mathematically seeded 500 km orbit; it is not evidence that the rocket achieved orbit.

## Defects found and changes made

1. **Horizon/globe handoff gap.** Rendered early flight showed the local horizon could leave the viewport before the globe visibly blended in. The reveal now completes over the lower atmosphere; the camera remains altitude-driven and continuous, with no forced object hiding or timer-based disguise. New tests assert meaningful reveal at 5 km and 8 km.
2. **Readiness/operations component mismatch.** The build-time mission assessment and post-launch operations used separate component tables, different base loads and incomplete loads for antennas/control hardware. Both now use the same exported component inventory; only installed parts contribute load, and batteries no longer count as continuous generation.
3. **Power status was too coarse.** Mission readiness checks the profile's required generation and configured operating load. Debrief power status also considers recorded energy shortfalls and reports generation, requirement and operating load separately.
4. **Communications data loop.** If a communications-profile spacecraft also had a science instrument, the science branch prevented telemetry from accumulating. Science and telemetry now accumulate independently when both are configured and powered.
5. **Operations telemetry.** The panel distinguishes current generated output from maximum installed generation and configured load.
6. **Cache identity.** All module query IDs and the build ID were bumped to V6.4.1 so patched files are not hidden behind V6.4 browser caches.
7. **Existing V6.4 features retained.** Physical separation, orbit/cutoff gates, component-driven operations, downlink retention on failure, calculated debrief, save/load safety and reset-state cleanup remain in place.

## Automated verification

- `npm test`: **PASS** — 18 test scripts in the package chain.
- New/expanded mission checks: 9 readiness checks, 32 operations checks, 11 deployment checks, 16 debrief checks, 7 save/load checks and 22 integration checks.
- Existing budget, world-system, orbital map, artwork, flight-regression, camera-stability, camera-transition, flight-policy and launch-pad regression checks pass.
- JavaScript syntax: `node --check` passed for all 66 JavaScript files.
- Archive/static reference audit: **127** local HTML/CSS/module references resolve; 66 JavaScript files were enumerated.
- HTTP server smoke test: a local Python HTTP server returned **200** for all **216** project files fetched; no content-length mismatches.

## Browser interaction and rendered flight

### Browser setup constraints

- System Chromium 144 was launched through Playwright with `--no-sandbox`, `--disable-dev-shm-usage`, `--disable-gpu` and `--use-gl=swiftshader`.
- Direct navigation to a local HTTP URL returned `net::ERR_BLOCKED_BY_ADMINISTRATOR` in this environment. The HTML was therefore loaded into a real Chromium page and Playwright intercepted app requests, serving the exact local project files with appropriate content types.
- This is real browser rendering and interaction, but it does **not** certify the VS Code Live Server extension itself.

### Fresh live-flight run

- The game initialized, rendered the canvas and displayed the V6.4.1 build ID.
- The starter rocket was launched through the UI, the next stage was ignited, and full throttle was held.
- An 18-second observed run reached approximately **4.6 km on the flight HUD** (the sampled radial distance was about 5.3 km). In the sampled interval altitude increased continuously, fuel decreased, the rocket did not report a crash, and the visible local horizon remained under the vehicle during the camera transition after the V6.4.1 change.
- The inspected browser run had **0 JavaScript console errors, 0 page errors, 0 missing local resources**, with 103 unique local resources served by the browser interception route.
- Screenshots: `evidence/build-browser-v6.4.1.png` and `evidence/flight-browser-v6.4.1-early-ascent.png`.
- A longer 30-sample live run exceeded the execution environment's command time limit. The run was not watched through fuel exhaustion or complete orbit insertion.

### Seeded-orbit operations workflow

This was a separate controlled workflow; it did **not** launch the spacecraft into orbit. A payload-bearing carrier was placed into a mathematically seeded, approximately circular 500 km Earth orbit. Actual UI buttons then exercised the deployment and operations flow:

- **Physical deployment:** carrier and spacecraft became different objects; science hardware was removed from the carrier inventory (3 carrier parts remained) and present on the independent spacecraft (5 payload parts).
- **Science control:** toggling science off stopped data growth after the UI/frame transition; toggling it back on resumed data collection.
- **Power UI:** displayed current output, installed maximum and operating load (`22 now / 30 max gen · 17 load` in the observed state).
- **Downlink:** one successful attempt transferred **0.780 MB**; stored data was not driven negative and no transfer failure was recorded.
- **Debrief:** the seeded state returned `COMPLETE SUCCESS`, with target orbit, deployment, collected/downlinked data, power, battery, communications and budget details visible. This result validates the controlled operations workflow only, not launch-to-orbit performance.
- This browser workflow had **0 console errors, 0 page errors and 0 missing local resources**. Screenshot: `evidence/operations-browser-v6.4.1-seeded-orbit.png`.

## Flight assessment

- Automated regression tests continue to cover continuous ascent through the historical 1.4–1.8 km band, a 100-second deterministic powered/coasting flight, camera stability, zoom-profile continuity, time-warp policy and launch-pad anchoring.
- Visual inspection in this run reached early ascent (~4.6 km) and showed the horizon still visible under the rocket after the camera handoff change. No pad reappearance, freeze or teleport was observed in that interval.
- **Not verified:** Earth reveal through the upper atmosphere, final coast, actual bound orbital insertion, real-launch spacecraft separation, and a complete end-to-end flight. The observed starter trajectory was suborbital; its displayed periapsis remained at/near the surface. The debrief must not grade that flight as complete success.

## Remaining limitations

- Lunar/planetary transfer, arrival and landing mechanics are not implemented; those profiles cannot receive complete-success status.
- Deployment uses a simplified low-energy separation impulse/recoil, not detailed mechanism/contact/debris dynamics.
- Target-orbit comparison uses an approximate mean-altitude tolerance and does not prove long-term orbital stability.
- Power, science/data rates and communications range are normalized gameplay models; no RF link budget, thermal model, eclipse geometry or component degradation is implemented.
- Deployed spacecraft and live operations are not persisted in saves; load resets operations rather than reusing stale state.
- The VS Code Live Server extension was not launched in this environment. Use `README_V6_4_1.md` to repeat browser verification on a desktop browser before claiming complete end-to-end mission success.
