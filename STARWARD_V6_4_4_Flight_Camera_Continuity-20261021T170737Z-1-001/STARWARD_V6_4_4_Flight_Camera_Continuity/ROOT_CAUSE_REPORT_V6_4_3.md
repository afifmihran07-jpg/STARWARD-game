# STARWARD V6.4.3 — Root-Cause and Flight Findings

## Summary

The supplied V6.4.2 project was audited and then changed in place. The primary confirmed defect was not a camera-triggered teleport: the flight controller had no automatic gravity-turn guidance, and the HUD conflated several telemetry/event concepts. The current camera already had continuous zoom/reveal interpolation from V6.4.2; the smaller Earth disk is the expected result of moving from local-horizon scale to planet scale.

## Confirmed findings and fixes

### 1. Near-vertical ascent

**Cause:** `js/flight/flightController.js` provided throttle and manual steering input but no automatic mission-aware pitch-over. The starter could remain almost vertical until the atmosphere became thin.

**Fix:** Added deterministic gravity-turn guidance using altitude and target-orbit altitude, with a velocity-relative angle-of-attack margin tied to dynamic pressure. Auto guidance is enabled on launch; A/D remains available as a manual override, and G toggles guidance. The 2D controller is an educational approximation, not an optimal trajectory solver.

**Observed result:** In the browser run, tangential velocity grew from about 6 m/s at 1.9 km to 355 m/s at 30.2 km, 1.04 km/s at 65.1 km, and 3.94 km/s at engine cutoff. The trajectory is no longer a vertical-only ascent.

### 2. Starter rocket does not achieve orbit

**Cause:** The configured starter has 47,170 kg initial mass, 40,000 kg propellant, 2.24 MN nominal engine thrust, and about 6,096.5 m/s ideal delta-v. That ideal delta-v is already below the approximately 7.8 km/s circular speed near low Earth orbit, before gravity and drag losses.

**Result:** It must not be forced into orbit. The browser flight reached about 166.2 km at cutoff with approximately 4,075 m/s total speed (1,033 m/s radial and 3,942 m/s tangential). Fuel and thrust then reached zero while the vehicle continued under gravity. The predicted apoapsis was about 254.7 km, but the periapsis intersected Earth. The vehicle reached about 254.1 km near apogee and was descending at about 206.5 km by simulated t=430 s. No orbit was claimed.

### 3. High TWR / G-force telemetry

**Cause:** The starter's nominal 2.24 MN thrust divided by its 47.17 t initial mass gives a sea-level TWR near 4.84. As propellant is consumed, an unthrottled engine would produce a much higher thrust-to-mass ratio. The screenshot's late-flight high TWR is therefore consistent with the configured thrust and low remaining mass, not a kN-to-N unit conversion error.

**Fix:** Auto guidance now reduces commanded throttle near a 4 g target. TWR uses actual simulated thrust and local gravity; G-force is still calculated from the physical acceleration excluding gravity, not clipped in the HUD. In the browser run the recorded G-force remained at or below about 4.0 g after guidance settled.

### 4. Fuel depletion impulse

**Cause:** The previous burn path applied full engine thrust for the whole final timestep even when less propellant remained than the nominal mass-flow demand.

**Fix:** The last-step effective thrust is derived from the amount of propellant actually available and burned during that timestep. Fuel exhaustion produces zero thrust, followed by gravity-driven coast.

### 5. Max-Q

**Cause:** The old HUD appended `MAX-Q!` whenever instantaneous dynamic pressure exceeded a fixed 20 kPa threshold. That was a threshold warning, not a measured maximum.

**Fix:** The simulation records a running maximum of actual dynamic pressure and its altitude/time. A Max-Q event is recorded when pressure has peaked and is falling. In the observed starter flight, Max-Q was approximately **92.2 kPa at 7.7 km** around 24.3 simulated seconds. This is the model's result, not a universal structural limit or NASA vehicle prediction.

### 6. Orbit classification and periapsis display

