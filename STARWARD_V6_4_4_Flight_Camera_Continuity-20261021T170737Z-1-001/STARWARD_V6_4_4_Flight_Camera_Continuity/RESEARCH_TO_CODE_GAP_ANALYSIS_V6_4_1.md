# STARWARD V6.4.1 — Research-to-Code Gap Analysis

| System | Current behavior | Verification / limitation |
|---|---|---|
| Mission profile | Profile drives science, power, communications and approximate target-orbit checks. | Earth-orbit profiles require Earth; lunar/planetary transfers are unsupported. |
| Rocket construction and flight | Existing parts, thrust, fuel, staging, steering, orbit calculations, map and maneuver planner are preserved. | 2D gameplay model; not a validated launch trajectory solver. |
| Orbit eligibility | Requires finite bound osculating elements, positive semimajor axis and periapsis above body radius plus modeled atmosphere. | Does not prove long-term stability under perturbations. |
| Deployment | Top payload part group is physically removed from carrier inventory and instantiated as an independent engine-less Rocket; position/velocity differ and a simplified radial impulse/recoil is applied. | No detailed latch/contact/debris dynamics. Browser interaction verified with a seeded valid orbit; launch-to-orbit deployment not verified. |
| Science and telemetry | Deployed inventory gates instrument capability and normalized data rate; science can be switched off; communication telemetry is independent and can accumulate alongside science. | Normalized MB per simulated minute, not real sensor output. |
| Power | Shared component specs drive readiness and operations. Per-part load, solar/RTG output, battery, energy consumed/wasted and shortfall are tracked. | No high-fidelity eclipse, thermal, degradation or electrical-bus model. |
| Communications | Antenna capability, valid orbit/range, available data and power gate downlink; failed transfers preserve stored data. | Simplified range and session-energy model, not RF link budget. |
| Mission debrief | Uses achieved orbit, target altitude, deployment, capabilities, power history, data transfer, fuel and budget estimate; grades complete/partial/failure. | Budget is model output; target-orbit tolerance is approximate. Unsupported destination profiles cannot be complete. |
| Save/retry | Carrier stage fuel/state restore; retry/new game/load clears stale operations/deployment/debrief state. | Deployed spacecraft and live operations are not persisted. |
| Camera and terrain | Early globe reveal overlaps local horizon before the horizon leaves the viewport; mathematical regression tests cover continuity. | Browser visual inspection only reached early ascent (~4.6 km in the fresh run); full Earth reveal and orbital insertion remain unverified. |
| Browser/runtime | Real Chromium/Playwright rendered build and early flight, plus a seeded-orbit UI workflow for physical separation, science toggle, downlink and debrief; no console/page errors or missing local resources in those runs. | Direct browser navigation to local HTTP was blocked by environment policy; app requests were intercepted and fulfilled from the exact project files. Live Server extension itself was not launched. |
