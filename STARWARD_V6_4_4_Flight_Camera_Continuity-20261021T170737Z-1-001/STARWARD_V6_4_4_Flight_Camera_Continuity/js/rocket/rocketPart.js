let nextId = 1;
export class RocketPart {
  constructor(type, x = 0, y = 0, rotation = 0, flipX = false) {
    this.id = nextId++;
    this.type = type;
    this.x = x;
    this.y = y;
    this.rotation = rotation;
    this.flipX = flipX;
    this.stage = 0;
  }
  serialize() {
    return {
      type: this.type,
      x: this.x,
      y: this.y,
      rotation: this.rotation,
      flipX: this.flipX,
      stage: this.stage
    };
  }
}
