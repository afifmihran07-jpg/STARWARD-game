export const G = 6.67430e-11;
export function gravityAt(position, bodies) {
  let x = 0,
    y = 0;
  for (const b of bodies) {
    const dx = b.position.x - position.x,
      dy = b.position.y - position.y,
      r2 = dx * dx + dy * dy;
    if (r2 > 1) {
      const k = b.mu / (r2 * Math.sqrt(r2));
      x += dx * k;
      y += dy * k;
    }
  }
  return {
    x,
    y
  };
}
