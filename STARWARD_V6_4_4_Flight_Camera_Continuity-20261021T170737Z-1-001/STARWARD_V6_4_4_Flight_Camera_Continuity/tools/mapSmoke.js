/* =========================================================================
   mapSmoke.js — headless render smoke test for the SYSTEM MAP.

   Paints whole frames of drawMap onto a stub canvas (Proxy-based 2D context)
   and drives fitSystem + wheel zoom, catching ReferenceErrors, type errors
   and zoom-floor regressions without needing a browser.
   ========================================================================= */
import assert from 'node:assert';
import {createSolarSystem} from '../js/celestial/solarSystem.js';
import {drawMap, pickBody, chromeInsets, compressRadius} from '../js/map/mapRenderer.js';
import {fitSystem, systemMinZoom, systemExtent} from '../js/map/spaceMap.js';
import {Camera} from '../js/camera.js';

// chromeInsets probes the DOM for the top bar / info panel; pretend the
// chrome is absent so it falls back to the classic hard-coded insets.
globalThis.document = {querySelector: () => null};

const canvas = {width: 1904, height: 1052, clientWidth: 1904, clientHeight: 1052};
const cam = new Camera(canvas);

let linearGradientCount = 0;
const gradient = () => ({addColorStop() {}});
const ctx = new Proxy({
  canvas,
  measureText: () => ({width: 48}),
  createRadialGradient: gradient,
  createLinearGradient: () => { linearGradientCount++; return gradient(); }
}, {
  get: (t, k) => (k in t ? t[k] : () => {}),
  set: (t, k, v) => { t[k] = v; return true; }
});

const game = {
  bodies: createSolarSystem(),
  camera: cam,
  mapCompressed: true,
  selected: null, hover: null, target: null,
  rocket: null,
  predictor: {points: []},
  plannedPoints: [],
  warp: 1,
  input: {mouse: {x: 952, y: 526}}
};
game.selected = game.bodies[1];   // Earth, as the game does on first entry

let passed = 0;
const check = (name, fn) => {
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (err) { console.error('  FAIL ' + name + '\n    ' + err.message); process.exitCode = 1; }
};

check('fitSystem frames the system at/above the zoom floor', () => {
  // Same box fitSystem computes with the info panel closed (dpr = 1 here).
  const box = Math.max(80, Math.min(
    Math.max(80, canvas.width - 48),
    Math.max(80, canvas.height - 112)) - 24);
  for (const compressed of [true, false]) {
    game.mapCompressed = compressed;
    fitSystem(game);
    const floor = systemMinZoom(game, box);
    assert.ok(Math.abs(cam.minZoom - floor) < floor * 1e-9,
      'fitSystem did not apply the floor');
    assert.ok(cam.zoom >= floor * 0.999, 'zoom below floor: ' + cam.zoom);
    assert.ok(cam.zoom <= cam.maxZoom, 'zoom above max: ' + cam.zoom);
  }
});

check('wheeling out can never collapse the map past the floor', () => {
  game.mapCompressed = true;
  fitSystem(game);
  const floor = cam.minZoom;
  for (let i = 0; i < 60; i++) cam.wheelAt(120, 952, 526);
  assert.ok(cam.zoom >= floor * 0.999, 'collapsed to ' + cam.zoom);
  for (let i = 0; i < 60; i++) cam.wheelAt(-120, 952, 526);
  assert.ok(cam.zoom <= cam.maxZoom, 'over-zoomed');
});

check('drawMap paints a full frame at the fit view, both scales', () => {
  for (const compressed of [true, false]) {
    game.mapCompressed = compressed;
    fitSystem(game);
    drawMap(ctx, game);
  }
});

check('planet lighting follows the Sun on both map projections', () => {
  const before = linearGradientCount;
  for (const compressed of [true, false]) {
    game.mapCompressed = compressed;
    fitSystem(game);
    drawMap(ctx, game);
  }
  assert.ok(linearGradientCount > before, 'directional shading was not rendered');
});

check('drawMap survives hover and target states', () => {
  game.mapCompressed = true;
  fitSystem(game);
  game.hover = game.bodies[7];      // Jupiter
  game.target = game.bodies[1];     // Earth
  drawMap(ctx, game);
  game.hover = null;
  game.target = null;
});

