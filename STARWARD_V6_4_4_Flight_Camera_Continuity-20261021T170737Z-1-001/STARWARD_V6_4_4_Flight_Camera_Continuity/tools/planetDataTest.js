/* Every body's mass, radius and orbit semi-major axis in js/celestial/
 * solarSystem.js is within 1% of the NASA NSSDCA fact sheets (values copied
 * from the pages listed below, retrieved 2026-11-15). Displayed surface
 * gravity is checked against the NSSDCA Planetary Fact Sheet summary table.
 * No live data feed: these are static values compiled into the game. */
import assert from 'node:assert/strict';
import {createSolarSystem} from '../js/celestial/solarSystem.js';
import {makeGame, element} from './_gameHarness.js';
import {updateBodyInfo} from '../js/ui/mapUI.js';

const NSSDCA = 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/';
const AU = 1.495978707e11;
// mass kg · volumetric mean radius km · semi-major axis km (orbit about its parent)
const FACT = {
  sun:     {mass: 1988400e24, radiusKm: 695700,  src: NSSDCA + 'sunfact.html'},
  mercury: {mass: 0.33010e24, radiusKm: 2439.7,  aKm: 57.909e6,   src: NSSDCA + 'mercuryfact.html'},
  venus:   {mass: 4.8673e24,  radiusKm: 6051.8,  aKm: 108.210e6,  src: NSSDCA + 'venusfact.html'},
  earth:   {mass: 5.9722e24,  radiusKm: 6371,    aKm: 149.598e6,  src: NSSDCA + 'earthfact.html'},
  moon:    {mass: 0.07346e24, radiusKm: 1737.4,  aKm: 0.3844e6,   src: NSSDCA + 'moonfact.html'},
  mars:    {mass: 0.64169e24, radiusKm: 3389.5,  aKm: 227.956e6,  src: NSSDCA + 'marsfact.html'},
  jupiter: {mass: 1898.13e24, radiusKm: 69911,   aKm: 778.479e6,  src: NSSDCA + 'jupiterfact.html'},
  saturn:  {mass: 568.32e24,  radiusKm: 58232,   aKm: 1432.041e6, src: NSSDCA + 'saturnfact.html'},
  uranus:  {mass: 86.811e24,  radiusKm: 25362,   aKm: 2867.043e6, src: NSSDCA + 'uranusfact.html'},
  neptune: {mass: 102.409e24, radiusKm: 24622,   aKm: 4514.953e6, src: NSSDCA + 'neptunefact.html'},
  pluto:   {mass: 0.01303e24, radiusKm: 1188,    aKm: 5869.656e6, src: NSSDCA + 'plutofact.html'},
  europa:  {mass: 480.0e20,   radiusKm: 1560.8,  aKm: 671.1e3,    src: NSSDCA + 'joviansatfact.html'},
  titan:   {mass: 1345.5e20,  radiusKm: 2575,    aKm: 1221.87e3,  src: NSSDCA + 'saturniansatfact.html'},
  // Asteroid Fact Sheet lists 965 x 961 x 891 km; mean radius = (965+961+891)/6.
  ceres:   {mass: 939300e15,  radiusKm: (965 + 961 + 891) / 6, aKm: 2.768 * AU / 1000, src: NSSDCA + 'asteroidfact.html'}
};
// NSSDCA Planetary Fact Sheet summary table, gravity (m/s^2), 2 significant figures.
const GRAVITY = {mercury: 3.7, venus: 8.9, earth: 9.8, moon: 1.6, mars: 3.7, jupiter: 23.1,
  saturn: 9.0, uranus: 8.7, neptune: 11.0, pluto: 0.6};

let checks = 0;
const within = (game, ref, tol, msg) => {
  const err = Math.abs(game - ref) / Math.abs(ref);
  assert.ok(err <= tol, `${msg}: game ${game}, NSSDCA ${ref} (${(err * 100).toFixed(2)}% > ${tol * 100}%)`);
  checks++;
  return err;
};

const bodies = createSolarSystem();
assert.equal(Object.keys(FACT).length, bodies.length, 'every body in the game has a fact-sheet entry');
checks++;
const worst = {};
for (const b of bodies) {
  const f = FACT[b.id];
  assert.ok(f, `fact-sheet entry for ${b.id}`); checks++;
  worst[b.id] = Math.max(
    within(b.mass, f.mass, 0.01, `${b.id} mass`),
    within(b.radius / 1000, f.radiusKm, 0.01, `${b.id} radius`),
    f.aKm ? within(b.orbit.radius / 1000, f.aKm, 0.01, `${b.id} semi-major axis`) : 0);
  if (GRAVITY[b.id] != null) {
    // The summary rounds to 2 significant figures (e.g. 0.6), hence 5%.
    within(b.gravity, GRAVITY[b.id], 0.05, `${b.id} displayed gravity`);
  }
}
// The map body panel credits the fact sheet the figures come from.
{
  const g = makeGame();
  g.selected = g.bodies.find(b => b.id === 'mars');
  updateBodyInfo(g);
  assert.equal(element('bodySourceLink').textContent, 'NASA NSSDCA Planetary Fact Sheet', 'Mars credits the Planetary Fact Sheet'); checks++;
  assert.equal(element('bodySourceLink').href, 'https://nssdc.gsfc.nasa.gov/planetary/planetfact.html', 'link to the fact sheet'); checks++;
  g.selected = g.bodies.find(b => b.id === 'ceres');
  updateBodyInfo(g);
  assert.equal(element('bodySourceLink').textContent, 'NASA NSSDCA Asteroid Fact Sheet', 'Ceres credits the Asteroid Fact Sheet'); checks++;
}
const largest = Object.entries(worst).sort((a, b) => b[1] - a[1])[0];
console.log(`${checks} checks passed: mass, radius and semi-major axis of all ${bodies.length} bodies within 1% of NASA NSSDCA ` +
  `fact sheets (largest deviation ${largest[0]} ${(largest[1] * 100).toFixed(2)}%), displayed gravity within the summary table's rounding`);
