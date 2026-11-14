export class BuildGrid {
  constructor() {
    this.scale = 62;
    this.x = 0;
    this.y = 0;
  }
  world(screen, w, h) {
    return {
      x: (screen.x - w / 2) / this.scale - this.x,
      y: (screen.y - h / 2) / this.scale - this.y
    };
  }
  screen(p, w, h) {
    return {
      x: (p.x + this.x) * this.scale + w / 2,
      y: (p.y + this.y) * this.scale + h / 2
    };
  }
}
