# STARWARD V6 — Mission Systems Layer

- Added six selectable mission profiles: Earth observation, weather/climate, communications, lunar exploration, planetary exploration, and technology demonstration.
- Added a live design-readiness score based on launch feasibility, science capability, power balance/storage, communications capability, and attitude control.
- Connected the assessment to actual placed parts and the existing Rocket statistics; changes to the build refresh the assessment.
- Added actionable warnings and clearly labeled simplified gameplay units.
- Added regression tests for under-equipped and fully capable configurations.
- Kept the V5 launch-site/camera continuity fixes, existing rocket construction, physics, orbital map, maneuver planning, budget model, and assets.

## Verification

`npm test` passes all 11 suites (including the new mission systems checks). Automated checks cover source-level physics/camera regressions; live browser visual acceptance has not been run in this environment.

## Remaining limitations

This release adds a connected mission-design assessment, not a complete science-operations/debrief loop. The existing flight model remains the project's current 2D Newtonian simulation; it is not a photorealistic 3D cinematic launch. Mission profile requirements and power/science values are intentionally simplified gameplay abstractions and should not be represented as real spacecraft engineering specifications.


## V6.2 — Flight experience refinement

- Implemented functional flight camera presets: Chase, Close, Planet, and Center.
- Added clickable camera controls with accessible pressed states and keyboard shortcuts 1–4.
- Camera preset changes interpolate the vehicle's screen-space anchor to reduce framing snaps while keeping the physics state untouched.
- The camera label now reports the active framing preset and a conservative altitude phase (PAD, ASCENT, UPPER ATMOSPHERE, EXOATMOSPHERIC, HIGH FLIGHT); it does not claim orbit solely from altitude.
- Applied manual zoom consistently across camera presets and updated module cache keys/build identity.
- Added camera preset regression tests.
