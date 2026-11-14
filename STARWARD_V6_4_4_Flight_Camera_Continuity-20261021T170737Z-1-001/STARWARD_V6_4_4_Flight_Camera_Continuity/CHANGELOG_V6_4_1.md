# STARWARD V6.4.1 — Changelog

V6.4.1 is a hardening release built on V6.3/V6.4. It preserves the existing 2D rocket construction, propulsion, staging, orbital map, maneuver planner, budget/readiness systems, and camera modes.

## V6.4 foundation retained

- Physical payload deployment: the upper payload stage is removed from the carrier's part inventory and instantiated as an independent, engine-less spacecraft with independent position/velocity and a simplified 0.5 m/s radial separation impulse plus carrier recoil. Already-staged compatible payloads can be adopted.
- Post-deployment science/telemetry, solar/RTG power, battery tracking, communications-gated downlink, and a simulation-derived debrief.
- Orbit/cutoff/deployment gates, safer save/load behavior, mission reset/retry state cleanup, and normalized gameplay-unit documentation.

## V6.4.1 fixes

- **Camera/terrain handoff:** the prior rendered browser flight exposed a gap where the local horizon could leave the viewport before the globe became visibly blended in. The continuous reveal now completes over the lower atmosphere (with the same smooth profile), and regression checks assert meaningful globe blending at 5–8 km. No teleport, forced hiding, or timer-based visual workaround was added.
- **Shared component inventory:** mission-readiness assessment and post-launch operations now use the same exported component-system definitions. Antennas, command core, reaction wheel and RCS loads are counted; the phantom six-unit base load is removed; battery capacity no longer counts as continuous generation.
- **Mission-specific power checks:** readiness now checks both the profile's minimum generation and the configured operating load. Debrief power status includes nominal generation, required generation, operating load and recorded energy shortfall history.
- **Communications missions:** telemetry and science data can both accumulate if both systems are fitted; the science branch no longer suppresses telemetry accumulation.
- **Operations telemetry:** the UI distinguishes current output from maximum installed generation and shows configured load.
- **Cache invalidation:** static module query identifiers and the build ID were bumped to V6.4.1.
- **Regression coverage:** added checks for shared power accounting, battery-only false readiness, simultaneous science/telemetry, power-failure debrief grading, and early globe/horizon overlap.

## Known limitations

- Full lunar/planetary transfer, arrival, landing and destination operations are not implemented; those profiles cannot receive complete-success status.
- Deployment dynamics are simplified and do not model latch/contact/debris mechanics.
- Orbit-target comparison is an approximate mean-altitude tolerance, not a high-fidelity insertion or long-term stability proof.
- Power, science/data rates and communications range use normalized gameplay values; downlink is not an RF link budget.
- Deployed spacecraft and live operations are not persisted in save files; load starts a clean operations state to avoid stale data.
- A complete live launch through Earth reveal, cutoff, achieved orbit and deployment was not visually verified in this environment. See `TESTING_REPORT_V6_4_1.md`.
