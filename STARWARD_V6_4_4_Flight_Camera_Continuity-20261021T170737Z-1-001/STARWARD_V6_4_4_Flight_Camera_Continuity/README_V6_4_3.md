# STARWARD V6.4.3 — Rocket Flight Realism

This is the complete existing STARWARD project with targeted flight-physics, gravity-turn, telemetry, and orbit-validation fixes. It is not a rewrite and does not use a prerecorded flight.

## Run locally in VS Code

1. Extract the ZIP into a normal writable folder.
2. Open the folder containing `index.html`, `style.css`, `js/`, and `assets/` in VS Code.
3. Install/enable the **Live Server** extension if needed.
4. Right-click the root `index.html` and choose **Open with Live Server**. Do not open the file directly with `file://`.
5. Click **LAUNCH VEHICLE**, set throttle, then press **SPACE** or click the stage button to ignite the active stage.
6. `G` toggles automatic gravity-turn guidance. A/D or arrow keys manually steer while held. W/S adjust throttle; Z requests full throttle; X requests cutoff. `1`–`4` change camera modes. `P` pauses; comma/period adjust supported time warp.

If the browser seems to show stale code, hard-refresh. The entry path and flight modules use the V6.4.3 cache/build identifiers.

## What changed

- Auto gravity turn uses actual altitude, target altitude, flight-path angle, and dynamic pressure; manual steering remains available.
- Auto throttle reduces commanded thrust near a 4 g target; telemetry shows the physical result, not a clipped number.
- Max-Q is recorded from the running dynamic-pressure history.
- Fuel depletion limits the final timestep's thrust to the propellant actually available. Thrust becomes zero at burnout, while gravity continues moving the vehicle.
- Mach is not displayed as a meaningful quantity in vacuum.
- The HUD distinguishes objective completion, powered ascent, coast, suborbital outcome, and a verified bound orbit.
- Orbit requires a bound trajectory, cutoff, and a periapsis clear of the modeled atmosphere; altitude alone cannot pass.

## Tests

```bash
npm test
find js -name '*.js' -print0 | xargs -0 -n1 node --check
```

Read `TESTING_REPORT_V6_4_3.md` for automated results, browser method, measured telemetry, screenshots, and unverified items. Read `ROOT_CAUSE_REPORT_V6_4_3.md` for the confirmed findings and `RESEARCH_TO_CODE_GAP_ANALYSIS_V6_4_3.md` for simplifications.

## Important limitations

The starter vehicle cannot reach orbit with its configured ideal delta-v (about 6.10 km/s). The verified browser flight therefore ends as a suborbital coast with a periapsis intersecting Earth; it is not forced into orbit. Multi-stage live launch, payload deployment during this flight, full atmospheric re-entry, and the VS Code Live Server extension itself were not verified in this environment. The model is a simplified 2D educational simulation, not a flight-certified aerospace solver or a NASA-validated model.

## V6.4.4 camera follow-up

See `CHANGELOG_V6_4_4.md` for the bounded velocity-relative camera lead added to make flight motion more perceptible without changing physics. `ROOT_CAUSE_REPORT_V6_4_3.md` includes the follow-up findings and clearly records the current browser-verification limitation. Run `npm test` for the automated suite. Browser screenshot verification is still required before claiming full end-to-end visual verification.
