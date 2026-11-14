export class InputManager {
  constructor(canvas) {
    this.keys = new Set;
    // Key *edges*: filled by keydown, drained by pressedOnce(). A tap that
    // starts and ends between two frames is still recorded here, so one-shot
    // keys never miss a press.
    this.edges = new Set;
    this.mouse = {
      x: 0,
      y: 0,
      down: false
    };
    this.wheel = 0;
    addEventListener('keydown', e => {
      if (!this.keys.has(e.code)) this.edges.add(e.code);
      this.keys.add(e.code);
      if (['Space', 'KeyW', 'KeyS', 'KeyA', 'KeyD'].includes(e.code)) e.preventDefault();
      if (['Space', 'KeyW', 'KeyS', 'KeyA', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyX', 'KeyZ'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    canvas.addEventListener('pointermove', e => {
      const r = canvas.getBoundingClientRect();
      this.mouse.x = (e.clientX - r.left) * canvas.width / r.width;
      this.mouse.y = (e.clientY - r.top) * canvas.height / r.height;
    });
    canvas.addEventListener('pointerdown', () => this.mouse.down = true);
    addEventListener('pointerup', () => this.mouse.down = false);
    canvas.addEventListener('wheel', e => {
      this.wheel += e.deltaY;
      e.preventDefault()
    }, {
      passive: false
    });
  }
  pressed(k) {
    return this.keys.has(k);
  }
  /** True once per physical press; drains the edge recorded by keydown. */
  pressedOnce(k) {
    if (!this.edges.has(k)) return false;
    this.edges.delete(k);
    return true;
  }
  consumeWheel() {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }
}
