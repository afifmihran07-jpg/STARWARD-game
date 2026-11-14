/**
 * Classical elements of the orbit a vehicle is currently on.
 *
 * The velocity is made relative to the body first: in this simulation the
 * planets orbit the Sun at ~30 km/s, and feeding that into the energy term
 * reports "escape velocity" for a vehicle sitting on the pad.
 */
export function orbitElements(p, v, body) {
  const x = p.x - body.position.x;
  const y = p.y - body.position.y;
  const vx = v.x - body.velocity.x;
  const vy = v.y - body.velocity.y;
  const r = Math.hypot(x, y);
  const s = vx * vx + vy * vy;
  const e = s / 2 - body.mu / r;
  const a = e < 0 ? -body.mu / (2 * e) : Infinity;
  const h = x * vy - y * vx;
  const ecc = Math.sqrt(Math.max(0, 1 + 2 * e * h * h / (body.mu * body.mu)));
  const finite = Number.isFinite(a);
  return {
    r,
    semiMajor: a,
    eccentricity: ecc,
    apoapsis: finite ? a * (1 + ecc) : Infinity,
    periapsis: finite ? a * (1 - ecc) : 0,
    period: finite ? 2 * Math.PI * Math.sqrt(a ** 3 / body.mu) : Infinity,
    escape: Math.sqrt(2 * body.mu / r),
    orbital: Math.sqrt(body.mu / r),
    specificEnergy: e,
    bound: e < 0 && ecc < 1 && finite,
  };
}
export function formatDistance(m) {
  if (!isFinite(m)) return '∞';
  const a = Math.abs(m);
  if (a >= 1e9) return (m / 1e9).toFixed(2) + ' Gm';
  if (a > 1e6) return (m / 1e6).toFixed(1) + ' Mm';
  if (a > 1000) return (m / 1000).toFixed(1) + ' km';
  return m.toFixed(0) + ' m';
}

/**
 * An osculating orbit is considered verified for gameplay only after thrust is
 * off and its predicted periapsis clears the modeled atmosphere. Altitude alone
 * is never sufficient. This is a 2D educational criterion, not flight certification.
 */
export function isOrbitVerified(orbit, body, vehicle = null) {
  if (!orbit || !body || !orbit.bound || !Number.isFinite(orbit.periapsis) ||
      !Number.isFinite(orbit.apoapsis) || orbit.eccentricity >= 1) return false;
  const atmosphereTop = body.radius + (body.atmosphere?.height || 0);
  const engineCutoff = !vehicle || ((vehicle.throttle || 0) <= 0.005 && (vehicle.spool || 0) <= 0.01);
  const currentAltitude = Math.hypot(vehicle ? vehicle.position.x - body.position.x : 0,
    vehicle ? vehicle.position.y - body.position.y : 0) - body.radius;
  return engineCutoff && currentAltitude >= (body.atmosphere?.height || 0) &&
    orbit.periapsis > atmosphereTop + 10000 && orbit.semiMajor > 0;
}
