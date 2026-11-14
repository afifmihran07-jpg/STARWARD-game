export class CelestialBody {
  constructor(data) {
    Object.assign(this, data);
    this.mu = 6.67430e-11 * this.mass;
    this.position = {
      x: 0,
      y: 0
    };
    this.velocity = {
      x: 0,
      y: 0
    };
  }
  altitude(p) {
    return Math.hypot(p.x - this.position.x, p.y - this.position.y) - this.radius;
  }
}
