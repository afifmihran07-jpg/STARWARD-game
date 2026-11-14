# STARWARD V6.4.4 — Flight Camera Motion Continuity

## Scope

This is a focused follow-up to V6.4.3. It does not restart the research phase, rewrite the flight integrator, change the starter vehicle, or force orbit success.

## Changes

- Added `flightCameraLeadOffset()` as a bounded, pure presentation helper. Chase/close/planet camera modes can aim up to 4.5% of the viewport ahead of the rocket's velocity relative to its primary body; the lead fades in with speed and is disabled in centered mode.
- Wired the look-ahead into `Game.updateFlightCamera()`. The rocket is no longer held at exactly the same relative screen point in all non-centered modes, giving the changing Earth/horizon a stronger sense of motion while retaining the existing continuous zoom, planet reveal, camera mode transitions, and camera anchor architecture.
- Kept the offset in camera coordinates only. It does not modify rocket position, velocity, orientation, throttle, fuel, or physics timestep.
- Updated module cache-busting tokens to V6.4.4 and added regression checks for low-speed fade-in, bounded lead, and centered-mode behavior.
- Preserved the V6.4.3 physical result: the ordinary starter remains suborbital when its actual state produces a periapsis intersecting Earth.

## Verification status

- `npm test`: passed after the changes (including the new camera-lead checks).
- JavaScript syntax and archive-local reference audit: included in the passing test suite.
- Actual browser flight and screenshot capture: **not verified in this environment**. Headless Chromium navigation to the local HTTP server was blocked by the execution environment's browser policy (`127.0.0.1 is blocked`). The provided archive did not contain a separate set of six reference screenshots, so those could not be compared directly here. Do not interpret the passing logic tests as proof of a full browser flight.

## Educational model notice

STARWARD is an educational 2D simulation, not a NASA-validated engineering model. Camera changes are rendering-only. Orbital classification continues to use position and velocity relative to the central body, predicted orbit elements, engine cutoff, and periapsis clearance rather than altitude alone.
