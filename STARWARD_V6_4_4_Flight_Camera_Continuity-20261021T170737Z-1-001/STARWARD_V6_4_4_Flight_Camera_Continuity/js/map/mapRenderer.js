/* =========================================================================
   mapRenderer.js — the SYSTEM MAP view.

   Two projections share one code path:
     REAL        true distances in metres (the outer planets run off screen)
     COMPRESSED  r^0.35 radial squeeze, so Earth, the Moon and Mars all fit

   Body disks are drawn with a log-ish radius instead of true scale — at any
   honest zoom a planet is a fraction of a pixel wide.
   ========================================================================= */
import {formatDistance} from '../physics/orbitalMechanics.js';
const COMPRESS_EXP = 0.35;

export function compressRadius(r) {
  return Math.pow(Math.max(0, r), COMPRESS_EXP);
}

/** Body centre in map space (camera world units for this mode). */
export function mapPosition(body, compressed) {
  const c = body.parent ? mapPosition(body.parent, compressed) : {x: 0, y: 0};
  if (!body.orbit || !body.parent) return c;
  const r = compressed ? compressRadius(body.orbit.radius) : body.orbit.radius;
  const a = body.orbitAngle || 0;
  return {x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r};
}

/** Any world point (ship, trajectory sample) in map space. */
export function mapPoint(pos, anchor, compressed) {
  if (!anchor) return {x: pos.x, y: pos.y};
  const c = mapPosition(anchor, compressed);
  const dx = pos.x - anchor.position.x;
  const dy = pos.y - anchor.position.y;
  const r = Math.hypot(dx, dy);
  if (!compressed || !r) return {x: c.x + dx, y: c.y + dy};
  const k = compressRadius(r) / r;
  return {x: c.x + dx * k, y: c.y + dy * k};
}

/**
 * How much of the canvas the floating chrome covers, in DEVICE pixels.
 *
 * The top bar and the info panel are HTML drawn on top of the canvas, so
 * anything framed or labelled underneath them is invisible to the player.
 * Measured live so the map can fit, draw and label around them, with the
 * classic hard-coded insets as fallbacks (probe pages / headless tests).
 */
export function chromeInsets(canvas) {
  let cssWidth = 0;
  try {
    const cw = Number(canvas && canvas.clientWidth);
    cssWidth = Number.isFinite(cw) && cw > 0 ? cw : 0;
  } catch { cssWidth = 0; }
  const dpr = cssWidth ? Number(canvas.width) / cssWidth : 1;
  const inset = {top: 76 * dpr, right: 24 * dpr, left: 24 * dpr, bottom: 36 * dpr};
  try {
    const q = typeof document !== 'undefined' && document.querySelector
      ? sel => document.querySelector(sel) : null;
    const bar = q && q('.topbar');
    const barRect = bar && bar.getBoundingClientRect ? bar.getBoundingClientRect() : null;
    if (barRect && Number.isFinite(barRect.bottom) && barRect.bottom > 0) {
      inset.top = barRect.bottom * dpr + 6;   // bar edge + a sliver of air
    }
    const bridge = q && q('#bottomTelemetryBridge');
    const bridgeRect = bridge && !bridge.hidden && bridge.getBoundingClientRect
      ? bridge.getBoundingClientRect() : null;
    if (bridgeRect && bridgeRect.width > 0 && bridgeRect.top < (canvas.clientHeight || Infinity)) {
      inset.bottom = ((canvas.clientHeight || 0) - bridgeRect.top + 8) * dpr;
    }
    const panel = q && q('#mapInfo');
    const pRect = panel && !panel.hidden && panel.getBoundingClientRect
      ? panel.getBoundingClientRect() : null;
    if (pRect && pRect.width > 0 && pRect.left > 0 && pRect.left < cssWidth) {
      inset.right = (cssWidth - pRect.left + 8) * dpr;
    }
    const leftPanel = q && q('#bodyFocusPanel');
    const lRect = leftPanel && !leftPanel.hidden && leftPanel.getBoundingClientRect
      ? leftPanel.getBoundingClientRect() : null;
    if (lRect && lRect.width > 0 && lRect.right > 0) {
      inset.left = (lRect.right + 8) * dpr;
    }
  } catch { /* detached DOM: keep the fallbacks */ }
  return inset;
}

