# STARWARD V6.4.3 — Rocket Flight Realism

## Scope

Targeted changes to the existing V6.4.2 project. The mission builder, mission profiles, budget/readiness checks, orbital map, maneuver planner, spacecraft operations, science/power/comms systems, save/load, and debrief architecture were retained.

## Changes

- Added a deterministic automatic gravity-turn guidance profile for launches. It uses altitude, vehicle state, target-orbit altitude, current flight-path angle, and dynamic pressure. Manual A/D steering overrides the guidance while held; `G` toggles auto guidance.
- Added automatic throttle reduction to keep powered acceleration near the configured 4 g guidance target. This changes commanded thrust; displayed acceleration remains the computed result.
- Reduced the aerodynamic weathervane correction while auto guidance is active so it stabilizes attitude without cancelling the pitch-over during dense-atmosphere ascent.
- Corrected the final propellant-step impulse: effective thrust is limited to the propellant mass actually available during that step, avoiding a full-engine impulse after fuel is exhausted.
- Recorded running maximum dynamic pressure and a Max-Q event from the actual pressure history. Max-Q is an event, not a separate flight phase.
- Added a single flight-event record for ignition command, ignition, liftoff, launch-structure clearance, gravity-turn initiation, Max-Q, engine cutoff, coast, stage separation where applicable, and verified orbit where applicable.
- Tightened orbit verification: a high apoapsis or altitude objective alone is insufficient. Verification requires a bound trajectory, engine cutoff, current altitude outside the modeled atmosphere, and a predicted periapsis clearing the modeled atmosphere by 10 km.
- Changed misleading periapsis display from `0 m` to `BODY INTERSECTION`, `ATMOSPHERIC`, or `UNBOUND` as appropriate.
- Corrected Mach telemetry: Earth uses a piecewise temperature-based speed-of-sound estimate in the atmosphere; Mach is marked `N/A · VACUUM` above the modeled atmosphere.
- Corrected TWR to use actual simulated thrust and local gravity, rather than sea-level gravity at all altitudes.
- Added V6.4.3 cache/build identifiers, an end-to-end flight regression test, test evidence, and the prior research PDF to the package.

## Camera finding

No additional camera transform was layered over V6.4.2. Source inspection and browser screenshots confirmed that its existing zoom/reveal interpolation is continuous. Earth becomes smaller as the view transitions from local-horizon framing to planet-scale framing; this is the intended camera pullback, not a physical Earth resize. The final browser run showed the local horizon at low altitude, a curved Earth limb through the upper atmosphere, and a coherent globe in space without a horizon gap or launch-pad reappearance.

## Known limitations

- The starter vehicle is single-stage, so multi-stage separation and upper-stage ignition were not demonstrated in the browser flight.
- The starter's ideal delta-v is about 6.10 km/s, below the roughly 7.8 km/s circular speed required near low Earth orbit even before gravity/drag losses. Its launch therefore correctly remains suborbital.
- The 2D model is not a certified aerospace solver. Aerodynamic lift, Mach-dependent drag coefficients, nozzle pressure correction, structural loads, six-degree-of-freedom dynamics, and a full standard-atmosphere pressure/density table remain simplified or absent.
- The browser run reached the post-burnout coast, apogee, and descending arc, but did not run through atmospheric re-entry or impact.