check('wheel sensitivity: every event moves at least one full step', () => {
  game.mapCompressed = true;
  fitSystem(game);
  let z0 = cam.zoom;
  cam.wheelAt(-40, 952, 526);            // tiny high-res touchpad event
  assert.ok(cam.zoom / z0 >= 1.22, 'small event too weak: ' + (cam.zoom / z0));
  z0 = cam.zoom;
  cam.wheelAt(-120, 952, 526);           // desktop notch — should be >= 1.26
  assert.ok(cam.zoom / z0 >= 1.26, 'notch too weak: ' + (cam.zoom / z0));
  z0 = cam.zoom;
  cam.wheelAt(-400, 952, 526);           // held-wheel burst scales up
  assert.ok(cam.zoom / z0 >= 1.26 * 1.26, 'burst not scaling up: ' + (cam.zoom / z0));
  // ...and zooming out walks back down from the peak.
  const zPeak = cam.zoom;
  cam.wheelAt(400, 952, 526);
  assert.ok(cam.zoom < zPeak, 'wheel-out did not zoom out');
});

check('pickBody finds the Sun at the view centre', () => {
  fitSystem(game);
  const hit = pickBody(952, 526, game);
  assert.ok(hit, 'nothing picked at centre');
  assert.ok(game.bodies.includes(hit));
});

check('chromeInsets falls back to the classic insets with no chrome', () => {
  // The stubbed document has no .topbar / #mapInfo, so the measured path
  // must degrade to exactly the insets fitSystem's box math relies on.
  const i = chromeInsets(canvas);
  assert.deepStrictEqual(
    {top: i.top, right: i.right, left: i.left, bottom: i.bottom},
    {top: 76, right: 24, left: 24, bottom: 36});
});

check('fit frames the whole system inside the inset view — nothing under the chrome', () => {
  // Regression pin for the radius-vs-diameter bug: at the fitted zoom the
  // entire system (extent radius around the Sun) must sit inside the box
  // the insets carve out, or the outer orbits slide under the top bar and
  // info panel the moment you enter the map.
  const inset = chromeInsets(canvas);
  const eps = 1e-6;
  for (const compressed of [true, false]) {
    game.mapCompressed = compressed;
    fitSystem(game);
    const sun = cam.worldToScreen(0, 0);
    const r = systemExtent(game) * cam.zoom;
    assert.ok(sun.x - r >= inset.left - eps,
      `left edge ${sun.x - r} tucked under chrome (${inset.left})`);
    assert.ok(sun.x + r <= canvas.width - inset.right + eps,
      `right edge ${sun.x + r} tucked under chrome (${canvas.width - inset.right})`);
    assert.ok(sun.y - r >= inset.top - eps,
      `top edge ${sun.y - r} tucked under chrome (${inset.top})`);
    assert.ok(sun.y + r <= canvas.height - inset.bottom + eps,
      `bottom edge ${sun.y + r} tucked under chrome (${canvas.height - inset.bottom})`);
  }
});

check('fit fills the chrome-free box — the map never looks shrunken', () => {
  // Counter-regression for the "map too small" complaint: systemExtent once
  // carried a 25% headroom on top of the box padding, so the fitted system
  // only filled 80% of the gap between the top bar and the info panel. At
  // the fitted zoom the outer edge (Kuiper belt at 75 AU) must reach ~half
  // the box — i.e. the system diameter fills it. (Framing it any larger is
  // pinned out by the previous check: nothing may sit under the chrome.)
  const inset = chromeInsets(canvas);
  const width = Math.max(80, canvas.width - inset.left - inset.right);
  const height = Math.max(80, canvas.height - inset.top - inset.bottom);
  const box = Math.max(80, Math.min(width, height) - 24);
  const edge = 75 * 149.6e9;
  for (const compressed of [true, false]) {
    game.mapCompressed = compressed;
    fitSystem(game);
    const r = (compressed ? compressRadius(edge) : edge) * cam.zoom;
    assert.ok(r >= box * 0.45,
      `outer-edge radius ${r.toFixed(1)} fills only ${(r / box).toFixed(3)} of the box (${box})`);
  }
});

console.log('\n' + passed + ' checks passed');
