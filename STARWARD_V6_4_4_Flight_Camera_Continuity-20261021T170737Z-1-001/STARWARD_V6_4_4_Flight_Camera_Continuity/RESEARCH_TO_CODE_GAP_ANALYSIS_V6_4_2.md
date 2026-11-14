# V6.4.2 — Flight Research-to-Code Notes

## Applied findings

- The supplied report recommends a smooth local-horizon-to-globe handoff, no camera teleporting, a gradual atmosphere fade, and no pad reappearance. V6.4.1's code passed mathematical continuity tests but the actual browser screenshot showed a blue-sky dead band: at approximately 5 km, the horizon had moved below the viewport while the globe remained effectively transparent.
- The cause was a combination of a shallow local zoom falloff (`exponent = 0.62`) and an altitude reveal that had been tuned primarily for early globe blending. The camera zoom could keep the Earth disk too far outside the viewport while the local horizon was already offscreen.
- V6.4.2 steepens the local camera pullback to `exponent = 0.90`, preserving the reference framing at 1.5 km while keeping the horizon in the viewport longer. The globe reveal is spread from the reference altitude to 92% of the configured atmosphere height.
- The rendered sky now uses one exponential fade envelope, with all color-stop alpha values proportional to the same scattering factor. Stars emerge progressively from 18 km to 83 km instead of being painted twice.
- Vehicle detail scale recedes continuously with altitude; this is explicitly a screen-space presentation aid, not a physical size change.

## NASA/source distinctions

- NASA Glenn's rocket thrust and ideal rocket equation pages support the governing relationships, but STARWARD does not dynamically solve nozzle flow, pressure-area thrust, or a full ideal rocket equation per engine burn.
- NASA's atmospheric-layer reference supports the fact that 100 km is a convention and that the atmosphere has no sharp physical boundary. The game's sky fade and star ramp are visual design parameters, not a NASA-prescribed rendering curve.
- NASA Langley's POST2 publication describes a real ascent-trajectory simulation architecture. STARWARD's existing two-dimensional physics is much simpler; the reference is used as engineering context, not as a claim of equivalent fidelity.

## Remaining gaps

- No full 6-DOF aerodynamic model, lift/angle-of-attack solution, real engine/nozzle tables, or standard-atmosphere implementation.
- No max-Q or g-load guidance; the sample starter vehicle can reach high reported acceleration during powered ascent.
- No complete launch-to-orbit visual acceptance run. The live browser sequence reached about 69 km with the engine still firing; orbital insertion was not demonstrated.
- Stage-separation visuals were not validated in this run because the starter vehicle is single-stage.
- Direct Chromium navigation to localhost was blocked by the execution environment. The real app was exercised in Chromium through a Playwright resource-interception harness, not the VS Code Live Server extension itself.
