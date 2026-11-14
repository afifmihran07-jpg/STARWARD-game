# STARWARD V6.3 — Run Instructions

1. Extract the ZIP into a folder.
2. Open the extracted folder in VS Code.
3. Install/enable the **Live Server** extension if it is not already available.
4. Right-click `index.html` and choose **Open with Live Server**.
5. Open the served `http://127.0.0.1:.../index.html` URL. Do not use `file://`.
6. Start from the default design or click **STARTER ROCKET**. Use **LAUNCH VEHICLE** to enter flight.
7. In flight, use the existing camera buttons or keyboard shortcuts 1–4. Mission operations unlock only if the computed orbit is bound and periapsis clears the body's surface; the panel explicitly notes that physical payload separation is not modeled.
8. To run automated checks, install Node.js and run `npm test` from the extracted project folder.

## Controls and scope
- Build: select parts from the library, edit/rotate/delete and review mass, Δv, TWR, budget and mission readiness.
- Flight: use the existing throttle, staging/space controls and camera modes.
- System map: inspect bodies and plan maneuvers using existing controls.
- Mission operations: toggle science collection and attempt data downlink once operations unlock. These subsystem values are normalized gameplay estimates, not real spacecraft telemetry.

If Live Server starts but a browser console/network error appears, capture the exact URL and first error before changing code. Visual flight quality should be assessed in the actual browser, especially at 1.5–1.8 km, during Earth reveal, and at the final flight state.
