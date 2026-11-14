/**
 * A launch site is fixed to a body's surface, not fixed in inertial/world
 * coordinates. Celestial bodies translate during the simulation, so an
 * absolute point captured at launch drifts across the surface if reused later.
 * The current model does not rotate bodies; angle + surface radius are the
 * body's local radial coordinates and remain stable as the body orbits.
 */
export function createLaunchSite(body, angle, terrainHeight = 0) {
  if (!body || !Number.isFinite(angle)) return null;
  const relief = Number.isFinite(terrainHeight) ? terrainHeight : 0;
  return {
    bodyId: body.id,
    angle,
    radius: Math.max(1, body.radius + relief)
  };
}

export function resolveLaunchSite(body, site) {
  if (!body || !site || !Number.isFinite(site.angle)) return null;
  const radius = Number.isFinite(site.radius) ? Math.max(1, site.radius) : Math.max(1, body.radius);
  return {
    x: body.position.x + Math.cos(site.angle) * radius,
    y: body.position.y + Math.sin(site.angle) * radius
  };
}

/** World-sized pad geometry fades by projected size, not by altitude toggles. */
export function launchPadMetrics(point, zoom, canvasWidth, canvasHeight, displayScale = null) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) ||
      !Number.isFinite(zoom) || zoom <= 0) return null;
  const effectiveZoom = displayScale != null && Number.isFinite(displayScale) && displayScale > 0
    ? displayScale / 2
    : zoom;
  const width = 60 * effectiveZoom; // apron span in world scale, scaled with the launch vehicle
  // Local launch equipment is a high-detail asset, not a painted marker on the
  // distant globe. Fade its geometry away when it is only a few pixels wide;
  // otherwise zoom-out could bring an offscreen pad back as a crisp overlay.
  if (width < 3) return null; // sub-detail scale; never force a minimum size
  const padHeight = Math.max(80, width * 0.6);
  if (point.x < -width || point.x > canvasWidth + width ||
      point.y < -padHeight || point.y > canvasHeight + padHeight) return null;
  const alpha = clamp((width - 3) / (16 - 3), 0, 1);
  return {width, alpha};
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
