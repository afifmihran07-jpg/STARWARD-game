# STARWARD V6.3 — Changelog

## Added
- A post-launch mission operations model (`js/missions/missionOperations.js`).
- Operations are gated by a bound osculating orbit whose periapsis clears the central body's radius; altitude alone does not unlock operations.
- Configured science parts generate a simplified science-data stream; the player can switch the instrument off/on.
- Communications capability gates the downlink action; downlink transfers data from stored to downlinked totals.
- The flight UI now shows mission operations status, normalized power/load estimates, battery state, science readiness, stored/downlinked data, and recent events.
- Operations UI refresh is throttled to avoid unnecessary per-frame DOM updates.
- Explicit messaging avoids pretending that physical payload separation or lunar/planetary transfer/arrival is implemented.
- Added `tools/missionOperationsTest.js` with tests for orbit gating, data production, instrument control, downlink, comms limits and unsupported destination honesty.
- Bumped cache/build identifiers to V6.3.

## Preserved
- Existing rocket construction, physics, staging, flight camera profiles, orbital map, maneuver planning, mission profiles, budget model, assets and prior regression suites.

## Limitations
- Power/science are normalized gameplay estimates; downlink is not a full RF link budget.
- Payload separation, mission-specific insertion validation, complete lunar/planetary transfers, and a fully integrated debrief remain future work.
- Browser visual flight verification was not completed in this environment; see `TESTING_REPORT_V6_3.md`.
