# STARWARD — Space Mission Design Game

STARWARD is a browser game for the NASA Space Apps Challenge 2026. You **design a rocket and a spacecraft, launch it, fly it to orbit, deploy the spacecraft and run its mission**: power, science data and downlink. A debrief then grades whether the mission met its goals within its budget.

It is an **educational 2D simulation**: real physics relationships, NASA planetary data, honest simplifications. It is not flight software and is not endorsed by NASA.

The game lives in [`STARWARD_V6_4_4_Flight_Camera_Continuity-20261021T170737Z-1-001/STARWARD_V6_4_4_Flight_Camera_Continuity/`](STARWARD_V6_4_4_Flight_Camera_Continuity-20261021T170737Z-1-001/STARWARD_V6_4_4_Flight_Camera_Continuity/). It is a static ES-module site with no build step.

## Run it

- **Online:** see the GitHub Pages link in the repository's About panel.
- **Locally:** serve the game folder over HTTP (ES modules do not load from `file://`):
  ```
  cd STARWARD_V6_4_4_Flight_Camera_Continuity-20261021T170737Z-1-001/STARWARD_V6_4_4_Flight_Camera_Continuity
  npx serve .        # or: python -m http.server 8000
  ```
  Then open the printed address (e.g. http://localhost:3000 or http://localhost:8000).

## How to play — a first mission in two minutes

1. **BUILD:** open *PRE-BUILT ROCKETS* and choose **Earth Observation (500 km)**. Mission readiness shows 100%, and the budget shows the cost against its NASA-style budget class.
2. Press **LAUNCH VEHICLE**. You are on the launch pad.
3. Press **G** to engage the autopilot, then **SPACE** to ignite. Use **.** to raise time warp: it is limited to 2× below 120 km and up to 50× above.
4. Watch the gravity turn, booster separation and upper-stage ignition, the coast to apoapsis and the circularization burn, until the status reads **ORBIT VERIFIED · ENGINE CUTOFF**.
5. Open **MISSION OPS** (bottom left) and press **DEPLOY SPACECRAFT**. The camera follows the spacecraft; press **V** to switch between it and the carrier.
6. Make sure **SCIENCE** is ON, let data accumulate (use warp), then press **DOWNLINK DATA**.
7. Press **EVALUATE MISSION** for the debrief and grade.

Try the **Starter** rocket the same way: it cannot reach orbit, and the game says so.

### Controls

| Where | Key / input | Action |
|---|---|---|
| Flight | **G** | Autopilot on/off (gravity turn → coast → circularize). Any manual flight key takes over at once. |
| Flight | **SPACE** | Ignite / separate the next stage |
| Flight | **V** | Camera: carrier ↔ deployed spacecraft (view only) |
| Flight | **W / S**, **Z** / **Shift**, **X** | Throttle up / down, full, cut |
| Flight | **A / D** (or ← / →) | Steer |
| Flight | **T** | SAS (stability assist) on/off |
| Flight / Map | **,** / **.** | Time warp down / up (2× max below 120 km) |
| Any | **M** | System map ↔ flight |
| Any | **P** | Pause |
| Build | click a part, then the field | Place a part. Drag to move; **R** rotate; **Del** remove; **Ctrl+Z / Ctrl+Y** undo / redo |
| Map | ← → or **1–9**, **F**, **T**, **Esc**, wheel, drag | Select body, focus, set/clear target, zoom, pan; arm and execute maneuver burns in the side panel |

## What is verified (automated tests in `tools/`, run with `npm test`)

| Behaviour | Test |
|---|---|
| Multi-stage staging fires every stage in order with its own engines and fuel; builder Δv uses the sequential rocket equation | `stagingDeltaVTest.js` |
| **Launch to orbit from the real pad with the autopilot** for every Earth-orbit preset; orbit stable for a full period after cutoff. Earth Observation: 531 × 501 km at T+859 s, max-q 30.6 kPa | `orbitE2ETest.js` |
| Autopilot phases, max-q (35 kPa) and max-g (4 g) limits, staging, failure states (TARGET UNREACHABLE, ENGINE OUT); the player always overrides it | `guidanceTest.js`, `autopilotControlTest.js`, `flightRealismV643Test.js` |
| Spacecraft deployment, power/battery/science data/downlink, debrief grading (including budget) | `missionOpsStagedDeployTest.js`, `missionOpsIntegrationTest.js`, `missionDebriefTest.js`, `missionOperationsTest.js` |
| Maneuver burns use the planet-relative frame and cost propellant (rocket equation) | `maneuverBurnTest.js` |
| Budget enforced on every launch route; presets 100% ready and within budget | `launchBudgetGateTest.js`, `presetBudgetReadinessTest.js` |
| Planetary mass, radius and orbit within 1% of NASA NSSDCA fact sheets | `planetDataTest.js` |
| Time-warp limits; camera focus never changes physics; truthful UI; each JS module loaded once | `warpPolicyTest.js`, `cameraFocusTest.js`, `truthfulUiTest.js`, `moduleUrlTest.js` |

Known open items: several older map, camera-easing and layout tests still fail. These are cosmetic or legacy expectations, listed by `npm test`. Gameplay physics is covered by the tests above.

### Simplifications (honest list)

2D flight; planets on circular coplanar orbits with no rotation; one exponential atmosphere model for every body (8.5 km scale height); **Venus atmosphere density scaled** from ~65 to 2.0 kg/m³ so launches are possible; fixed-diameter drag; no sphere-of-influence switching yet (no Moon landings); simplified power/data/downlink units; parametric mission costs anchored on public NASA programme caps. Full list: [DATA_SOURCES.md](DATA_SOURCES.md).

## NASA data

- **Planetary data:** mass, radius, gravity and semi-major axis of every body come from the **NASA NSSDCA Planetary Fact Sheets** (<https://nssdc.gsfc.nasa.gov/planetary/planetfact.html>). The map's body panel shows the source, and `tools/planetDataTest.js` checks every value to within 1%.
- **Physics relationships:** NASA Glenn Research Center's *Beginner's Guide to Aeronautics* (flight to orbit, rocket thrust, ideal rocket equation, atmosphere model).
- **There is no live data feed;** the values are compiled into the game. Details and URLs: [DATA_SOURCES.md](DATA_SOURCES.md).

## AI tools used

- **Claude Code (Anthropic, Claude Opus 5.5).** Used from the technical audit onwards, as recorded in this repository's commit history. It audited the source, then fixed:
  - multi-stage staging and Δv;
  - mission operations, deployment and debrief wiring;
  - maneuver frames;
  - the budget gate and truthful UI text.

  It also wrote the autopilot (`js/flight/guidance.js`), retuned the presets, added the Node regression tests in `tools/`, and verified the game in headless Chrome. Each change was reviewed and approved by the team before it was committed. Commits it authored carry a `Co-Authored-By: Claude` line.
- The project folder also contains a **Google Stitch** design export (`stitch_extract/`) and a **Freebuff Desktop** project marker (`.freebuff/`) from earlier development.

## Credits

- STARWARD team — NASA Space Apps Challenge 2026.
- Planetary data: NASA NSSDCA. Physics references: NASA Glenn Research Center.
- Rocket part artwork: original SVG/PNG parts made for this project (see `ASSET_PACK_README.md` in the game folder; not taken from any other game).
