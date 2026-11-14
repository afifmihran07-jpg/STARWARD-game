/**
 * Keep the vehicle out of the ground.
 *
 * Everything is done in the body's frame: the planet is moving at ~30 km/s
 * around the Sun, so testing the absolute velocity against the surface normal
 * would fling the stack off the planet on the first step.
 *
 * @returns {boolean} true when the vehicle was touching the surface.
 */
export function surfaceCollision(rocket, body) {
  const dx = rocket.position.x - body.position.x;
  const dy = rocket.position.y - body.position.y;
  const r = Math.hypot(dx, dy);
  if (r < 1e-6) return false;
  const nx = dx / r, ny = dy / r;
  const floor = body.radius + terrainHeight(Math.atan2(dy, dx), body);
  const contactRadius = floor + rocket.supportExtent(nx, ny);
  if (r > contactRadius) return false;

  // Push the rocket out of the ground onto the surface.
  rocket.position.x = body.position.x + nx * contactRadius;
  rocket.position.y = body.position.y + ny * contactRadius;

  // Relative velocity in the body's frame.
  const vx = rocket.velocity.x - body.velocity.x;
  const vy = rocket.velocity.y - body.velocity.y;
  const inward = vx * nx + vy * ny;

  if (inward < 0) {
    // Very soft contact (< 2 m/s): kill the normal component entirely so the
    // rocket rests without micro-bouncing.  Harder impacts get a mild bounce.
    const restitution = Math.abs(inward) < 2 ? 0 : 0.3;
    rocket.velocity.x -= inward * nx * (1 + restitution);
    rocket.velocity.y -= inward * ny * (1 + restitution);
  }

  // Damp any residual tangential sliding so the rocket doesn't drift along
  // the surface when it should be standing still.
  const tvx = (rocket.velocity.x - body.velocity.x) - ((rocket.velocity.x - body.velocity.x) * nx + (rocket.velocity.y - body.velocity.y) * ny) * nx;
  const tvy = (rocket.velocity.y - body.velocity.y) - ((rocket.velocity.x - body.velocity.x) * nx + (rocket.velocity.y - body.velocity.y) * ny) * ny;
  const tSpeed = Math.hypot(tvx, tvy);
  if (tSpeed > 0 && tSpeed < 5) {
    rocket.velocity.x -= tvx * 0.3;
    rocket.velocity.y -= tvy * 0.3;
  }

  return true;
}

/**
 * Rolling relief of the surface, in metres, as a function of the angle.
 * Always >= 0 so the terrain never dips below the planet's nominal radius.
 */
export function terrainHeight(a, b) {
  const base = 300;
  return base + Math.sin(a * 17) * 260 + Math.sin(a * 43) * 90 + (b.id === 'moon' ? 90 : 0);
}
