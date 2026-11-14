/**
 * Continuous flight-camera profile in screen-space units.
 *
 * The previous 1/altitude pullback kept altitude * zoom almost constant. With
 * the rocket pinned to a screen anchor that made the horizon look stationary
 * through the 1.5–1.7 km band; later, the globe reveal changed the zoom by
 * several orders of magnitude and looked like a teleport. This profile matches
 * the old framing at the 1.5 km reference point, then uses a sublinear pullback
 * (altitude^-0.90) and blends to globe framing over one continuous interval.
 */
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smoothstep01 = t => {
  const x = clamp(Number.isFinite(t) ? t : 0, 0, 1);
  return x * x * (3 - 2 * x);
};

export function flightCameraProfile({
  viewportHeight,
  rocketHeight,
  altitude,
  bodyRadius,
  atmosphereHeight,
  zoomScale = 1,
  minZoom = 2e-6,
  maxZoom = 60
}) {
  const h = Number.isFinite(viewportHeight) ? Math.max(1, viewportHeight) : 1;
  const alt = Number.isFinite(altitude) ? Math.max(0, altitude) : 0;
  const radius = Number.isFinite(bodyRadius) ? Math.max(1, bodyRadius) : 1;
  const atmosphericTop = Number.isFinite(atmosphereHeight) && atmosphereHeight > 0
    ? atmosphereHeight : radius * 0.02;

  const chaseZoom = h * 0.72 / Math.max(1, (Number.isFinite(rocketHeight) ? rocketHeight : 1) + 120);
  const referenceAltitude = clamp(atmosphericTop * 0.015, 250, 1500);
  const referenceZoom = h * 0.42 / referenceAltitude;
  // A steeper but still sublinear pullback keeps the local horizon in frame
  // through the early ascent. At 0.62, altitude × zoom exceeded the viewport
  // before the globe reveal was visible, creating a blue-sky dead band.
  const exponent = 0.90;

  // Pick the scale altitude so localZoom exactly meets referenceZoom at the
  // reference altitude while retaining the close launch framing at alt=0.
  let localZoom;
  const ratio = chaseZoom / referenceZoom;
  if (ratio > 1.000001) {
    const denominator = Math.pow(ratio, 1 / exponent) - 1;
    const scaleAltitude = denominator > 1e-8 ? referenceAltitude / denominator : 1e12;
    localZoom = chaseZoom / Math.pow(1 + alt / scaleAltitude, exponent);
  } else {
    // Short/wide vehicles may have a chase scale smaller than the reference.
    localZoom = Math.min(chaseZoom,
      referenceZoom * Math.pow(Math.max(1, alt / referenceAltitude), -exponent));
  }
  localZoom = Math.max(minZoom, Math.min(maxZoom, localZoom));

  // Reveal Earth over the ascent, not in the lower atmosphere. Completing the
  // handoff at 12% of the configured atmosphere made the planet scale snap into
  // dominance around 10–12 km even though the vehicle was still in atmospheric
  // ascent. Start once the local horizon has begun to recede and finish near the
  // configured atmosphere's upper boundary. This is a presentation envelope; it
  // does not alter the rocket's world coordinates or physical trajectory.
  const revealStart = referenceAltitude;
  const revealEnd = Math.max(revealStart + 1, atmosphericTop * 0.92);
  const reveal = smoothstep01((alt - revealStart) / (revealEnd - revealStart));
  const planetZoom = clamp(h * 0.24 / Math.max(1, radius + alt), minZoom, maxZoom);
  const finalPlanetZoom = Math.min(localZoom, planetZoom);
  let zoom = localZoom;
  if (reveal > 0 && localZoom > 0 && finalPlanetZoom > 0) {
    zoom = Math.exp(Math.log(localZoom) * (1 - reveal) + Math.log(finalPlanetZoom) * reveal);
  }
  const safeScale = Number.isFinite(zoomScale) ? clamp(zoomScale, 0.25, 4) : 1;
  zoom = clamp(zoom * safeScale, minZoom, maxZoom);
  return {
    zoom,
    localZoom,
    planetZoom: finalPlanetZoom,
    reveal,
    revealStart,
    revealEnd,
    referenceAltitude
  };
}