**Cause:** High apoapsis or altitude could be mistaken for orbit success; a periapsis intersecting Earth was rendered as `0 m`, which obscured the actual failure condition.

**Fix:** Orbit verification now requires a bound osculating orbit, engine cutoff, current altitude outside the modeled atmosphere, and a predicted periapsis above the atmosphere plus a 10 km margin. The HUD reports `BODY INTERSECTION`, `ATMOSPHERIC`, or `UNBOUND` instead of showing a misleading zero periapsis. The starter remains `COASTING · SUBORBITAL`.

### 7. Mach in vacuum

**Cause:** The prior model continued dividing velocity by an invented sound speed after leaving the atmosphere, producing a meaningless high Mach number in vacuum.

**Fix:** Earth Mach uses a piecewise temperature-based speed-of-sound estimate while inside the modeled atmosphere. In vacuum, Mach is zero internally and shown as `N/A · VACUUM`. Other bodies still use a deliberately simplified sound-speed envelope.

### 8. Earth reveal and camera continuity

**Finding:** The V6.4.2 camera already blended zoom in log space and combined the projected-globe blend with altitude reveal. Its local-horizon pullback exponent and reveal completion had already been adjusted to avoid the V6.4.1 blue-sky dead band. The apparent Earth-size reduction is a continuous move to a planet-scale view, not a change to Earth's physical radius or rocket trajectory.

**Browser evidence:** At 1.9 km the ground/horizon and pad are still naturally within view; at 5.3 km the local horizon remains visible; at 30.2–65.1 km the horizon becomes a curved planetary limb; at 176.3 km the globe is fully visible and framed consistently with the vehicle. The pad did not reappear after the camera had pulled out. No extra camera system was added.

### 9. Physics timestep audit correction

A first-pass note described the flight loop as variable-step. Further tracing corrected that conclusion: during supported flight warp (up to 50×), the loop uses `steps = warp` and `sdt = dt * warp / steps`, leaving each physics substep at the frame's 1/60 s `dt`. The V6.4.2 flight loop therefore already uses fixed-size substeps for supported flight warp. No unnecessary integration rewrite was made; a regression test now checks equivalent fixed-step simulation time grouped as 1× versus 2×.

## Not verified

- A successful launch-to-orbit using a vehicle with sufficient delta-v.
- Multi-stage separation/upper-stage ignition in the live browser; the tested starter is single-stage.
- Payload separation and post-launch operations during this launch. Existing separate mission/deployment/operations tests remain green, but a seeded-orbit test is not launch evidence.
- Atmospheric re-entry/impact after the observed descending coast.
- VS Code Live Server itself. Direct localhost navigation was blocked by the execution environment; Chromium ran the actual app files through request interception.

---

# V6.4.4 Follow-up — Camera Lead and Verification Boundary

## Additional presentation finding

The camera maintained a strict rocket-relative screen anchor in every flight mode. This preserved zoom continuity but also kept the rocket visually pinned while the terrain and globe transitioned in the background. That behavior is not itself a physics freeze, but it can weaken the viewer's perception of acceleration and forward travel.

## V6.4.4 change

A bounded velocity-relative look-ahead now shifts the camera aim point by up to 4.5% of viewport dimensions in chase/close/planet modes, fading in from 80 m/s to 1.8 km/s. The velocity is measured relative to the primary body's velocity. Centered mode remains centered. This is strictly a camera target offset and does not feed back into the simulation state. Automated regression checks cover the low-speed behavior, bound, and centered mode.

## What remains unverified

The automated suite validates camera math and physics invariants, but a real rendered flight was not captured for V6.4.4 in this execution environment. Headless Chromium was blocked from loading the local server, and no separate six-image screenshot set was present alongside the supplied ZIP. Consequently, there is no V6.4.4 screenshot or end-to-end browser evidence here for liftoff, Max-Q, upper-atmosphere transition, cutoff, coast, or orbit insertion. The next verification must be run in a normal browser/VS Code Live Server environment and record those states. No successful orbital insertion is claimed.