/**
 * Where a body is actually drawn. Symbolic discs are far larger than true
 * scale, so a moon's orbit can fall inside its parent's disc (Europa and
 * Titan both do). Whenever that happens the child is slid just beyond the
 * parent's limb along its orbit direction, the way real mission maps call
 * out satellites — otherwise Jupiter would simply swallow Europa whole.
 */
function displayPosition(body, game, compressed) {
  const position = mapPosition(body, compressed);
  if (!body.parent) return position;

  const cam = game.camera;
  const parentMap = mapPosition(body.parent, compressed);
  const parent = cam.worldToScreen(parentMap.x, parentMap.y);
  const child = cam.worldToScreen(position.x, position.y);
  const gap = discRadius(body.parent, cam, compressed) +
    discRadius(body, cam, compressed) + 8;
  if (Math.hypot(child.x - parent.x, child.y - parent.y) >= gap) return position;

  const angle = body.orbitAngle || 0;
  return cam.screenToWorld(parent.x + Math.cos(angle) * gap,
    parent.y - Math.sin(angle) * gap);
}

/**
 * Drawn disk radius in pixels — proportional to the body's REAL radius.
 *
 *   r_px = k · r_km^0.6,  k = 0.047  →  Earth ≈ 9 px at the fit zoom.
 *
 * The exponent keeps the whole system on one screen while preserving the
 * true size ORDER and roughly the real ratios (Jupiter's disc is 4.2×
 * Earth's, Saturn 3.8×, Mercury and the Moon the smallest). The old hand-
 * tuned table only knew six bodies and gave Jupiter a smaller disc than
 * Earth; this law scales to any world, at either map scale.
 */
const MAP_DISC_SIZES = {
  sun: 11, mercury: 2.8, venus: 3.8, earth: 4.2, moon: 2.2, mars: 3.3,
  ceres: 2.5, jupiter: 7.1, saturn: 6.5, uranus: 4.8, neptune: 4.8, pluto: 2.8
};

export function discRadius(body, camera, compressed = false) {
  const km = Math.max(1, body.radius / 1000);
  let r = MAP_DISC_SIZES[body.id] || Math.max(2.8, Math.min(7, Math.pow(km, 0.35) * 0.28));
  if (camera) {
    const refZoom = compressed ? 0.018 : 1.2e-10;
    const s = Math.pow(Math.max(0.5, Math.min(4, camera.zoom / refZoom)), 0.08);
    r *= s;
  }
  return Math.max(2, Math.min(body.id === 'sun' ? 14 : 9, r));
}

/* ------------------------- belts, zones, Oort ---------------------------- *
 * Real annuli: habitable zone 0.95–1.37 AU, asteroid belt 2.2–3.2 AU,
 * Kuiper belt 30–50 AU, Oort cloud inner edge ≈ 2000 AU. Rendered with a
 * soft radial band plus a deterministic speckle field (fixed LCG seed, so
 * the belt never shimmers between frames).                                    */
const AU = 149.6e9;

export const BELTS = [
  {id: 'hz', label: 'HABITABLE ZONE', inner: 0.95 * AU, outer: 1.37 * AU,
   color: 'rgba(110,231,160,.10)', edge: 'rgba(110,231,160,.30)',
   labelColor: 'rgba(150,240,190,.95)', dots: 0},
  {id: 'asteroid', label: 'ASTEROID BELT', inner: 2.2 * AU, outer: 3.2 * AU,
   color: 'rgba(190,170,140,.13)', edge: 'rgba(205,185,155,.34)',
   labelColor: 'rgba(226,208,176,.95)', dots: 220},
  {id: 'kuiper', label: 'KUIPER BELT', inner: 30 * AU, outer: 50 * AU,
   color: 'rgba(130,180,255,.11)', edge: 'rgba(160,195,255,.32)',
   labelColor: 'rgba(176,206,255,.95)', dots: 260}
];

const beltSpeckles = (() => {
  let seed = 1337;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  return BELTS.map(b => Array.from({length: b.dots},
    () => ({a: rnd() * Math.PI * 2, u: rnd()})));
})();

