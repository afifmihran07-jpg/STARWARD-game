/* =========================================================================
   camera.js — world <-> screen mapping shared by every view.

   Build view ignores the camera (the grid has its own scale); flight and map
   use it. Zoom limits are set per mode, and the map can be panned freely.
   ========================================================================= */
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class Camera {
  constructor(canvas) {
    this.canvas = canvas;
    this.x = 0;
    this.y = 0;
    this.zoom = 0.00009;
    this.target = null;
    this.drag = null;
    this.minZoom = 1e-11;
    this.maxZoom = 0.2;
    this.smooth = 4;
    // --- Chase-cam feel: velocity look-ahead + engine shake -----------------
    this.lookX = 0;
    this.lookY = 0;
    this.shake = 0;
    this.shakeX = 0;
    this.shakeY = 0;
  }

  /** Per-mode limits, e.g. camera.limits(1, 60) while flying. */
  limits(min, max) {
    this.minZoom = min;
    this.maxZoom = max;
    this.zoom = clamp(this.zoom, min, max);
    return this;
  }

  focus(worldX, worldY) {
    this.x = worldX;
    this.y = worldY;
  }

  setZoom(zoom) {
    this.zoom = clamp(zoom, this.minZoom, this.maxZoom);
    return this;
  }

  update(dt) {
    if (this.target && !this.drag) {
      const k = Math.min(1, dt * this.smooth);
      // Chase target already includes velocity look-ahead (set by the flight
      // camera); ease position and the look offset together for a smooth pan.
      this.x += (this.target.x - this.x) * k;
      this.y += (this.target.y - this.y) * k;
    }
    // Engine shake decays fast; offsets are recomputed by flightShake().
    this.shake = Math.max(0, this.shake - dt * 3.5);
    if (this.shake <= 0.001) { this.shakeX = 0; this.shakeY = 0; }
  }

  /**
   * Per-frame chase feel: push the aim point ahead of the velocity vector so
   * fast flight leans into the direction of travel, and add a subtle engine
   * rumble proportional to thrust. Call AFTER focus/target is set.
   */
  flightShake(dt, velX, velY, thrust01) {
    const lookK = Math.min(1, dt * 2.2);
    // ~0.9s of velocity look-ahead, clamped so the ship never leaves frame.
    const wantX = Math.max(-900, Math.min(900, (velX || 0) * 0.9));
    const wantY = Math.max(-900, Math.min(900, (velY || 0) * 0.9));
    this.lookX += (wantX - this.lookX) * lookK;
    this.lookY += (wantY - this.lookY) * lookK;
    this.x += this.lookX * dt * 0.55;
    this.y += this.lookY * dt * 0.55;
    const target = Math.min(1, Math.max(0, thrust01 || 0));
    this.shake += (target * 0.55 - this.shake) * Math.min(1, dt * 5);
    if (this.shake > 0.01) {
      const t = performance.now() / 1000;
      const px = 1 / Math.max(0.05, this.zoom);
      const amp = Math.min(9, px * 0.012) * this.shake;
      this.shakeX = (Math.sin(t * 47.3) + Math.sin(t * 31.7) * 0.6) * amp;
      this.shakeY = (Math.cos(t * 43.1) + Math.sin(t * 27.9) * 0.6) * amp;
    } else { this.shakeX = 0; this.shakeY = 0; }
  }

  worldToScreen(x, y) {
    return {
      x: (x - this.x) * this.zoom + this.canvas.width / 2 + (this.shakeX || 0),
      y: -(y - this.y) * this.zoom + this.canvas.height / 2 + (this.shakeY || 0)
    };
  }

  screenToWorld(x, y) {
    return {
      x: (x - this.canvas.width / 2) / this.zoom + this.x,
      y: -(y - this.canvas.height / 2) / this.zoom + this.y
    };
  }

  /**
   * Zoom a step, keeping the point under (x, y) pinned (map behaviour).
   * Every scroll event moves AT LEAST one full step — that's the classic
   * 1.22-per-event feel, so tiny high-resolution deltas from touchpads and
   * smooth wheels stay as responsive as they ever were. Larger deltas (a
   * held wheel, several notches inside one frame) scale up to four steps so
   * fast scrolls go fast instead of being throttled.
   */
  wheelAt(delta, x, y) {
    if (!delta) return;
    const before = this.screenToWorld(x, y);
    const steps = Math.max(1, Math.min(4, Math.abs(delta) / 90));
    const factor = Math.pow(1.26, delta < 0 ? steps : -steps);
    this.setZoom(this.zoom * factor);
    const after = this.screenToWorld(x, y);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
  }

  /** Plain centred zoom (flight behaviour, follow stays live). */
  wheel(delta) {
    this.setZoom(this.zoom * (delta < 0 ? 1.18 : 1 / 1.18));
  }

  beginDrag(x, y) {
    this.drag = {x, y};
  }

  dragTo(x, y) {
    if (!this.drag) return;
    this.x -= (x - this.drag.x) / this.zoom;
    this.y += (y - this.drag.y) / this.zoom;
    this.drag = {x, y};
    this.target = null;
  }

  endDrag() {
    this.drag = null;
  }
}

