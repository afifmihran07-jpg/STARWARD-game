/* =========================================================================
   systemTest.js — validates the expanded solar system and the map maths.
   Run with:  node tools/systemTest.js
   ========================================================================= */
import assert from 'node:assert';
import {createSolarSystem, updateOrbits} from '../js/celestial/solarSystem.js';
import {compressRadius, discRadius, BELTS} from '../js/map/mapRenderer.js';
import {bodyOrder, systemExtent, systemMinZoom} from '../js/map/spaceMap.js';

let passed = 0;
const check = (name, fn) => {
  fn();
  passed++;
  console.log('  ok  ' + name);
};

const bodies = createSolarSystem();
const byId = Object.fromEntries(bodies.map(b => [b.id, b]));

check('all 14 worlds present, Earth still at index 1', () => {
  assert.strictEqual(bodies.length, 14);
  assert.strictEqual(bodies[1].id, 'earth');
  for (const want of ['sun', 'mercury', 'venus', 'earth', 'moon', 'mars',
    'ceres', 'jupiter', 'europa', 'saturn', 'titan', 'uranus', 'neptune', 'pluto']) {
    assert.ok(byId[want], 'missing ' + want);
  }
});

check('parent chains, real JPL data and detail fields', () => {
  for (const b of bodies) {
    assert.ok(!b.parent || bodies.includes(b.parent), b.id + ' orphaned');
    assert.ok(b.radius > 0 && b.mass > 0, b.id + ' bad physical data');
    assert.ok(b.type && b.fact, b.id + ' lacks type/fact detail');
  }
  assert.strictEqual(Math.round(byId.jupiter.radius / 1000), 69911);
  assert.strictEqual(Math.round(byId.earth.radius / 1000), 6371);
  assert.ok(Math.abs(byId.jupiter.orbit.radius / 149.6e9 - 5.204) < 0.01);
  assert.ok(Math.abs(byId.neptune.orbit.radius / 149.6e9 - 30.07) < 0.1);
  assert.strictEqual(byId.europa.parent.id, 'jupiter');
  assert.strictEqual(byId.titan.parent.id, 'saturn');
});

check('100 simulated years stay finite and on-orbit', () => {
  for (let i = 0; i < 876000; i++) updateOrbits(bodies, 3600); // 100 yr, 1 h steps
  for (const b of bodies) {
    assert.ok(isFinite(b.position.x) && isFinite(b.position.y), b.id + ' went NaN');
    if (b.orbit && b.parent) {
      const d = Math.hypot(b.position.x - b.parent.position.x,
        b.position.y - b.parent.position.y);
      assert.ok(Math.abs(d - b.orbit.radius) < b.orbit.radius * 1e-6,
        b.id + ' drifted off its orbit');
    }
  }
});

check('Earth period is 365.25 d (Kepler against the Sun)', () => {
  const e = byId.earth;
  const period = 2 * Math.PI * Math.sqrt(Math.pow(e.orbit.radius, 3) / e.parent.mu);
  assert.ok(Math.abs(period / 86400 - 365.25) < 1, (period / 86400) + ' d');
});

check('bodyOrder lists every world, moons right after parents', () => {
  const order = bodyOrder(bodies).map(b => b.id);
  assert.deepStrictEqual(order, ['sun', 'mercury', 'venus', 'earth', 'moon',
    'mars', 'ceres', 'jupiter', 'europa', 'saturn', 'titan', 'uranus',
    'neptune', 'pluto']);
  for (let i = 0; i < 9; i++) assert.ok(order[i], 'digit shortcut ' + (i + 1) + ' empty');
});

check('disc sizes follow the real radius order', () => {
  const g = id => discRadius(byId[id], null, true);
  assert.ok(g('jupiter') > g('saturn'), 'Jupiter < Saturn');
  assert.ok(g('saturn') > g('uranus'), 'Saturn < Uranus');
  assert.ok(g('earth') > g('venus'), 'Earth < Venus');
  assert.ok(g('venus') > g('mars'), 'Venus < Mars');
  assert.ok(g('mars') > g('mercury'), 'Mars < Mercury');
  assert.ok(g('mercury') > g('moon'), 'Mercury < Moon');
  assert.strictEqual(g('sun'), 46, 'Sun cap');
  assert.ok(g('pluto') >= 3.2 && g('ceres') >= 3.2, 'minimum floor');
  const ratio = g('jupiter') / g('earth');
  assert.ok(ratio > 3.5 && ratio < 5, 'Jupiter/Earth = ' + ratio.toFixed(2));
});

check('belt annuli use the real distances', () => {
  const au = 149.6e9;
  const asteroid = BELTS.find(b => b.id === 'asteroid');
  const kuiper = BELTS.find(b => b.id === 'kuiper');
  assert.ok(Math.abs(asteroid.inner / au - 2.2) < 0.01);
  assert.ok(Math.abs(asteroid.outer / au - 3.2) < 0.01);
  assert.ok(Math.abs(kuiper.inner / au - 30) < 0.01);
  assert.ok(Math.abs(kuiper.outer / au - 50) < 0.01);
  for (const b of BELTS) assert.ok(b.inner < b.outer, b.id + ' inverted');
  assert.ok(compressRadius(50 * au) > compressRadius(30 * au));
});

check('fit extent reaches past Pluto and the Kuiper belt', () => {
  const extent = systemExtent({bodies, mapCompressed: true});
  assert.ok(extent > compressRadius(5906.38e9), 'excludes Pluto');
  // The extent IS the Kuiper edge now — the fit's breathing room comes from
  // the box padding inside the chrome insets, not from headroom here.
  assert.ok(extent >= compressRadius(50 * 149.6e9), 'reaches the Kuiper edge');
  const real = systemExtent({bodies, mapCompressed: false});
  assert.ok(real > 5906.38e9, 'true-scale extent too small');
});

check('map zoom floors at the system fit — it can never collapse to a dot', () => {
  const box = 700;
  for (const mapCompressed of [true, false]) {
    const game = {bodies, mapCompressed};
    // fitSystem frames the system's DIAMETER (systemExtent is a radius).
    const fit = box / (2 * systemExtent(game));
    const floor = systemMinZoom(game, box);
    assert.ok(floor > 0, 'floor must be positive');
    assert.ok(floor <= fit, 'floor must not exceed the fit zoom');
    assert.ok(Math.abs(floor - fit * 0.9) < fit * 1e-9,
      'floor is 0.9× the fit zoom');
    // The camera never needs a zoom below the floor, so wheel-zoom-out
    // stops while the whole system (diameter) still fills the view, give
    // or take the floor's 10% slack.
    assert.ok(box / floor <= systemExtent(game) * 2 / 0.9 + 1,
      'floor span within the system extent');
  }
});

console.log('\n' + passed + ' checks passed');
