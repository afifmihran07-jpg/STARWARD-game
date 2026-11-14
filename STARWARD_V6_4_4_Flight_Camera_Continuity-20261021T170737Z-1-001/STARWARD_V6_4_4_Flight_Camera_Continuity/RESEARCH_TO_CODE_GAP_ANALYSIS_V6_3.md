# STARWARD V6.3 — Research-to-Code Gap Analysis

## Source basis

Primary research input: *STARWARD: Space Mission Design Game – Research Report & Implementation Blueprint* (30 pages). Its core requirement is an end-to-end interactive mission where mission objective, spacecraft design, launch vehicle, budget, power, mass, communications, orbital constraints, flight and mission outcomes affect one another (report pp. 1–4, 15–19, 29–30).

This is a code audit of the supplied V6.2 ZIP. Claims below distinguish existing code from this update; it is not an assertion of official NASA endorsement.

## Feature inventory

| Feature | Observed implementation | Status | Notes |
|---|---|---|---|
| Rocket construction | `js/construction/editor.js`, `js/rocket/partDefinitions.js`, `js/ui/buildUI.js` | Implemented | Part-based editor with mass, thrust, cost and artwork. |
| Newtonian flight | `js/physics/physics.js`, `js/physics/gravity.js` | Implemented, simplified | Gravity, stage engine thrust, propellant burn, atmospheric drag, attitude dynamics and collision. The integrator is an explicit step, not a validated high-fidelity launch-vehicle solver. |
| Propellant and staging | `js/rocket/rocket.js`, `js/physics/physics.js` | Implemented | Fuel depletion and automatic next-stage logic exist; staged vehicle configuration remains game-scale. |
| Orbital elements | `js/physics/orbitalMechanics.js` | Implemented, simplified | Computes two-body osculating elements relative to a selected body; the full launch is still multi-body influenced. |
| Camera/Earth reveal | `js/flight/flightCameraProfile.js`, `js/game.js`, `js/camera.js` | Implemented, regression-tested | Continuous zoom/horizon profile and camera modes. Actual rendered quality requires manual/browser verification. |
| Mission objectives | `js/missions/missionManager.js` | Implemented | Campaign goals include altitude, orbit and destination-oriented challenges; not all objectives imply a fully validated transfer. |
| Budget | `js/construction/budget.js` | Implemented, estimates | NASA-anchored programme budget classes plus parametric cost estimates; values are educational estimates, not mission proposals. |
| Design readiness | `js/construction/missionSystems.js` | Implemented, simplified | Uses capability units for science, power, comms, control and launch readiness. |
| Spacecraft operations | Before this update: no connected persistent science/data/downlink loop | Gap; partially addressed in V6.3 | New operations model unlocks only after a bound-orbit check; instrument control, stored data and downlink now respond to component choices. |
| Physical payload separation | No complete payload-deployment model found in audited workflow | Missing / unverified | V6.3 explicitly does not claim a spacecraft has physically separated. |
| Lunar/planetary arrival | Mission labels exist, but a complete target-body transfer/arrival validation was not established | Incomplete | V6.3 refuses to unlock Earth-orbit operations as if lunar/planetary arrival had occurred. |
| Mission debrief | Campaign progress exists; a complete engineering/science debrief linked to the new operations model is not established | Incomplete | Future work should score actual orbit, science data, power, downlink and cost together. |
| Audio and cinematic 3D launch | No evidence of a full 3D rendering/audio pipeline in this project | Not implemented as specified | The supplied project is a 2D canvas spaceflight simulation, not a 3D cinematic simulator. |

## Research-to-code matrix

| Research finding | Existing implementation | Gap | V6.3 change | Priority | Verification |
|---|---|---|---|---|---|
| Decisions should affect mission outcomes (report pp. 2–4, 14–16) | `missionSystems.js` readiness model | Readiness did not continue into a post-launch operational loop | Added `missionOperations.js` using configured part types to derive science capability, power generation/load, communications and data rate | Must/Should bridge | `tools/missionOperationsTest.js`; `npm test` |
| Do not declare orbit from altitude alone (report pp. 9–10) | `orbitElements.js` calculates periapsis/apoapsis/eccentricity | Operations need a clear gate | Operations unlock only when orbit is bound and periapsis clears the body's radius | Must | Tests reject suborbital and escape trajectories |
| Power and instruments must create trade-offs (report pp. 11–13) | Design readiness has normalized generation/load estimates | No runtime instrument on/off or data accumulation loop | Instrument toggle changes whether science data is produced; battery and power values are updated using explicitly normalized game units | Should | Test checks data stops when instrument is off |
| Communications must not be decorative (report pp. 12–13) | Comms readiness score in design phase | No data downlink action connected to comms readiness | Downlink action checks the profile's communications capability and moves data from stored to downlinked totals | Should | Test checks weak communications block downlink |
| Multi-body destination missions require transfer/arrival logic (report pp. 9–10, 14) | Destination-oriented mission labels exist | No complete verified lunar/planetary transfer lifecycle | Operations do not falsely unlock for lunar/planetary profiles on an Earth-bound orbit | Must for honesty | Test confirms those profiles remain locked |
| Stable simulation/render separation (report pp. 4, 9, 22–27) | Physics and camera are separate modules | Browser-rendered continuity still requires human visual check | Kept simulation and camera coordinates separate; added no camera-driven physical changes | Must | Existing flight/camera regression tests |
| Resource paths and runtime integrity | Existing archive audit | Need a fresh packaged source check after edits | Added operations module to module path checks; cache identifiers bumped to V6.3 | Must | archive audit and HTTP request smoke test |

## Important scientific qualifications

- The project uses game-scale normalized capability units for spacecraft science/power. They are not watt-hour, link-budget, or instrument-datasheet predictions.
- The new downlink model is a relative range/capability gameplay approximation, not a full RF link budget using frequency, gains, noise temperature, bandwidth and Shannon capacity.
- `orbitElements` provides two-body osculating elements. A mathematically bound osculating orbit is not by itself proof of a mission-specific target orbit or successful insertion under every perturbation.
- The new operations panel says physical payload separation is not modeled. Lunar/planetary transfer and arrival remain incomplete.
- The supplied research report itself says the architecture cannot be audited without source code (p. 4); this ZIP audit supplies that source-level inspection but does not validate NASA's official event page independently.

## Next highest-value work

1. Implement an explicit spacecraft/payload separation state tied to staging and orbital conditions.
2. Add a target-orbit planner and a mission-specific insertion acceptance check.
3. Produce a debrief from actual orbit elements, configured objectives, stored/downlinked data, power balance and cost.
4. Add deterministic tests for full mission state transitions and then browser automation/visual inspection for flight presentation.
5. Only after those are complete, expand multi-body transfer fidelity and optional audio/visual effects.
