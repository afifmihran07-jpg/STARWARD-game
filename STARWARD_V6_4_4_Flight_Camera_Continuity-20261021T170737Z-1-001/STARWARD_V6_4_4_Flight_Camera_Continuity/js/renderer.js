/* =========================================================================
   renderer.js — every pixel the game paints.

   Three views share one canvas:
     BUILD   assembly grid drawn with supplied PNGs and vector fallbacks
     FLIGHT  the assembled vehicle flying over real terrain
     MAP     the solar system (mapRenderer.js)
   ========================================================================= */
import {PART_DEFINITIONS as D} from './rocket/partDefinitions.js?v=ground-anchor-20261023d';
import {METERS_PER_UNIT} from './rocket/rocket.js?v=starward-flight-realism-20261016-v644';
import {terrainHeight} from './physics/collision.js?v=starward-flight-realism-20261016-v644';
import {drawMap} from './map/mapRenderer.js?v=system-map-visual-20261023d';
import {sheetImage, cellRect, packArt, packStatus, fitArtRect, contentRect} from './rocket/partSprites.js?v=starward-flight-realism-20261016-v644';
import {combinePlanetReveal, atmosphereVisualProfile, rocketDisplayScale} from './flight/flightCameraProfile.js?v=starward-flight-realism-20261016-v644';
import {resolveLaunchSite, launchPadMetrics} from './flight/launchSite.js?v=starward-flight-realism-20261016-v644';

export const BUILD_PART_SCALE = 1.0;

/** Blueprint parts are drawn at their logical size. Seam coverage is handled
 *  by overlapping attachment points so the original art scale stays intact. */
