/* =========================================================================
   hud.js — binds simulation state to the DOM created in index.html.

   Every element is looked up once at construction. `update()` only writes
   text/width/style, never innerHTML, so the HUD cannot become a per-frame
   performance sink.
   ========================================================================= */
(function (global) {
  'use strict';

  const { Vec3, Quat, Util } = global.Math3;
  const P = global.Physics;
  const SI = Util.formatSI;

  const $ = (id) => document.getElementById(id);

  function Hud() {
    // Looked up once. Guarded so this also loads under the headless harness.
    this.el = {
      speed: $('ro-speed'), relspeed: $('ro-relspeed'),
      altitude: $('ro-altitude'), accel: $('ro-accel'), mass: $('ro-mass'),
      apoapsis: $('ro-apoapsis'), periapsis: $('ro-periapsis'),
      period: $('ro-period'), ecc: $('ro-ecc'),
      targetName: $('ro-target-name'), targetRange: $('ro-target-range'),
      targetClosure: $('ro-target-closure'), targetDv: $('ro-target-dv'),
      thrust: $('ro-thrust'), fuel: $('ro-fuel'), dv: $('ro-dv'),
      pitch: $('ro-pitch'), heading: $('ro-heading'), roll: $('ro-roll'),
      thrustFill: $('thrust-bar-fill'), thrustLabel: $('thrust-bar-label'),
      fuelFill: $('fuel-fill'), warp: $('warp-indicator'),
      missionName: $('hud-mission-name'), missionStep: $('hud-mission-step'),
      objectives: $('hud-objectives'), commLog: $('comm-log'),
      alert: $('alert-banner'), cameraLabel: $('camera-label'),
      navball: $('navball'), map: $('map-canvas'),
      overlay: $('overlay-canvas')
    };

    this.navCtx = this.el.navball ? this.el.navball.getContext('2d') : null;
    this.mapCtx = this.el.map ? this.el.map.getContext('2d') : null;
    this.ovCtx = this.el.overlay ? this.el.overlay.getContext('2d') : null;

    this._objRows = [];
    this._logLines = [];
    this._alertTimer = 0;
    this._lastObjectiveCount = -1;
  }

  Hud.prototype = {
    /**
     * Push simulation state into the DOM. `st` carries everything the HUD
     * needs, so this method has no knowledge of the game loop.
     */
    update: function (st) {
      const e = this.el;
      const ship = st.ship;
      if (!e.speed) return;

      e.speed.textContent = SI(ship.speed()) + ' m/s';
      e.relspeed.textContent = SI(st.relSpeed) + ' m/s';
      e.altitude.textContent = isFinite(st.altitude) ? SI(st.altitude) + ' m' : '---';
      e.accel.textContent = st.accelMag.toFixed(2) + ' m/s²';
      e.mass.textContent = Math.round(ship.mass) + ' kg';

      // --- Orbit: apoapsis/periapsis shown as altitude, the pilot's unit ---
      const o = st.orbit;
      const R = st.primaryRadius;
      if (o && o.closed) {
        e.apoapsis.textContent = SI(o.apoapsis - R) + ' m';
        e.periapsis.textContent = SI(o.periapsis - R) + ' m';
        e.period.textContent = this._duration(o.period);
        e.ecc.textContent = o.ecc.toFixed(4);
        // Periapsis inside the surface means a collision is inevitable.
        e.periapsis.className = 'readout__val' +
          (o.periapsis < R ? ' is-danger' : (o.periapsis < R + 2e5 ? ' is-warn' : ''));
        e.ecc.className = 'readout__val' + (o.ecc > 0.9 ? ' is-warn' : '');
      } else {
        e.apoapsis.textContent = o ? (o.hyper ? 'ESCAPE' : 'PARABOLIC') : '---';
        e.periapsis.textContent = o ? SI(o.periapsis - R) + ' m' : '---';
        e.period.textContent = '—';
        e.ecc.textContent = o ? o.ecc.toFixed(4) : '---';
        e.periapsis.className = 'readout__val' + (o && o.hyper ? ' is-good' : '');
      }
// --- Target panel ---
      if (st.target) {
        e.targetName.textContent = st.target.name;
        e.targetRange.textContent = SI(st.range) + ' m';
        e.targetClosure.textContent = st.relSpeed.toFixed(1) + ' m/s';
        e.targetDv.textContent = SI(st.requiredDv) + ' m/s';
        e.targetClosure.className = 'readout__val' +
          (st.relSpeed < 5 ? ' is-good' : (st.relSpeed > 200 ? ' is-danger' : ' is-warn'));
        // Green only if the remaining delta-v can actually cover the burn.
        e.targetDv.className = 'readout__val' +
          (st.requiredDv < ship.deltaVRemaining() ? ' is-good' : ' is-danger');
      } else {
        e.targetName.textContent = st.primaryName || '—';
        e.targetRange.textContent = isFinite(st.altitude) ? SI(st.altitude) + ' m' : '---';
        e.targetClosure.textContent = '---';
        e.targetDv.textContent = '---';
        e.targetClosure.className = 'readout__val';
        e.targetDv.className = 'readout__val';
      }

      // --- Propulsion ---
      const maxT = ship.SPEC.mainThrust * (ship.afterburner ? 1.55 : 1);
      const pct = Math.max(0, Math.min(1, ship.thrustNow / maxT));
      if (e.thrustFill) {
        e.thrustFill.style.width = (pct * 100).toFixed(0) + '%';
        e.thrustFill.className = 'thrust__fill' + (ship.burning ? ' is-burn' : '');
      }
      if (e.thrustLabel) e.thrustLabel.textContent = Math.round(pct * 100) + '%';
      e.thrust.textContent = Math.round(ship.thrustNow).toLocaleString() + ' N';

      const fuelPct = ship.fuelFraction * 100;
      e.fuel.textContent = fuelPct.toFixed(1) + '%';
      e.fuel.className = 'readout__val' +
        (fuelPct < 10 ? ' is-danger' : (fuelPct < 30 ? ' is-warn' : ''));
      if (e.fuelFill) {
        e.fuelFill.style.width = fuelPct.toFixed(1) + '%';
        e.fuelFill.className = 'fuel__fill' +
          (fuelPct < 10 ? ' is-critical' : (fuelPct < 30 ? ' is-low' : ''));
      }
      e.dv.textContent = Math.round(ship.deltaVRemaining()) + ' m/s';

      // --- Attitude ---
      e.pitch.textContent = st.attitude.pitch.toFixed(0) + '°';
      e.heading.textContent = st.attitude.heading.toFixed(0) + '°';
      e.roll.textContent = st.attitude.roll.toFixed(0) + '°';

      e.warp.textContent = st.warp >= 10000
        ? Math.round(st.warp / 1000) + 'k×' : st.warp + '×';
      if (e.cameraLabel) e.cameraLabel.textContent = st.cameraName;

      this.updateObjectives(st.objectives);
      if (this.navCtx) this.drawNavball(st);
      if (this.mapCtx) this.drawMap(st);
      if (this.ovCtx && st.markerPainter) st.markerPainter(this.ovCtx, st);
    },

    /** Human-readable duration for an orbital period. */
    _duration: function (sec) {
      if (!isFinite(sec)) return '∞';
      if (sec < 90) return sec.toFixed(1) + ' s';
      if (sec < 5400) return (sec / 60).toFixed(1) + ' min';
      if (sec < 172800) return (sec / 3600).toFixed(1) + ' h';
      return (sec / 86400).toFixed(1) + ' d';
    },
/* --------------------------- Navball ------------------------------- */
    /**
     * Attitude indicator. Draws the horizon disc rotated by the ship's roll
     * and pitch relative to the camera, plus prograde/retrograde markers.
     * This is the 2D instrument that tells you where the velocity vector is.
     */
    drawNavball: function (st) {
      const ctx = this.navCtx;
      const c = this.el.navball;
      const W = c.width, H = c.height;
      const cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 - 4;

      ctx.clearRect(0, 0, W, H);

      // Attitude is expressed relative to the local horizon of the dominant
      // body, which is what a real navball shows.
      const pitch = st.attitude.pitchRad;
      const roll = st.attitude.rollRad;

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.clip();

      // Rotate/translate the horizon sphere by roll and pitch.
      ctx.translate(cx, cy);
      ctx.rotate(-roll);
      const pitchPx = (pitch / (Math.PI / 2)) * R;
      ctx.translate(0, pitchPx);

      // Sky (above horizon) and ground (below).
      ctx.fillStyle = '#0d3352';
      ctx.fillRect(-R * 2, -R * 3, R * 4, R * 3);
      ctx.fillStyle = '#3a2a1c';
      ctx.fillRect(-R * 2, 0, R * 4, R * 3);

      // Horizon line with degree ladder.
      ctx.strokeStyle = '#d8ecf5';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-R, 0); ctx.lineTo(R, 0);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(216,236,245,0.7)';
      ctx.lineWidth = 1;
      ctx.font = '9px monospace';
      ctx.fillStyle = 'rgba(216,236,245,0.8)';
      ctx.textAlign = 'center';
      for (let deg = -80; deg <= 80; deg += 10) {
        if (deg === 0) continue;
        const y = -(deg / 90) * R;
        const len = deg % 20 === 0 ? R * 0.18 : R * 0.09;
        ctx.beginPath();
        ctx.moveTo(-len, y); ctx.lineTo(len, y);
        ctx.stroke();
        if (deg % 20 === 0) {
          ctx.fillText(String(Math.abs(deg)), len + 10, y + 3);
          ctx.fillText(String(Math.abs(deg)), -len - 10, y + 3);
        }
      }
      ctx.restore();

      // Outer bezel.
      ctx.strokeStyle = 'rgba(95,216,255,0.4)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.stroke();

      // Fixed aircraft symbol (centre).
      ctx.strokeStyle = '#ffc35c';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - R * 0.4, cy); ctx.lineTo(cx - R * 0.15, cy);
      ctx.moveTo(cx + R * 0.15, cy); ctx.lineTo(cx + R * 0.4, cy);
      ctx.moveTo(cx, cy - 3); ctx.lineTo(cx, cy + 3);
      ctx.stroke();

      // Prograde / retrograde markers projected onto the ball.
      if (st.prograde !== null && st.prograde !== undefined) {
        this._ballMarker(ctx, cx, cy, R, st.prograde, '#6ee7a0', 'V');
      }
      if (st.retrograde !== null && st.retrograde !== undefined) {
        this._ballMarker(ctx, cx, cy, R, st.retrograde, '#ff6b6b', 'R');
      }
    },

    /** Draw a velocity-direction marker on the navball. */
    _ballMarker: function (ctx, cx, cy, R, ang, color, label) {
      const px = cx + Math.sin(ang) * R * 0.82;
      const py = cy - Math.cos(ang) * R * 0.82;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.moveTo(px - 10, py); ctx.lineTo(px - 6, py);
      ctx.moveTo(px + 6, py); ctx.lineTo(px + 10, py);
      ctx.moveTo(px, py - 10); ctx.lineTo(px, py - 6);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.font = '8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(label, px, py + 3);
    },

    /** Rebuild the objective list only when its shape changes. */
    updateObjectives: function (rows) {
      if (!rows) return;
      const list = this.el.objectives;
      if (!list) return;

      if (this._lastObjectiveCount !== rows.length) {
        list.textContent = '';
        this._objRows = rows.map(function () {
          const li = document.createElement('li');
          list.appendChild(li);
          return li;
        });
        this._lastObjectiveCount = rows.length;
      }

      for (let i = 0; i < rows.length; i++) {
        const li = this._objRows[i], r = rows[i];
        if (li.textContent !== r.text) li.textContent = r.text;
        const next = r.done ? 'is-done' : (r.active ? 'is-active' : '');
        if (li.className !== next) li.className = next;
      }
    },

    /* ---------------------------- Messages ---------------------------- */

    /** Append a line to the flight log (newest last, capped). */
    log: function (text, kind) {
      const list = this.el.commLog;
      if (!list) return;
      const li = document.createElement('li');
      li.textContent = text;
      li.className = kind ? 'is-' + kind : '';
      list.appendChild(li);
      this._logLines.push(li);
      while (this._logLines.length > 8) {
        const old = this._logLines.shift();
        if (old.parentNode) old.parentNode.removeChild(old);
      }
    },

    clearLog: function () {
      const list = this.el.commLog;
      if (list) list.textContent = '';
      this._logLines.length = 0;
    },

    /** Show a transient banner. `kind` may be 'warn' or ''. */
    alert: function (text, kind, seconds) {
      const el = this.el.alert;
      if (!el) return;
      el.textContent = text;
      el.className = 'alert is-visible' + (kind === 'warn' ? ' is-warn' : '');
      this._alertTimer = seconds || 2.0;
    },

    clearAlert: function () {
      if (this._alertTimer > 0) return;
      const el = this.el.alert;
      if (el && el.textContent) { el.textContent = ''; el.className = 'alert'; }
    },

    tickAlert: function (dt) {
      if (this._alertTimer > 0) {
        this._alertTimer -= dt;
        if (this._alertTimer <= 0) {
          const el = this.el.alert;
          if (el) { el.textContent = ''; el.className = 'alert'; }
        }
      }
    },

    setMissionName: function (name, step) {
      if (this.el.missionName) this.el.missionName.textContent = name;
      if (this.el.missionStep) this.el.missionStep.textContent = step || '';
    },

    /* ------------------------- Orbital map ----------------------------- */
    /**
     * Top-down plot in the local orbital plane of the dominant body, so a
     * 400 km orbit and a 40,000 km orbit are legible at the same time.
     */
    drawMap: function (st) {
      const ctx = this.mapCtx;
      const c = this.el.map;
      const cx = c.width / 2, cy = c.height / 2;
      const R = Math.min(c.width, c.height) / 2 - 12;

      ctx.clearRect(0, 0, c.width, c.height);
      ctx.fillStyle = '#02060c';
      ctx.fillRect(0, 0, c.width, c.height);

      const body = st.primaryBody;
      if (!body) return;

      // Scale so both the ship and the primary fit inside the disc.
      const shipR = Vec3.dist(st.ship.body.pos, body.pos);
      const span = Math.max(shipR * 1.35, body.radius * 4);
      const scale = R / span;

      // Plot basis: +X right, +Y up on screen (the ecliptic plane).
      const project = (p) => {
        const d = Vec3.sub(p, body.pos);
        return { x: cx + d.x * scale, y: cy - d.y * scale };
      };

      // Range rings at decade intervals.
      ctx.strokeStyle = 'rgba(95,216,255,0.18)';
      ctx.lineWidth = 1;
      const ringStep = Math.pow(10, Math.floor(Math.log10(span)));
      for (let r = ringStep; r < span; r += ringStep) {
        ctx.beginPath();
        ctx.arc(cx, cy, r * scale, 0, Math.PI * 2);
        ctx.stroke();
      }

      // The primary body.
      const bp = project(body.pos);
      ctx.fillStyle = body.color;
      ctx.beginPath();
      ctx.arc(bp.x, bp.y, Math.max(2, body.radius * scale), 0, Math.PI * 2);
      ctx.fill();

      // Predicted trajectory, drawn from the real integrator.
      if (st.trajectory && st.trajectory.length > 1) {
        ctx.strokeStyle = 'rgba(95,216,255,0.85)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < st.trajectory.length; i++) {
          const q = project(st.trajectory[i]);
          if (i === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
        }
        ctx.stroke();
      }

      // Target reticle.
      if (st.target) {
        const tp = project(st.target.pos);
        ctx.strokeStyle = '#ffc35c';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(tp.x, tp.y, 5, 0, Math.PI * 2);
        ctx.moveTo(tp.x - 8, tp.y); ctx.lineTo(tp.x + 8, tp.y);
        ctx.moveTo(tp.x, tp.y - 8); ctx.lineTo(tp.x, tp.y + 8);
        ctx.stroke();
      }

      // The ship.
      const sp = project(st.ship.body.pos);
      ctx.fillStyle = '#6ee7a0';
      ctx.beginPath();
      ctx.moveTo(sp.x, sp.y - 5);
      ctx.lineTo(sp.x + 4, sp.y + 4);
      ctx.lineTo(sp.x - 4, sp.y + 4);
      ctx.closePath();
      ctx.fill();
    },
/* --------------------- Screen-space markers ---------------------- */
    /**
     * Painter for the overlay canvas: velocity markers and a target bracket,
     * projected from world space. `st.project(worldPos)` returns {x, y}.
     */
    drawMarkers: function (ctx, st) {
      const c = this.el.overlay;
      if (!c) return;
      ctx.clearRect(0, 0, c.width, c.height);
      const proj = st.project;
      if (!proj) return;

      const marker = (world, color, label, size) => {
        const p = proj(world);
        if (!p) return;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
        ctx.moveTo(p.x - size * 1.8, p.y); ctx.lineTo(p.x - size * 1.1, p.y);
        ctx.moveTo(p.x + size * 1.1, p.y); ctx.lineTo(p.x + size * 1.8, p.y);
        ctx.moveTo(p.x, p.y - size * 1.8); ctx.lineTo(p.x, p.y - size * 1.1);
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.font = '10px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(label, p.x + size * 2.2, p.y + 3);
      };

      if (st.progradePos) marker(st.progradePos, '#6ee7a0', 'V', 7);
      if (st.retrogradePos) marker(st.retrogradePos, '#ff6b6b', 'R', 7);

      if (st.target) {
        const p = proj(st.target.pos);
        if (p) {
          ctx.strokeStyle = '#ffc35c';
          ctx.lineWidth = 1.5;
          const s = 14;
          // Corner brackets, the standard target-reticle idiom.
          ctx.beginPath();
          ctx.moveTo(p.x - s, p.y - s); ctx.lineTo(p.x - s / 2, p.y - s);
          ctx.moveTo(p.x - s, p.y - s); ctx.lineTo(p.x - s, p.y - s / 2);
          ctx.moveTo(p.x + s / 2, p.y - s); ctx.lineTo(p.x + s, p.y - s);
          ctx.moveTo(p.x + s, p.y - s); ctx.lineTo(p.x + s, p.y - s / 2);
          ctx.moveTo(p.x - s, p.y + s / 2); ctx.lineTo(p.x - s, p.y + s);
          ctx.moveTo(p.x - s, p.y + s); ctx.lineTo(p.x - s / 2, p.y + s);
          ctx.moveTo(p.x + s / 2, p.y + s); ctx.lineTo(p.x + s, p.y + s);
          ctx.moveTo(p.x + s, p.y + s / 2); ctx.lineTo(p.x + s, p.y + s);
          ctx.stroke();

          ctx.fillStyle = '#ffc35c';
          ctx.font = '11px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(st.target.name, p.x, p.y - s - 6);
          ctx.fillText(SI(st.range) + ' m', p.x, p.y + s + 16);
        }
      }
    }
  };

  global.Hud = Hud;
})(window);