/**
 * Bounded, presentation-only look-ahead in world coordinates. The returned
 * aim point is at most a small viewport fraction ahead of relative velocity;
 * it never changes the vehicle state or feeds back into physics.
 */
export function flightCameraLeadOffset({vx, vy, speed = null, viewportWidth, viewportHeight,
  zoom, mode = 'chase', maxFraction = 0.045, startSpeed = 80, fullSpeed = 1800} = {}) {
  const safeVx = Number.isFinite(vx) ? vx : 0;
  const safeVy = Number.isFinite(vy) ? vy : 0;
  const v = Number.isFinite(speed) ? Math.max(0, speed) : Math.hypot(safeVx, safeVy);
  const z = Number.isFinite(zoom) && zoom > 0 ? zoom : 1e-12;
  const w = Number.isFinite(viewportWidth) ? Math.max(0, viewportWidth) : 0;
  const h = Number.isFinite(viewportHeight) ? Math.max(0, viewportHeight) : 0;
  const t = clamp((v - startSpeed) / Math.max(1, fullSpeed - startSpeed), 0, 1);
  const fraction = mode === 'center' ? 0 : clamp(maxFraction, 0, 0.08) * t;
  if (v <= 1 || fraction <= 0) return {x: 0, y: 0, fraction};
  return {x: safeVx / v * w * fraction / z, y: safeVy / v * h * fraction / z, fraction};
}

/**
 * Rendering-only atmosphere envelope. Earth-like scale height is approximately
 * 8.5 km; body-specific values remain gameplay approximations unless supplied.
 * The 18–83 km star fade is a deliberate visual transition, not a physical
 * boundary of the atmosphere. Neither value affects trajectory integration.
 */
export function atmosphereVisualProfile(altitude, atmosphereHeight, scaleHeight = null) {
  const alt = Number.isFinite(altitude) ? Math.max(0, altitude) : 0;
  const top = Number.isFinite(atmosphereHeight) && atmosphereHeight > 0 ? atmosphereHeight : 100000;
  const H = Number.isFinite(scaleHeight) && scaleHeight > 0
    ? scaleHeight : clamp(top * 0.085, 1500, 12000);
  return {
    scaleHeight: H,
    scattering: Math.exp(-alt / H),
    starVisibility: smoothstep01((alt - 18000) / 65000)
  };
}

/** Smooth screen-space legibility scale; this never feeds back into physics. */
export function rocketDisplayScale(altitude, closeScale = 1.6, distantScale = 0.34) {
  const alt = Number.isFinite(altitude) ? Math.max(0, altitude) : 0;
  const t = smoothstep01((alt - 1500) / 65000);
  return closeScale * (1 - t) + distantScale * t;
}

/** Combine zoom-driven and altitude-driven globe transitions without a cut. */
export function combinePlanetReveal(zoomMix, altitudeReveal) {
  const z = clamp(Number.isFinite(zoomMix) ? zoomMix : 0, 0, 1);
  const a = clamp(Number.isFinite(altitudeReveal) ? altitudeReveal : 0, 0, 1);
  // Smooth union: either signal can start the transition; neither can undo it.
  return 1 - (1 - z) * (1 - a);
}


/** Select a framing preset while keeping the simulation state untouched. */
export function flightCameraModeProfile(profile, mode, altitude, zoomScale = 1,
  minZoom = 2e-6, maxZoom = 60) {
  const clampZoom = value => clamp(value, minZoom, maxZoom);
  const scale = Number.isFinite(zoomScale) ? clamp(zoomScale, 0.25, 4) : 1;
  const alt = Number.isFinite(altitude) ? Math.max(0, altitude) : 0;
  const progress = clamp(alt / 50000, 0, 1);
  const eased = progress * progress * (3 - 2 * progress);
  const chaseFraction = 0.08 + 0.15 * eased;
  if (mode === 'close') {
    return {zoom: clampZoom(profile.localZoom * scale * 1.2), focusFraction: 0.015};
  }
  if (mode === 'planet') {
    return {zoom: clampZoom(profile.planetZoom * scale), focusFraction: 0.12};
  }
  if (mode === 'center') {
    return {zoom: clampZoom(profile.zoom), focusFraction: 0};
  }
  return {zoom: clampZoom(profile.zoom), focusFraction: chaseFraction};
}