// eslint-disable-next-line no-unused-vars
export const BUILD_DRAW_SCALE = 1.0;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.groundPatterns = new Map();
    this.stars = Array.from({length: 420}, (_, i) => ({
      x: (i * 911 % 1000) / 1000,
      y: (i * 431 % 1000) / 1000,
      r: i % 11 === 0 ? 1.5 : 0.7,
      a: 0.2 + (i % 8) / 12,
      tw: (i * 37 % 100) / 100 * Math.PI * 2
    }));
    // Pooled exhaust/smoke particles (world-space, recycled — no GC churn).
    this.particles = [];
    this.resize();
    addEventListener('resize', () => this.resize());
    canvas.addEventListener('contextlost', event => {
      event.preventDefault();
      this.contextLost = true;
    });
    canvas.addEventListener('contextrestored', () => {
      this.ctx = canvas.getContext('2d');
      this.contextLost = false;
      this.resize();
    });
  }

  resize() {
    const d = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = innerWidth * d;
    this.canvas.height = innerHeight * d;
    this.canvas.style.width = innerWidth + 'px';
    this.canvas.style.height = innerHeight + 'px';
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';
  }

  space(starVisibility = 1, mapMode = false) {
    const {ctx: c, canvas} = this;
    if (mapMode) {
      const g = c.createRadialGradient(canvas.width * 0.48, canvas.height * 0.46, 0,
        canvas.width * 0.5, canvas.height * 0.5, canvas.width * 0.82);
      g.addColorStop(0, '#0c1727');
      g.addColorStop(.58, '#091321');
      g.addColorStop(1, '#070e18');
      c.fillStyle = g;
    } else {
      const g = c.createRadialGradient(canvas.width * 0.5, canvas.height * 0.4, 0, canvas.width * 0.5, canvas.height * 0.5, canvas.width * 0.8);
      g.addColorStop(0, '#10254b');
      g.addColorStop(1, '#020611');
      c.fillStyle = g;
    }
    c.fillRect(0, 0, canvas.width, canvas.height);
    const t = performance.now() / 1000;
    this.stars.forEach((s, i) => {
      const twinkle = 0.72 + 0.28 * Math.sin(t * 1.7 + s.tw);
      if (mapMode && i % 2) return;
      const alpha = s.a * twinkle * Math.max(0, Math.min(1, starVisibility)) * (mapMode ? .7 : 1);
      c.fillStyle = 'rgba(205,222,238,' + alpha.toFixed(3) + ')';
      const size = mapMode ? Math.min(.9, s.r) : s.r;
      c.fillRect(s.x * canvas.width, s.y * canvas.height, size, size);
    });
  }

  frame(game, dt = 1 / 60) {
    const c = this.ctx;
    // Canvas state survives between frames. If any drawing routine exits with
    // a stale transform, clip, alpha or blend mode, the next scene can become
    // completely invisible. Reset the backing bitmap/state before each frame.
    if (typeof c.reset === 'function') c.reset();
    else {
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'source-over';
      c.filter = 'none';
      c.shadowBlur = 0;
      c.setLineDash([]);
      c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    const flightBody = game.rocket && (game.rocket.primaryBody || game.rocket.body);
    const flightAltitude = game.mode === 'FLIGHT' && game.rocket && flightBody
      ? game.rocket.altitudeAboveSurface(flightBody) : 0;
    const starVisibility = game.mode === 'FLIGHT' && flightBody && flightBody.atmosphere
      ? atmosphereVisualProfile(flightAltitude, flightBody.atmosphere.height).starVisibility : 1;
    this.space(starVisibility, game.mode === 'MAP');
    if (game.mode === 'BUILD') this.build(game);
    else if (game.mode === 'MAP') drawMap(c, game);
    else this.flight(game, dt);
    // Canvas debug text only if the richer DOM debug panel is absent —
    // drawing both stacked on top of each other read as broken rendering.
    if (game.debug) {
      const dom = document.querySelector('#debug');
      if (!dom || dom.hidden) this.debug(game);
    }
  }

  /** Keep a visible, recoverable frame if a single draw call fails. */
  recoverFrame(error) {
    const c = this.canvas.getContext('2d');
    if (!c) return;
    this.ctx = c;
    try {
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'source-over';
      c.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.space();
      c.save();
      c.font = '600 13px system-ui';
      c.textAlign = 'center';
      c.fillStyle = 'rgba(6,14,24,.84)';
      c.fillRect(this.canvas.width / 2 - 185, 104, 370, 38);
      c.fillStyle = '#bdeaff';
      c.fillText('Flight view recovering…', this.canvas.width / 2, 128);
      c.restore();
    } catch (fallbackError) {
      console.error('Canvas fallback failed:', fallbackError, error);
    }
  }

  /**
   * Draw one part from its PNG or SVG artwork, preserving source proportions.
   * Falls back to the sprite sheet while the pack art loads or if both files
   * are unavailable, then to a flat-colour block if neither can be drawn.
   */
  /**
   * Draw one part from its PNG or SVG artwork, preserving source proportions.
   * No hull backing is painted behind real artwork - the old full-slot fill
   * is what showed as a white box around narrow parts. Outlines hug the
   * fitted artwork, and a soft shadow + top-light gives cylindrical depth.
   */
  /**
   * Draw one part from its PNG or SVG artwork, preserving source proportions.
   * No hull backing is painted behind real artwork - the old full-slot fill
   * is what showed as a white box around narrow parts. Outlines hug the
   * fitted artwork, and a soft shadow + top-light gives cylindrical depth.
   */
  drawPart(type, cx, cy, wPx, hPx, rotation = 0, alpha = 1, outline = null, flipX = false, axialScale = 1) {
    const c = this.ctx;
    const def = D[type] || {};
    const art = packArt(type, wPx, hPx);
    const sheet = art ? null : sheetImage();
    c.save();
    c.globalAlpha = alpha;
    c.translate(cx, cy);
    if (rotation) c.rotate(rotation);
    if (flipX) c.scale(-1, 1);
    if (axialScale !== 1) c.scale(1, axialScale);
    if (art) {
      const content = contentRect(art);
      const fitted = content && fitArtRect(content.w, content.h, wPx, hPx);
      if (fitted) {
        c.drawImage(art, content.x, content.y, content.w, content.h,
          fitted.x, fitted.y, fitted.w, fitted.h);
        if (outline) {
          c.save();
          c.strokeStyle = outline;
          c.lineWidth = Math.max(1.5, Math.min(3, wPx * 0.03));
          c.shadowColor = outline;
          c.shadowBlur = 12;
          this._roundRect(fitted.x, fitted.y, fitted.w, fitted.h, Math.min(6, fitted.w * 0.08));
          c.stroke();
          c.restore();
        } else if (alpha > 0.75) {
          c.save();
          const g = c.createLinearGradient(0, fitted.y, 0, fitted.y + fitted.h);
          g.addColorStop(0, 'rgba(255,255,255,.10)');
          g.addColorStop(0.25, 'rgba(255,255,255,0)');
          g.addColorStop(1, 'rgba(0,0,0,.14)');
          c.fillStyle = g;
          this._roundRect(fitted.x, fitted.y, fitted.w, fitted.h, Math.min(6, fitted.w * 0.08));
          c.fill();
          c.restore();
        }
      }
      c.restore();
      return;
    }
    if (sheet && !def.vector) {
      const cell = cellRect(type);
      const fitted = fitArtRect(cell.w, cell.h, wPx, hPx) || {x: -wPx / 2, y: -hPx / 2, w: wPx, h: hPx};
      c.drawImage(sheet, cell.x, cell.y, cell.w, cell.h, fitted.x, fitted.y, fitted.w, fitted.h);
      if (outline) {
        c.save();
        c.strokeStyle = outline;
        c.lineWidth = 2;
        c.shadowColor = outline;
        c.shadowBlur = 10;
        this._roundRect(fitted.x, fitted.y, fitted.w, fitted.h, 4);
        c.stroke();
        c.restore();
      }
      c.restore();
      return;
    }
    // Vector / fallback hull. Guard the gradient: a zero-length gradient
    // (hPx <= 0, e.g. a tiny blueprint thumbnail) throws in some browsers, so
    // fall back to a wide symmetric one that still reads as a lit cylinder.
    const top = -hPx / 2, bot = hPx / 2;
    const g = bot > top ? c.createLinearGradient(0, top, 0, bot)
                        : c.createLinearGradient(0, -1, 0, 1);
    const base = def.color || '#8899aa';
    g.addColorStop(0, base);
    g.addColorStop(1, 'rgba(0,0,0,.30)');
    c.fillStyle = g;
    this._roundRect(-wPx / 2, -hPx / 2, wPx, hPx, Math.min(6, wPx * 0.12));
    c.fill();
    c.strokeStyle = outline || 'rgba(4,12,22,.6)';
    c.lineWidth = outline ? 2 : 1;
    if (outline) { c.shadowColor = outline; c.shadowBlur = 10; }
    this._roundRect(-wPx / 2, -hPx / 2, wPx, hPx, Math.min(6, wPx * 0.12));
    c.stroke();
    c.restore();
  }

  _roundRect(x, y, w, h, r) {
    const c = this.ctx;
    const rr = Math.max(0, Math.min(r, w / 2, h / 2));
    c.beginPath();
    c.moveTo(x + rr, y);
    c.lineTo(x + w - rr, y);
    c.quadraticCurveTo(x + w, y, x + w, y + rr);
    c.lineTo(x + w, y + h - rr);
    c.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    c.lineTo(x + rr, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - rr);
    c.lineTo(x, y + rr);
    c.quadraticCurveTo(x, y, x + rr, y);
    c.closePath();
  }

  _groundPattern(biome) {
    if (this.groundPatterns.has(biome)) return this.groundPatterns.get(biome);
    const tile = document.createElement('canvas');
    tile.width = tile.height = 128;
    const t = tile.getContext('2d');
    let seed = biome === 'earth' ? 711 : biome === 'mars' ? 1729 : 3191;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const light = biome === 'earth' ? [126, 161, 103] : biome === 'mars' ? [208, 142, 105] : [179, 186, 193];
    const dark = biome === 'earth' ? [9, 19, 14] : biome === 'mars' ? [48, 25, 19] : [14, 17, 21];
    for (let i = 0; i < 100; i++) {
      const x = rand() * 128, y = rand() * 128;
      const rx = 1 + rand() * 5, ry = .5 + rand() * 2;
      const rgb = rand() > .56 ? light : dark;
      const alpha = .08 + rand() * .16;
      t.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha.toFixed(3)})`;
      t.beginPath(); t.ellipse(x, y, rx, ry, (rand() - .5) * .5, 0, Math.PI * 2); t.fill();
    }
    const pattern = this.ctx.createPattern(tile, 'repeat');
    this.groundPatterns.set(biome, pattern);
    return pattern;
  }

  /* ------------------------------- BUILD -------------------------------- */

  build(game) {
    const {ctx: c, canvas} = this;
    const ed = game.editor, grid = ed.grid, scale = grid.scale;
    const dpr = canvas.width / Math.max(1, innerWidth);
    const top = 82 * dpr, bottom = canvas.height - 112 * dpr;
    const left = 350 * dpr, right = canvas.width - 370 * dpr;

    // Blueprint grid: faint minor lines, stronger majors every 5.
    c.save();
    c.lineWidth = 1;
    let xi = 0;
    for (let x = canvas.width / 2 % scale; x < canvas.width; x += scale, xi++) {
      c.strokeStyle = xi % 5 === 0 ? 'rgba(117,212,255,.15)' : 'rgba(117,212,255,.06)';
      c.beginPath();
      c.moveTo(x, top);
      c.lineTo(x, bottom);
      c.stroke();
    }
    let yi = 0;
    for (let y = top + (canvas.height / 2 % scale); y < bottom; y += scale, yi++) {
      c.strokeStyle = yi % 5 === 0 ? 'rgba(117,212,255,.15)' : 'rgba(117,212,255,.06)';
      c.beginPath();
      c.moveTo(left, y);
      c.lineTo(right, y);
      c.stroke();
    }
    c.strokeStyle = 'rgba(120,221,255,.28)';
    c.setLineDash([6, 8]);
    c.beginPath();
    c.moveTo(canvas.width / 2, top);
    c.lineTo(canvas.width / 2, bottom);
    c.stroke();
    c.setLineDash([]);
    c.restore();

    this.buildAmbience(game, left, right, top, bottom);
    this.buildPad(game, scale, left, right);

    // Parts, lowest first, so higher stages overlap the ones below them.
    const ordered = ed.parts.slice().sort((a, b) => b.y - a.y);
    for (const p of ordered) {
      const def = D[p.type] || {width: 1, height: 1};
      const s = grid.screen(p, canvas.width, canvas.height);
      if (s.x < -240 || s.x > canvas.width + 240) continue;
      // Selection is shown in the assembly panel; a stroked rounded rectangle
      // here outlines transparent sprite padding and reads like a bad border.
      this.drawPart(p.type, s.x, s.y, def.width * scale * BUILD_PART_SCALE * BUILD_DRAW_SCALE,
        def.height * scale * BUILD_PART_SCALE * BUILD_DRAW_SCALE, p.rotation, 1,
        null, p.flipX);
    }

    this.buildStageMarkers(game, scale);
    this.buildGhost(game, scale);

    if (!ed.parts.length) {
      c.save();
      c.fillStyle = 'rgba(200,232,255,.75)';
      c.font = '600 13px system-ui';
      c.textAlign = 'center';
      c.fillText('Empty build — pick a part from the left, then click the grid.', canvas.width / 2, canvas.height * 0.5);
      c.restore();
    }
  }

  /** Soft blueprint-stage lighting behind the complete vehicle silhouette. */
  buildAmbience(game, left, right, top, bottom) {
    const {ctx: c, canvas} = this;
    const bounds = game.editor.bounds();
    const scale = game.editor.grid.scale;
    const centerX = canvas.width * 0.5;
    const centerY = canvas.height * 0.5;
    const radius = Math.min(canvas.height * 0.58, (bottom - top) * 0.72);
    c.save();
    c.beginPath();
    c.rect(left, top, Math.max(0, right - left), Math.max(0, bottom - top));
    c.clip();
    const glow = c.createRadialGradient(centerX, centerY, 8 * (canvas.width / Math.max(1, innerWidth)), centerX, centerY, Math.max(80, radius));
    glow.addColorStop(0, 'rgba(90, 183, 255, .10)');
    glow.addColorStop(.45, 'rgba(47, 112, 201, .055)');
    glow.addColorStop(1, 'rgba(12, 31, 64, 0)');
    c.fillStyle = glow;
    c.fillRect(left, top, Math.max(0, right - left), Math.max(0, bottom - top));

    // A faint height guide frames long stacks without obscuring part art.
    if (game.editor.parts.length) {
      const mid = (bounds.minY + bounds.maxY) * .5 + game.editor.grid.y;
      const y = (mid * scale) + centerY;
      c.strokeStyle = 'rgba(107, 202, 255, .12)';
      c.lineWidth = Math.max(1, canvas.width / Math.max(1, innerWidth));
      c.setLineDash([3 * c.lineWidth, 7 * c.lineWidth]);
      c.beginPath();
      c.moveTo(centerX, Math.max(top, y - radius * .72));
      c.lineTo(centerX, Math.min(bottom, y + radius * .72));
      c.stroke();
    }
    c.restore();
  }

  /** Launch pad line plus a metre rule down the side of the build field. */
  buildPad(game, scale, left = 246, right = this.canvas.width - 262) {
    const {ctx: c, canvas} = this, ed = game.editor, grid = ed.grid;
    let padY = canvas.height * 0.5;
    for (const p of ed.parts) {
      const def = D[p.type];
      if (!def) continue;
      const s = grid.screen(p, canvas.width, canvas.height);
      padY = Math.max(padY, s.y + def.height * scale * BUILD_PART_SCALE * BUILD_DRAW_SCALE / 2);
    }
    // Leave a little visual clearance under asymmetric engine art (clustered
    // PNGs often have a longer center bell than their side bells).
    if (ed.parts.length) padY += Math.max(2, scale * 0.24);
    c.save();
    c.shadowColor = 'rgba(120,221,255,.8)';
    c.shadowBlur = 14;
    c.strokeStyle = 'rgba(140,230,255,.65)';
    c.lineWidth = 2.5;
    c.beginPath();
    c.moveTo(left, padY);
    c.lineTo(right, padY);
    c.stroke();
    c.shadowBlur = 0;
    const pg = c.createLinearGradient(0, padY - 26, 0, padY);
    pg.addColorStop(0, 'rgba(120,221,255,0)');
    pg.addColorStop(1, 'rgba(120,221,255,.10)');
    c.fillStyle = pg;
    c.fillRect(left, padY - 26, right - left, 26);
    c.fillStyle = 'rgba(150,190,215,.9)';
    c.font = '10px ui-monospace, monospace';
    c.fillText('LAUNCH PAD · 0 m', 250, padY - 7);
    for (let m = 5; m <= 120; m += 5) {
      const y = padY - m * scale * BUILD_PART_SCALE;
      if (y < 100) break;
      const major = m % 10 === 0;
      c.strokeStyle = major ? 'rgba(120,221,255,.34)' : 'rgba(120,221,255,.16)';
      c.lineWidth = major ? 2 : 1;
      c.beginPath();
      c.moveTo(left, y);
      c.lineTo(left + (major ? 26 : 18), y);
      c.stroke();
      if (major) {
        c.fillStyle = 'rgba(160,200,225,.85)';
        c.fillText(m + ' m', left + 30, y + 3);
      }
    }
    c.restore();
  }

  buildStageMarkers(game, scale) {
    const {ctx: c, canvas} = this, ed = game.editor, grid = ed.grid;
    const joiners = ed.parts.filter(p => D[p.type] && D[p.type].stage);
    if (!joiners.length) return;
    c.save();
    c.font = '600 9px ui-monospace, monospace';
    c.textAlign = 'left';
    for (const q of joiners) {
      const s = grid.screen(q, canvas.width, canvas.height);
      const w = Math.max(30, D[q.type].width * scale * 0.34);
      c.save();
      c.strokeStyle = 'rgba(255,200,110,.65)';
      c.lineWidth = 1.5;
      c.setLineDash([4, 5]);
      c.beginPath();
      c.moveTo(s.x - w, s.y);
      c.lineTo(s.x + w, s.y);
      c.stroke();
      c.setLineDash([]);
      const label = 'SEPARATION';
      const tw = c.measureText(label).width;
      const bx = s.x + w + 8, by = s.y - 10;
      c.fillStyle = 'rgba(30,18,4,.85)';
      c.strokeStyle = 'rgba(255,200,110,.7)';
      c.lineWidth = 1;
      c.beginPath();
      if (c.roundRect) c.roundRect(bx - 5, by - 3, tw + 10, 17, 8);
      else c.rect(bx - 5, by - 3, tw + 10, 17);
      c.fill();
      c.stroke();
      c.fillStyle = 'rgba(255,205,120,.95)';
      c.fillText(label, bx, by + 9);
      c.restore();
    }
    c.restore();
  }

  /** Translucent preview of the part about to be placed, with its snap axis. */
  buildGhost(game, scale) {
    const c = this.ctx, ed = game.editor;
    if (!ed.pending || !ed.ghost) return;
    const def = D[ed.pending];
    if (!def) return;
    c.save();
    c.strokeStyle = 'rgba(120,221,255,.4)';
    c.lineWidth = 1.5;
    c.setLineDash([3, 6]);
    c.beginPath();
    c.moveTo(ed.ghost.x, 92);
    c.lineTo(ed.ghost.x, this.canvas.height - 122);
    c.stroke();
    c.setLineDash([]);
    c.restore();
    this.drawPart(ed.pending, ed.ghost.x, ed.ghost.y,
      def.width * scale * BUILD_PART_SCALE * BUILD_DRAW_SCALE, def.height * scale * BUILD_PART_SCALE * BUILD_DRAW_SCALE,
      0, 0.5, '#78ddff');
  }

  /* ------------------------------- FLIGHT ------------------------------- */

  flight(game, dt = 1 / 60) {
    const r = game.rocket;
    const body = (r && r.body) || game.bodies[1];
    const pos = r ? r.position : body.position;
    const alt = r ? r.altitudeAboveSurface(body) : body.altitude(pos);
    this.sky(body, alt);
    this.ascentStreaks(game, body, alt);
    this.terrain(game, body, alt);
    if (r) {
      this.launchPad(game);
      const poweredFlight = r.stageIndex >= 0 && r.throttle > 0;
      if (r.hasFlown || poweredFlight) this.trajectory(game);
      this.vehicle(game, dt, alt);
      if (game.atmosphereExitPulse) this.atmosphereExitEffect(game);
      if (game.deployedSpacecraft && game.deployedSpacecraft !== game.rocket) this.spacecraftMarker(game, game.deployedSpacecraft);
      if (r.hasFlown || poweredFlight) this.flightMarkers(game);
      if (r.crashed) this.banner('VEHICLE DESTROYED — fix the design and launch again', '#ff9a9a');
      else if (r.landed && r.hasFlown) {
        const v = Math.hypot(r.velocity.x - body.velocity.x, r.velocity.y - body.velocity.y);
        this.banner('TOUCHDOWN · ' + v.toFixed(1) + ' m/s', '#70f0b5');
      }
    } else {
      this.banner('No vehicle in flight — open BUILD, then press LAUNCH VEHICLE', '#8da8bb');
    }
    // Milestone card ("KÁRMÁN LINE", "EXO-ATMOSPHERIC"...) fades in above
    // everything else so leaving the world is impossible to miss.
    if (game.flash) this.flashBanner(game.flash);
  }

  /** Draw the pad only at its body-relative launch location and physical scale. */
  launchPad(game) {
    const rocket = game.rocket;
    const site = rocket && rocket.launchSite;
    if (!rocket || !site) return;
    const body = game.bodies.find(b => b.id === site.bodyId) ||
      rocket.primaryBody || rocket.body;
    if (!body) return;
    const worldPoint = resolveLaunchSite(body, site);
    if (!worldPoint) return;
    const point = game.camera.worldToScreen(worldPoint.x, worldPoint.y);
    // Near the pad the vehicle is intentionally rendered at a legible scale,
    // which can be larger than world scale. The artwork is also drawn with an
    // axial stretch (see vehicle()) and aspect-fitted inside its slot, so an
    // analytic "physical" base never matches the pixels you actually see.
    // When the vehicle is on the ground, anchor the deck AT ANY COST to the
    // rocket's rendered base: project the rocket origin to screen space and
    // drop straight down its local +Y (the stack's down direction) by the
    // same visual extent vehicle() paints. The deck then cannot float above
    // or sink below the feet — it is derived from the same numbers.
    const alt = rocket ? rocket.altitudeAboveSurface(body) : 0;
    const displayScale = Math.max(game.camera.zoom * METERS_PER_UNIT, rocketDisplayScale(alt));
    const AXIAL = 1.6; // must match vehicle()'s drawPart axialScale
    let maxBottom = 0;
    for (const part of rocket.parts) {
      const def = D[part.type] || {height: 1};
      maxBottom = Math.max(maxBottom, part.y + def.height * 0.5 * AXIAL);
    }
    if (rocket.landed) {
      const pr = game.camera.worldToScreen(rocket.position.x, rocket.position.y);
      const basePx = maxBottom * displayScale;
      // Local (0, base) through the vehicle's screen rotation.
      point.x = pr.x - basePx * Math.sin(rocket.angle || 0);
      point.y = pr.y + basePx * Math.cos(rocket.angle || 0) + 1; // +1px bite: no hairline gap
    }
    const metrics = launchPadMetrics(point, game.camera.zoom, this.canvas.width, this.canvas.height, displayScale);
    if (!metrics) return; // naturally too small or outside viewport — never altitude-toggle it

    const c = this.ctx, width = metrics.width;
    // Build in a local surface frame so the complex sits on the body's tangent
    // even when the launch site is on a curved horizon.
    c.save();
    c.globalAlpha *= metrics.alpha;
    c.translate(point.x, point.y);
    // Screen-space tangent: local +Y points inward toward the body, so the
    // structures drawn at negative Y always rise away from the surface.
    c.rotate(Math.atan2(Math.cos(site.angle), Math.sin(site.angle)));

    // A broad poured-concrete apron gives the launch complex a clear footprint.
    const apron = c.createLinearGradient(0, -9, 0, 5);
    apron.addColorStop(0, '#364656');
    apron.addColorStop(.45, '#273644');
    apron.addColorStop(1, '#17232e');
    c.fillStyle = apron;
    c.fillRect(-width * .68, -8, width * 1.36, 13);
    c.strokeStyle = 'rgba(193,211,222,.25)';
    c.lineWidth = Math.max(.7, width * .006);
    c.beginPath();
    c.moveTo(-width * .65, -7); c.lineTo(width * .65, -7);
    c.moveTo(-width * .65, 4); c.lineTo(width * .65, 4);
    c.moveTo(-width * .53, -7); c.lineTo(-width * .53, 4);
    c.moveTo(width * .53, -7); c.lineTo(width * .53, 4);
    c.stroke();
    c.fillStyle = 'rgba(246,193,91,.8)';
    for (let i = 0; i < 5; i++) {
      const stripeX = width * (.43 + i * .045);
      c.fillRect(stripeX, -3, width * .018, 2);
      c.fillRect(-stripeX - width * .018, -3, width * .018, 2);
    }

    // Local reference frame: the surface the vehicle stands on is local y = 0
    // and +Y reaches down into the ground. The apron's painted top edge, the
    // deck markings and every building foundation share this line, so the
    // rocket's feet always land exactly on the pad — never floating above it
    // or sunk into it.
    const deckFace = Math.max(2.5, width * 0.035); // slab face under the deck (px)
    const edge = c.createLinearGradient(0, 0, 0, deckFace);    // concrete slab face
    edge.addColorStop(0, '#2c4256');
    edge.addColorStop(1, '#131f2b');
    c.fillStyle = edge;
    c.fillRect(-width * .5, 0, width, deckFace);
    c.fillStyle = '#101a26';                                    // shadow seam under the slab
    c.fillRect(-width * .5, deckFace, width, 1);
    c.fillStyle = '#b8c9d3';                                    // painted deck surface the feet touch
    c.fillRect(-width * .5, -1.2, width, 1.2);
    c.fillStyle = '#111d2c';                                    // recessed flame trench, centred on the stack
    c.fillRect(-width * .15, 0, width * .3, Math.max(2, deckFace - 1));
    c.strokeStyle = 'rgba(255,255,255,.28)';                    // deck edge glow
    c.lineWidth = Math.max(.6, Math.min(1.2, game.camera.zoom * 1.2));
    c.beginPath(); c.moveTo(-width * .5, .2); c.lineTo(width * .5, .2); c.stroke();
    // Painted centre-line guides leading out from under the vehicle.
    c.fillStyle = 'rgba(240,246,250,.75)';
    c.fillRect(-width * .055, 0, width * .025, Math.max(2, deckFace - 1.5));
    c.fillRect(width * .03, 0, width * .025, Math.max(2, deckFace - 1.5));
    // Pad edge lights stay on the deck, not above it.
    c.fillStyle = 'rgba(112,240,181,.95)';
    c.fillRect(-width * .47, -2.4, Math.min(5, width * .04), 1.8);
    c.fillRect(width * .43, -2.4, Math.min(5, width * .04), 1.8);
    c.strokeStyle = 'rgba(190,220,230,.65)';                    // runway shoulders into the terrain
    c.lineWidth = Math.max(.6, Math.min(1.4, game.camera.zoom * 1.5));
    c.beginPath();
    c.moveTo(-width * .35, 0); c.lineTo(-width * .39, 8);
    c.moveTo(width * .35, 0); c.lineTo(width * .39, 8);
    c.stroke();

    // Hold-down clamps grip the base of the stack at the deck edge. Their
    // feet straddle the local y = 0 line and their heads rise just past the
    // vehicle's lowest pixels, which reads unmistakably as "bolted to the pad".
    // Positions are measured in screen px from the stack centre so the arms
    // stay just outside the rendered silhouette (plus a small artistic
    // overlap the vehicle paints over, suggesting a real connection).
    const baseHalf = rocket.parts.reduce((m, part) => {
      const def = D[part.type] || {width: 1};
      return Math.max(m, Math.abs(part.x) * displayScale + def.width * displayScale / 2);
    }, 0);
    for (const side of [-1, 1]) {
      const footX = side * (baseHalf + Math.max(4, width * 0.03));
      const stubW = Math.max(3, width * 0.03);            // angled arm stub toward the stack
      const stubL = Math.max(4, width * 0.035);
      c.fillStyle = '#101a26';
      c.fillRect(footX - stubW / 2, -1.5, stubW, deckFace + 3);
      c.fillStyle = '#506b7c';
      c.fillRect(footX - stubW / 2, -4.5, stubW, 3.5);    // clamp head rising past the feet
      c.fillStyle = '#ffca6a';
      c.fillRect(footX - stubW / 2, -5.5, stubW, 1.2);    // beacon strip on each head
      c.strokeStyle = '#8da7b7';
      c.lineWidth = Math.max(.7, Math.min(1.6, stubW * .3));
      c.beginPath();
      c.moveTo(footX, -3);
      c.lineTo(footX - side * stubL, -1);                 // short arm reaching the vehicle
      c.stroke();
    }
    // Mission facilities, drawn with the apron's own scale factor so the whole
    // complex shrinks and grows with the pad instead of floating at a fixed
    // screen size. Every structure's foundation starts exactly at local y = 0.
    const f = width / 156;
    const X = v => v * f, Y = v => v * f;
    // Keep facilities clear of the vehicle silhouette: propellant and
    // operations buildings to the left, service tower and mast to the right.
    // Three insulated propellant vessels add readable industrial forms behind
    // the service shed. Their highlights, hoops, saddles and pipework scale
    // with the launch complex rather than becoming screen-space stickers.
    for (const [tx, th, tone] of [[-122, 19, '#8fa8b8'], [-111, 25, '#aebdc5'], [-100, 19, '#718b9d']]) {
      const tw = 7.5, topY = -th;
      const tankGrad = c.createLinearGradient(X(tx - tw / 2), 0, X(tx + tw / 2), 0);
      tankGrad.addColorStop(0, '#34495a');
      tankGrad.addColorStop(.2, tone);
      tankGrad.addColorStop(.55, '#d3dee2');
      tankGrad.addColorStop(1, '#405565');
      c.fillStyle = '#111c27'; c.fillRect(X(tx - tw * .45), Y(-3), X(tw * .9), Y(3));
      c.fillStyle = tankGrad; c.fillRect(X(tx - tw / 2), Y(topY + 3), X(tw), Y(th - 6));
      c.fillStyle = '#c3d2da'; c.beginPath(); c.ellipse(X(tx), Y(topY + 3), X(tw / 2), Y(2.7), 0, Math.PI, Math.PI * 2); c.fill();
      c.fillStyle = '#536d7d'; c.beginPath(); c.ellipse(X(tx), Y(-3), X(tw / 2), Y(2.4), 0, 0, Math.PI); c.fill();
      c.strokeStyle = 'rgba(20,35,48,.68)'; c.lineWidth = Math.max(.55, f * .7);
      for (const hoopY of [topY + th * .35, topY + th * .68]) {
        c.beginPath(); c.moveTo(X(tx - tw / 2), Y(hoopY)); c.lineTo(X(tx + tw / 2), Y(hoopY)); c.stroke();
      }
      c.fillStyle = 'rgba(245,250,252,.48)'; c.fillRect(X(tx - tw * .29), Y(topY + 5), X(tw * .08), Y(th - 10));
      c.fillStyle = '#ffca6a'; c.fillRect(X(tx + tw * .22), Y(topY + 6), X(tw * .12), Y(2));
      for (const legX of [-.32, .32]) {
        c.strokeStyle = '#657d8c'; c.lineWidth = Math.max(1, f * 1.2);
        c.beginPath(); c.moveTo(X(tx + tw * legX), Y(-3)); c.lineTo(X(tx + tw * legX * 1.2), Y(0)); c.stroke();
      }
    }
    c.strokeStyle = '#91a8b8'; c.lineWidth = Math.max(.8, f);
    c.beginPath(); c.moveTo(X(-126), Y(-7)); c.lineTo(X(-126), Y(-24)); c.lineTo(X(-96), Y(-24)); c.lineTo(X(-96), Y(-13)); c.stroke();
    c.fillStyle = '#f0bd58'; c.fillRect(X(-127), Y(-25), X(3), Y(2));

    // --- Propellant / utility building (far left): tank farm shed with door.
    c.fillStyle = '#101b27'; c.fillRect(X(-88), Y(-2), X(30), Y(2));          // foundation
    const shed = c.createLinearGradient(0, Y(-15), 0, 0);                    // shed facade
    shed.addColorStop(0, '#26405a'); shed.addColorStop(1, '#16283a');
    c.fillStyle = shed; c.fillRect(X(-88), Y(-15), X(30), Y(15));
    c.fillStyle = 'rgba(255,255,255,.14)'; c.fillRect(X(-88), Y(-15), X(30), Y(1.5)); // roof edge light
    c.strokeStyle = 'rgba(177,204,220,.24)'; c.lineWidth = Math.max(.5, f * .55);
    c.beginPath();
    for (let seam = -82; seam <= -64; seam += 6) { c.moveTo(X(seam), Y(-13)); c.lineTo(X(seam), Y(-2)); }
    c.stroke();
    c.fillStyle = '#0e1722'; c.fillRect(X(-89), Y(-17.5), X(32), Y(2.5));     // roof cap
    c.fillStyle = '#3c5a72'; c.fillRect(X(-83), Y(-20), X(4), Y(2.5));        // roof vents
    c.fillStyle = '#3c5a72'; c.fillRect(X(-70), Y(-20), X(4), Y(2.5));
    c.fillStyle = '#0b1420'; c.fillRect(X(-80), Y(-9), X(12), Y(9));          // roll-up door
    c.fillStyle = '#31485a';
    for (let i = 0; i < 4; i++) c.fillRect(X(-80), Y(-8 + i * 2.2), X(12), Y(.7));
    c.fillStyle = '#ffca6a'; c.fillRect(X(-62.5), Y(-11), X(1.6), Y(1.6));    // wall lamp
    c.strokeStyle = 'rgba(150,180,200,.5)'; c.lineWidth = Math.max(.5, f);   // side pipework
    c.beginPath(); c.moveTo(X(-89.5), Y(-4)); c.lineTo(X(-89.5), Y(-13));
    c.moveTo(X(-89.5), Y(-8)); c.lineTo(X(-92), Y(-8)); c.stroke();

    // --- Mission operations block: two-storey control building, grounded.
    c.fillStyle = '#0f1a26'; c.fillRect(X(-52), Y(-2.5), X(26), Y(2.5));      // foundation
    const ops = c.createLinearGradient(0, Y(-26), 0, 0);                     // facade
    ops.addColorStop(0, '#2a4560'); ops.addColorStop(.55, '#1d3349'); ops.addColorStop(1, '#142436');
    c.fillStyle = ops; c.fillRect(X(-52), Y(-26), X(26), Y(26));
    c.fillStyle = 'rgba(255,255,255,.1)'; c.fillRect(X(-52), Y(-26), X(1.2), Y(23));
    c.fillStyle = '#111f2e'; c.fillRect(X(-53.5), Y(-4.5), X(29), Y(2));
    c.fillStyle = '#0b1420'; c.fillRect(X(-53), Y(-28.5), X(28), Y(2.5));     // parapet
    c.fillStyle = '#31485a'; c.fillRect(X(-48), Y(-31), X(5), Y(2.5));        // rooftop plant
    c.fillStyle = '#31485a'; c.fillRect(X(-40), Y(-30.2), X(4), Y(1.7));
    // Architectural facade framing, recessed panels, and service bays.
    c.strokeStyle = 'rgba(155,190,211,.5)'; c.lineWidth = Math.max(.55, f * .55);
    c.strokeRect(X(-50.5), Y(-24), X(23), Y(18));
    c.strokeRect(X(-50.5), Y(-4), X(23), Y(2.5));
    c.fillStyle = '#213b51';
    for (let bay = 0; bay < 3; bay++) {
      c.fillRect(X(-51), Y(-24 + bay * 6), X(1.2), Y(5));
      c.fillRect(X(-27.8), Y(-24 + bay * 6), X(1.2), Y(5));
    }
    c.strokeStyle = '#8ca6b7'; c.lineWidth = Math.max(.7, f);                // comm mast + dish
    c.beginPath(); c.moveTo(X(-31), Y(-28.5)); c.lineTo(X(-31), Y(-37)); c.stroke();
    c.beginPath(); c.arc(X(-31), Y(-37.5), X(3), .4, 2.6); c.stroke();
    c.fillStyle = '#ff6a5e'; c.fillRect(X(-31.8), Y(-39.6), X(1.6), Y(1.6));  // mast beacon
    for (let row = 0; row < 2; row++) {                                      // two lit office rows
      const wy = -22 + row * 8;
      for (let i = 0; i < 4; i++) {
        const dim = (row === 1 && (i === 1 || i === 3));                      // a couple of dark rooms
        c.fillStyle = dim ? '#1b2f42' : '#7ce4f7';
        c.fillRect(X(-49 + i * 6), Y(wy), X(4), Y(4.5));
        c.fillStyle = 'rgba(10,20,32,.8)';
        c.fillRect(X(-49 + i * 6), Y(wy + 2), X(4), Y(.7));                   // mullion bar
      }
    }
    c.strokeStyle = 'rgba(11,25,39,.85)'; c.lineWidth = Math.max(.55, f * .65);
    for (let i = 1; i < 4; i++) {
      c.beginPath(); c.moveTo(X(-49 + i * 6), Y(-22)); c.lineTo(X(-49 + i * 6), Y(-13.5)); c.stroke();
    }
    c.fillStyle = 'rgba(124,228,247,.12)'; c.fillRect(X(-51), Y(-24), X(24), Y(12));
    c.fillStyle = '#0e1a28'; c.fillRect(X(-38), Y(-6.5), X(6), Y(6.5));       // entrance
    c.fillStyle = 'rgba(124,228,247,.85)'; c.fillRect(X(-37), Y(-5.5), X(4), Y(3));
    c.fillStyle = '#3c5a72'; c.fillRect(X(-39.5), Y(-8), X(9), Y(1.5));       // awning

    // Service tower on the right of the vehicle: a taller, better-braced
    // umbilical mast with platforms, swing arms that reach toward (but stop
    // clear of) the stack, red obstruction lights, and a white lightning mast
    // behind it. Sits on its own concrete footing at local y = 0.
    c.fillStyle = '#101b27'; c.fillRect(X(34), Y(-2), X(16), Y(2));       // footing
    c.fillStyle = '#0f1a26'; c.fillRect(X(56), Y(-1.5), X(6), Y(1.5));    // lightning-mast base
    const mast = c.createLinearGradient(X(56), Y(-72), X(62), Y(-72));    // white lightning mast
    mast.addColorStop(0, '#d7e5ee'); mast.addColorStop(1, '#8ca6b7');
    c.fillStyle = mast; c.fillRect(X(57.5), Y(-72), X(3), Y(72));
    c.strokeStyle = 'rgba(215,229,238,.6)'; c.lineWidth = Math.max(.5, f * .7);
    for (let i = 0; i < 5; i++) {                                         // mast guy wires
      c.beginPath(); c.moveTo(X(59), Y(-66 + i * 3)); c.lineTo(X(50), Y(-8 - i * 5)); c.stroke();
      c.beginPath(); c.moveTo(X(59), Y(-66 + i * 3)); c.lineTo(X(68), Y(-8 - i * 5)); c.stroke();
    }
    const tower = c.createLinearGradient(X(34), 0, X(52), 0);             // tower facade
    tower.addColorStop(0, '#3c5a72'); tower.addColorStop(.5, '#2a4560'); tower.addColorStop(1, '#1a2c40');
    c.fillStyle = tower; c.fillRect(X(38), Y(-64), X(12), Y(64));
    c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(X(38), Y(-64), X(2), Y(64)); // sunlit edge
    c.fillStyle = 'rgba(4,13,22,.48)'; c.fillRect(X(47.5), Y(-62), X(1.2), Y(60));
    c.fillStyle = '#0e1722'; c.fillRect(X(36.5), Y(-66.5), X(15), Y(2.5)); // crown beam
    c.fillStyle = '#ff5e52'; c.fillRect(X(43), Y(-70), X(3), Y(3));      // red obstruction light
    c.fillStyle = 'rgba(255,94,82,.35)'; c.fillRect(X(41.5), Y(-71.5), X(6), Y(6));
    c.fillStyle = '#ff7a6a'; c.fillRect(X(43.5), Y(-47), X(2), Y(2));        // mid obstruction lights
    // Steel tower ribs, access plates, and regularly spaced bolt heads.
    c.strokeStyle = 'rgba(170,198,215,.36)'; c.lineWidth = Math.max(.45, f * .55);
    for (let y = -60; y < -4; y += 8) {
      c.beginPath(); c.moveTo(X(37), Y(y)); c.lineTo(X(51), Y(y)); c.stroke();
      c.fillStyle = '#9eb5c4'; c.fillRect(X(37.2), Y(y - .5), X(1.4), Y(1.4));
      c.fillRect(X(49.4), Y(y - .5), X(1.4), Y(1.4));
    }
    c.fillStyle = '#ff7a6a'; c.fillRect(X(43.5), Y(-29), X(2), Y(2));
    // Elevator shaft windows running up the tower, plus three lit decks.
    c.fillStyle = '#7ce4f7';
    for (let i = 0; i < 8; i++) {
      c.fillStyle = i % 3 === 0 ? '#a9f1ff' : '#67c9df';
      c.fillRect(X(42), Y(-60 + i * 6.5), X(2.3), Y(3));
      c.fillStyle = 'rgba(255,255,255,.3)'; c.fillRect(X(42), Y(-60 + i * 6.5), X(2.3), Y(.55));
    }
    for (const deck of [-52, -36, -20]) {
      c.fillStyle = '#506b7c'; c.fillRect(X(35), Y(deck), X(18), Y(2.4));  // platform floor
      c.strokeStyle = '#8da7b7'; c.lineWidth = Math.max(.5, f * .7);       // railing
      c.beginPath(); c.moveTo(X(35), Y(deck)); c.lineTo(X(35), Y(deck - 3));
      c.lineTo(X(53), Y(deck - 3)); c.lineTo(X(53), Y(deck)); c.stroke();
      c.fillStyle = 'rgba(255,202,106,.9)'; c.fillRect(X(35), Y(deck + 1.1), X(18), Y(1)); // deck lights
    }
    c.strokeStyle = '#8da7b7'; c.lineWidth = Math.max(.7, f);              // truss cross-bracing
    c.beginPath();
    for (let y = -60; y < -4; y += 8) {
      c.moveTo(X(38), Y(y)); c.lineTo(X(50), Y(y + 8));
      c.moveTo(X(50), Y(y)); c.lineTo(X(38), Y(y + 8));
    }
    c.stroke();
    // Two swing arms reach from the tower toward the stack and stop clear of
    // it; white rooms at their roots read as umbilical enclosures.
    for (const armY of [-52, -36]) {
      c.fillStyle = '#d7e5ee'; c.fillRect(X(34), Y(armY - 4), X(4), Y(4)); // white room
      c.fillStyle = '#31485a'; c.fillRect(X(22), Y(armY - 1.2), X(12), Y(1.6)); // swing arm
      c.fillStyle = '#ffca6a'; c.fillRect(X(22), Y(armY - 2.4), X(2), Y(1.2));   // arm tip light
    }
    // Crawlerway: lit taxiway strip leading off the right edge of the apron.
    c.fillStyle = 'rgba(240,246,250,.35)';
    for (let i = 0; i < 5; i++) c.fillRect(X(66 + i * 7), Y(-1), X(3.5), Y(1));
    c.restore();
    c.restore();
  }

  /** Atmosphere thinning to black as the vehicle climbs out of it. */
  sky(body, alt) {
    const {ctx: c, canvas} = this;
    if (!body.atmosphere) return;
    // Exponential visual scattering uses an Earth-like scale height of about
    // 8.5 km, consistent with the simplified density profile used by flight
    // physics. This is a rendering approximation, not a full standard-atmosphere
    // or wavelength-dependent scattering model. Keep every stop proportional to
    // the same optical fade: a fixed 0.15 top opacity used to remain after the
    // rest of the sky had vanished, causing a subtle atmospheric 'pop'.
    const visual = atmosphereVisualProfile(alt, body.atmosphere.height);
    const t = visual.scattering;
    if (t <= 0.001) return; // remaining overlay is below one tenth of one percent
    const tSharp = Math.pow(t, 0.85);
    const g = c.createLinearGradient(0, 0, 0, canvas.height);
    const top = 0.92 * tSharp;
    const mid = 0.86 * tSharp;
    const bot = 0.72 * tSharp;
    g.addColorStop(0, 'rgba(2,8,22,' + top.toFixed(3) + ')');
    g.addColorStop(0.35, 'rgba(8,30,70,' + mid.toFixed(3) + ')');
    g.addColorStop(0.65, 'rgba(30,90,160,' + (mid * 0.85).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(100,170,220,' + bot.toFixed(3) + ')');
    c.save();
    c.fillStyle = g;
    c.fillRect(0, 0, canvas.width, canvas.height);
    // Atmospheric halo / limb brightening at the horizon line when high up.
    if (t > 0.02 && t < 0.6) {
      const horizonIntensity = Math.max(0, 1 - t / 0.6) * t * 0.8;
      const hg = c.createLinearGradient(0, canvas.height * 0.3, 0, canvas.height * 0.7);
      hg.addColorStop(0, 'rgba(100,180,255,0)');
      hg.addColorStop(0.5, 'rgba(120,200,255,' + (horizonIntensity * 0.4).toFixed(3) + ')');
      hg.addColorStop(1, 'rgba(100,180,255,0)');
      c.fillStyle = hg;
      c.fillRect(0, 0, canvas.width, canvas.height);
    }
    // Sun glow near the top while still in atmosphere.
    if (t > 0.2) {
      const sg = c.createRadialGradient(canvas.width * 0.78, canvas.height * 0.12, 0,
        canvas.width * 0.78, canvas.height * 0.12, canvas.height * 0.45);
      sg.addColorStop(0, 'rgba(255,244,214,' + (0.4 * t).toFixed(3) + ')');
      sg.addColorStop(0.6, 'rgba(255,220,180,' + (0.15 * t).toFixed(3) + ')');
      sg.addColorStop(1, 'rgba(255,244,214,0)');
      c.fillStyle = sg;
      c.fillRect(0, 0, canvas.width, canvas.height);
    }
    // The base starfield is already painted by space(); it now emerges through
    // this same continuous atmospheric fade instead of being drawn a second time.
    c.restore();
  }

  /** Subtle air-flow streaks make speed relative to the world legible in chase view. */
  ascentStreaks(game, body, altitude) {
    const rocket = game.rocket;
    const atmosphereTop = body && body.atmosphere && body.atmosphere.height;
    if (!rocket || !rocket.hasFlown || !atmosphereTop || altitude >= atmosphereTop) return;
    const vx = rocket.velocity.x - (body.velocity?.x || 0);
    const vy = rocket.velocity.y - (body.velocity?.y || 0);
    const speed = Math.hypot(vx, vy);
    if (speed < 100) return;

    const {ctx: c, canvas} = this;
    const dpr = canvas.clientWidth ? canvas.width / canvas.clientWidth : 1;
    const speedMix = Math.max(0, Math.min(1, (speed - 80) / 760));
    const airMix = Math.max(0, 1 - altitude / atmosphereTop);
    const alpha = 0.24 * speedMix * Math.pow(airMix, 0.35);
    if (alpha < 0.012) return;

    // In screen space, the world streams opposite the vehicle's velocity.
    const dx = -vx / speed;
    const dy = vy / speed;
    const width = canvas.width, height = canvas.height;
    const wrap = (value, span) => ((value % span) + span) % span;
    const travel = (performance.now() / 1000) * (34 + speed * 0.12);
    c.save();
    for (let i = 0; i < 42; i++) {
      const offset = (travel + i * 97.3) % Math.hypot(width, height);
      const x = wrap((i * 211.7) % width + dx * offset, width);
      const y = wrap((i * 307.9) % height + dy * offset, height);
      const depth = i % 3;
      const length = dpr * (9 + speedMix * (18 + depth * 10) + (i % 4) * 3);
      if (Math.hypot(x - width / 2, y - height / 2) < 48 * dpr) continue;
      c.strokeStyle = depth === 2
        ? 'rgba(145,205,255,' + (alpha * 0.55).toFixed(3) + ')'
        : 'rgba(205,235,255,' + (alpha * (depth === 1 ? 0.8 : 0.48)).toFixed(3) + ')';
      c.lineWidth = Math.max(0.7, dpr * (depth === 2 ? 1.1 : 0.7));
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + dx * length, y + dy * length);
      c.stroke();
    }
    c.restore();
  }

  /** Expanding blue-white ring marks the atmosphere boundary crossing. */
  atmosphereExitEffect(game) {
    const pulse = game.atmosphereExitPulse;
    if (!pulse) return;
    const now = performance.now();
    const progress = Math.max(0, Math.min(1, (now - pulse.at) / (pulse.until - pulse.at)));
    if (progress >= 1) return;
    const rocket = game.rocket;
    if (!rocket) return;
    const center = game.camera.worldToScreen(rocket.position.x, rocket.position.y);
    const dpr = this.canvas.clientWidth ? this.canvas.width / this.canvas.clientWidth : 1;
    const maxRadius = Math.min(this.canvas.width, this.canvas.height) * 0.56;
    const ease = 1 - Math.pow(1 - progress, 2.2);
    const alpha = Math.pow(1 - progress, 1.6);
    const radius = dpr * 22 + maxRadius * ease;
    const c = this.ctx;
    c.save();
    const glow = c.createRadialGradient(center.x, center.y, Math.max(1, radius * 0.72),
      center.x, center.y, radius);
    glow.addColorStop(0, 'rgba(105,195,255,0)');
    glow.addColorStop(0.78, 'rgba(105,195,255,0)');
    glow.addColorStop(0.94, 'rgba(150,225,255,' + (0.16 * alpha).toFixed(3) + ')');
    glow.addColorStop(1, 'rgba(100,185,255,0)');
    c.fillStyle = glow;
    c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    c.strokeStyle = 'rgba(170,230,255,' + (0.78 * alpha).toFixed(3) + ')';
    c.lineWidth = Math.max(1, dpr * 1.4 * alpha);
    c.beginPath();
    c.arc(center.x, center.y, radius, 0, Math.PI * 2);
    c.stroke();
    c.strokeStyle = 'rgba(105,195,255,' + (0.3 * alpha).toFixed(3) + ')';
    c.lineWidth = Math.max(1, dpr * 3 * alpha);
    c.beginPath();
    c.arc(center.x, center.y, radius + dpr * 4, 0, Math.PI * 2);
    c.stroke();
    c.restore();
  }

  /** Blend the local horizon into the full planet as the camera pulls back. */
  terrain(game, body, altitude = 0) {
    const {ctx: c, canvas} = this, cam = game.camera;
    const ref = game.rocket ? game.rocket.position : body.position;
    const R = body.radius;
    const rpx = R * cam.zoom;
    const centre = cam.worldToScreen(body.position.x, body.position.y);
    const transitionStart = Math.max(canvas.width, canvas.height) * 4.5;
    const transitionEnd = Math.max(canvas.width, canvas.height) * 1.35;
    const planetMix = Math.max(0, Math.min(1,
      (transitionStart - rpx) / (transitionStart - transitionEnd)));
    // Blend using both projected globe size and the camera's altitude reveal.
    // The local horizon and sphere limb share the same screen-space geometry;
    // starting the globe blend before the zoom threshold avoids a dead band
    // where the horizon has left the viewport but the Earth disk is not drawn.
    const zoomMixSmooth = planetMix * planetMix * (3 - 2 * planetMix);
    const planetMixSmooth = combinePlanetReveal(zoomMixSmooth, game.flightReveal);
    const dx = ref.x - body.position.x, dy = ref.y - body.position.y;
    const dist = Math.hypot(dx, dy) || R;
    const angle = Math.atan2(dy, dx);
    const screenRef = cam.worldToScreen(ref.x, ref.y);

    c.save();
    // Keep the nearby surface beneath the planet layer during the handoff.
    // The globe then fades over it instead of appearing as a sudden cut.
    if (planetMixSmooth < 1) {
      const groundOffset = Math.max(0, dist - R - terrainHeight(angle, body));
      let horizonY = screenRef.y + groundOffset * cam.zoom;
      if (game.rocket && game.rocket.landed) {
        const displayScale = Math.max(cam.zoom * METERS_PER_UNIT, rocketDisplayScale(0));
        const AXIAL = 1.6;
        let maxBottom = 0;
        for (const part of game.rocket.parts) {
          const def = D[part.type] || {height: 1};
          maxBottom = Math.max(maxBottom, part.y + def.height * 0.5 * AXIAL);
        }
        horizonY = screenRef.y + maxBottom * displayScale;
      }
      const sag = Math.min(canvas.height * 0.42,
        canvas.width * canvas.width / (8 * R * Math.max(cam.zoom, 1e-12)));
      const getHorizonY = (x) => {
        const t = (x - screenRef.x) / Math.max(1, canvas.width * 0.5);
        return horizonY + sag * t * t;
      };

      const traceHorizon = (yOffset = 0) => {
        c.beginPath();
        const steps = 96;
        for (let i = 0; i <= steps; i++) {
          const x = canvas.width * i / steps;
          const y = getHorizonY(x) + yOffset;
          i ? c.lineTo(x, y) : c.moveTo(x, y);
        }
      };

      const isEarth = body.id === 'earth';
      const isMars = body.id === 'mars';
      const isMoon = body.id === 'moon' || body.id === 'mercury';
      const alphaMix = 1 - planetMixSmooth;

      // Distant rolling mountain / hill ridges in the background for horizon depth
      if (alphaMix > 0.05) {
        const camWorldX = cam.x || 0;
        // Far mountain range
        c.save();
        c.beginPath();
        const farSteps = 64;
        for (let i = 0; i <= farSteps; i++) {
          const x = canvas.width * i / farSteps;
          const worldX = (x - canvas.width * 0.5) / Math.max(0.001, cam.zoom) + camWorldX;
          const hy = getHorizonY(x);
          const hill1 = Math.sin(worldX * 0.00045) * 45 + Math.sin(worldX * 0.0011 + 1.2) * 22;
          const y = hy - Math.max(0, hill1 * Math.min(1.2, Math.pow(cam.zoom, 0.25)));
          i ? c.lineTo(x, y) : c.moveTo(x, y);
        }
        c.lineTo(canvas.width, canvas.height);
        c.lineTo(0, canvas.height);
        c.closePath();
        c.fillStyle = isEarth ? 'rgba(22, 42, 50, ' + (0.50 * alphaMix).toFixed(3) + ')'
                    : isMars ? 'rgba(74, 38, 30, ' + (0.50 * alphaMix).toFixed(3) + ')'
                    : 'rgba(38, 42, 48, ' + (0.50 * alphaMix).toFixed(3) + ')';
        c.fill();
        c.restore();

        // Mid-distance hill ridge
        c.save();
        c.beginPath();
        const midSteps = 64;
        for (let i = 0; i <= midSteps; i++) {
          const x = canvas.width * i / midSteps;
          const worldX = (x - canvas.width * 0.5) / Math.max(0.001, cam.zoom) + camWorldX;
          const hy = getHorizonY(x);
          const hill2 = Math.sin(worldX * 0.00085 + 2.5) * 24 + Math.sin(worldX * 0.0023) * 11;
          const y = hy - Math.max(0, hill2 * Math.min(1.1, Math.pow(cam.zoom, 0.25)));
          i ? c.lineTo(x, y) : c.moveTo(x, y);
        }
        c.lineTo(canvas.width, canvas.height);
        c.lineTo(0, canvas.height);
        c.closePath();
        c.fillStyle = isEarth ? 'rgba(28, 52, 44, ' + (0.68 * alphaMix).toFixed(3) + ')'
                    : isMars ? 'rgba(92, 46, 36, ' + (0.68 * alphaMix).toFixed(3) + ')'
                    : 'rgba(46, 50, 56, ' + (0.68 * alphaMix).toFixed(3) + ')';
        c.fill();
        c.restore();
      }

      // Foreground ground polygon
      traceHorizon();
      c.lineTo(canvas.width, canvas.height);
      c.lineTo(0, canvas.height);
      c.closePath();

      // Multi-stop geological strata gradient
      const ground = c.createLinearGradient(0, horizonY, 0, Math.min(canvas.height, horizonY + 2400));
      if (isEarth) {
        ground.addColorStop(0, '#385e46');      // Vibrant topsoil grass
        ground.addColorStop(0.02, '#2d4b38');   // Root turf layer
        ground.addColorStop(0.08, '#24372b');   // Subsoil loam
        ground.addColorStop(0.22, '#1b2820');   // Dense clay / gravel stratum
        ground.addColorStop(0.65, '#121a15');   // Bedrock transition
        ground.addColorStop(1, '#090d0b');
      } else if (isMars) {
        ground.addColorStop(0, '#8c563d');
        ground.addColorStop(0.03, '#734430');
        ground.addColorStop(0.12, '#593223');
        ground.addColorStop(0.35, '#381d14');
        ground.addColorStop(1, '#120805');
      } else if (body.id === 'venus') {
        ground.addColorStop(0, '#856d3b');
        ground.addColorStop(0.04, '#6b572e');
        ground.addColorStop(0.2, '#4a3b1d');
        ground.addColorStop(1, '#151006');
      } else {
        ground.addColorStop(0, '#666a70');
        ground.addColorStop(0.03, '#52565c');
        ground.addColorStop(0.15, '#3c4046');
        ground.addColorStop(0.45, '#24272c');
        ground.addColorStop(1, '#0e1013');
      }
      c.fillStyle = ground;
      c.fill();

      // Sub-surface strata bands (sediment striations) and soil grain
      c.save();
      c.beginPath();
      traceHorizon();
      c.lineTo(canvas.width, canvas.height);
      c.lineTo(0, canvas.height);
      c.closePath();
      c.clip();

      const strataBands = [
        {offset: 5, width: 2.5, color: isEarth ? 'rgba(78, 126, 94, 0.32)' : 'rgba(165, 105, 75, 0.28)'},
        {offset: 14, width: 3.8, color: isEarth ? 'rgba(32, 54, 40, 0.42)' : 'rgba(85, 48, 34, 0.38)'},
        {offset: 28, width: 5.0, color: isEarth ? 'rgba(46, 72, 56, 0.28)' : 'rgba(110, 65, 45, 0.24)'},
        {offset: 52, width: 7.0, color: isEarth ? 'rgba(22, 36, 28, 0.38)' : 'rgba(55, 30, 20, 0.32)'},
        {offset: 88, width: 9.5, color: isEarth ? 'rgba(30, 48, 38, 0.20)' : 'rgba(75, 42, 30, 0.18)'},
      ];
      for (const s of strataBands) {
        c.beginPath();
        for (let i = 0; i <= 96; i++) {
          const x = canvas.width * i / 96;
          const wave = Math.sin(x * 0.018 + s.offset) * 1.8 + Math.sin(x * 0.042) * 0.9;
          const y = getHorizonY(x) + s.offset + wave;
          i ? c.lineTo(x, y) : c.moveTo(x, y);
        }
        c.strokeStyle = s.color;
        c.lineWidth = s.width;
        c.stroke();
      }

      // Cached procedural material tile: one inexpensive pattern fill per frame.
      c.globalAlpha *= .82;
      const surfacePattern = this._groundPattern(isEarth ? 'earth' : isMars ? 'mars' : 'rock');
      if (surfacePattern && surfacePattern.setTransform) {
        const tileSize = 128;
        const phaseX = ((canvas.width * .5 - (cam.x || 0) * cam.zoom) % tileSize + tileSize) % tileSize;
        const phaseY = ((horizonY % tileSize) + tileSize) % tileSize;
        surfacePattern.setTransform({a:1, b:0, c:0, d:1, e:phaseX, f:phaseY});
      }
      c.fillStyle = surfacePattern;
      c.fillRect(0, horizonY, canvas.width, canvas.height - horizonY);
      c.restore();

      // Organic grass blade tufts / soil fringe along the horizon line
      if (isEarth && alphaMix > 0.15) {
        c.save();
        const tuftCount = Math.floor(canvas.width / 6);
        const camWorldX = cam.x || 0;
        for (let i = 0; i < tuftCount; i++) {
          const x = i * 6 + 3;
          const hy = getHorizonY(x);
          const wx = Math.floor((x - canvas.width * 0.5) / Math.max(0.001, cam.zoom) + camWorldX);
          const h = Math.sin(wx * 37.1) * 43758.5453;
          const r1 = h - Math.floor(h);
          const r2 = (h * 5.7) - Math.floor(h * 5.7);

          if (r1 > 0.28) {
            const bladeH = 2.0 + r2 * 3.4;
            const slant = (r1 - 0.5) * 2.4;
            const bAlpha = (0.40 + r1 * 0.45) * alphaMix;
            c.strokeStyle = r2 > 0.5
              ? 'rgba(98, 164, 120, ' + bAlpha.toFixed(2) + ')'
              : 'rgba(62, 114, 80, ' + bAlpha.toFixed(2) + ')';
            c.lineWidth = 1.1;
            c.beginPath();
            c.moveTo(x, hy + 0.6);
            c.lineTo(x + slant, hy - bladeH);
            c.moveTo(x + 1.8, hy + 0.6);
            c.lineTo(x + 1.8 - slant * 0.6, hy - bladeH * 0.75);
            c.stroke();
          }
        }
        c.restore();
      } else if ((isMars || isMoon) && alphaMix > 0.15) {
        c.save();
        const cragCount = Math.floor(canvas.width / 10);
        const camWorldX = cam.x || 0;
        for (let i = 0; i < cragCount; i++) {
          const x = i * 10 + 5;
          const hy = getHorizonY(x);
          const wx = Math.floor((x - canvas.width * 0.5) / Math.max(0.001, cam.zoom) + camWorldX);
          const h = Math.sin(wx * 37.1) * 43758.5453;
          const r1 = h - Math.floor(h);
          if (r1 > 0.4) {
            const rockH = 1.2 + r1 * 2.5;
            const rockW = 1.5 + r1 * 3.0;
            c.fillStyle = isMars ? 'rgba(145, 90, 68, 0.65)' : 'rgba(110, 115, 122, 0.65)';
            c.fillRect(x - rockW * 0.5, hy - rockH, rockW, rockH + 1);
          }
        }
        c.restore();
      }

      // Horizon highlight lines: rich turf crown + sun-grazing atmospheric edge
      traceHorizon();
      c.strokeStyle = isEarth ? 'rgba(84, 144, 104, ' + (0.75 * alphaMix).toFixed(3) + ')'
                    : isMars ? 'rgba(175, 112, 85, ' + (0.75 * alphaMix).toFixed(3) + ')'
                    : 'rgba(135, 142, 150, ' + (0.75 * alphaMix).toFixed(3) + ')';
      c.lineWidth = 2.0;
      c.stroke();

      traceHorizon();
      c.strokeStyle = 'rgba(255,255,255,' + (0.35 * alphaMix).toFixed(3) + ')';
      c.lineWidth = 1.0;
      c.stroke();
    }

    if (planetMixSmooth > 0) {
      c.save();
      c.globalAlpha *= planetMixSmooth;
      if (body.atmosphere) {
        const atmPx = body.atmosphere.height * cam.zoom;
        const haloR = rpx + Math.max(2, Math.min(atmPx * 1.5, rpx * 0.4));
        // Multi-layer atmosphere glow for depth
        const halo = c.createRadialGradient(centre.x, centre.y, rpx * 0.98, centre.x, centre.y, haloR);
        halo.addColorStop(0, 'rgba(180,220,255,.65)');
        halo.addColorStop(0.25, 'rgba(120,200,255,.45)');
        halo.addColorStop(0.6, 'rgba(80,160,255,.22)');
        halo.addColorStop(1, 'rgba(60,130,255,0)');
        c.fillStyle = halo;
        c.beginPath();
        c.arc(centre.x, centre.y, haloR, 0, Math.PI * 2);
        c.arc(centre.x, centre.y, rpx * 0.98, 0, Math.PI * 2, true);
        c.fill();
        // Inner limb brightening (atmosphere edge glow)
        const limbR = rpx + Math.max(1, atmPx * 0.02);
        const limb = c.createRadialGradient(centre.x, centre.y, rpx, centre.x, centre.y, limbR);
        limb.addColorStop(0, 'rgba(200,230,255,0)');
        limb.addColorStop(0.5, 'rgba(220,240,255,.35)');
        limb.addColorStop(1, 'rgba(200,230,255,0)');
        c.fillStyle = limb;
        c.beginPath();
        c.arc(centre.x, centre.y, limbR, 0, Math.PI * 2);
        c.arc(centre.x, centre.y, rpx, 0, Math.PI * 2, true);
        c.fill();
      }
      const planet = c.createRadialGradient(centre.x - rpx * 0.35, centre.y - rpx * 0.35,
        rpx * 0.1, centre.x, centre.y, rpx);
      planet.addColorStop(0, body.color);
      planet.addColorStop(1, 'rgba(4,10,20,.95)');
      c.fillStyle = planet;
      c.beginPath();
      c.arc(centre.x, centre.y, rpx, 0, Math.PI * 2);
      c.fill();

      c.beginPath();
      for (let a = 0; a <= Math.PI * 2 + 0.001; a += 0.04) {
        const rr = rpx + terrainHeight(a, body) * cam.zoom;
        const x = centre.x + Math.cos(a) * rr;
        const y = centre.y - Math.sin(a) * rr;
        a ? c.lineTo(x, y) : c.moveTo(x, y);
      }
      c.closePath();
      c.strokeStyle = 'rgba(255,255,255,.28)';
      c.lineWidth = 1.2;
      c.stroke();
      c.restore();
    }
    c.restore();
  }

  /** The assembled vehicle, drawn from the very same parts as the build view. */
  vehicle(game, dt = 1 / 60, flightAltitude = null) {
    const {ctx: c} = this, cam = game.camera, r = game.rocket;
    const p = cam.worldToScreen(r.position.x, r.position.y);
    // Preserve launch detail briefly, then smoothly reduce the tracked scale as
    // the rocket climbs. This keeps it legible near the pad without letting it
    // overlap the distant horizon or planet at high altitude.
    const altitude = flightAltitude == null
      ? (r.body ? r.altitudeAboveSurface(r.body) : 0) : flightAltitude;
    // Keep the vehicle legible near the pad, then let its rendered body recede
    // continuously as the world-scale view takes over. This is presentation-only.
    const trackedScale = rocketDisplayScale(altitude);
    const s = Math.max(cam.zoom * METERS_PER_UNIT, trackedScale);
    const spool = r.spool || 0;
    const burning = spool > 0.01 && r.activeEngine && r.currentFuel > 0;
    const now = performance.now() / 1000;

    // Exhaust particles spawn in world space (behind each lit nozzle).
    if (burning) this.spawnExhaust(game, altitude);
    this.drawParticles(game, dt);

    c.save();
    c.translate(p.x, p.y);
    c.rotate(r.angle);

    const lit = r.stageIndex >= 0 ? (r.groups[r.stageIndex] || []) : [];
    if (burning) {
      const flicker = 1 + Math.sin(now * 61) * 0.06 + Math.sin(now * 97) * 0.04;
      const boost = Math.max(0.7, Math.min(2.6, s / 8));
      // Plume expands + cools with altitude: short orange sea-level flame,
      // long pale-blue vacuum plume.
      const altF = r.body && r.body.atmosphere
        ? Math.max(0, Math.min(1, r.altitudeAboveSurface(r.body) / r.body.atmosphere.height)) : 1;
      for (const part of lit) {
        const def = D[part.type];
        if (!def || !def.thrust) continue;
        const w = def.width * s;
        const y0 = (part.y + def.height * 0.5) * s;
        const len = (30 + spool * 95) * boost * flicker * (0.75 + altF * 0.9);
        const flame = c.createLinearGradient(0, y0, 0, y0 + len);
        flame.addColorStop(0, 'rgba(255,248,214,' + (0.95 * spool).toFixed(2) + ')');
        flame.addColorStop(0.3, 'rgba(255,190,90,' + (0.85 * spool).toFixed(2) + ')');
        flame.addColorStop(0.65, 'rgba(120,170,255,' + (0.35 * spool * altF + 0.1 * spool).toFixed(2) + ')');
        flame.addColorStop(1, 'rgba(90,140,255,0)');
        c.fillStyle = flame;
        c.beginPath();
        const spread = 0.5 + altF * 0.35;
        c.moveTo(-w * 0.42, y0);
        c.lineTo(w * 0.42, y0);
        c.lineTo(w * spread * 0.5, y0 + len * 0.7);
        c.lineTo(0, y0 + len);
        c.lineTo(-w * spread * 0.5, y0 + len * 0.7);
        c.closePath();
        c.fill();
        // Hot core.
        const coreLen = len * 0.45;
        const core = c.createLinearGradient(0, y0, 0, y0 + coreLen);
        core.addColorStop(0, 'rgba(255,255,245,.95)');
        core.addColorStop(1, 'rgba(255,220,150,0)');
        c.fillStyle = core;
        c.beginPath();
        c.moveTo(-w * 0.22, y0);
        c.lineTo(w * 0.22, y0);
        c.lineTo(0, y0 + coreLen);
        c.closePath();
        c.fill();
        // Mach diamonds shimmering inside the plume (fade with altitude).
        c.fillStyle = 'rgba(200,230,255,' + (0.5 * spool * (1 - altF * 0.7)).toFixed(2) + ')';
        for (let i = 1; i <= 3; i++) {
          const cy = y0 + (len * 0.42 * i) / 3.5;
          const cw = w * 0.16 * (1 - i / 4.5);
          c.beginPath();
          c.moveTo(-cw, cy);
          c.lineTo(cw, cy);
          c.lineTo(0, cy + len * 0.05);
          c.closePath();
          c.fill();
        }
      }
    }

    let maxY = -Infinity, minX = Infinity, maxX = -Infinity, minY = Infinity;
    // Match the builder's bottom-to-top paint order so enlarged joint overlaps
    // are consistent and upper parts sit cleanly over the lower stage.
    const drawOrder = r.parts.slice().sort((a, b) => b.y - a.y);
    for (const part of drawOrder) {
      const def = D[part.type] || {width: 1, height: 1};
      maxY = Math.max(maxY, part.y + def.height * 0.5);
      minX = Math.min(minX, part.x * s - def.width * s / 2);
      maxX = Math.max(maxX, part.x * s + def.width * s / 2);
      minY = Math.min(minY, part.y * s - def.height * s / 2);
      this.drawPart(part.type, part.x * s, part.y * s, def.width * s, def.height * s,
        part.rotation, 1, null, part.flipX, 1.6);
    }

    // Under-glow: hot light spilling onto the pad / ground.
    if (burning) {
      const gy = maxY * s;
      const glowR = Math.max(46, s * 13 * (0.5 + spool * 0.7));
      const glow = c.createRadialGradient(0, gy, 2, 0, gy, glowR);
      glow.addColorStop(0, 'rgba(255,196,100,' + (0.5 * spool).toFixed(2) + ')');
      glow.addColorStop(0.5, 'rgba(255,140,60,' + (0.18 * spool).toFixed(2) + ')');
      glow.addColorStop(1, 'rgba(255,120,40,0)');
      c.fillStyle = glow;
      c.beginPath();
      c.arc(0, gy, glowR, 0, Math.PI * 2);
      c.fill();
    }

    // Re-entry heating glow. Dynamic pressure peaks during powered ascent too;
    // drawing the full orange/red plasma bloom for every high-q launch caused
    // an oversized pulsing glow that looked like a render fault. Only show
    // re-entry heating when the craft is moving inward through the atmosphere.
    const qHeat = r.dynPressure || 0;
    const heatBody = r.body || r.primaryBody;
    let radialSpeed = 0;
    if (heatBody) {
      const rx = r.position.x - heatBody.position.x;
      const ry = r.position.y - heatBody.position.y;
      const radius = Math.hypot(rx, ry);
      if (radius > 1) {
        const rvx = r.velocity.x - (heatBody.velocity?.x || 0);
        const rvy = r.velocity.y - (heatBody.velocity?.y || 0);
        radialSpeed = (rvx * rx + rvy * ry) / radius;
      }
    }
    if (qHeat > 8000 && radialSpeed < -25 && !r.landed) {
      const heat = Math.min(0.42, (qHeat - 8000) / 60000);
      const hr = Math.max(42, s * 7);
      const hg = c.createRadialGradient(0, 0, 4, 0, 0, hr);
      hg.addColorStop(0, 'rgba(255,120,50,' + heat.toFixed(2) + ')');
      hg.addColorStop(1, 'rgba(255,60,20,0)');
      c.fillStyle = hg;
      c.beginPath();
      c.arc(0, 0, hr, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();

    // Once the camera pulls back to planet scale the stack is a few pixels
    // tall — ring it and label it so the eye can still track the vehicle
    // against the globe it just left.
    const truePx = r.heightMeters * cam.zoom;
    if ((game.flightReveal > 0.65 || truePx < 14) && !r.crashed) {
      const pulse = 1 + 0.12 * Math.sin(now * 3.1);
      const rad = Math.max(11, Math.min(26, 10 * s)) * pulse;
      c.save();
      c.strokeStyle = 'rgba(126,232,255,.9)';
      c.lineWidth = 1.6;
      c.beginPath();
      c.arc(p.x, p.y, rad, 0, Math.PI * 2);
      c.stroke();
      c.strokeStyle = 'rgba(126,232,255,.28)';
      c.lineWidth = 4;
      c.beginPath();
      c.arc(p.x, p.y, rad + 3, 0, Math.PI * 2);
      c.stroke();
      c.fillStyle = 'rgba(180,240,255,.95)';
      c.font = '600 10px ui-monospace, monospace';
      c.fillText(game.deployedSpacecraft === r ? 'SPACECRAFT' : 'VEHICLE', p.x + rad + 6, p.y + 3);
      c.restore();
    }
  }

  /** Render the independently integrated deployed spacecraft, distinct from the carrier. */
  spacecraftMarker(game, craft) {
    const c = this.ctx;
    const p = game.camera.worldToScreen(craft.position.x, craft.position.y);
    if (p.x < -80 || p.x > this.canvas.width + 80 || p.y < -80 || p.y > this.canvas.height + 80) return;
    const scale = Math.max(2, Math.min(10, game.camera.zoom * METERS_PER_UNIT * 2));
    c.save();
    c.translate(p.x, p.y);
    c.rotate(-craft.angle);
    c.strokeStyle = 'rgba(120,221,255,.95)';
    c.fillStyle = 'rgba(120,221,255,.22)';
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(0, -scale * 1.8); c.lineTo(scale * 1.2, 0);
    c.lineTo(0, scale * 1.8); c.lineTo(-scale * 1.2, 0); c.closePath();
    c.fill(); c.stroke();
    c.beginPath(); c.moveTo(-scale * 2, 0); c.lineTo(scale * 2, 0);
    c.moveTo(0, -scale * 2); c.lineTo(0, scale * 2); c.stroke();
    c.restore();
    c.save();
    c.fillStyle = 'rgba(160,232,255,.95)';
    c.font = '600 10px ui-monospace, monospace';
    c.fillText('DEPLOYED SPACECRAFT', p.x + 12, p.y + 20);
    c.restore();
  }

  /** Spawn exhaust + smoke particles behind every lit nozzle (world space). */
  spawnExhaust(game, altitude = null) {
    const r = game.rocket;
    const spool = r.spool || 0;
    const cos = Math.cos(r.angle), sin = Math.sin(r.angle);
    const lit = r.stageIndex >= 0 ? (r.groups[r.stageIndex] || []) : [];
    const budget = Math.max(0, 120 - this.particles.length);
    if (budget <= 0) return;
    let spawned = 0;
    const altF = r.body && r.body.atmosphere
      ? Math.max(0, Math.min(1, (altitude == null
        ? r.altitudeAboveSurface(r.body) : altitude) / r.body.atmosphere.height)) : 1;
    for (const part of lit) {
      const def = D[part.type];
      if (!def || !def.thrust || spawned >= budget) continue;
      // Nozzle tip: local metres (+y = down the stack) rotated to world.
      const lx = part.x * METERS_PER_UNIT;
      const ly = (part.y + def.height * 0.5) * METERS_PER_UNIT;
      const tipX = r.position.x + (lx * cos - ly * sin);
      const tipY = r.position.y + (-(lx * sin + ly * cos));
      const n = 1;
      for (let i = 0; i < n && spawned < budget; i++, spawned++) {
        const dirX = -Math.sin(r.angle), dirY = -Math.cos(r.angle);
        const speed = (18 + Math.random() * 26) * (0.5 + spool * 0.8);
        this.particles.push({
          x: tipX + (Math.random() - 0.5) * 2,
          y: tipY + (Math.random() - 0.5) * 2,
          vx: r.velocity.x + dirX * speed + (Math.random() - 0.5) * 6,
          vy: r.velocity.y + dirY * speed + (Math.random() - 0.5) * 6,
          life: 0,
          maxLife: 0.5 + Math.random() * 0.7 + altF * 0.4,
          size: (1.2 + Math.random() * 1.8) * (0.7 + spool * 0.6),
          hot: Math.random() < (0.75 - altF * 0.3)
        });
      }
    }
  }

  /** Integrate + draw exhaust particles (additive sparks, normal smoke). */
  drawParticles(game, dt) {
    if (!this.particles.length) return;
    const {ctx: c} = this, cam = game.camera;
    const keep = [];
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (const pt of this.particles) {
      pt.life += dt;
      if (pt.life >= pt.maxLife) continue;
      keep.push(pt);
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= (1 - 1.6 * dt);
      pt.vy *= (1 - 1.6 * dt);
      const t = pt.life / pt.maxLife;
      if (pt.hot && t < 0.55) {
        const s = cam.worldToScreen(pt.x, pt.y);
        if (s.x < -40 || s.x > this.canvas.width + 40 || s.y < -40 || s.y > this.canvas.height + 40) continue;
        const rad = Math.max(1, pt.size * cam.zoom * METERS_PER_UNIT * (0.6 + t * 1.6));
        c.fillStyle = t < 0.25
          ? 'rgba(255,240,200,' + (0.8 * (1 - t * 2)).toFixed(2) + ')'
          : 'rgba(255,150,70,' + (0.55 * (1 - t)).toFixed(2) + ')';
        c.beginPath();
        c.arc(s.x, s.y, rad * (1 - t * 0.5), 0, Math.PI * 2);
        c.fill();
      }
    }
    c.restore();
    c.save();
    for (const pt of keep) {
      const t = pt.life / pt.maxLife;
      if (pt.hot && t < 0.55) continue;
      const s = cam.worldToScreen(pt.x, pt.y);
      if (s.x < -40 || s.x > this.canvas.width + 40 || s.y < -40 || s.y > this.canvas.height + 40) continue;
      const rad = Math.max(1.5, pt.size * cam.zoom * METERS_PER_UNIT * (1 + t * 2.4));
      c.fillStyle = 'rgba(200,208,216,' + (0.28 * (1 - t)).toFixed(2) + ')';
      c.beginPath();
      c.arc(s.x, s.y, rad, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
    this.particles = keep;
  }

  flightMarkers(game) {
    const pts = game.predictor.points;
    const r = game.rocket;
    if (!r || pts.length < 3) return;
    const body = r.body;
    let ap = null, pe = null;
    for (const q of pts) {
      const d = Math.hypot(q.x - body.position.x, q.y - body.position.y);
      if (!ap || d > ap.d) ap = {d, q};
      if (!pe || d < pe.d) pe = {d, q};
    }
    this.marker(game, ap.q, 'APOAPSIS ' + ((ap.d - body.radius) / 1000).toFixed(0) + ' km', '#78ddff');
    this.marker(game, pe.q, 'PERIAPSIS ' + ((pe.d - body.radius) / 1000).toFixed(0) + ' km', '#ff9d7a');
  }

  marker(game, world, label, color) {
    if (!world) return;
    const c = this.ctx;
    const p = game.camera.worldToScreen(world.x, world.y);
    if (p.x < -60 || p.x > this.canvas.width + 60 || p.y < -60 || p.y > this.canvas.height + 60) return;
    // Predicted apogee/perigee land on the vehicle itself while the
    // trajectory is degenerate (coasting straight up at apogee) — at planet
    // zoom their labels would tangle with the VEHICLE ring, and the same
    // numbers are already on the flight computer, so drop them.
    const r = game.rocket;
    if (r) {
      const s = game.camera.worldToScreen(r.position.x, r.position.y);
      if (Math.hypot(p.x - s.x, p.y - s.y) < 40) return;
    }
    c.save();
    c.strokeStyle = color;
    c.fillStyle = color;
    c.lineWidth = 1.4;
    c.beginPath();
    c.moveTo(p.x, p.y - 6);
    c.lineTo(p.x + 6, p.y);
    c.lineTo(p.x, p.y + 6);
    c.lineTo(p.x - 6, p.y);
    c.closePath();
    c.stroke();
    c.font = '10px ui-monospace, monospace';
    c.fillText(label, p.x + 10, p.y + 3);
    c.restore();
  }

  trajectory(game) {
    const c = this.ctx, cam = game.camera;
    const draw = (points, color) => {
      if (!points || points.length < 2) return;
      c.save();
      c.strokeStyle = color;
      c.setLineDash([5, 6]);
      c.lineWidth = 1.4;
      c.beginPath();
      points.forEach((q, i) => {
        const p = cam.worldToScreen(q.x, q.y);
        i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y);
      });
      c.stroke();
      c.restore();
    };
    draw(game.predictor.points, 'rgba(255,198,95,.8)');
    draw(game.plannedPoints, 'rgba(120,240,255,.9)');
  }

  banner(text, color) {
    const c = this.ctx;
    c.save();
    c.font = '600 14px system-ui';
    c.textAlign = 'center';
    const w = c.measureText(text).width + 40;
    c.fillStyle = 'rgba(6,14,24,.82)';
    c.strokeStyle = 'rgba(126,213,255,.3)';
    c.beginPath();
    c.rect(this.canvas.width / 2 - w / 2, 96, w, 32);
    c.fill();
    c.stroke();
    c.fillStyle = color;
    c.fillText(text, this.canvas.width / 2, 117);
    c.restore();
  }

  /**
   * Large centred milestone card, shown for a few seconds after an altitude
   * landmark (thin air / Kármán line / planet fully below). Fades in fast and
   * out over the last stretch of `flash.until`.
   */
  flashBanner(flash) {
    const now = performance.now();
    const life = flash.until - now;
    if (life <= 0) return;
    const fade = Math.max(0, Math.min(1, (now - (flash.at || 0)) / 260, life / 900));
    if (fade <= 0) return;
    const c = this.ctx;
    const cx = this.canvas.width / 2;
    const cy = this.canvas.height * 0.3;
    const lift = (1 - fade) * 10;
    c.save();
    c.globalAlpha = fade;
    c.translate(0, lift);
    c.textAlign = 'center';
    c.font = '700 30px system-ui';
    const tw = c.measureText(flash.title).width;
    const sw = flash.sub ? c.measureText(flash.sub).width : 0;
    const w = Math.max(tw, sw) + 96;
    const h = flash.sub ? 92 : 66;
    const g = c.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0);
    g.addColorStop(0, 'rgba(8,20,38,0)');
    g.addColorStop(0.16, 'rgba(8,20,38,.85)');
    g.addColorStop(0.84, 'rgba(8,20,38,.85)');
    g.addColorStop(1, 'rgba(8,20,38,0)');
    c.fillStyle = g;
    c.fillRect(cx - w / 2, cy - h / 2, w, h);
    c.strokeStyle = 'rgba(126,213,255,.45)';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(cx - w * 0.44, cy - h / 2 + 0.5);
    c.lineTo(cx + w * 0.44, cy - h / 2 + 0.5);
    c.moveTo(cx - w * 0.44, cy + h / 2 - 0.5);
    c.lineTo(cx + w * 0.44, cy + h / 2 - 0.5);
    c.stroke();
    c.shadowColor = 'rgba(140,220,255,.6)';
    c.shadowBlur = 16;
    c.fillStyle = '#e3f4ff';
    c.fillText(flash.title, cx, cy + (flash.sub ? -4 : 11));
    if (flash.sub) {
      c.shadowBlur = 0;
      c.font = '400 13px system-ui';
      c.fillStyle = 'rgba(180,216,238,.92)';
      c.fillText(flash.sub, cx, cy + 24);
    }
    c.restore();
  }

  debug(game) {
    const c = this.ctx;
    const r = game.rocket;
    const lines = [
      'mode ' + game.mode + '   fps ' + game.fps.toFixed(0) + '   steps ' + game.steps + '   time warp ' + game.warp + 'x',
      'parts ' + game.editor.parts.length + '   pack ' + packStatus() + '   sheet ' + (sheetImage() ? 'loaded' : 'missing') + '   prediction ' + game.predictor.ms.toFixed(1) + 'ms',
      r ? 'alt ' + (r.body.altitude(r.position) / 1000).toFixed(1) + ' km   speed ' +
        Math.hypot(r.velocity.x - r.body.velocity.x, r.velocity.y - r.body.velocity.y).toFixed(0) + ' m/s' : 'no vehicle'
    ];
    if (r) {
      lines.push('mass ' + (r.mass / 1000).toFixed(2) + ' t   fuel ' + r.fuel.toFixed(0) + ' kg   stage ' +
        r.stageNumber + '/' + r.totalStages + '   throttle ' + (r.throttle * 100).toFixed(0) + '%');
      lines.push('accel ' + Math.hypot(r.acceleration.x, r.acceleration.y).toFixed(2) + ' m/s²   angle ' +
        (r.angle * 180 / Math.PI).toFixed(0) + '°   primary ' + r.body.name);
    }
    c.save();
    c.font = '11px ui-monospace, monospace';
    const w = Math.max(...lines.map(l => c.measureText(l).width)) + 22;
    c.fillStyle = 'rgba(4,10,18,.78)';
    c.strokeStyle = 'rgba(126,213,255,.28)';
    c.beginPath();
    c.rect(246, 130, w, lines.length * 16 + 14);
    c.fill();
    c.stroke();
    c.fillStyle = '#bdeaff';
    lines.forEach((l, i) => c.fillText(l, 258, 150 + i * 16));
    c.restore();
  }
}



