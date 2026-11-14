# STARWARD V6.4.3 — Research-to-Code Gap Analysis

## Alignment with the supplied blueprint

- **Newtonian force balance:** thrust, gravity, and drag continue to update the physical state; the new gravity-turn controller changes the actual thrust direction instead of moving a sprite along a canned path.
- **Mass depletion / rocket equation:** propellant is consumed from engine Isp and thrust; the final partial burn step is now limited to the available propellant. The build's ideal delta-v estimate is used to explain why the starter cannot reach orbit.
- **Gravity turn:** a deterministic, state-aware approximation now builds tangential velocity. It is not a solved optimal trajectory and does not model full 6-DOF control.
- **Dynamic pressure:** Max-Q is derived from the running history of `q = 1/2 rho v_rel^2`, not a fixed HUD threshold.
- **Orbit classification:** apoapsis/periapsis come from the current position/velocity state. The HUD distinguishes a predicted high point from an orbit whose periapsis clears the modeled atmosphere after cutoff.
- **Camera:** the V6.4.2 camera's continuous log-space zoom, reveal blend, atmosphere fade, and launch-pad continuity were retained and verified through the full observed flight. The smaller Earth disk at high altitude is expected scale framing.
- **Mission loop:** the altitude objective can complete while the overall flight remains suborbital; the UI explicitly says the flight continues until orbit/deployment.

## Deliberate adaptations for the existing 2D engine

- The report suggests fixed timestep 0.02–0.05 s; the game already advances flight physics in 1/60 s substeps for supported flight warp, so this release preserves that architecture.
- The gravity turn is an altitude/velocity/dynamic-pressure-aware pitch approximation. It does not solve a full guidance-and-navigation optimal control problem.
- The atmosphere retains the existing exponential density approximation. Earth Mach now uses a piecewise temperature-based speed-of-sound estimate, but density, pressure, drag coefficient, and area are not a complete NASA standard-atmosphere or transonic drag model.
- No floating origin was needed for this 2D implementation; the existing camera keeps the authoritative inertial position/velocity unchanged and renders body-relative geometry.
- The Earth reveal is a presentation blend between local horizon and globe geometry, not a physical mode switch. The transition was verified visually rather than replaced with a separate orbital camera.

## Still out of scope / simplified

- Real engine nozzle pressure correction, altitude-dependent thrust tables, mixture ratio, tank pressurization, and engine start transients.
- Mach-dependent drag coefficient, lift, angle-of-attack force, dynamic structural loads, and full six-degree-of-freedom attitude dynamics.
- A production-grade ascent optimizer and vehicle-specific structural Max-Q limit.
- Multistage flight validation, fairing sequencing, a capable multi-stage launch-to-orbit test, complete orbital insertion, one-revolution confirmation, and re-entry/impact.
- Complete lunar/planetary transfer and arrival mechanics.

## Evidence boundary

The browser run is a real rendering and interaction of the actual app source in Chromium. The UI was used to launch and ignite the starter; the Game update loop ran through cutoff, then the same shipped physics/orbit modules continued the same vehicle in fixed 1/60 s steps through apogee and descent. The environment blocked direct navigation to localhost, so the project was served to Chromium through a Playwright request-interception harness. This does not certify the VS Code Live Server extension itself.
