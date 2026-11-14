# STARWARD V6.4.1 — Run and Mission Guide

## Run through VS Code Live Server

1. Extract the complete ZIP into a folder and open that folder in VS Code.
2. Install/enable the **Live Server** extension.
3. Right-click the root `index.html` and choose **Open with Live Server**.
4. Use the `http://127.0.0.1:.../index.html` address Live Server opens. Do not open the app as `file://`.
5. Open DevTools → **Console** and **Network**. Confirm there are no red console errors or failed local asset/module requests.
6. From the project root, run `npm test` (Node.js required).

## Recommended coherent Earth-orbit mission loop

1. Select an Earth-orbit profile. Earth observation and technology demonstration are the simplest starting objectives.
2. Build a launch vehicle with an engine and fuel below a stage joint (`decoupler`, `separator`, or `rSeparator`). Place a command core and mission hardware in the top payload group. Build-grid `y` increases down the stack, so the payload uses smaller `y` values.
3. Fit the selected profile's science, power, communications and control needs. Science Bay, Rover Camera Mast and Robotic Arm provide instrument capability; Solar Panel, Deployable Solar Array and RTG provide generation; Battery stores energy; Antenna and High-Gain Antenna provide communications; Probe Core, Reaction Wheel and RCS provide control/telemetry functions.
4. Launch and fly. `SPACE` stages/ignites the next stage, hold `Z` for full throttle, `W/S` ramp throttle, `X` cuts throttle, `A/D` steer, and `1`–`4` switch camera modes. Inspect altitude, velocity, fuel, periapsis, apoapsis and the orbital map. Altitude alone never establishes orbital success.
5. Reach a finite bound orbit whose periapsis clears the modeled atmosphere and settle engine cutoff.
6. Click **DEPLOY SPACECRAFT**. The upper payload is separated from the carrier with a small radial impulse and carrier recoil. If the compatible engine-less payload has already been separated by normal staging, the game adopts that independent object.
7. Operate instruments, manage power/battery and downlink data. Science collection requires configured instruments and sufficient power. Communications requires configured antenna capability and valid orbit/range; failed transfers retain stored data.
8. Click **EVALUATE MISSION**. The debrief grades complete success, partial success or failure from target orbit, deployment, profile capability, power history, downlinked data, fuel and budget estimates. Lunar/planetary profiles cannot complete because transfer/arrival mechanics are not implemented.

## Controls and scope

- **BUILD:** part selection, stack design, readiness, Δv/TWR and budget estimates.
- **FLIGHT:** launch, staging, throttle, steering, camera presets, telemetry, deployment and operations.
- **SYSTEM MAP:** celestial-system view and the existing maneuver planner. Simulation/operations update while the map is active; BUILD pauses flight.
- **Save/load:** carrier stage fuel and flight state restore safely. Deployed spacecraft and live operations are not serialized yet; loading resets them rather than reusing stale state.

## Simplifications

- The flight model is a 2D gameplay simulation, not a high-fidelity or flight-certified launch vehicle model.
- Mission-system power units and battery capacity are normalized gameplay values; science and telemetry rates are MB per simulated minute.
- Solar output follows a simplified illumination cycle; RTG output is constant. There is no eclipse geometry, thermal model or component degradation.
- Communications uses a simplified range/capability model, not an RF link budget.
- Mission-specific target orbit uses an approximate mean-altitude tolerance. It does not prove long-term stability.
- Lunar/planetary transfer, arrival and landing are not implemented.

See `TESTING_REPORT_V6_4_1.md` and `RESEARCH_TO_CODE_GAP_ANALYSIS_V6_4_1.md` for verification status and gaps.
