# STARWARD V6.4.2 — Flight Refinement

STARWARD is a browser-based space mission design and flight simulation. V6.4.2 focuses on the local-horizon-to-Earth reveal, atmospheric fade, high-altitude rocket scale, and cache consistency while preserving the V6.4.1 mission systems.

## Run locally in VS Code

1. Extract the ZIP into a normal writable folder.
2. Open that folder in VS Code (the folder containing `index.html`, `style.css`, and `js/`).
3. Install/enable the **Live Server** extension if it is not already available.
4. Right-click the root `index.html` and choose **Open with Live Server**.
5. Use the browser URL that Live Server opens. Do not open the HTML file directly with `file://`.
6. Click **LAUNCH VEHICLE**, set throttle, then press **SPACE** or click the stage button to ignite the active stage. The simulation supports pause and time-warp controls; warp is limited during low-altitude flight to protect numerical stability.

If the page appears cached, perform a hard refresh. V6.4.2 has updated cache-busting identifiers for the entry path and flight renderer dependencies.

## Camera and visual behavior

- At liftoff, the vehicle is shown at close scale with the launch site in view.
- During early ascent, the local horizon remains visible longer instead of dropping out before Earth appears.
- Earth reveal continues through the ascent and completes near 92% of the configured atmosphere height.
- Atmospheric color/scattering and star visibility fade progressively. The 18–83 km star ramp is a presentation choice, not a physical atmospheric boundary.
- The rocket's screen-space detail scale recedes smoothly at altitude. This only affects drawing; physical position, velocity, mass, and orbit calculations are not modified by camera code.

## Testing

Run:

```bash
npm test
```

For an additional syntax sweep:

```bash
find js -name '*.js' -print0 | xargs -0 -n1 node --check
```

Browser screenshots and measured state samples from the refinement run are under `verification/`. Read `TESTING_REPORT_V6_4_2.md` for exactly what was verified and what remains unverified.

## Model limitations

Engine and part values are illustrative gameplay parameters unless explicitly documented otherwise. The physics is a simplified 2D Newtonian model with gravity, propellant mass change, a simplified atmospheric-density/drag model, and rotational controls; it is not a certified launch-vehicle simulator. The camera uses screen-space framing and presentation-only scale cues. Lunar/planetary transfers and destination arrival are not implemented as complete trajectories.
