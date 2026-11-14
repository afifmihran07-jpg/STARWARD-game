# STARWARD — Improvement Plan (for Claude Code in VS Code)

Source: code verification of the Nov-11 build (see `claude/STARWARD_Latest_Build_Verification_2026-11-14.md`).
Every item names its file, the root cause, the fix and an acceptance test. Work top-down: P0 items block a truthful demo.

---

## Step 0 — Set up before touching code
1. `git init && git add -A && git commit -m "Baseline: Nov-11 build as received"`, then one branch or commit per item below.
2. If any copy of the **Oct-21 V6.4.4 `js/game.js`** exists (an older zip or a teammate's folder), put it at `reference/game.v644.js`. P0-3 becomes a merge instead of a rewrite.
3. Add `CLAUDE.md` to the repo root (template at the end of this file).
4. Run the tests individually (`npm test` stops at the first failure). Record the baseline: 11 pass, 10 fail.
5. Serve locally with `npx serve .` or `python -m http.server`. ES modules do not work from `file://`.

---

## P0 — Correctness bugs that block a truthful demo

### P0-1 Staging: the upper stage never ignites (3+ stage groups) — CRITICAL
- **File:** `js/rocket/rocket.js` → `nextStage()` / `refresh()`.
- **Root cause:** `nextStage()` removes the spent parts, then `refresh()` rebuilds `groups` from the remaining parts, which renumbers them from 0. `stageIndex` keeps its old value, so it now points one group too high. The result is either no engine (Earth Obs, Weather, Comms, Planetary, Tech) or the wrong engine (Lunar fires the lander).
- **Fix (minimal):** in `nextStage()`, after jettisoning, slice `stageFuel` so it starts at the lit stage, then set `stageIndex = 0`. Track a separate counter, `stagesJettisoned`, so the HUD can still show "STAGE 2 / 3". Update `flightUI.js` and `game.paintDebugPanel` to display `stagesJettisoned + stageIndex + 1` out of the original stage count.
- **Accept:** new `tools/stagingTest.js`. For every preset: after the 1st and 2nd `nextStage()`, `activeEngine` equals the engines of the expected original group, fuel equals that group's capacity, and no jettisoned part remains. The browser HUD shows the correct stage number.

### P0-2 Builder Δv under-reports multi-stage vehicles
- **File:** `rocket.js` → `stats()`.
- **Root cause:** after each stage, only its propellant is subtracted from `remaining`; the dropped stage's dry mass is not.
- **Fix:** `remaining -= fuel + stageDryMass`. Also return a per-stage array `[{stage, thrust, isp, m0, mf, dv, twr}]` (needed for P1-9).
- **Accept:** Earth Obs ≈ 8,750 m/s, Weather ≈ 9,105, Starter unchanged at 6,442.

### P0-3 Reconnect mission operations, deployment and the debrief
- **Files:** `js/game.js` (Nov-11 rewrite dropped the wiring), `index.html` (buttons exist), `js/missions/missionOperations.js`, `missionDebrief.js` (working, unit-tested).
- **Contract:** `tools/missionOpsIntegrationTest.js` lists exactly what `game.js` must contain:
  - `createMissionOperations` on launch, using `getSelectedMissionProfile()`;
  - `stepMissionOperations` each step, passing `engineCutoff` based on `this.rocket.throttle`;
  - the DEPLOY button → `deploySpacecraft`, then step `this.deployedSpacecraft` with `stepRocket` and store `this.spacecraftOrbit = orbitElements(...)`;
  - the instrument toggle → `setScienceInstrument`;
  - DOWNLINK → `downlinkMissionData(this.missionOperations, downlinkOrbit, downlinkBody)`;
  - EVALUATE → `evaluateMissionDebrief`, unhiding `#missionDebrief`;
  - the ops panel updated in both FLIGHT and MAP.
- **Accept:** `missionOpsIntegrationTest` passes. In the browser: buttons enable only after a verified orbit and cutoff, and EVALUATE shows a grade.
- **Note:** keep the Nov-11 dashboard UI. Port the logic in; don't revert the design.

### P0-4 Maneuver node: wrong frame and free Δv
- **Files:** `js/physics/physics.js` → `applyDeltaV`, `js/trajectory/trajectoryPredictor.js` → `trace`, `js/game.js` → `executeBurn`.
- **Root cause:** prograde is taken from the absolute (Sun-relative) velocity, which includes Earth's ~29.8 km/s. The burn also costs no propellant.
- **Fix:**
  1. Use the velocity relative to `rocket.primaryBody` for direction, in both `applyDeltaV` and the predictor's planned path.
  2. In `executeBurn`, require an active engine; compute the required propellant with the rocket equation `m_f = m₀·e^(−Δv/(Isp·g₀))`; refuse if the current stage has too little; otherwise subtract the propellant with `burn()`.
  3. Optional (better): make the node set a target and let the player or autopilot execute a real finite burn.
- **Accept:** a "+500 m/s prograde" burn on a circular 300 km orbit raises apoapsis and never lowers periapsis, at any orbital phase. Fuel drops by the rocket-equation amount.

### P0-5 Wrong or misleading UI text
- **Readiness toast:** `game.js loadPresetRocket` hard-codes "100% readiness". Use the `assessMission(...).score` value instead.
- **Flight status:** `flightUI.js flightStatus()` shows "POWERED ASCENT" with no engine or fuel. Add an "ENGINE OUT / NO ACTIVE STAGE" state when `!r.activeEngine || r.currentFuel <= 0`.
- **Map units:** `mapUI.js` line ~177: `rel` is in m/s but labelled "km/s". Divide by 1000. Rename the straight-line "INTERCEPT ETA" to "STRAIGHT-LINE ETA", or compute the Hohmann time from `transferDeltaV().time`.
- **"GUIDANCE … [G]"** is shown, but no G key exists. Hide it until P1-1 ships.
- **Hard-coded cosmetic telemetry** in `index.html` ("CORE RELAY 99.8% (DSN LOCK)", "AVIONICS 99.4%", "SYS NOMINAL"). Remove it or replace it with real values. Judges may read it as simulated data.
- **Duplicate label** "ALTITUDE (ASL)", and the Max-Q/transonic overlay overlapping the mission card (CSS).
- **Accept:** screenshots show no false states.

### P0-6 Budget gate can be bypassed
- **File:** `game.js launch()`. Only `#launchButton` is disabled; the FLIGHT tab, the M key and `#mapLaunch` call `launch()` directly.
- **Fix:** check `budgetLevel(missionBreakdown(...).total, profile.budget).key !== 'over'` inside `launch()` itself, and show a toast when it blocks.
- **Accept:** an over-budget design cannot reach FLIGHT by any route.

### P0-7 Campaign mission logic
- **File:** `js/missions/missionManager.js`.
- **Homeward:** done on the pad. Require `hasFlown` and a peak altitude above 100 km earlier in the flight, then a landing on Earth (add `rocket.maxAltitude` tracking in `stepRocket`).
- **Lunar Crossing:** `earthDistance <= 40000` is impossible (inside Earth). Intended meaning: within ~40,000 km of the Moon. Use `moonDistance <= 40e6`; fix the progress formula.
- **Moon Landing** stays impossible until P1-2 (SOI switching).
- **Accept:** unit test for each mission with crafted states.

### P0-8 Prove launch-to-orbit end to end
- Add `tools/orbitE2ETest.js`: launch each Earth-orbit preset through `controlRocket` + `stepRocket`, with a scripted pilot or the P1-1 autopilot, and assert `isOrbitVerified` within N simulated minutes.
- **Why:** no build has ever verified launch-to-orbit. The only "COMPLETE SUCCESS" came from a seeded orbit. If the presets cannot make orbit after P0-1/P0-2, retune them (P1-8).

---

## P1 — Physics, flight and gameplay quality

### P1-1 Real gravity-turn autopilot (also fixes `flightRealismV643Test`)
- New `js/flight/guidance.js` (pure function): state in → `{steer, throttle}` out. Phases: vertical rise → pitch kick → pitch program by altitude or velocity → q-limit throttle (e.g. ≤ 35 kPa) → MECO at the target apoapsis → coast → circularization near apoapsis (steer to keep radial velocity ≈ 0) → cutoff when periapsis is above the atmosphere + 10 km.
- Called from `controlRocket` when `rocket.autoGuidance`. Bind the **G** key. The player can always override.
- This is the most reliable way to show a real orbit in the demo.

### P1-2 Sphere-of-influence switching
- `stepRocket` sets `primaryBody` once and never updates it. Re-evaluate every N steps using a Laplace SOI (`r_SOI = a·(m/M)^(2/5)`) with hysteresis. Update `rocket.body` and refresh orbit elements.
- Enables Moon orbit, Moon landing and correct apoapsis/periapsis near the Moon.

### P1-3 Trajectory predictor uses the real physics
- Refactor `stepRocket` so it can run on a cloned state without side effects (events and UI flags behind an option). The predictor clones the rocket (fuel, stage, spool, angle) and steps it at an adaptive dt: small in the atmosphere, large in vacuum.
- Removes the false "identical stepper" claim and makes the map path match the flight.

### P1-4 Atmosphere per body
- Add `scaleHeight` to each body in `solarSystem.js` (Earth 8.5 km, Mars ~11.1 km, Venus ~15.9 km, Titan ~40 km, giants as configured). Replace the hard-coded `8500` in `physics.js`.
- Cite the source for each value (NASA Planetary Fact Sheets).

### P1-5 Drag from the actual vehicle
- Reference area from the widest attached part (`attachedParts`, `width × METERS_PER_UNIT`).
- Cd from the nose: lower with a nose cone or fairing on top, higher for a blunt top.
- Makes aerodynamic parts matter, as the challenge's "decisions have consequences" asks.

### P1-6 Thrust varies with pressure (optional realism)
- Currently thrust stays fixed and only fuel flow changes. Alternative: keep ṁ fixed and scale thrust by Isp_eff/Isp_vac, so a vacuum engine is weak at sea level. Show the sea-level and vacuum TWR in the builder.

### P1-7 Time-warp policy and camera
- Wire `flight/flightPolicy.js maxFlightWarpForAltitude()` into `stepWarp` and `update` (2× below 120 km). Fixes the audit mismatch.
- Re-wire the V6.4.4 camera look-ahead and profile (`flightCameraLeadOffset`, altitude zoom, planet reveal) into `updateFlightCamera`. Export `flightFocusFraction` from `camera.js` or update the 2 tests that expect it.

### P1-8 Preset tuning
- Liftoff TWR of 3.5–6.2 gives max-Q of 100–400 kPa. Real launchers are roughly 1.2–1.6 TWR at liftoff and ~30–40 kPa max-Q. Retune presets to TWR ~1.3–1.8, add an antenna to Earth Obs and Tech demo (fixes `missionPresetsTest`), and confirm each reaches orbit with the autopilot (P0-8).

### P1-9 Builder information
- Inspector: show Isp, thrust, fuel and mission-system points (science, power, comms) for the selected part, not just mass.
- A per-stage table (Δv, TWR, burn time) from P0-2.
- Show sea-level vs vacuum TWR.
- Remove the unused `cost` field in `partDefinitions.js`, or use it. Right now the listed cost differs from the charged cost.

### P1-10 Staging by attachment, not by height
- `groupStages` sorts by `y` only. Build stages from the attachment graph so radial boosters separate as their own group (or with the core stage), and add a separation impulse.
- Optional: spawn the jettisoned stage as a passive debris object with its own trajectory.

### P1-11 Save and load in the body's frame
- `saveManager.js` restores absolute heliocentric position and velocity while planets have moved, so the rocket lands far from Earth. Save position and velocity **relative to `bodyId`** (plus the body orbit angles or the sim time). Restore relative to that body's current state.
- **Accept:** save in orbit, reload, and the orbital elements match within tolerance (test plus a browser check).

### P1-12 Landing hardware does something
- Parachutes: add drag area when deployed, below a speed and altitude threshold.
- Heat shield: allow survival on re-entry above a q/heating threshold; without it, add a simple heating failure.
- Legs: raise the crash speed limit. Today these parts add only mass.

---

## P2 — Mission-design depth (official challenge alignment)

- **P2-1 Power model:** replace the sinusoidal "sunlight factor" with real 2D eclipse geometry (the planet's shadow cone using the Sun's position), so orbit altitude changes power.
- **P2-2 Comms:** ground-station visibility (a station on Earth's surface; line of sight) and a range factor. Downlink only when in view.
- **P2-3 Mission lifetime and consumables:** a duration target per profile, battery degradation, RCS propellant.
- **P2-4 Debrief that teaches:** show *why* (Δv margin, power margin, data returned vs. target, budget %), with a short educational line for each failure.
- **P2-5 Start screen:** a simple, real main menu with mission select and a short tutorial. Delete the inert legacy `<template>` rather than reviving it.
- **P2-6 NASA open data (only if it is in the challenge Resources tab):** replace the hand-typed planetary constants with a cited, versioned JSON snapshot (e.g. NASA/JPL planetary physical parameters; Horizons for initial positions), loaded at startup and shown in the map body panel with its source. Without this, do **not** claim NASA data integration.
- **P2-7 Educational tooltips:** TWR, Δv, max-Q, periapsis, Isp, each with the formula used by the game.

---

## P3 — Code health

- **P3-1 Duplicate module instances (real risk):** mixed import URLs load the same file twice as separate modules: `partSprites.js` (stateful `image`/`ready`), `rocket.js`, `collision.js`, `partDefinitions.js`, `renderer.js`. Example: `game.js` calls `loadSheet()` on one copy of `partSprites`; `renderer.js` reads the other copy. Use one query version across all imports (or none, plus a single build ID in `index.html`).
- **P3-2 Dead code:** move `js/physics.js, ship.js, universe.js, missions.js, hud.js, input.js, math.js, selftest.js, _harness.js, blueprint.js` (~3,400 lines) to `/legacy` or delete them. Remove `<template id="legacy-3d-source">` from `index.html` (also fixes `uiLayoutTest`).
- **P3-3 Tests:** make `npm test` run every test and print a summary. Fix the stale tests (`systemTest` Sun cap, `mapSmoke`, `packTest overview.png`, `cameraStability`). Add the new tests from P0/P1.
- **P3-4 One physics step:** keep `stepRocket` the only integrator (spacecraft, predictor and autopilot all use it). Keep the camera and UI read-only.
- **P3-5 Repo clutter:** loose PNG/SVG assets at the root, multiple old README/CHANGELOG/TESTING_REPORT files and `stitch_*` zips. Move them to `assets/` and `docs/history/`.

---

## Suggested order and prompts for Claude Code
Paste one prompt at a time, and review the diff before the next.

1. *"Read CLAUDE.md. Fix P0-1 in IMPROVEMENT_PLAN.md (staging index bug in js/rocket/rocket.js). Write tools/stagingTest.js first, show it failing, then fix, then run it and all flight tests."*
2. *"Do P0-2 (builder Δv drops spent dry mass) with a test."*
3. *"Do P0-3: reconnect mission operations/deployment/debrief into js/game.js using tools/missionOpsIntegrationTest.js as the contract. Keep the Nov-11 dashboard UI. [If available: use reference/game.v644.js as the source of the old wiring.]"*
4. *"Do P0-4 (maneuver burn in body-relative frame and costing propellant) with a test."*
5. *"Do P0-5, P0-6, P0-7."*
6. *"Do P1-1 (guidance.js autopilot, G key), then P0-8 orbitE2ETest for every Earth-orbit preset. Report actual results; do not loosen assertions to pass."*
7. P1-8 → P1-3 → P1-2 → P1-11 → P3-1/P3-2/P3-3 → the remaining P1 → P2.

Before each demo recording, run all tests, then fly the demo preset in the browser and keep the recording as evidence.

---

## CLAUDE.md template (put in repo root)
```
# STARWARD — rules for Claude Code
- Static ES-module game. Entry: index.html → js/main.js → js/game.js. Serve over HTTP; no bundler.
- Live physics: js/physics/*.js. js/physics.js, ship.js, universe.js, etc. are legacy/dead unless moved.
- Inspect before editing; find the root cause; make minimal, focused diffs. Never rewrite working systems.
- stepRocket() is the only integrator. Camera/renderer/UI must never modify rocket state.
- Every fix gets a Node test in tools/ (DOM-free). Run tests individually: `node tools/<name>.js`.
- Never weaken a test's assertion to make it pass; report real results.
- Do not claim orbit, mission success or NASA data use unless a test or browser run shows it.
- Keep the Nov-11 dashboard UI design.
```
