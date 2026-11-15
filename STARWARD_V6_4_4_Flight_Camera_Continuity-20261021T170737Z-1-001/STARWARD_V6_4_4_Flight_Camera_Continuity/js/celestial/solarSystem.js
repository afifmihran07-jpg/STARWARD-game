import {CelestialBody} from './celestialBody.js';

const G = 6.67430e-11;

function createSolarSystem() {
  const sun = new CelestialBody({
    id: 'sun', name: 'Sun', mass: 1.989e30, radius: 696340000,
    gravity: 274, atmosphere: null, rotation: 25, parent: null, orbit: null,
    color: '#ffc86c', orbitAngle: 0, type: 'STAR', moons: 0, tempC: 5505,
    fact: 'The star at the centre — 99.86% of the entire system’s mass.'
  });

  const earthOrbitSpeed = Math.sqrt(G * sun.mass / 149.6e9) / 149.6e9;
  const earth = new CelestialBody({
    id: 'earth', name: 'Earth', mass: 5.972e24, radius: 6371000,
    gravity: 9.81, atmosphere: {height: 100000, density: 1.225}, rotation: 1,
    parent: sun, orbit: {radius: 149.6e9}, color: '#2f8ed7',
    orbitAngle: 0, orbitSpeed: earthOrbitSpeed,
    type: 'TERRESTRIAL', moons: 1, tempC: 15,
    fact: 'The only world with stable liquid oceans — and the only known life.'
  });

  const moonOrbitSpeed = Math.sqrt(G * earth.mass / 384.4e6) / 384.4e6;
  const moon = new CelestialBody({
    id: 'moon', name: 'Moon', mass: 7.342e22, radius: 1737400,
    gravity: 1.62, atmosphere: null, rotation: 27,
    parent: earth, orbit: {radius: 384.4e6}, color: '#a9afb7',
    orbitAngle: 0, orbitSpeed: moonOrbitSpeed,
    type: 'MOON', moons: 0, tempC: -20,
    fact: 'Tidally locked, and drifting 3.8 cm farther from Earth every year.'
  });

  const marsOrbitSpeed = Math.sqrt(G * sun.mass / 227.9e9) / 227.9e9;
  const mars = new CelestialBody({
    id: 'mars', name: 'Mars', mass: 6.417e23, radius: 3389500,
    gravity: 3.71, atmosphere: {height: 60000, density: 0.02}, rotation: 1.03,
    parent: sun, orbit: {radius: 227.9e9}, color: '#ce7653',
    orbitAngle: Math.PI, orbitSpeed: marsOrbitSpeed,
    type: 'TERRESTRIAL', moons: 2, tempC: -63,
    fact: 'Home to Olympus Mons — 21.9 km tall, nearly three Everests.'
  });

  // --- Inner planets ---------------------------------------------------
  // Real JPL reference values. Orbit radii are the true semi-major axes, so
  // both map projections (compressed and true scale) keep their real spacing.
  // NOTE: appended AFTER Mars because several systems fall back to
  // `bodies[1]` expecting Earth to stay at index 1.
  const mercuryOrbitSpeed = Math.sqrt(G * sun.mass / 57.9e9) / 57.9e9;
  const mercury = new CelestialBody({
    id: 'mercury', name: 'Mercury', mass: 3.3011e23, radius: 2439700,
    gravity: 3.70, atmosphere: null, rotation: 58.6,
    parent: sun, orbit: {radius: 57.9e9}, color: '#9a9186',
    orbitAngle: 1.15, orbitSpeed: mercuryOrbitSpeed,
    type: 'TERRESTRIAL', moons: 0, tempC: 167,
    fact: 'No real atmosphere: surface swings from −173 °C to 427 °C.'
  });

  // Venus' real surface density is ~65 kg/m³, which no engine in the game
  // could climb through; the density is scaled to 2.0 so the atmosphere still
  // reads as thick (drag, sky gradient) while a launch stays flyable.
  const venusOrbitSpeed = Math.sqrt(G * sun.mass / 108.2e9) / 108.2e9;
  const venus = new CelestialBody({
    id: 'venus', name: 'Venus', mass: 4.8675e24, radius: 6051800,
    gravity: 8.87, atmosphere: {height: 70000, density: 2.0}, rotation: 243,
    parent: sun, orbit: {radius: 108.2e9}, color: '#e8c987',
    orbitAngle: 3.7, orbitSpeed: venusOrbitSpeed,
    type: 'TERRESTRIAL', moons: 0, tempC: 464,
    fact: 'A runaway greenhouse — the hottest surface in the system, 464 °C.'
  });

  // --- Belt object + outer planets ----------------------------------------
  // Real JPL semi-major axes and NASA planetary fact-sheet figures. Orbit
  // angles are deliberately spread so labels never pile up on the map.
  const ceresOrbitSpeed = Math.sqrt(G * sun.mass / 4.137e11) / 4.137e11;
  const ceres = new CelestialBody({
    id: 'ceres', name: 'Ceres', mass: 9.3835e20, radius: 469700,
    gravity: 0.27, atmosphere: null, rotation: 0.378,
    parent: sun, orbit: {radius: 4.137e11}, color: '#8f887f',
    orbitAngle: 2.05, orbitSpeed: ceresOrbitSpeed,
    type: 'DWARF PLANET', moons: 0, tempC: -105,
    fact: 'Largest object in the asteroid belt — a quarter of all belt mass.'
  });

  const jupiterOrbitSpeed = Math.sqrt(G * sun.mass / 778.479e9) / 778.479e9;
  const jupiter = new CelestialBody({
    id: 'jupiter', name: 'Jupiter', mass: 1.89813e27, radius: 69911000,
    // Displayed gravity: NSSDCA Jupiter Fact Sheet, equatorial at 1 bar (was 24.79).
    gravity: 23.12, atmosphere: {height: 100000, density: 0.16}, rotation: 0.414,
    parent: sun, orbit: {radius: 778.479e9}, color: '#d9ab7e',
    orbitAngle: 4.35, orbitSpeed: jupiterOrbitSpeed,
    type: 'GAS GIANT', moons: 95, tempC: -145,
    fact: 'The Great Red Spot is a storm wider than Earth that has raged for centuries.'
  });

  const europaOrbitSpeed = Math.sqrt(G * jupiter.mass / 671.1e6) / 671.1e6;
  const europa = new CelestialBody({
    id: 'europa', name: 'Europa', mass: 4.7998e22, radius: 1560800,
    gravity: 1.315, atmosphere: null, rotation: 3.551,
    parent: jupiter, orbit: {radius: 671.1e6}, color: '#dcd3c2',
    orbitAngle: 0.9, orbitSpeed: europaOrbitSpeed,
    type: 'MOON', moons: 0, tempC: -160,
    fact: 'An ice shell over a global saltwater ocean — a prime place to hunt for life.'
  });

  const saturnOrbitSpeed = Math.sqrt(G * sun.mass / 1433.53e9) / 1433.53e9;
  const saturn = new CelestialBody({
    id: 'saturn', name: 'Saturn', mass: 5.6834e26, radius: 58232000,
    // Displayed gravity: NSSDCA Saturn Fact Sheet, equatorial at 1 bar (was 10.44).
    gravity: 8.96, atmosphere: {height: 100000, density: 0.12}, rotation: 0.444,
    parent: sun, orbit: {radius: 1433.53e9}, color: '#e6d3a3',
    orbitAngle: 5.5, orbitSpeed: saturnOrbitSpeed,
    type: 'GAS GIANT', moons: 146, tempC: -178,
    fact: 'Its rings span 282,000 km yet are only about 10 m thick in places.'
  });

  const titanOrbitSpeed = Math.sqrt(G * saturn.mass / 1221.87e6) / 1221.87e6;
  const titan = new CelestialBody({
    id: 'titan', name: 'Titan', mass: 1.3452e23, radius: 2574700,
    // Real surface density is 5.4 kg/m³ — unusually thick, and gentle enough
    // that a parachute descent works without the Venus-style scaling hack.
    gravity: 1.352, atmosphere: {height: 600000, density: 5.4}, rotation: 15.945,
    parent: saturn, orbit: {radius: 1221.87e6}, color: '#e3a75f',
    orbitAngle: 2.4, orbitSpeed: titanOrbitSpeed,
    type: 'MOON', moons: 0, tempC: -179,
    fact: 'The only moon with a thick atmosphere — lakes of liquid methane pole to pole.'
  });

  const uranusOrbitSpeed = Math.sqrt(G * sun.mass / 2872.46e9) / 2872.46e9;
  const uranus = new CelestialBody({
    id: 'uranus', name: 'Uranus', mass: 8.6810e25, radius: 25362000,
    gravity: 8.69, atmosphere: {height: 100000, density: 0.08}, rotation: 0.718,
    parent: sun, orbit: {radius: 2872.46e9}, color: '#9fd6de',
    orbitAngle: 2.7, orbitSpeed: uranusOrbitSpeed,
    type: 'ICE GIANT', moons: 28, tempC: -195,
    fact: 'Knocked onto its side long ago — it rolls around the Sun at a 98° tilt.'
  });

  const neptuneOrbitSpeed = Math.sqrt(G * sun.mass / 4495.06e9) / 4495.06e9;
  const neptune = new CelestialBody({
    id: 'neptune', name: 'Neptune', mass: 1.02409e26, radius: 24622000,
    gravity: 11.15, atmosphere: {height: 100000, density: 0.08}, rotation: 0.671,
    parent: sun, orbit: {radius: 4495.06e9}, color: '#4668e0',
    orbitAngle: 0.75, orbitSpeed: neptuneOrbitSpeed,
    type: 'ICE GIANT', moons: 16, tempC: -201,
    fact: 'Supersonic winds reach 2,100 km/h — the fastest in the system.'
  });

  const plutoOrbitSpeed = Math.sqrt(G * sun.mass / 5906.38e9) / 5906.38e9;
  const pluto = new CelestialBody({
    id: 'pluto', name: 'Pluto', mass: 1.303e22, radius: 1188300,
    gravity: 0.62, atmosphere: null, rotation: 6.387,
    parent: sun, orbit: {radius: 5906.38e9}, color: '#b9a78f',
    orbitAngle: 5.95, orbitSpeed: plutoOrbitSpeed,
    type: 'DWARF PLANET', moons: 5, tempC: -229,
    fact: 'Demoted in 2006; its heart-shaped nitrogen glacier is bigger than Texas.'
  });

  // NOTE: Earth stays at index 1 — several systems fall back to bodies[1].
  const bodies = [sun, earth, moon, mars, mercury, venus,
    ceres, jupiter, europa, saturn, titan, uranus, neptune, pluto];
  updateOrbits(bodies, 0);
  return bodies;
}

export function updateOrbits(bodies, dt) {
  for (const body of bodies) {
    if (body.orbit && body.parent) {
      body.orbitAngle += body.orbitSpeed * dt;
      const r = body.orbit.radius;
      const px = body.parent.position.x;
      const py = body.parent.position.y;
      body.position.x = px + Math.cos(body.orbitAngle) * r;
      body.position.y = py + Math.sin(body.orbitAngle) * r;

      const vx = -Math.sin(body.orbitAngle) * body.orbitSpeed * r;
      const vy = Math.cos(body.orbitAngle) * body.orbitSpeed * r;
      body.velocity.x = body.parent.velocity.x + vx;
      body.velocity.y = body.parent.velocity.y + vy;
    }
  }
}

export {createSolarSystem, createSolarSystem as default};
