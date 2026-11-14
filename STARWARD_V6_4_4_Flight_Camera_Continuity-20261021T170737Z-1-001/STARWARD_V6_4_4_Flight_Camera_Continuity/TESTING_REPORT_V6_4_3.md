# STARWARD V6.4.3 — Testing and Browser Flight Verification

## Automated test results

| Test | Result | What it establishes |
|---|---|---|
| `npm test` | **PASS — 19 scripts** | Existing mission, operations, deployment, debrief, save/load, budget, solar-system, map, parts, flight, camera, launch-pad, and archive checks plus the new flight-realism test pass. |
| `tools/flightRealismV643Test.js` | **PASS** | Automatic gravity turn creates tangential velocity; actual Max-Q history/event is recorded; throttle guidance stays near 4 g; fuel depletion ends thrust; coast continues; Mach is zero in vacuum; last-step propellant impulse is bounded; true circular orbit validation passes while starter trajectory is rejected; 1×/2× fixed-step grouping is equivalent. |
| `tools/archiveRuntimeAudit.js` (included in suite) | **PASS — 135 references, 67 JS files enumerated** | Local references resolve and project JavaScript parses. |
| Browser resource audit | **PASS — 0 console errors, 0 failed requests, 0 missing local resources** | All requested app modules and assets loaded through the test harness. |
| Freshly extracted final ZIP browser smoke | **PASS** | Build ID loaded; after 10 simulated seconds the starter was at 1.31 km, velocity 271 m/s, fuel 34,393 kg, actual thrust 1.63 MN; no console errors, failed requests, or missing resources. |

An explicit `node --check` sweep of all project JavaScript files is also included in the final packaging pass.

## Real-browser flight run

**Build ID:** `STARWARD-FLIGHT-REALISM-20261016-V6.4.3`  
**Browser:** Chromium / Playwright  
**Execution detail:** direct localhost navigation was blocked by the environment. The actual `index.html` and project resources were loaded through HTTP-style request interception. The app UI was used to launch and ignite the starter. `Game.update` drove the flight through burnout; the same shipped physics/orbit modules continued the same state in fixed 1/60 s steps through apogee and descent. The camera profile and camera easing were updated every simulated step. This is accelerated simulation time, not 430 seconds of wall-clock observation.

### Key live state samples

| Simulated time | Altitude | Speed | Radial speed | Tangential speed | Fuel | Current thrust | Current q | Flight result |
|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 5 s | 0.3 km | 131 m/s | 131 m/s | ~0 m/s | 37,221 kg | 1.74 MN | 10.1 kPa | Powered ascent; pad still naturally visible |
| 12 s | 1.9 km | 323 m/s | 323 m/s | 6 m/s | 33,313 kg | 1.59 MN | 51.0 kPa | Gravity-turn event has initiated; horizon remains visible |
| 20 s | 5.3 km | 516 m/s | 514 m/s | 43 m/s | 29,274 kg | 1.43 MN | 87.3 kPa | Powered ascent; 10 km objective not yet complete |
| 50 s | 30.2 km | 1,215 m/s | 1,162 m/s | 355 m/s | 17,509 kg | 0.97 MN | 25.8 kPa | Max-Q passed; curved Earth reveal developing |
| 75 s | 65.1 km | 1,845 m/s | 1,524 m/s | 1,041 m/s | 10,813 kg | 0.71 MN | 0.99 kPa | Curved Earth limb visible; powered ascent continues |
| 160 s | 176.3 km | 4,075 m/s | 1,033 m/s | 3,942 m/s | 0 kg | 0 N | 0 Pa | Engine cutoff and gravitational coast; suborbital |
| 300 s | 254.1 km | 3,896 m/s | 76 m/s | 3,896 m/s | 0 kg | 0 N | 0 Pa | Near apoapsis; still not orbit |
| 360 s | 246.6 km | 3,914 m/s | −332 m/s | 3,900 m/s | 0 kg | 0 N | 0 Pa | Descending after apoapsis |
| 430 s | 206.5 km | 4,007 m/s | −810 m/s | 3,924 m/s | 0 kg | 0 N | 0 Pa | Continuing coast/descent; re-entry/impact not yet observed |

**Maximum dynamic pressure:** about **92.2 kPa at 7.7 km**, near 24.3 simulated seconds. This is the configured starter's computed result, not a universal vehicle limit.

**At cutoff:** apoapsis was about **254.7 km**; predicted periapsis intersected Earth (about −5,415 km altitude when expressed relative to Earth's surface). At the observed apogee, tangential speed was only about 3.9 km/s, far below the roughly 7.8 km/s circular speed near this altitude. Orbit verification correctly remained false.

## Browser regression checks

- Inspected the prior trouble interval at about 1.9 km in Chromium: altitude 1.9 km, speed 323 m/s, angle about 4°, fuel about 33.3 t, and actual thrust about 1.59 MN. The horizon and launch-site reference stayed spatially coherent; the pad did not reappear after being left behind.
- Changed camera modes with the game paused; position, velocity, fuel, and mass were bit-for-bit unchanged.
- Returned to BUILD and launched again; the new flight began with 40,000 kg fuel, stage 1 active, throttle 100%, and auto gravity turn enabled.
- No console errors, page errors, failed requests, or missing local resources were observed in the final browser runs.

## Visual evidence

Before/after comparisons are included in `verification/`:

- `before-v642-flight-ascent-10s.png` (~4.9 km in the prior build) ↔ `after-v643-flight-20s-5p3km.png` (~5.3 km).
- `before-v642-flight-ascent-20s.png` (~25.4 km) ↔ `after-v643-flight-50s-30km.png` (~30.2 km).
- `before-v642-earth-reveal-30s.png` (~69.1 km) ↔ `after-v643-earth-reveal-75s-65km.png` (~65.1 km).
- Additional after screenshots cover 1.9 km, cutoff/coast at 176.3 km, near-apogee at 254.1 km, and the descending arc at 246.6 km and 206.5 km.
- `verification/v643/browser-flight-evidence.json` and `browser-regression-evidence.json` contain raw sampled state and browser regression results. `fresh-package-browser-smoke.png/.json` show the separately extracted final ZIP loaded in Chromium and advanced through a 10-second launch smoke test.

## Acceptance boundary / not claimed

- **Verified:** actual UI launch, liftoff, gravity-turn initiation, Max-Q history, atmospheric/curved-Earth transition, fuel exhaustion, thrust cutoff, gravity-driven coast, apoapsis passage, descent after apoapsis, camera state independence, and restart.
- **Not achieved:** orbit. The starter's ideal delta-v is about 6.10 km/s, less than circular orbital speed before losses; the actual periapsis intersects Earth.
- **Not tested in live launch:** multi-stage separation, upper-stage ignition, fairing separation, payload separation, and post-launch spacecraft operations. The observed starter is single-stage; existing automated mission/deployment/operations tests still pass.
- **Not observed:** atmospheric re-entry or impact after the descending coast.
- **Environment limitation:** the VS Code Live Server extension was not directly opened because direct localhost navigation is blocked in this environment. The actual app rendered in Chromium through resource interception.
- **Model limitation:** no full six-degree-of-freedom flight solver, lift/angle-of-attack force model, Mach-dependent drag table, structural load limit, nozzle flow solver, or full standard atmosphere. This is an educational 2D approximation, not a certified or NASA-validated model.

## References

See `NASA_REFERENCES_V6_4_3.md` and the bundled research PDF. The governing principles are consistent with NASA Glenn's descriptions of rocket thrust, changing-mass ideal delta-v, and the need for horizontal orbital velocity; STARWARD's simplified implementation is not represented as a NASA engineering model.
