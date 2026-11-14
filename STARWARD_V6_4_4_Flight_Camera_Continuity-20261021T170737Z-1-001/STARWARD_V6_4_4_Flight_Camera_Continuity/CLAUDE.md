# STARWARD — rules for Claude Code
- Static ES-module game. Entry: index.html → js/main.js → js/game.js. Serve over HTTP; no bundler.
- Live physics: js/physics/*.js. js/physics.js, ship.js, universe.js, missions.js, hud.js, input.js, math.js, selftest.js, _harness.js, blueprint.js are legacy/dead.
- Inspect before editing; find the root cause; make minimal, focused diffs. Never rewrite working systems. Keep the Nov-11 dashboard UI design.
- stepRocket() is the only integrator. Camera/renderer/UI must never modify rocket state.
- Every fix gets a DOM-free Node test in tools/. Run tests individually: node tools/<name>.js.
- Never weaken a test's assertion to make it pass; report real results.
- Do not claim orbit, mission success or NASA data use unless a test or a real browser run shows it. Debug-seeded orbits must stay labelled.
