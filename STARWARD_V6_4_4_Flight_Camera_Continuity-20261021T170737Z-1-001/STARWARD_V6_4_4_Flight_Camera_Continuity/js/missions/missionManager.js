/* =========================================================================
   missionManager.js — the campaign strip.

   Every mission measures something different (altitude, orbit, reaching the
   Moon, landing, coming home) instead of a single altitude ratio.
   ========================================================================= */
const clamp01 = v => Math.max(0, Math.min(1, v));

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
    id: 'moon', name: 'Lunar Crossing', objective: 'Close to 384 400 km from Earth.',
    progress: st => clamp01(1 - (st.earthDistance - 40000) / 344400),
    done: st => st.earthDistance <= 40000,
    hint: st => Math.round(st.earthDistance / 1000).toLocaleString() + ' km from Earth'
  },
  {
    id: 'landing', name: 'Moon Landing', objective: 'Touch down on the Moon below 15 m/s.',
    progress: st => clamp01(st.altitude / 20000),
    done: st => st.onMoon && st.landed && st.speed < 15,
    hint: st => (st.onMoon ? (st.landed ? 'landed at ' + st.speed.toFixed(0) + ' m/s' : 'over the Moon') : 'not at the Moon')
  },
  {
    id: 'return', name: 'Homeward', objective: 'Come back down on Earth.',
    progress: st => clamp01(st.earthDistance / 400000),
    done: st => st.onEarth && st.landed,
    hint: st => Math.round(st.earthDistance / 1000).toLocaleString() + ' km from Earth'
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
