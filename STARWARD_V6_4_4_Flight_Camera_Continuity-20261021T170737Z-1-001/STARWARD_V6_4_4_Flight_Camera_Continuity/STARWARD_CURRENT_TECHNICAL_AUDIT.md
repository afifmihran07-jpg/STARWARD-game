# STARWARD — Current Technical Audit

**Date:** 2026-11-14
**Scope:** Read-only, source-based audit of the currently opened project, with automated tests and a live headless-browser run.
**Project root verified:** `STARWARD_V6_4_4_Flight_Camera_Continuity-20261021T170737Z-1-001/STARWARD_V6_4_4_Flight_Camera_Continuity/`. The outer workspace folder only contains this nested directory. `index.html`, `package.json`, `js/` and `tools/` live here. Git: branch `master`, one commit (`4e285bf Backup before NASA Space Apps improvements`), clean tree before this audit.
**Runtime build ID reported by the live app:** `STARWARD-SYSTEM-MAP-20261022` ([js/main.js:3](js/main.js#L3)).

No project source file was modified. All probes ran from a separate scratch directory and imported the project modules read-only. This report is the only file added.

### Evidence labels used in this report

| Label | Meaning |
|---|---|
| **CONFIRMED (reproduced)** | Found in source **and** reproduced by running the real modules (Node) and/or the live app (headless Chrome). |
| **CONFIRMED (source)** | Proven directly by the code path; not separately executed. |
| **SUSPECTED** | Likely problem or design weakness; needs a decision or more testing. |

---

## Summary: status of the previously reported issues

| # | Previously reported issue | Current status | Evidence |
|---|---|---|---|
| 1 | Stage sequencing bug | **STILL PRESENT — CONFIRMED (reproduced)** | `Rocket.nextStage()` re-groups the remaining parts but keeps the old `stageIndex`, so the index skips one stage at every separation after the first. See B-1. |
| 2 | Upper-stage ignition failure | **STILL PRESENT — CONFIRMED (reproduced)** | In 5 of 6 multi-stage presets, booster burnout leaves **no engine lit**. In `lunar`, the middle stage is skipped and the lander engine lights. Reproduced in Node and in the live browser. |
| 3 | Fuel stranded after staging | **STILL PRESENT — CONFIRMED (reproduced)** | 6,000 kg of upper-stage propellant (1,600 kg on `technology`) stays aboard and can never be burned. SPACE then reports "All stages used". |
| 4 | Mission operations disconnected from the live app | **STILL PRESENT — CONFIRMED (reproduced)** | Nothing in the runtime imports `missionOperations.js`. The DEPLOY / SCIENCE / DOWNLINK buttons have no handler. `tools/missionOpsIntegrationTest.js` fails. |
| 5 | Mission debrief disconnected | **STILL PRESENT — CONFIRMED (reproduced)** | `evaluateMissionDebrief` is never called. EVALUATE MISSION does nothing, and `#missionDebrief` stays hidden after a click (browser-verified). |
| 6 | Orbital maneuvers in wrong reference frame, no fuel consumed | **STILL PRESENT — CONFIRMED (reproduced)** | `applyDeltaV` uses heliocentric velocity. A "+100 m/s prograde" burn in LEO gave **24.9 m/s prograde + 96.8 m/s radial**, and a *retrograde* burn **raised** apoapsis. Fuel used: **0 kg**. The trajectory predictor shares the same frame error (see B-4). |

**Additional major finding.** The current runtime (`js/game.js`, `js/flight/flightController.js`, `js/camera.js`) does **not** contain the V6.4.3/V6.4.4 work that the project's own changelogs and tests describe. Missing pieces: automatic gravity turn, 4 g throttle limiting, the `G` key, camera lead offset, `flightFocusFraction`, the flight warp policy and altitude-driven planet reveal. This is the main reason **10 of 21 test scripts fail** and `npm test` exits with code 1. The cause cannot be traced, because git holds only one commit.

---

## A. Current architecture

### A.1 Entry points

| Entry | What it loads | Status |
|---|---|---|
| **`index.html`** (live game) | `<script type="module" src="js/main.js">` ([index.html:1097](index.html#L1097)), plus `style.css` and `css/flight-dashboard.css` | **The real runtime.** |
| `integration.html` | Legacy classic-script stack: `math.js`, `physics.js`, `renderer.js`, `universe.js`, `ship.js`, `missions.js`, `hud.js`, `input.js`, `selftest.js`, `game.js`, `_harness.js` and `css/style.css` | Legacy harness. Not used by `index.html`. |
| `catalog.html`, `partsPreview.html` | Static parts catalog / preview | Tooling only. |
| `index.html` lines 470–1092 | A `<template id="legacy-3d-source">` holding an older "ORBITAL" UI: boot screen, mission catalog, real-engine builder (RS-25/F-1/Raptor…), camera-mode buttons, results screen | **Inert.** Never rendered and has no handlers. None of its ~60 buttons are reachable. |

### A.2 Live module graph (from `js/main.js`)

```
main.js ─► game.js (Game: modes BUILD / FLIGHT / MAP, fixed 1/60 s loop)
  ├─ camera.js, renderer.js ─► flight/flightCameraProfile.js (visual helpers only)
  ├─ celestial/solarSystem.js, celestialBody.js      14 bodies on circular rails
  ├─ construction/editor.js ─► missionPresets.js, buildGrid.js, budget.js
  ├─ construction/symmetry.js, rocket/attachmentSystem.js
  ├─ rocket/rocket.js ─► partDefinitions.js           stage groups, fuel, stats()
  ├─ physics/physics.js ─► gravity.js, collision.js   stepRocket, applyDeltaV
  ├─ physics/orbitalMechanics.js                      orbitElements, isOrbitVerified
  ├─ flight/controls.js (InputManager), flight/flightController.js, flight/launchSite.js
  ├─ trajectory/trajectoryPredictor.js, maneuverNode.js
  ├─ missions/missionManager.js                       5-mission campaign strip
  ├─ save/saveManager.js
  └─ ui/buildUI.js (─► missionSystems.js, budget.js), ui/flightUI.js, ui/mapUI.js, map/spaceMap.js, map/mapRenderer.js
```

**Present in the repo but not reachable from `main.js`:**

| Module | Used only by |
|---|---|
| `missions/missionOperations.js` | `missionDebrief.js` and tests |
| `missions/missionDebrief.js` | Tests |
| `flight/flightPolicy.js` | Tests |
| `flightCameraLeadOffset` (in `flightCameraProfile.js`) | Tests |
| `rocket/staging.js` | Nothing (legacy `rocket.stage++` helper) |
| `js/ship.js`, `universe.js`, `hud.js`, `missions.js`, `selftest.js`, `physics.js`, `math.js`, `input.js`, `_harness.js` | `integration.html` (legacy) |
| `css/style.css` | `integration.html` (legacy) |

### A.3 Simulation model

| Aspect | Implementation |
|---|---|
| Space | 2D, world y-up. Build units: 1 unit = 2 m. |
| Planets | Circular, non-rotating rails ([solarSystem.js:163-179](js/celestial/solarSystem.js#L163-L179)). Earth moves at about 29.8 km/s heliocentric. The rocket carries absolute (heliocentric) velocity. |
| Gravity | Summed over all 14 bodies ([gravity.js](js/physics/gravity.js)). |
| Integrator | Semi-implicit Euler with fixed substeps: `substeps = min(warp, 60)`, `sdt = dt·warp/substeps` ([game.js:763-776](js/game.js#L763-L776)). Flight warp is capped at 50× (1/60 s substeps). Map warp goes up to 10,000× (2.78 s substeps). |
| Staging | `groupStages()` sorts parts by `y`. Each part with `stage:true` (decoupler / separator / rSeparator) closes a group, bottom group first ([rocket.js:19-32](js/rocket/rocket.js#L19-L32)). Propellant is tracked per group (`stageFuel[]`). |

---

## B. Confirmed bugs, ordered by severity

### CRITICAL

#### B-1. Stage index desynchronises after the first separation. Upper stages never ignite, and their fuel is stranded. — CONFIRMED (reproduced)

**Where:** [js/rocket/rocket.js:232-243](js/rocket/rocket.js#L232-L243) (`nextStage`) together with [js/rocket/rocket.js:155-168](js/rocket/rocket.js#L155-L168) (`refresh`). Triggered automatically from [js/physics/physics.js:119-141](js/physics/physics.js#L119-L141) on depletion, and manually from `Game.stage()` ([js/game.js:619-630](js/game.js#L619-L630)).

**Mechanism:**
1. `nextStage()` increments `stageIndex`.
2. It deletes the parts of groups `< stageIndex`.
3. It calls `refresh()`, which **re-runs `groupStages()` on the surviving parts**. The surviving groups are therefore re-numbered from 0.
4. `stageIndex` is only clamped (`Math.min(stageIndex, groups.length-1)`, line 166). It is never decremented.

So after the booster drops, `stageIndex = 1` points to what was originally group 2.

**Why it hits every multi-stage preset:** each preset ends with an engineless payload group above the top decoupler. That makes three groups (booster / upper / payload). After booster burnout, index 1 lands on the **payload** group, which has no engine:

| Preset | Groups (bottom → top) | After booster burnout | Stranded |
|---|---|---|---|
| earthObservation | bigEngine 26 t fuel / vacuumEngine 6 t / payload | **NO ENGINE**, crash at t=620 s | 6,000 kg |
| weather | mediumEngine+2×boosterLarge / vacuumEngine / payload | **NO ENGINE**, crash at t=820 s | 6,000 kg |
| communications | same pattern | (same code path; not flown separately) | 6,000 kg |
| planetary | same pattern | (same code path) | 6,000 kg |
| technology | mediumEngine / ionEngine / payload | **NO ENGINE**, crash at t=246 s | 1,600 kg |
| lunar | core+boosters / vacuumEngine / lander (smallEngine) | **Skips the vacuum stage** and lights the 160 kN lander engine with the vacuum stage still attached | 6,000 kg |
| custom 2-group design | booster / upper (no payload joint) | Works: upper stage lights | 0 |

**Live-browser reproduction** (real `index.html`, `earthObservation`, real `Game.launch()` / `Game.stage()` / `Game.update()`):

```
AUTO-STAGE at t=49.4s: stageIndex=1 groups=2 engine=null currentFuel=0 fuelAboard=6000
  status="COASTING · SUBORBITAL TRAJECTORY" stageBtnDisabled=true
manual SPACE after booster burnout: stageIndex 1 -> 1, toast="All stages used"
```

**Secondary defects in the same code:**
- `refresh()` resets every `stageFuel` entry to full capacity whenever the group count changes ([rocket.js:163-164](js/rocket/rocket.js#L163-L164)). This works only because the surviving stages are usually unburned. Any partially used upper stage would be silently refilled.
- `attachedParts` ([rocket.js:146-152](js/rocket/rocket.js#L146-L152)) indexes the re-numbered `groups` with the old `stageIndex`, so its result is also wrong after staging.

#### B-2. Mission operations (deploy, power, battery, science, data, downlink) are not connected to the live app. — CONFIRMED (reproduced)

- `js/game.js` imports none of `createMissionOperations`, `stepMissionOperations`, `deploySpacecraft`, `downlinkMissionData` or `setScienceInstrument` (see imports at [js/game.js:7-30](js/game.js#L7-L30)).
- A repo-wide search finds no JS reference to `#deploySpacecraft`, `#missionInstrumentToggle` or `#missionDownlink` ([index.html:81-85](index.html#L81-L85)).
- Browser check: all three buttons are permanently `disabled`, `onclick=false`, and `game.missionOperations` / `game.deployedSpacecraft` do not exist. `#opsPower` stays at `—`.
- `flightUI.js` checks `game.deployedSpacecraft` ([js/ui/flightUI.js:31](js/ui/flightUI.js#L31), [:91](js/ui/flightUI.js#L91), [:203](js/ui/flightUI.js#L203)), but nothing ever sets it.
- The underlying modules are healthy: `missionOperationsTest` (32 checks), `missionDeploymentTest` (11) and `missionSystemsTest` (9) all pass. **This is a wiring gap, not a model failure.**

#### B-3. The mission debrief is not connected. — CONFIRMED (reproduced)

- `evaluateMissionDebrief` ([js/missions/missionDebrief.js:6](js/missions/missionDebrief.js#L6)) is only called from tests.
- `#evaluateMission` ([index.html:88](index.html#L88)) has no handler. Browser check: clicking it leaves `#missionDebrief` hidden and `#debriefSummary` empty.
- `missionDebriefTest` (16 checks) passes in isolation.

### HIGH

#### B-4. Maneuver burns use the heliocentric frame and consume no propellant. — CONFIRMED (reproduced)

- [js/physics/physics.js:301-309](js/physics/physics.js#L301-L309) (`applyDeltaV`) normalises `rocket.velocity`, which is absolute and includes Earth's 29.8 km/s orbital velocity, instead of `rocket.velocity − primary.velocity`.
- Called from `Game.executeBurn()` ([js/game.js:641-652](js/game.js#L641-L652)). There is no check for fuel, engine, stage or landed state, and nothing is deducted through the rocket equation.

**Measured in a 400 km circular LEO**, at a point where Earth-relative prograde is perpendicular to Earth's heliocentric velocity:

| Command | Earth-relative impulse actually applied | Orbit after (Ap / Pe) | Fuel used |
|---|---|---|---|
| +100 m/s prograde | 24.9 prograde, 96.8 radial | 543 / 348 km | 0 kg |
| −100 m/s retrograde | −24.9 prograde, −96.8 radial | **453** / 262 km (apoapsis *rises*) | 0 kg |
| +500 m/s prograde | 124.7 prograde, 484.2 radial | 1,165 / 152 km | 0 kg |

The error depends on where Earth is in its solar orbit, so the same button behaves differently from one minute to the next.

#### B-5. The trajectory predictor freezes the planets but keeps heliocentric velocity, so predicted paths and Ap/Pe markers are wrong. — CONFIRMED (reproduced)

- [js/trajectory/trajectoryPredictor.js:39-72](js/trajectory/trajectoryPredictor.js#L39-L72) integrates the vehicle for 1,500 s against **stationary** bodies, starting from the vehicle's **absolute** velocity. The vehicle therefore drifts away from the frozen Earth at about 29.8 km/s.
- Measured on a circular 400 km LEO (true radius 6,771 km): the predicted path ended **54,418 km** from Earth's centre, with a maximum radial error of **47,647 km**. The real simulation stayed at 6,771 km.
- The APOAPSIS / PERIAPSIS markers drawn in flight are taken from these points ([js/renderer.js:1523-1535](js/renderer.js#L1523-L1535)), so they are wrong too.
- The planned (cyan) path repeats the heliocentric "prograde" from B-4 (lines 44-46).
- The file's header comment says it "runs gravity and thrust through the identical stepper". It does not:
  - no drag;
  - constant mass;
  - a 5 s step;
  - thrust for a fixed 350 s with no fuel limit (line 58).

#### B-6. The primary body is never re-evaluated. There is no sphere of influence, the vehicle passes through the Moon, and Moon missions are impossible. — CONFIRMED (reproduced)

- `findPrimaryBody()` only runs when `rocket.primaryBody` is unset ([js/physics/physics.js:37](js/physics/physics.js#L37)). `launch()` always sets it to the pad body ([js/game.js:596-597](js/game.js#L596-L597)), and `stepRocket` writes the same body back every step (line 280-281).
- Surface collision, altitude, drag, orbit elements, HUD "PRIMARY", mission state (`onMoon`) and the predictor's crash test all use that one body.
- Measured: a vehicle 50 km above the Moon keeps `primaryBody = earth`. In free fall it went **795 km below the lunar surface** with `crashed=false`.

#### B-7. The V6.4.3/V6.4.4 flight features are missing from the runtime, and the HUD advertises a control that does not exist. — CONFIRMED (reproduced)

- [js/flight/flightController.js](js/flight/flightController.js) is 24 lines: throttle and steering keys only. There is no gravity-turn guidance and no 4 g throttle limit. Nothing sets `rocket.autoGuidance = true`, and no handler exists for `KeyG`.
- The HUD still shows `GUIDANCE … MANUAL [G]` ([js/ui/flightUI.js:133](js/ui/flightUI.js#L133)).
- **Measured:** the starter preset flies straight up. After 900 s it was at 1,868 km altitude on a near-vertical track. `flightRealismV643Test`: "automatic gravity turn must build horizontal speed; got 0 m/s".
- `camera.js` does not export `flightFocusFraction` / `flightFocusOffset`, and `Camera.update` snaps instead of easing (`cameraStabilityTest`, `flightCameraTransitionTest`, `flightCameraProfileTest` fail).
- `Game.updateFlightCamera()` ([js/game.js:498-516](js/game.js#L498-L516)):
  - focuses directly on the rocket;
  - **forces `this.flightReveal = 0` every frame** (line 513), although the renderer still reads `game.flightReveal` for planet reveal ([js/renderer.js:964](js/renderer.js#L964), [:1393](js/renderer.js#L1393));
  - does not apply `flightCameraLeadOffset`.

  The altitude-driven Earth reveal is therefore disabled in code. The visual effect was not screenshot-verified in this audit.
- `flight/flightPolicy.js` (low-altitude warp cap) is never used. Flight warp of 50× is allowed inside dense atmosphere.
- Documentation drift:
  - The V6.4.3 docs describe the starter as 47.17 t / 2.24 MN. The current starter measures **46.33 t / 1.60 MN** (one `bigEngine`).
  - The V6.4.3 build ID was `STARWARD-FLIGHT-REALISM-20261016-V6.4.3`. The current one is `STARWARD-SYSTEM-MAP-20261022`.

#### B-8. Builder Δv understates multi-stage vehicles by 28–38%. — CONFIRMED (reproduced)

- [js/rocket/rocket.js:258-270](js/rocket/rocket.js#L258-L270): after each stage burns, `remaining` drops by that stage's **fuel only**. The jettisoned stage's **dry mass** (tanks, engines, decoupler) is never removed, so every upper stage is computed as if it still carried the dead booster.

| Preset | Displayed Δv | Correct sequential Δv (stage dry mass dropped) |
|---|---|---|
| earthObservation | 6,263 m/s | 8,750 m/s |
| weather | 6,549 | 9,105 |
| communications | 6,849 | 9,456 |
| lunar | 6,199 | 8,920 |
| planetary | 6,715 | 9,326 |
| technology | 10,066 | 16,125 |
| starter (single stage) | 6,442 | 6,442 ✔ |

This hides from players and judges that most presets **do** have orbital-class Δv once staging works.

### MEDIUM

#### B-9. Campaign mission logic errors, and no real progression. — CONFIRMED (reproduced)

- **Lunar Crossing** ([js/missions/missionManager.js:22-27](js/missions/missionManager.js#L22-L27)): `done: earthDistance <= 40000` compares a distance in **metres** with 40,000. That means within 40 km of Earth's *centre*, which is inside the planet, so it can never complete. Progress uses the same wrong scale, and the objective text ("Close to 384 400 km from Earth") does not describe the check.
  Measured: 5,000 km from the Moon gives `done=false`, progress 0.00.
- **Homeward** (line 37): `onEarth && landed` is **already true on the launch pad**. Measured: progress 1.00 at t=0.
- **Moon Landing** depends on `rocket.body === moon`, which can never happen (B-6).
- **No campaign state:**
  - no completion is recorded, persisted or used to unlock anything;
  - `#nextMission` just cycles the index ([js/game.js:209-212](js/game.js#L209-L212));
  - `MissionManager` holds only `index`;
  - `SaveManager` does not store campaign progress (not verified beyond reading the save fields).

#### B-10. Readiness messaging is false, and readiness never gates launch. — CONFIRMED (reproduced)

- `loadPresetRocket()` always toasts `Loaded … (100% readiness)` ([js/game.js:312](js/game.js#L312)).
- Measured readiness: **starter 40%** (no science, power or comms), **earthObservation 80%**, **technology 80%** (both lack an antenna; comms 0/1). The live browser showed `readiness shown: 80%, toast: Loaded Earth Observation Rocket (100% readiness)`.
- `missionPresetsTest` fails on exactly this.
- Readiness score has no effect on whether `launch()` proceeds.

#### B-11. The over-budget launch lock is bypassable. — CONFIRMED (reproduced)

- Only `#launchButton.disabled` is set when over budget ([js/ui/buildUI.js:184-191](js/ui/buildUI.js#L184-L191)).
- `launch()` itself has no budget check ([js/game.js:570-617](js/game.js#L570-L617)), so the FLIGHT tab (`setMode('FLIGHT')` → `launch()`, [js/game.js:469-470](js/game.js#L469-L470)), the `M` key and `#mapLaunch` all launch freely.
- Browser: a $895M design against a $500M cap had its launch button disabled. Clicking the FLIGHT tab still created and launched the rocket.

#### B-12. The HUD "ΔV LEFT" mixes stages. — CONFIRMED (source)

[js/ui/flightUI.js:14-22](js/ui/flightUI.js#L14-L22) applies the **active stage's Isp** to **all propellant aboard** (including unlit upper stages) against total mass, as one stage. Once B-1 is fixed this will over- or under-state the remaining Δv depending on the stack.

#### B-13. MAP-mode arrow keys also fly the rocket. — CONFIRMED (reproduced)

`controlRocket()` runs in every non-BUILD mode ([js/game.js:771](js/game.js#L771)). The MAP body-cycling keys (←/→/↑/↓) are also throttle and steering keys ([js/flight/flightController.js:9-23](js/flight/flightController.js#L9-L23)). Measured: ArrowDown+ArrowRight lowered throttle 0.5 → 0.487 in one step and set `steer=1`.

#### B-14. Orbits drift at high map warp. — CONFIRMED (reproduced)

At 10,000× the substep is 2.78 s with explicit gravity. Over 5 orbits, a 400 km circular orbit decayed to a **373.5 km periapsis**. At ≤1,000× drift was ≤1.5 km. A real LEO coast at high map warp will slowly lose periapsis.

### LOW

#### B-15. The aerodynamic model ignores the vehicle. — CONFIRMED (source)

- Drag uses a fixed 4 m diameter for every design ([js/physics/physics.js:147](js/physics/physics.js#L147)).
- Every body uses Earth's 8,500 m scale height ([js/physics/physics.js:58](js/physics/physics.js#L58)) (Mars, Venus, Titan, gas giants).
- Fairings, fins and stack width have no drag effect. Fins only add steering torque.

#### B-16. Builder TWR is sea-level, liftoff-only. — CONFIRMED (source)

[js/rocket/rocket.js:253-254](js/rocket/rocket.js#L253-L254), [:278](js/rocket/rocket.js#L278). It falls back to the sum of **all** engines if group 0 has none, and uses g = 9.81. There is no per-stage TWR, so a weak upper stage is invisible to the player.

#### B-17. Duplicate `[data-mode]` controls. — CONFIRMED (reproduced)

The MAP rack buttons at [index.html:256-258](index.html#L256-L258) duplicate the topbar tabs. `game.js:417-419` documents that the topbar tabs must be the only matches. They work, but `uiLayoutTest` fails and the `active` class is toggled on both sets.

#### B-18. Dead and stale code and assets. — CONFIRMED (source)

- `rocket/staging.js` (legacy `rocket.stage++` helper, not imported anywhere).
- The per-part `cost:` fields in `partDefinitions.js` are never read; cost comes from `budget.js` $/kg rates.
- The 620-line inert `<template>` in `index.html`.
- `css/style.css` (legacy only).
- `overview.png` is not used by any part (`packTest`).

#### B-19. Map visual cap regressions. — CONFIRMED (test)

- `systemTest`: Sun disc cap is 11 px; the test expects 46.
- `mapSmoke`: directional planet lighting is not rendered, and `pickBody` finds nothing at the Sun at view centre.

Cosmetic; map interaction otherwise works (browser sweep).

### SUSPECTED (needs a decision or more testing)

- **S-1. Staging is purely vertical.** `groupStages` sorts by `y` only, so radial decouplers and parallel (asparagus / side-booster) staging cannot be expressed. Side boosters always burn and drop with the core stage. The `part.stage` field copied in the `Rocket` constructor is ignored.
- **S-2. Launch cost is double-counted.** `missionBreakdown()` adds a commercial launch price (Falcon 9 … SLS) sized by the player's own rocket mass ([js/construction/budget.js:181](js/construction/budget.js#L181)), in addition to costing that same rocket's hardware.
- **S-3. Burns while landed.** `executeBurn()` is allowed on the pad. The landed clamp ([js/physics/physics.js:203-208](js/physics/physics.js#L203-L208)) cancels horizontal and downward impulse, so the burn is silently partially lost. Not executed in this audit.
- **S-4. Status text.** "ORBIT PREDICTED · BURN ACTIVE" ([js/ui/flightUI.js:36](js/ui/flightUI.js#L36)) is shown when periapsis is *inside* the atmosphere, so the wording is misleading.
- **S-5. Build stats overwritten during flight.** `Game.stage()` calls `updateBuildStats(new Rocket(this.editor.parts))` ([js/game.js:628](js/game.js#L628)) mid-flight. It is harmless but recomputes and overwrites build-panel values during flight.

---

## C. Rocket-builder-specific problems

| ID | Problem | Severity | Ref |
|---|---|---|---|
| B-1 | Stage groups re-indexed on separation. Multi-stage stacks unusable past stage 1. | Critical | rocket.js:155-168, 232-243 |
| B-8 | Δv ignores dropped stage dry mass (−28% to −38%). | High | rocket.js:258-270 |
| B-10 | "100% readiness" toast is false. Starter 40%, earthObservation/technology 80%. Readiness does not gate launch. | Medium | game.js:312; missionSystems.js:47-48 |
| B-11 | Budget lock only on one button. | Medium | buildUI.js:184-191; game.js:469 |
| B-16 | TWR liftoff-only, all-engine fallback, no per-stage TWR. | Low | rocket.js:253-278 |
| B-15 | Vehicle geometry has no effect on drag. | Low | physics.js:147 |
| S-1 | No radial / parallel staging. | Suspected | rocket.js:19-32 |
| S-2 | Launch services cost added on top of the player's own launcher. | Suspected | budget.js:181 |
| B-18 | Unused per-part `cost` fields; legacy `staging.js`. | Low | partDefinitions.js; staging.js |

**Verified correct in the builder:**
- Part catalog: 60+ parts with mass, fuel, thrust and Isp.
- Mass totals (`dryMass + fuel`).
- Thrust-weighted mean Isp per stage ([rocket.js:171-178](js/rocket/rocket.js#L171-L178)).
- Single-stage Δv (starter 6,442 m/s matches an independent calculation).
- Cost model arithmetic (`budgetTest` 9/9).
- Readiness model (`missionSystemsTest` 9/9).
- Undo / redo / clear / rotate / duplicate / delete wiring.
- Symmetry placement; preset loading.
- Save/load round-trip (browser: 26 parts restored).

---

## D. Flight and physics problems

| ID | Problem | Severity |
|---|---|---|
| B-1 | Auto / manual staging lights the wrong group or none. Fuel stranded. | Critical |
| B-6 | No primary-body / SOI switching; no collision with other bodies. | High |
| B-7 | No gravity-turn guidance / G-limit / `G` key; camera easing, lead offset and altitude reveal removed; warp policy unused. | High |
| B-5 | Predicted trajectory and Ap/Pe markers wrong (frozen planets + heliocentric velocity). | High |
| B-14 | Integrator drift at 10,000× map warp. | Medium |
| B-13 | Map navigation keys move throttle and steering. | Medium |
| B-12 | ΔV LEFT mixes stages. | Medium |
| B-15 | Fixed-diameter drag; Earth scale height used everywhere. | Low |

**Verified correct in flight physics (keep):**
- Gravity summed over all bodies.
- Semi-implicit Euler at fixed 1/60 s substeps up to 50× (orbit drift ≤1.2 km per 5 orbits at 1–50×).
- Propellant-limited final-step thrust ([physics.js:106-118](js/physics/physics.js#L106-L118)).
- Engine spool lag.
- Altitude-blended Isp.
- Max-Q recorded from actual pressure history.
- Earth speed-of-sound table and Mach = N/A in vacuum.
- Body-frame surface collision with crash threshold.
- G-force excluding gravity.
- Rotational dynamics with SAS damping and weathervane.
- Correct 2-group staging and `NEXT_STAGE_IGNITION` event.
- `orbitElements` correctly body-relative ([orbitalMechanics.js:8-32](js/physics/orbitalMechanics.js#L8-L32)).
- `isOrbitVerified` gating (cutoff + outside atmosphere + periapsis margin).
- HUD periapsis text (BODY INTERSECTION / ATMOSPHERIC / UNBOUND).
- Launch-pad regression (`launchPadRegressionTest` passes).

---

## E. Mission-system problems

| ID | Problem | Severity |
|---|---|---|
| B-2 | Operations model (power / battery / science / data / downlink / deploy) not wired; three buttons have no handler. | Critical |
| B-3 | Debrief not wired; EVALUATE MISSION does nothing. | Critical |
| B-1 | Even when wired, deployment needs the payload group to reach orbit, which B-1 prevents for every preset. | Critical (dependency) |
| B-4 | Map maneuvers cannot be used for orbit raising or circularisation (wrong frame, free Δv). | High |
| B-6 | Lunar and planetary objectives cannot be completed (no SOI). | High |
| B-9 | Lunar Crossing unit bug; Homeward complete on the pad; no campaign progression or persistence. | Medium |
| B-10 | Preset readiness claims are false. | Medium |

**Mission modules that pass their own tests and should be wired in, not rewritten:**
- `missionOperations.js` (32 checks).
- `deploySpacecraft` (11 checks), including the "already separated payload" adoption path, which is relevant to how B-1 is fixed.
- `missionDebrief.js` (16 checks).
- `missionSystems.js` (9 checks).

`missionOpsIntegrationTest.js` already specifies the expected integration contract in `game.js`:
- `createMissionOperations`, `deployMissionSpacecraft`, `stepMissionOperations`;
- `stepRocket(this.deployedSpacecraft…)`;
- `this.spacecraftOrbit = orbitElements…`;
- `downlinkMissionData(...)`, `setScienceInstrument`, `evaluateMissionDebrief`, `getSelectedMissionProfile`.

---

## F. Working features that must be preserved

Each item below was verified by a passing test or the live browser run in this audit.

1. **App boot:** 0 console errors, 0 page exceptions, 0 failed requests in headless Chrome. All 140 local references resolve (`archiveRuntimeAudit`).
2. **Mode switching** BUILD / FLIGHT / MAP via topbar tabs, map rack buttons, `M`, `#mapButton`. Abort returns to BUILD.
3. **Builder:** part bin with search and category chips, placement with snapping and symmetry, drag, rotate, duplicate, delete, undo/redo, clear, the pre-built rocket dropdown and LOAD PRE-BUILT button, the inspector.
4. **Budget system:** NASA-class profiles, cost breakdown modal, over-budget warning, launch-button lock.
5. **Mission readiness panel:** profile selector, science / power / comms / attitude metrics, warnings.
6. **Flight dashboard:** throttle slider and CUT, SAS badge, PAD / CHASE / ORBIT framing, STAGE button, pause, 1/2/5/10× warp, MISSION OPS dock toggle, help, full telemetry list (altitude, Mach / vacuum, q, Max-Q, G, Ap, Pe status, fuel, mass, thrust, TWR, stage, phase, primary).
7. **Flight physics** items listed at the end of section D, including single-stage and 2-group staging.
8. **System map:**
   - all 14 bodies;
   - body chips and focus list;
   - FIT SYSTEM / FOCUS / FIT BODY / SCALE toggle / TARGET / LAUNCH TO SELECTED;
   - map warp 1–10,000× and pause;
   - ARM NODE / ±PROGRADE / CLEAR / EXECUTE buttons (they respond; the physics behind EXECUTE is B-4);
   - Hohmann transfer estimate (`transferDeltaV`);
   - arrow / digit / F / T / Esc keyboard navigation.
9. **Save / Load** (browser round-trip; `saveManagerTest` 7/7, including per-stage fuel).
10. **Tested but unwired modules:** `missionOperations.js`, `missionDebrief.js`, `missionSystems.js`, `flightPolicy.js`, `flightCameraProfile.js` (incl. `flightCameraLeadOffset`, `flightCameraModeProfile`). These should be **connected**, not replaced.
11. **Honest-physics policies already in the code:** no forced orbit success; suborbital status reported truthfully; educational-model notices.

---

## G. Test results

**Environment:** Windows 10, Node v24.21.0, Google Chrome (headless, DevTools protocol). The project was served by a local static server from a scratch directory. Run on 2026-11-14.

### G.1 `npm test` — FAILED (exit code 1)

The `npm test` script chains 21 scripts with `&&`, so it stops at the first failure (`uiLayoutTest`). Each script was therefore also run individually:

| # | Script | Result | Failure detail |
|---|---|---|---|
| 1 | uiLayoutTest | **FAIL** | "only the three topbar tabs may declare data-mode": found 6 (B-17) |
| 2 | missionSystemsTest | PASS | 9 checks |
| 3 | missionOperationsTest | PASS | 32 checks |
| 4 | missionDeploymentTest | PASS | 11 checks |
| 5 | missionDebriefTest | PASS | 16 checks |
| 6 | saveManagerTest | PASS | 7 checks |
| 7 | missionOpsIntegrationTest | **FAIL** | `game.js` does not match `/createMissionOperations/` (B-2/B-3) |
| 8 | budgetTest | PASS | 9 checks |
| 9 | systemTest | **FAIL** | "Sun cap" 11 !== 46 (B-19) |
| 10 | mapSmoke | **FAIL** | 8 pass, 2 FAIL: planet lighting not rendered; `pickBody` finds nothing at the Sun (B-19) |
| 11 | packTest | **FAIL** | "overview.png is not used by a rocket part" (B-18) |
| 12 | flightRegressionTest | PASS | Starter ascent stays upward, 236 km max in 100 s |
| 13 | cameraStabilityTest | **FAIL** | "camera must ease, not snap, at 10 FPS" (B-7) |
| 14 | flightCameraTransitionTest | **FAIL** | SyntaxError: `camera.js` has no export `flightFocusFraction` (B-7) |
| 15 | flightPolicyTest | PASS | (module is not used by the runtime) |
| 16 | launchPadRegressionTest | PASS | |
| 17 | flightCameraProfileTest | **FAIL** | SyntaxError: no export `flightFocusFraction` (B-7) |
| 18 | flightCameraModeTest | PASS | (presets not used by the runtime) |
| 19 | archiveRuntimeAudit | PASS | 140 references, 71 JS files |
| 20 | flightRealismV643Test | **FAIL** | "automatic gravity turn must build horizontal speed; got 0 m/s" (B-7) |
| 21 | missionPresetsTest | **FAIL** | "earthObservation must achieve 100% readiness (got 80%)" (B-10) |

**Totals: 11 pass, 10 fail.**

**No existing test covers 3-group staging, maneuver frames or SOI.** That is why B-1, B-4, B-5 and B-6 were never caught by the suite.

### G.2 Audit probes (Node, real project modules, read-only)

| Probe | Result |
|---|---|
| All 7 presets: stats, groups, readiness | Δv understatement (B-8); readiness 40 / 80 / 80% (B-10) |
| Fly starter, earthObservation, weather, technology, lunar, custom 2-group | B-1 reproduced on every 3-group preset; 2-group works |
| `applyDeltaV` in LEO (two geometries) | B-4 reproduced |
| Predictor vs simulation, 1,500 s LEO | B-5 reproduced (54,418 km vs 6,771 km) |
| Vehicle near the Moon | B-6 reproduced (795 km below lunar surface, not crashed) |
| Campaign predicates on the pad / near the Moon | B-9 reproduced |
| LEO at 1 / 50 / 1,000 / 10,000× warp | B-14 reproduced at 10,000× only |
| Arrow keys through `controlRocket` | B-13 reproduced |

### G.3 Live browser verification (headless Chrome, real `index.html`)

- **Boot:** build `STARWARD-SYSTEM-MAP-20261022`; 0 console errors, 0 exceptions, 0 failed requests.
- **Button sweep:** every visible button in BUILD, FLIGHT and MAP was clicked (save/load tested separately). None threw.

  **Dead buttons:**
  - `#deploySpacecraft`, `#missionInstrumentToggle`, `#missionDownlink`: permanently disabled, no handler;
  - `#evaluateMission`: enabled, no handler, does nothing.

  **Controls that respond but are wrong:**
  - EXECUTE BURN (B-4);
  - STAGE after the first separation (B-1).

  **Correct no-ops:** ROTATE / DUPLICATE / DELETE with nothing selected, and CUT at 0% throttle.

  Inert `<template>` controls are not rendered and were excluded.
- **Live staging (earthObservation):** B-1 reproduced, as quoted in B-1.
- **Budget bypass:** B-11 reproduced.
- **Save/Load round-trip:** pass (26 → 26 parts). Ran in a throw-away browser profile, so the user's local save data was not touched.
- **Not covered:** a full launch-to-orbit flight. It is impossible with any current preset (B-1, B-7). Screenshots and visual camera behaviour were not captured in this audit.

---

## H. Prioritised repair roadmap (awaiting approval; nothing implemented)

The principle is to **fix in place and keep the architecture**: `Game` modes, the `Rocket` / `stepRocket` model, the UI modules and the already-tested mission modules all stay. Each step lists a verification gate.

### Phase 0: unblock flight to orbit

1. **Fix stage sequencing (B-1).**
   - Freeze the stage plan at launch, so the original groups keep stable indices or IDs.
   - `nextStage()` advances to the next group in that frozen plan, removes only the spent group's parts, and does not re-index.
   - Keep `stageFuel` keyed to the frozen plan, so no refills happen on group-count change.
   - Fix `attachedParts` accordingly.
   - Treat a top engineless payload group as **payload awaiting DEPLOY**, not a stage to auto-jettison into. This aligns with `deploySpacecraft`'s existing joint and "already separated" logic.

   *Gate:* new `stagingSequenceTest` flying every preset through each separation. Assert the correct engine is lit, there is no stranded fuel, and the payload stays attached. Existing `saveManagerTest` and `missionDeploymentTest` must stay green.
2. **Fix the builder Δv (B-8)** by dropping each burned stage's dry mass, and make **HUD ΔV LEFT (B-12)** use the same per-stage sum. Add per-stage TWR to the build stats (B-16).

   *Gate:* Δv test against hand-computed values for all presets.

### Phase 1: make orbital operations correct

3. **Body-relative maneuvers that cost propellant (B-4).**
   - Prograde and retrograde come from `velocity − primary.velocity`.
   - Required propellant comes from the rocket equation using the active stage's Isp and current mass.
   - Refuse or clip when there is no engine, no fuel, or the vehicle is landed; report the actual Δv achieved.

   *Gate:* LEO test where ±Δv changes only the intended apsis, and fuel decreases by `m(1 − e^(−Δv/(Isp·g₀)))`.
4. **Correct the predictor (B-5).** Integrate in the primary body's frame (or advance the bodies alongside), and include the same staging and fuel limits.

   *Gate:* a circular-LEO prediction stays within a few km of the simulation over one orbit.
5. **Primary-body / SOI switching (B-6),** with hysteresis using the existing `findPrimaryBody`. Run collision against the current primary.

   *Gate:* Moon free-fall test crashes or lands on the Moon; HUD PRIMARY switches.

### Phase 2: reconnect mission systems

6. **Wire mission operations, deployment and debrief into `game.js` (B-2, B-3)**, following the contract already written in `missionOpsIntegrationTest.js`. Add button handlers, per-step `stepMissionOperations`, spacecraft physics and HUD.

   *Gate:* `missionOpsIntegrationTest` passes; browser test deploys from a verified orbit, toggles science, downlinks and shows a debrief grade.
7. **Campaign fixes (B-9):**
   - Lunar Crossing uses distance to the Moon in km;
   - Homeward requires `hasFlown` plus a prior objective;
   - record completions in `SaveManager` and advance or unlock missions.
8. **Honest readiness and budget (B-10, B-11):**
   - toast the computed score;
   - add an antenna to the earthObservation and technology presets, or relax the profile (your call);
   - enforce budget (and optionally readiness) inside `launch()` so every launch path is gated.

### Phase 3: restore the V6.4.3/V6.4.4 flight work (needs your decision)

9. **B-7. Decide:** either (a) restore gravity-turn guidance with the `G` key and 4 g limit, the flight warp policy, camera easing / `flightFocusFraction` / lead offset and altitude-driven reveal into the *current* `game.js` / `flightController.js` / `camera.js`, without touching the newer flight dashboard; or (b) formally retire those features and update the tests and HUD text. Recommendation: **(a)**. The helper modules already exist and pass their own tests, and guidance is what makes the presets reach orbit hands-free for judges.

   *Gate:* `flightRealismV643Test`, `cameraStabilityTest`, `flightCameraTransitionTest` and `flightCameraProfileTest` pass; a browser run captures liftoff, Max-Q, staging, cutoff and verified orbit.

### Phase 4: polish and hygiene

10. **Input:** isolate MAP keys from flight controls (B-13).
11. **High-warp stability:** in vacuum at high map warp, use more substeps or analytic two-body propagation (B-14). Cap flight warp in atmosphere via `flightPolicy.js`.
12. **Aerodynamics:** vehicle-width drag area and per-body scale height (B-15).
13. **UI and dead code:** resolve duplicate `[data-mode]` (B-17), map visual regressions (B-19), and decide what to do with the inert `<template>`, `staging.js`, unused `cost` fields and the unused PNG (B-18).
14. **Test suite:** make `npm test` fully green. Add the new staging, maneuver, predictor, SOI and campaign tests, plus a scripted browser end-to-end test: multi-stage preset → orbit → deploy → debrief.

### Decisions needed from you before implementation

- **Phase 3 (B-7):** restore the V6.4.3/V6.4.4 guidance and camera behaviour, or retire it and update the tests?
- **Payload semantics:** should the top engineless group stay attached until DEPLOY (recommended), or remain an ordinary stage?
- **Readiness of the earthObservation and technology presets:** add hardware (an antenna), or change the profile requirement?
- **Budget model (S-2):** keep adding commercial launch-service cost on top of the player-built launcher?