/** Small uppercase pill used for belt / zone captions. */
function bandLabel(ctx, x, y, text, color) {
  ctx.save();
  ctx.font = '600 7px ui-monospace, monospace';
  try { ctx.letterSpacing = '0.1em'; } catch (e) { /* older canvas */ }
  ctx.fillStyle = 'rgba(151,165,180,.48)';
  ctx.textAlign = 'center';
  ctx.fillText(text, x, y + 2.5);
  ctx.textAlign = 'left';
  try { ctx.letterSpacing = '0px'; } catch (e) { /* ignore */ }
  ctx.restore();
}

function radialBand(ctx, cx, cy, rIn, rOut, color) {
  if (!(rOut - rIn > 1.5)) return;
  const g = ctx.createRadialGradient(cx, cy, rIn, cx, cy, rOut);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.15, color);
  g.addColorStop(0.85, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, rOut, 0, Math.PI * 2);
  ctx.fill();
}

/** The habitable zone, both belts and the Oort cloud's inner rim. */
function drawBelts(ctx, cam, compressed, chrome) {
  const c = cam.worldToScreen(0, 0); // the Sun sits at the map origin
  const px = m => (compressed ? compressRadius(m) : m) * cam.zoom;
  const H = ctx.canvas.height;

  BELTS.forEach((belt, i) => {
    const rIn = px(belt.inner);
    const rOut = px(belt.outer);
    if (!isFinite(rOut) || rOut < 8) return;

    radialBand(ctx, c.x, c.y, rIn, rOut, belt.color);

    // Keep the belts legible as faint regions instead of noisy particle clouds.
    if (belt.dots && rOut - rIn > 6) {
      ctx.fillStyle = 'rgba(172,190,207,.12)';
      for (const s of beltSpeckles[i].filter((_, n) => n % 5 === 0)) {
        const r = rIn + s.u * (rOut - rIn);
        ctx.fillRect(c.x + Math.cos(s.a) * r, c.y + Math.sin(s.a) * r, 1.4, 1.4);
      }
    }

    // Crisp inner / outer edges so the annulus reads as a region.
    ctx.save();
    ctx.setLineDash([3, 6]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = belt.edge;
    for (const r of [rIn, rOut]) {
      if (r < 6) continue;
      ctx.beginPath();
      ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    // Caption at the top of the band, only when it is actually on screen.
    const top = c.y - (rIn + rOut) / 2;
    if (rOut > 46 && top > chrome.top + 8 && top < H - 30 && Math.abs(c.x - ctx.canvas.width / 2) < 4000) {
      bandLabel(ctx, c.x, top, belt.label, belt.labelColor);
    }
  });

  // --- Oort cloud (inner edge ≈ 2000 AU) ---------------------------------
  // The cloud's real inner edge (~2000 AU) sits far outside every fitted
  // view, so a literal ring would never be visible once the zoom floor is in
  // place. It reads better as the faint outer darkness beyond the Kuiper
  // belt: a soft wash toward the screen edge, captioned on the far diagonal
  // where it rarely collides with a body label.
  const diag = Math.hypot(ctx.canvas.width, ctx.canvas.height);
  const rKuiperOut = px(50 * AU);
  if (isFinite(rKuiperOut) && rKuiperOut > 40 && rKuiperOut < diag * 0.55) {
    const reach = rKuiperOut + Math.max(240, diag * 0.45);
    const g = ctx.createRadialGradient(c.x, c.y, rKuiperOut, c.x, c.y, reach);
    g.addColorStop(0, 'rgba(104,140,205,.15)');
    g.addColorStop(0.4, 'rgba(104,140,205,.08)');
    g.addColorStop(1, 'rgba(104,140,205,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(c.x, c.y, reach, 0, Math.PI * 2);
    ctx.fill();
    const off = (rKuiperOut + 46) * Math.SQRT1_2;
    const lx = c.x - off;
    const ly = c.y + off;
    if (lx > 150 && ly > chrome.top + 44 && ly < H - 52 &&
        lx < ctx.canvas.width - Math.max(48, chrome.right + 16)) {
      bandLabel(ctx, lx, ly, 'OORT CLOUD', 'rgba(178,198,235,.9)');
    }
  }
}

/* ------------------------------ world art -------------------------------- *
 * Per-body appearance painted to match the real planet at map scale:
 * gas-giant banding and storm spots, Saturn's rings, Earth's oceans and
 * land, Mars' polar cap, crater fields on the airless rocks. Discs are
 * drawn slightly oblate where the real planet is (Saturn is 10% flatter). */
const RINGS = {
  saturn: {r0: 1.5, r1: 2.3, tilt: -0.22, squash: 0.3,
    color: 'rgba(226,209,168,.7)'},
  uranus: {r0: 1.65, r1: 2.0, tilt: 1.2, squash: 0.9,
    color: 'rgba(180,225,235,.3)'}
};

/** One elliptical ring pass; `front` redraws only the near half. */
function ringStroke(ctx, x, y, meanR, squash, tilt, width, color, front) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.ellipse(x, y, meanR, meanR * squash, tilt,
    0, front ? Math.PI : Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawRings(ctx, x, y, r, ring, front) {
  const R0 = r * ring.r0, R1 = r * ring.r1, w = R1 - R0;
  // Two ring segments with the Cassini division between them.
  ringStroke(ctx, x, y, R0 + 0.22 * w, ring.squash, ring.tilt, 0.4 * w, ring.color, front);
  ringStroke(ctx, x, y, R0 + 0.77 * w, ring.squash, ring.tilt, 0.42 * w, ring.color, front);
}

/** Paint one body's disc: halo → base sphere → features → limb shade → rings. */
function drawBodyDisc(ctx, b, x, y, r) {
  // Flat, compact symbols match the reference mission-planning map.
  const colors = {
    mercury: '#8c969d', venus: '#d7b77c', earth: '#65c8ee', moon: '#aab3bc',
    mars: '#d98b4e', ceres: '#b5a28f', jupiter: '#d5b18a', saturn: '#d8c592',
    uranus: '#8dcbd1', neptune: '#6489e8', pluto: '#aaa2bc'
  };
  if (b.id === 'sun') {
    const corona = ctx.createRadialGradient(x, y, r * .2, x, y, r * 5.2);
    corona.addColorStop(0, 'rgba(255,223,132,.38)');
    corona.addColorStop(.22, 'rgba(255,182,64,.2)');
    corona.addColorStop(.58, 'rgba(255,151,42,.055)');
    corona.addColorStop(1, 'rgba(255,169,56,0)');
    ctx.fillStyle = corona;
    ctx.beginPath(); ctx.arc(x, y, r * 3.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffb83f';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    const core = ctx.createRadialGradient(x - r * .22, y - r * .24, r * .08, x, y, r);
    core.addColorStop(0, '#fff8d6');
    core.addColorStop(.5, '#ffe18b');
    core.addColorStop(1, '#ffac32');
    ctx.fillStyle = core;
    ctx.beginPath(); ctx.arc(x, y, r * .86, 0, Math.PI * 2); ctx.fill();
    return;
  }

  const halos = {
    mercury: 'rgba(193,205,213,.15)', venus: 'rgba(255,216,147,.18)',
    earth: 'rgba(77,195,255,.28)', moon: 'rgba(190,206,221,.13)',
    mars: 'rgba(255,143,78,.24)', ceres: 'rgba(204,184,158,.12)',
    jupiter: 'rgba(255,194,129,.22)', saturn: 'rgba(255,224,157,.2)',
    uranus: 'rgba(115,218,240,.2)', neptune: 'rgba(105,147,255,.25)',
    pluto: 'rgba(194,177,225,.13)'
  };
  const halo = ctx.createRadialGradient(x, y, r * .45, x, y, r * 4.4);
  halo.addColorStop(0, halos[b.id] || 'rgba(160,195,220,.16)');
  halo.addColorStop(.34, (halos[b.id] || 'rgba(160,195,220,.16)').replace(/\.\d+\)$/, '.08)'));
  halo.addColorStop(1, 'rgba(120,170,220,0)');
  ctx.fillStyle = halo;
  ctx.beginPath(); ctx.arc(x, y, r * 4.4, 0, Math.PI * 2); ctx.fill();

  const ring = RINGS[b.id];
  if (ring) {
    ringStroke(ctx, x, y, r * 1.85, .34, ring.tilt, 1.1, 'rgba(218,199,150,.82)', false);
    ringStroke(ctx, x, y, r * 2.15, .34, ring.tilt, .8, 'rgba(218,199,150,.46)', false);
  }
  const surface = ctx.createRadialGradient(x - r * .35, y - r * .4, r * .08, x, y, r * 1.2);
  surface.addColorStop(0, '#f0f5f8');
  surface.addColorStop(.2, colors[b.id] || b.color || '#b9c6d1');
  surface.addColorStop(1, 'rgba(9,15,24,.9)');
  ctx.fillStyle = surface;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(226,239,248,.28)';
  ctx.lineWidth = .7;
  ctx.stroke();
  if (ring) ringStroke(ctx, x, y, r * 1.85, .34, ring.tilt, 1, 'rgba(218,199,150,.7)', true);
}
export function drawMap(ctx, game) {
  const cam = game.camera;
  const compressed = !!game.mapCompressed;
  // The top bar and info panel float ABOVE the canvas — measure them so no
  // disc, caption or pill is ever framed underneath the UI.
  const chrome = chromeInsets(ctx.canvas);

  // --- orbit rings ---------------------------------------------------------
  const sunScreen = cam.worldToScreen(0, 0);
  ctx.save();

  for (const b of game.bodies) {
    if (!b.orbit || !b.parent) continue;
    const c = mapPosition(b.parent, compressed);
    const p = cam.worldToScreen(c.x, c.y);
    const r = (compressed ? compressRadius(b.orbit.radius) : b.orbit.radius) * cam.zoom;
    if (!isFinite(r) || r < 0.75) continue;
    const hot = game.selected === b || game.selected === b.parent ||
                game.hover === b || game.hover === b.parent;

    // Orbit color: per-planet base, brightened when selected/hovered
    const base = b.id === 'earth' ? 'rgba(92,207,239,.58)'
      : b.id === 'mars' ? 'rgba(238,177,102,.48)' : 'rgba(145,174,204,.32)';
    const stroke = hot ? 'rgba(187,234,255,.78)' : base;
    ctx.strokeStyle = stroke;
    const dpr = ctx.canvas.clientWidth ? ctx.canvas.width / ctx.canvas.clientWidth : 1;
    ctx.lineWidth = (hot ? 1.35 : 1.1) * dpr;
    ctx.setLineDash(b.orbit.radius > AU * 3 ? [2.5 * dpr, 4 * dpr] : []);

    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.stroke();

  }
  ctx.setLineDash([]);
  ctx.restore();

  // --- trajectories --------------------------------------------------------
  drawTransferGuide(ctx, game);
  if (game.rocket) {
    drawPath(ctx, game, game.predictor.points, 'rgba(78,205,255,0.9)');
    if (game.plannedPoints.length) drawPath(ctx, game, game.plannedPoints, 'rgba(120,240,255,1)');
  }

  // --- bodies --------------------------------------------------------------
  // Two passes: paint every visible disc first, then lay the name pills with
  // collision culling (drawBodyLabels) so the fit-to-system view — where
  // fourteen worlds share one screen — never stacks a dozen labels into an
  // unreadable smear.
  const visible = [];
  for (const b of game.bodies) {
    const c = displayPosition(b, game, compressed);
    const p = cam.worldToScreen(c.x, c.y);
    const r = discRadius(b, cam, compressed);
    if (p.x + r < 0 || p.x - r > ctx.canvas.width || p.y + r < 0 || p.y - r > ctx.canvas.height) continue;
    visible.push({b, p, r});

    ctx.save();
    drawBodyDisc(ctx, b, p.x, p.y, r,
      sunScreen.x - p.x, sunScreen.y - p.y);

    if (game.selected === b || game.target === b) {
      // A small instrument reticle marks selection without dominating the map.
      ctx.strokeStyle = game.target === b ? '#efaa42' : '#73d5f6';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 4, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
  drawBodyLabels(ctx, game, visible, chrome);

  // --- hover feedback --------------------------------------------------------
  if (game.hover && game.hover !== game.selected) {
    const c = displayPosition(game.hover, game, compressed);
    const p = cam.worldToScreen(c.x, c.y);
    const r = discRadius(game.hover, cam, compressed);
    ctx.save();
    ctx.strokeStyle = 'rgba(206,226,239,.7)';
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(p.x, p.y, r + 9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  drawHoverTip(ctx, game, chrome);

  // --- rocket marker -------------------------------------------------------
  if (game.rocket) {
    const anchor = game.rocket.primaryBody || game.bodies[1];
    const c = mapPoint(game.rocket.position, anchor, compressed);
    const p = cam.worldToScreen(c.x, c.y);
    ctx.save();
    ctx.strokeStyle = '#ffc86e';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
    ctx.moveTo(p.x - 11, p.y);
    ctx.lineTo(p.x - 3, p.y);
    ctx.moveTo(p.x + 3, p.y);
    ctx.lineTo(p.x + 11, p.y);
    ctx.moveTo(p.x, p.y - 11);
    ctx.lineTo(p.x, p.y - 3);
    ctx.moveTo(p.x, p.y + 3);
    ctx.lineTo(p.x, p.y + 11);
    ctx.stroke();
    ctx.fillStyle = '#ffc86e';
    ctx.font = '600 11px system-ui';
    ctx.fillText('VEHICLE', p.x + 12, p.y - 4);
    ctx.fillStyle = 'rgba(255,200,110,.85)';
    ctx.font = '10px ui-monospace, monospace';
    const alt = Math.max(0, (anchor.altitude ? anchor.altitude(game.rocket.position) : 0));
    const rel = Math.hypot(game.rocket.velocity.x - anchor.velocity.x, game.rocket.velocity.y - anchor.velocity.y);
    ctx.fillText((alt / 1000).toFixed(1) + ' km · ' + rel.toFixed(0) + ' m/s', p.x + 12, p.y + 9);
    ctx.restore();

    if (game.selected) {
      const m = displayPosition(game.selected, game, compressed);
      const t = cam.worldToScreen(m.x, m.y);
      ctx.save();
      ctx.setLineDash([2, 6]);
      ctx.strokeStyle = 'rgba(112,240,181,.5)';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(t.x, t.y);
      ctx.stroke();
      ctx.restore();
    }
  }

  if (!compressed) drawScaleBar(ctx, cam, compressed);
}

/**
 * Name labels for the visible bodies — compact monospace text placed just
 * off each body's disc. Selected /
 * hovered / target worlds always keep their labels; others are culled on
 * overlap to keep the fit-to-system view legible.
 */
function drawBodyLabels(ctx, game, visible, chrome) {
  const keep = new Set([game.selected, game.target, game.hover]);
  const order = visible.slice().sort((a, b) => {
    const ka = keep.has(a.b) ? 1 : 0, kb = keep.has(b.b) ? 1 : 0;
    return ka !== kb ? kb - ka : b.r - a.r;
  });
  const placed = [];
  for (const {b, p, r} of order) {
    const origin = game.rocket ? (game.rocket.primaryBody || game.rocket.body) : game.selected;
    const current = origin === b;
    const target = game.target === b;
    const au = b.parent && b.parent.id === 'sun' ? ' · ' + (b.orbit.radius / AU).toFixed(2) + ' AU' : '';
    const suffix = target ? '  [TARGET]' : current ? '  (ORIGIN)' : '';
    const text = (b.id === 'sun' ? 'SOL' : b.name.toUpperCase()) + au + suffix;
    ctx.font = '600 8px ui-monospace, monospace';
    const width = ctx.measureText(text).width;
    let x = p.x + r + 6;
    let align = 'left';
    if (x + width > ctx.canvas.width - chrome.right - 5) {
      x = p.x - r - 6;
      align = 'right';
    }
    const y = Math.max(chrome.top + 9, Math.min(ctx.canvas.height - 10, p.y + 3));
    const bounds = {x: align === 'left' ? x : x - width, y: y - 8, w: width, h: 11};
    const overlaps = placed.some(o => bounds.x < o.x + o.w && bounds.x + bounds.w > o.x && bounds.y < o.y + o.h && bounds.y + bounds.h > o.y);
    if (overlaps && !keep.has(b)) continue;
    placed.push(bounds);
    ctx.save();
    ctx.font = '600 8px ui-monospace, monospace';
    ctx.textAlign = align;
    ctx.fillStyle = target ? '#e9a942' : current ? '#68cef1' : (game.selected === b ? '#c7eafa' : 'rgba(193,207,220,.72)');
    ctx.fillText(text, x, y);
    ctx.restore();
  }
}
function drawPath(ctx, game, points, color) {
  if (!points || points.length < 2) return;
  const anchor = (game.rocket && game.rocket.primaryBody) || game.bodies[1];
  ctx.save();
  ctx.strokeStyle = color;
  ctx.setLineDash([2, 3]);
  ctx.lineWidth = 1.25;
  ctx.lineCap = 'round';
  ctx.beginPath();
  points.forEach((q, i) => {
    const m = mapPoint(q, anchor, game.mapCompressed);
    const p = game.camera.worldToScreen(m.x, m.y);
    i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
  });
  ctx.stroke();
  ctx.restore();
}

/** Quiet Hohmann guide from the selected heliocentric origin to its target. */
function drawTransferGuide(ctx, game) {
  const target = game.target;
  const source = game.rocket
    ? (game.rocket.primaryBody || game.rocket.body)
    : game.selected;
  if (!source || !target || source === target || !source.orbit || !target.orbit ||
      source.parent !== target.parent || source.parent?.id !== 'sun') return;

  const r1 = source.orbit.radius;
  const r2 = target.orbit.radius;
  const a = (r1 + r2) / 2;
  const e = Math.abs(r2 - r1) / (r1 + r2);
  const p = a * (1 - e * e);
  const start = source.orbitAngle || 0;
  const phase = (target.orbitAngle || 0) - start;
  const direction = Math.abs(Math.sin(phase)) < .01 ? -1 : Math.sign(Math.sin(phase));

  ctx.save();
  ctx.strokeStyle = 'rgba(94,211,242,.82)';
  ctx.lineWidth = 1.25;
  ctx.setLineDash([2, 3]);
  ctx.lineCap = 'round';
  ctx.beginPath();
  const steps = 72;
  for (let i = 0; i <= steps; i++) {
    const nu = Math.PI * i / steps;
    const radius = p / (1 + e * Math.cos(nu));
    const angle = start + direction * nu;
    const mapRadius = game.mapCompressed ? compressRadius(radius) : radius;
    const point = game.camera.worldToScreen(mapRadius * Math.cos(angle), mapRadius * Math.sin(angle));
    if (i) ctx.lineTo(point.x, point.y);
    else ctx.moveTo(point.x, point.y);
  }
  ctx.stroke();
  ctx.restore();
}

/** Cursor-following tooltip with the hovered body's headline facts. */
function drawHoverTip(ctx, game, chrome) {
  const b = game.hover;
  const m = game.input && game.input.mouse;
  if (!b || !m) return;

  const lines = [b.name.toUpperCase()];
  lines.push(b.parent
    ? formatDistance(b.orbit.radius) + ' from ' + b.parent.name
    : 'centre of the system');
  lines.push('gravity ' + b.gravity.toFixed(2) + ' m/s² · ' +
    (b.atmosphere ? 'atmosphere' : 'airless'));
  lines.push([
    b.type || '',
    (b.moons || 0) + ' moon' + (b.moons === 1 ? '' : 's'),
    b.tempC != null ? b.tempC + ' °C' : ''
  ].filter(Boolean).join(' · '));

  ctx.save();
  ctx.font = '600 11px ui-monospace, monospace';
  let w = ctx.measureText(lines[0]).width;
  ctx.font = '10px ui-monospace, monospace';
  for (const line of lines.slice(1)) w = Math.max(w, ctx.measureText(line).width);
  w += 18;
  const h = 14 + lines.length * 13;

  const rightLimit = ctx.canvas.width - chrome.right - 8;
  let x = m.x + 16, y = m.y + 16;
  if (x + w > rightLimit) x = m.x - 16 - w;
  if (y + h > ctx.canvas.height - 8) y = m.y - 16 - h;
  x = Math.min(Math.max(8, x), Math.max(8, rightLimit - w));
  y = Math.max(chrome.top + 8, y);   // never tuck the tip under the top bar

  ctx.fillStyle = 'rgba(8,20,34,.92)';
  ctx.strokeStyle = 'rgba(126,213,255,.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, 5);
  else ctx.rect(x, y, w, h);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.fillStyle = '#e5f3ff';
  ctx.font = '600 11px ui-monospace, monospace';
  ctx.fillText(lines[0], x + 9, y + 15);
  ctx.fillStyle = 'rgba(141,168,187,.95)';
  ctx.font = '10px ui-monospace, monospace';
  for (let i = 1; i < lines.length; i++) {
    ctx.fillText(lines[i], x + 9, y + 15 + i * 13);
  }
  ctx.restore();
}

function bodySubLabel(body, game) {
  return game.rocket && game.rocket.body === body ? 'CURRENT' : '';
}

function drawScaleBar(ctx, cam, compressed) {
  const x = 24;
  const y = ctx.canvas.height - 34;
  ctx.save();
  if (compressed) {
    // On the compressed map a pixel is not a distance, so do not pretend.
    ctx.fillStyle = 'rgba(200,235,255,.85)';
    ctx.font = '11px ui-monospace, monospace';
    ctx.fillText('COMPRESSED SCALE — DISTANCES ARE NOT TO SCALE', x, y);
    ctx.restore();
    return;
  }
  const steps = [1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9, 1e10, 1e11, 1e12];
  const targetPx = Math.min(ctx.canvas.width * 0.24, 220);
  let chosen = steps[0];
  for (const s of steps) {
    if (s * cam.zoom <= targetPx) chosen = s;
  }
  const px = chosen * cam.zoom;
  ctx.strokeStyle = 'rgba(120,221,255,.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + px, y);
  ctx.moveTo(x, y - 5);
  ctx.lineTo(x, y + 5);
  ctx.moveTo(x + px, y - 5);
  ctx.lineTo(x + px, y + 5);
  ctx.stroke();
  ctx.fillStyle = 'rgba(200,235,255,.9)';
  ctx.font = '11px ui-monospace, monospace';
  ctx.fillText(chosen >= 1e9 ? (chosen / 1e9).toFixed(1) + 'e9 m' : (chosen / 1e6).toFixed(0) + ' Mm', x + 4, y - 10);
  ctx.restore();
}

function drawModeBadge(ctx, game, compressed, chrome) {
  ctx.save();
  const label = (compressed ? 'COMPRESSED MAP' : 'TRUE SCALE') + ' · ' + (mapWarp(game) > 1 ? mapWarp(game) + '× TIME' : 'REAL TIME');
  const y = chrome.top + 8;   // pinned under the measured top bar, never clipped
  ctx.font = '600 11px ui-monospace, monospace';
  const w = ctx.measureText(label).width + 22;
  let x = chrome.left + 8;
  try {
    const dock = typeof document !== 'undefined' && document.querySelector
      ? document.querySelector('.dock--left') : null;
    const rect = dock && dock.getBoundingClientRect ? dock.getBoundingClientRect() : null;
    const cssWidth = Number(ctx.canvas.clientWidth) || 0;
    const dpr = cssWidth ? ctx.canvas.width / cssWidth : 1;
    if (rect && rect.width > 0) x = Math.max(x, (rect.right + 8) * dpr);
  } catch { /* detached canvas: use the measured map inset */ }
  // The canvas sits behind the dashboards. Keep this badge in the clear map
  // corridor, and suppress it on narrow layouts where the docks leave no room.
  if (x + w > ctx.canvas.width - chrome.right - 8) {
    ctx.restore();
    return;
  }
  ctx.fillStyle = 'rgba(8,20,34,.78)';
  ctx.strokeStyle = 'rgba(126,213,255,.35)';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, 26, 6);
  else ctx.rect(x, y, w, 26);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#78ddff';
  ctx.fillText(label, x + 11, y + 17);
  ctx.restore();
}

/** Which body is under the cursor? */
export function pickBody(x, y, game) {
  let best = null;
  for (const b of game.bodies) {
    const c = displayPosition(b, game, game.mapCompressed);
    const p = game.camera.worldToScreen(c.x, c.y);
    const d = Math.hypot(p.x - x, p.y - y);
    const r = Math.max(discRadius(b, game.camera, game.mapCompressed), 10);
    if (d <= r && (!best || d < best.d)) best = {body: b, d};
  }
  return best ? best.body : null;
}

/** The warp the simulation actually runs at (altitude-limited). */
function mapWarp(game) {
  return typeof game.appliedWarp === 'function' ? game.appliedWarp() : game.warp;
}
