/* =========================================================================
   spaceMap.js — what you can click on the SYSTEM MAP, and how the camera
   frames it. Selection state lives on the game object.
   ========================================================================= */
import {pickBody, mapPosition, compressRadius, discRadius, chromeInsets} from './mapRenderer.js';

/** Body under the cursor (canvas pixels), or null. */
export function selectBody(x, y, game) {
  return pickBody(x, y, game);
}

/**
 * Bodies in orbital rank order: the star first, then each planet by orbit
 * size with its moons directly after it — Sun, Mercury, Venus, Earth, Luna,
 * Mars. Used for the panel's quick-pick chips and for cycling the selection
 * with the arrow keys.
 */
export function bodyOrder(bodies) {
  const out = [];
  const visit = (b) => {
    out.push(b);
    bodies.filter(k => k.parent === b)
      .sort((a, c) => (a.orbit ? a.orbit.radius : 0) - (c.orbit ? c.orbit.radius : 0))
      .forEach(visit);
  };
  bodies.filter(b => !b.parent).forEach(visit);
  for (const b of bodies) if (!out.includes(b)) out.push(b); // safety net
  return out;
}

/** Centre the map on a body. */
export function focusBody(game, body) {
  if (!body) return;
  const p = mapPosition(body, game.mapCompressed);
  game.camera.focus(p.x, p.y);
  game.camera.target = null;
}

/**
 * Radius that frames the entire system: the outermost orbit — or the Kuiper
 * belt's outer edge at 75 AU, whichever is wider. The old hard-coded
 * constants (20000 / 4.8e11) only reached as far as Mars and would have
 * left Saturn, Uranus, Neptune and Pluto off the fitted view.
 *
 * This is the TRUE outer edge, with no headroom: fitSystem frames the
 * diameter into the chrome-free box, and that box's own 24px padding plus
 * the measured top-bar / info-panel insets supply the air. The old 25%
 * headroom stacked on top of that padding made the fitted system fill only
 * 80% of the gap — the map looked shrunken — while framing without the
 * chrome insets (the original bug) overfilled to 160% and hid the outer
 * orbits under the panels. Filling 100% of the box is the sweet spot.
 */
export function systemExtent(game) {
  const AU = 149.6e9;
  const toMap = r => (game.mapCompressed ? compressRadius(r) : r);
  let max = toMap(75 * AU);
  for (const b of game.bodies) {
    if (b.orbit && b.parent) max = Math.max(max, toMap(b.orbit.radius));
  }
  return max;
}

/**
 * Widest useful zoom — the one that frames the whole system — and therefore
 * the floor for map wheel-zooming (with 10% slack so the wheel isn't caught
 * by a hard edge the instant it reaches the fit). Exported so tests can pin
 * the behaviour headlessly: past this zoom every orbit keeps shrinking into
 * one unreadable blob at the centre of the screen.
 *
 * systemExtent is a radius out from the Sun, so the span the view frames is
 * its diameter — the fit zoom and this floor must both divide by 2×extent.
 */
export function systemMinZoom(game, box, maxZoom = game.mapCompressed ? 0.2 : 2e-5) {
  return Math.min(maxZoom, box / (2 * systemExtent(game))) * 0.9;
}

/**
 * Zoom so a span of the system fits the view.
 *
 * The map projection puts the Sun at the origin, so centring on (0, 0) frames
 * the whole solar system; pass `center` to frame one body's neighbourhood.
 */
export function fitSystem(game, span, center) {
  const cam = game.camera;
  const canvas = cam.canvas;
  const dpr = canvas.width / Math.max(1, canvas.clientWidth);
  // Measure the real chrome (top bar + info panel) instead of guessing, so
  // the fitted view is never framed underneath the UI floating over the map.
  // chromeInsets returns device pixels with headless-safe fallbacks.
  const chrome = chromeInsets(canvas);
  const leftInset = chrome.left;
  const rightInset = chrome.right;
  const topInset = chrome.top;
  const bottomInset = chrome.bottom;
  const width = Math.max(80, canvas.width - leftInset - rightInset);
  const height = Math.max(80, canvas.height - topInset - bottomInset);
  const box = Math.max(80, Math.min(width, height) - 24 * dpr);
  // systemExtent is a RADIUS measured out from the Sun (its true outer
  // edge), so the span a view must frame is its DIAMETER. Treating the
  // radius as the span framed the system at twice the fitting zoom — the
  // outer orbits then spilled under the top bar and info panel on every
  // fit. `span` callers (fitBody) already pass a full span as-is.
  const extent = span || systemExtent(game) * 2;
  const maxZoom = game.mapCompressed ? 0.2 : 2e-5;
  // Zoom-out floor: the widest view is the system fit itself. The old
  // 1e-12 floor let the wheel keep shrinking the map until every orbit
  // collapsed into a single dot at the centre of the screen.
  const floor = systemMinZoom(game, box, maxZoom);
  cam.limits(floor, maxZoom);
  cam.setZoom(Math.max(floor, Math.min(maxZoom, box / extent)));
  const c = center || {x: 0, y: 0};
  const viewCenterX = (leftInset + canvas.width - rightInset) / 2;
  const viewCenterY = (topInset + canvas.height - bottomInset) / 2;
  cam.focus(
    c.x + (canvas.width / 2 - viewCenterX) / cam.zoom,
    c.y + (viewCenterY - canvas.height / 2) / cam.zoom
  );
  cam.target = null;
}

/** Zoom so a body and its orbit fill the view. */
export function fitBody(game, body) {
  if (!body || !body.parent) return fitSystem(game);
  const span = game.mapCompressed
    ? compressRadius(body.orbit.radius) * 4.4
    : body.orbit.radius * 4.4;
  fitSystem(game, span, mapPosition(body.parent, game.mapCompressed));
}

export {discRadius};
