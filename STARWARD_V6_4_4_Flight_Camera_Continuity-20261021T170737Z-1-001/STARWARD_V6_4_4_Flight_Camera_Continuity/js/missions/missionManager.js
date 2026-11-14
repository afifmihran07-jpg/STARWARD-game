/* =========================================================================
   missionManager.js — the campaign strip.

   Every mission measures something different (altitude, orbit, reaching the
   Moon, landing, coming home) instead of a single altitude ratio.
   ========================================================================= */
const clamp01 = v => Math.max(0, Math.min(1, v));

/** Lunar Crossing: arrive within this distance of the Moon's centre (m). */
export const LUNAR_CROSSING_DISTANCE = 40000e3;
/** Earth–Moon mean distance (m), the start of the Lunar Crossing progress bar. */
const EARTH_MOON_DISTANCE = 384400e3;
/** Homeward: the flight must first have reached space (m above the surface). */
export const HOMEWARD_MIN_PEAK = 100e3;

export const MISSIONS = [
  {
    id: 'altitude', name: 'Altitude Trial', objective: 'Reach an altitude of 10 km.',
    progress: st => clamp01(st.altitude / 10000),
    done: st => st.altitude >= 10000,
    hint: st => (st.altitude / 1000).toFixed(1) + ' / 10 km'
  },
  {
    id: 'orbit', name: 'First Orbit', objective: 'Raise the periapsis above 100 km.',
    progress: st => clamp01((st.periapsis - st.primaryRadius) / 100000),
    done: st => st.periapsis - st.primaryRadius >= 100000,
    hint: st => Math.max(0, (st.periapsis - st.primaryRadius) / 1000).toFixed(0) + ' / 100 km periapsis'
  },
  {
    // Distances are metres. The old check compared Earth-centre distance with
    // 40000 (40 km — inside the Earth), so it could never complete.
    id: 'moon', name: 'Lunar Crossing', objective: 'Fly to within 40 000 km of the Moon.',
    progress: st => clamp01((EARTH_MOON_DISTANCE - st.moonDistance) / (EARTH_MOON_DISTANCE - LUNAR_CROSSING_DISTANCE)),
    done: st => st.moonDistance <= LUNAR_CROSSING_DISTANCE,
    hint: st => Math.round(st.moonDistance / 1000).toLocaleString() + ' km from the Moon'
  },
  {
    id: 'landing', name: 'Moon Landing', objective: 'Touch down on the Moon below 15 m/s.',
    progress: st => clamp01(st.altitude / 20000),
    done: st => st.onMoon && st.landed && st.speed < 15,
    hint: st => (st.onMoon ? (st.landed ? 'landed at ' + st.speed.toFixed(0) + ' m/s' : 'over the Moon') : 'not at the Moon')
  },
  {
    // A landing only counts after the flight has been above 100 km; sitting
    // on the pad used to complete this mission.
    id: 'return', name: 'Homeward', objective: 'Reach space (above 100 km), then land back on Earth.',
    progress: st => st.maxAltitude < HOMEWARD_MIN_PEAK
      ? 0.5 * clamp01(st.maxAltitude / HOMEWARD_MIN_PEAK)
      : (st.onEarth && st.landed && !st.crashed) ? 1
      : 0.5 + 0.5 * clamp01(1 - st.altitude / st.maxAltitude),
    done: st => st.hasFlown && st.maxAltitude >= HOMEWARD_MIN_PEAK && st.onEarth && st.landed && !st.crashed,
    hint: st => st.maxAltitude < HOMEWARD_MIN_PEAK
      ? 'peak ' + (st.maxAltitude / 1000).toFixed(1) + ' / 100 km — reach space first'
      : (st.crashed ? 'vehicle destroyed' : (st.altitude / 1000).toFixed(1) + ' km up — land on Earth')
  }
];

/** Everything the missions need to know about the vehicle, in one object. */
export function flightState(game) {
  const rocket = game.rocket;
  if (!rocket) return null;
  const earth = game.bodies.find(b => b.id === 'earth') || game.bodies[1];
  const moon = game.bodies.find(b => b.id === 'moon');
  return {
    altitude: rocket.altitudeAboveSurface(rocket.body),
    speed: Math.hypot(rocket.velocity.x - rocket.body.velocity.x, rocket.velocity.y - rocket.body.velocity.y),
    primaryRadius: rocket.body.radius,
    periapsis: game.orbit ? game.orbit.periapsis : 0,
    earthDistance: Math.hypot(rocket.position.x - earth.position.x, rocket.position.y - earth.position.y),
    moonDistance: moon ? Math.hypot(rocket.position.x - moon.position.x, rocket.position.y - moon.position.y) : Infinity,
    maxAltitude: rocket.maxAltitude || 0,
    hasFlown: !!rocket.hasFlown,
    onMoon: !!(moon && rocket.body === moon),
    onEarth: rocket.body === earth,
    landed: !!rocket.landed,
    crashed: !!rocket.crashed
  };
}

export class MissionManager {
  constructor() {
    this.index = 0;
  }

  get current() {
    return MISSIONS[this.index] || MISSIONS[0];
  }

  /** 0..1 progress of the active mission for the current vehicle. */
  progress(game) {
    const st = flightState(game);
    return st ? this.current.progress(st) : 0;
  }

  /** Short human-readable line for the mission panel. */
  status(game) {
    const st = flightState(game);
    if (!st) return 'no vehicle in flight';
    const m = this.current;
    if (m.done(st)) return 'COMPLETE';
    return m.hint(st);
  }
}

export {MISSIONS as default};
