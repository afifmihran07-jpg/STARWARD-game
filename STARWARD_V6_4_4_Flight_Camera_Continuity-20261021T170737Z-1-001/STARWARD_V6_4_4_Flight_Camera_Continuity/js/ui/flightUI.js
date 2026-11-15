/* =========================================================================
   flightUI.js — the FLIGHT COMPUTER panel and the mission progress bar.
   ========================================================================= */
import {formatDistance, isOrbitVerified} from '../physics/orbitalMechanics.js';
import {GUIDANCE_PHASE_LABELS} from '../flight/guidance.js';

function setText(sel, text) {
  const el = document.querySelector(sel);
  if (el) el.textContent = text;
}

/** Delta-v the remaining propellant can still buy: the same stage-by-stage
 *  rocket equation as the builder, starting at the lit stage, so propellant in
 *  unlit upper stages is credited to *their* engines and dropped dry mass is
 *  not carried. */
function remainingDv(rocket, stats = rocket.stats()) {
  return stats.dv || 0;
}

function flightStatus(game, alt, orbit) {
  const r = game.rocket;
  const body = r.body || r.primaryBody;
  const outsideAtmosphere = !body.atmosphere || alt >= body.atmosphere.height;
  const engineCutoff = r.throttle <= 0.005 && (r.spool || 0) <= 0.01;
  if (r.crashed) return {text:'VEHICLE DESTROYED', cls:'is-bad'};
  if (r.landed && !r.hasFlown) return {text:'ON LAUNCH PAD', cls:'is-good'};
  if (game.deployedSpacecraft === r) return {text:'SPACECRAFT OPERATIONS', cls:'is-space'};
  if (isOrbitVerified(orbit, body, r)) return {text:'ORBIT VERIFIED · ENGINE CUTOFF', cls:'is-space'};
  if (r.activeEngine && !r.hasFlown && r.throttle <= 0.01) return {text:'ENGINES READY — PRESS SPACE TO IGNITE', cls:'is-warn'};
  // Nothing produces thrust without a lit engine that still has propellant.
  if (r.hasFlown && (!r.activeEngine || r.currentFuel <= 0)) return {text:'ENGINE OUT · NO ACTIVE STAGE', cls:'is-warn'};
  if (r.throttle <= 0.01 && (r.spool || 0) > 0.01) return {text:'ENGINE CUTOFF · THRUST TAILOFF', cls:'is-warn'};
  if (outsideAtmosphere && orbit && orbit.bound && orbit.periapsis <= body.radius + (body.atmosphere?.height || 0) + 10000) {
    return {text: engineCutoff ? 'COASTING · SUBORBITAL' : 'BURN ACTIVE · PERIAPSIS IN ATMOSPHERE', cls:'is-warn'};
  }
  if (outsideAtmosphere && orbit && !Number.isFinite(orbit.apoapsis)) return {text:'SPACE · ESCAPE TRAJECTORY', cls:'is-space'};
  if (outsideAtmosphere && orbit && orbit.bound && !engineCutoff) return {text:'SPACE · BURN ACTIVE · ORBIT NOT VERIFIED', cls:'is-warn'};
  if (outsideAtmosphere) return {text:'SPACE COAST · ORBIT NOT VERIFIED', cls:'is-space'};
  if (engineCutoff && r.hasFlown) return {text:'COASTING · SUBORBITAL TRAJECTORY', cls:'is-warn'};
  // "Powered" only while the engines are actually producing thrust.
  if (r.hasFlown) return (r.actualThrust || 0) > 0
    ? {text:'POWERED ASCENT', cls:'is-good'}
    : {text:'COASTING · SUBORBITAL TRAJECTORY', cls:'is-warn'};
  return {text:'PRELAUNCH', cls:'is-good'};
}

export function updateFlightUI(game, orbit) {
  const r = game.rocket;
  if (!r) return;
  const missionToggle = document.querySelector('#missionDockToggle');
  if (missionToggle && !missionToggle.dataset.bound) {
    missionToggle.dataset.bound = 'true';
    missionToggle.addEventListener('click', () => {
      const open = document.body.classList.toggle('mission-tools-open');
      missionToggle.setAttribute('aria-expanded', String(open));
      const label = missionToggle.querySelector('span');
      if (label) label.textContent = open ? '−' : '+';
    });
  }
  // One-time wiring for the flight dashboard controls that live outside the
  // game's own key handlers (cut, camera framing, SAS chip).
  const hud = document.querySelector('#hud');
  if (hud && !hud.dataset.dashboardBound) {
    hud.dataset.dashboardBound = 'true';
    const throttleInput = document.querySelector('#throttle');
    const cutButton = document.querySelector('#throttleCut');
    if (throttleInput && cutButton) {
      cutButton.addEventListener('click', () => {
        throttleInput.value = '0';
        throttleInput.dispatchEvent(new Event('input', {bubbles: true}));
      });
    }
    const sas = document.querySelector('#sasBadge');
    if (sas) {
      sas.addEventListener('click', () => {
        if (game.rocket) game.rocket.sas = !game.rocket.sas;
      });
    }
    document.querySelectorAll('[data-flight-view]').forEach(btn => {
      btn.addEventListener('click', () => {
        game.flightZoomScale = btn.dataset.flightView === 'pad' ? 2.6
          : btn.dataset.flightView === 'orbit' ? 0.62 : 1.2;
      });
    });
  }

  const body = r.body;
  const alt = r.altitudeAboveSurface(body);
  // Surface-relative speed: the vehicle's own motion, not Earth's orbital one.
  const speed = Math.hypot(r.velocity.x - body.velocity.x, r.velocity.y - body.velocity.y);
  const st = r.stats();
  const isSpacecraft = game.deployedSpacecraft === r;
  const ap = orbit ? orbit.apoapsis : Infinity;
  const pe = orbit ? orbit.periapsis : 0;
  const periapsisAltitude = pe - body.radius;
  const periapsisText = !orbit ? '—' : !orbit.bound ? 'UNBOUND'
    : periapsisAltitude <= 0 ? 'BODY INTERSECTION'
    : periapsisAltitude < (body.atmosphere?.height || 0) ? 'ATMOSPHERIC'
    : formatDistance(periapsisAltitude);
  // Live thrust-to-weight of the lit stage, using spooled (actual) thrust.
  const spool = r.spool || 0;
  const actualThrust = r.activeEngine ? (Number.isFinite(r.actualThrust) ? r.actualThrust : r.activeEngine.thrust * spool) : 0;
  const localRadius = Math.max(1, body.radius + alt);
  const localGravity = body.mu / (localRadius * localRadius);
  const twr = r.activeEngine && r.mass && localGravity > 0
    ? (actualThrust / (r.mass * localGravity)) : 0;
    const fuelCurrent = r.stageIndex >= 0 ? r.currentFuel : r.fuel;
    const fuelCap = r.stageIndex >= 0 ? r.currentCapacity : r.fuelCapacity;
    const q = r.dynPressure || 0;
    const mach = r.mach || 0;
    const gForce = r.gForce || 0;

    const phaseLabels = {PRELAUNCH:'PRELAUNCH', IGNITION:'IGNITION', POWERED_ASCENT:'POWERED ASCENT',
    STAGE_SEPARATION:'STAGE SEPARATION', ENGINE_CUTOFF:'ENGINE CUTOFF', COASTING:'COASTING',
    ORBIT_VERIFIED:'ORBIT VERIFIED'};
  const rows = [
      ['ALTITUDE', formatDistance(alt)],
      ['ENVIRONMENT', body.atmosphere && alt < body.atmosphere.height
        ? 'ATMOSPHERE' : 'VACUUM'],
      ['VELOCITY', speed.toFixed(0) + ' m/s'],
      ['MACH', body.atmosphere && alt < body.atmosphere.height ? mach.toFixed(2) + ' · EST.' : 'N/A · VACUUM'],
      ['DYN PRESSURE', q >= 1000 ? (q / 1000).toFixed(1) + ' kPa' : q.toFixed(0) + ' Pa'],
      ['MAX-Q', r.maxDynPressure >= 1000 ? (r.maxDynPressure / 1000).toFixed(1) + ' kPa @ ' + formatDistance(r.maxQAltitude || 0) : 'not reached'],
      ['G-FORCE', gForce.toFixed(1) + ' g'],
      ['APOAPSIS', isFinite(ap) ? formatDistance(Math.max(0, ap - body.radius)) : 'ESCAPE'],
      ['PERIAPSIS', periapsisText],
      ['FUEL', isSpacecraft ? 'N/A' : fuelCurrent.toFixed(0) + ' / ' + fuelCap.toFixed(0) + ' kg'],
      ['MASS', (r.mass / 1000).toFixed(2) + ' t'],
      ['THRUST', isSpacecraft ? 'N/A' : actualThrust >= 1000 ? (actualThrust / 1000).toFixed(0) + ' kN' : actualThrust.toFixed(0) + ' N'],
      ['TWR', isSpacecraft ? 'N/A' : r.activeEngine ? twr.toFixed(2) : (r.mass ? (st.thrust / (r.mass * localGravity)).toFixed(2) : '—')],
      ['ΔV LEFT', isSpacecraft ? 'N/A' : Math.round(remainingDv(r, st)) + ' m/s'],
      ['STAGE', isSpacecraft ? 'DEPLOYED' : r.stageNumber + ' / ' + r.totalStages],
      ['SAS', r.sas ? 'ON [T]' : 'OFF [T]'],
      // The real autopilot phase, or why it is off.
      ['GUIDANCE', r.autoGuidance
        ? 'AUTO · ' + (GUIDANCE_PHASE_LABELS[r.guidancePhase] || 'ENGAGED') + ' → ' + Math.round((r.guidanceTargetAltitude || 0) / 1000) + ' km [G]'
        : r.guidancePhase === 'MANUAL_OVERRIDE' ? 'MANUAL OVERRIDE [G]' : 'MANUAL [G]'],
      ['FLIGHT PHASE', phaseLabels[r.flightPhase] || r.flightPhase || 'ASCENT'],
      // Applied warp (altitude-limited), not the raw request.
      ['WARP', (typeof game.appliedWarp === 'function' ? game.appliedWarp() : game.warp) + '\u00D7' +
        (typeof game.appliedWarp === 'function' && game.appliedWarp() < game.warp ? ' · LIMITED' : '')],
      ['CAMERA', game.cameraFocus === 'spacecraft' && game.deployedSpacecraft && game.deployedSpacecraft !== r
        ? 'SPACECRAFT [V]' : 'CARRIER [V]'],
      ['PRIMARY', body.name],
      ['ENGINES', isSpacecraft ? 'NONE (SPACECRAFT)' : st.engines + ' fitted']
    ];

  const essentialMetrics = new Set(['ALTITUDE', 'VELOCITY']);
  // The altitude card already carries a static "Altitude (ASL)" heading in
  // index.html, so its headline metric is rendered without a second label.
  const metricLabels = {ALTITUDE: ''};
  const renderMetric = ([k, v], splitValue = false) => {
    const label = k in metricLabels ? metricLabels[k] : k;
    const labelHtml = label ? '<span>' + label + '</span>' : '';
    if (!splitValue) return '<div class="metric">' + labelHtml + '<b>' + v + '</b></div>';
    // Headline rows split the unit so the dashboard can set it in small type.
    const match = /^([\d.,+\-]+)\s*(.+)$/.exec(String(v));
    const value = match ? match[1] : v;
    const unit = match ? match[2] : '';
    return '<div class="metric">' + labelHtml + '<b>' + value + '</b>' +
      (unit ? '<em>' + unit + '</em>' : '') + '</div>';
  };
  const metrics = document.querySelector('#metrics');
  if (metrics) metrics.innerHTML = rows.filter(([k]) => essentialMetrics.has(k))
    .map(row => renderMetric(row, true)).join('');
  const metricsMore = document.querySelector('#metricsMore');
  if (metricsMore) metricsMore.innerHTML = rows.filter(([k]) => !essentialMetrics.has(k))
    .map(row => renderMetric(row)).join('');

  const fuelFraction = fuelCap > 0 && !isSpacecraft ? Math.max(0, Math.min(1, fuelCurrent / fuelCap)) : 0;
  setText('#fuelPercent', isSpacecraft ? '—' : String(Math.round(fuelFraction * 100)));
  setText('#fuelMass', isSpacecraft ? 'SPACECRAFT' : Math.round(fuelCurrent).toLocaleString() + ' kg');
  const fuelGauge = document.querySelector('#fuelGauge');
  if (fuelGauge) fuelGauge.style.setProperty('--fuel-level', (fuelFraction * 360).toFixed(1) + 'deg');
  setText('#flightApogee', isFinite(ap) ? formatDistance(Math.max(0, ap - body.radius)) : 'ESCAPE');
  setText('#flightAccel', gForce.toFixed(2) + ' G');
  const atmosphere = body.atmosphere;
  const inAtmosphere = !!atmosphere && alt < atmosphere.height;
  setText('#flightMach', inAtmosphere ? mach.toFixed(2) : 'N/A');
  setText('#flightRegime', !inAtmosphere ? 'VACUUM'
    : mach < 0.85 ? 'SUBSONIC' : mach < 1.35 ? 'TRANSONIC' : 'SUPERSONIC');
  setText('#flightTot', isFinite(ap)
    ? (Math.max(0, ap - body.radius) / 1000).toFixed(1) + ' KM' : 'ESCAPE');
  if (metrics) {
    const ceiling = atmosphere && atmosphere.height > 0
      ? atmosphere.height : Math.max(1, body.radius * 0.02);
    metrics.style.setProperty('--alt-fill',
      Math.max(0, Math.min(100, alt / ceiling * 100)).toFixed(1) + '%');
  }
  setText('#flightTransonic', atmosphere ? 'TRANSONIC BOUNDARY // ' + formatDistance(atmosphere.height * 0.1) : 'NO ATMOSPHERE');
  setText('#flightMaxQ', r.maxDynPressure > 0
    ? 'MAX-Q PRESSURE ZONE // ' + formatDistance(r.maxQAltitude || 0)
    : 'MAX-Q PRESSURE ZONE // ' + (atmosphere ? 'AWAITING ASCENT' : 'N/A'));
  setText('#flightPadLabel', 'LAUNCH PAD // ' + body.name.toUpperCase() + ' · ' + formatDistance(0));
  setText('#sasBadge', r.sas ? 'SAS LOCKED' : 'SAS STANDBY');
  const sasBadge = document.querySelector('#sasBadge');
  if (sasBadge) {
    sasBadge.classList.toggle('is-active', !!r.sas);
    sasBadge.setAttribute('aria-pressed', String(!!r.sas));
  }

  setText('#throttleOut', isSpacecraft ? 'N/A' : Math.round(r.throttle * 100) + '%');
  const throttle = document.querySelector('#throttle');
  if (throttle) {
    const lever = isSpacecraft ? 0 : Math.round(r.throttle * 100);
    throttle.disabled = isSpacecraft;
    if (isSpacecraft) throttle.value = 0;
    else if (document.activeElement !== throttle) throttle.value = lever;
    // Keeps the dashboard slider fill in step with keyboard throttle changes.
    throttle.style.setProperty('--fill', lever + '%');
  }

  const status = flightStatus(game, alt, orbit);
  if (game.deployedSpacecraft && game.deployedSpacecraft !== r && !r.crashed) {
    status.text = 'LAUNCH VEHICLE · PAYLOAD DEPLOYED'; status.cls = 'is-space';
  }
  const badge = document.querySelector('#flightStatus');
  if (badge) {
    badge.textContent = status.text;
    badge.className = 'status ' + status.cls;
  }

  const stageBtn = document.querySelector('#stageButton');
  if (stageBtn) {
    const stageLine = document.querySelector('#stageLine');
    const stageAction = document.querySelector('#stageAction');
    const stageNumber = Math.min(Math.max(1, r.stageNumber), r.totalStages);
    // What SPACE does next, from the real staging state: ignite stage 1,
    // separate the lit stage (n counts jettisoned stages too), or nothing
    // more to stage (the engineless payload stays until DEPLOY).
    const [line, action] = isSpacecraft ? ['SPACECRAFT', 'DEPLOYED']
      : game.deployedSpacecraft ? ['STAGE ' + stageNumber, 'SPACECRAFT DEPLOYED']
      : r.stageIndex < 0 ? ['IGNITE', 'STAGE 1']
      : r.canStage() ? ['SEPARATE', 'STAGE ' + stageNumber]
      : ['FINAL STAGE', ''];
    if (stageLine) stageLine.textContent = line;
    if (stageAction) stageAction.textContent = action;
    stageBtn.disabled = isSpacecraft || !r.canStage();
  }

  // Camera framing presets reuse the flight zoom the wheel already drives.
  const zoomScale = Number(game.flightZoomScale) || 1.2;
  const view = zoomScale >= 1.9 ? 'pad' : zoomScale <= 0.85 ? 'orbit' : 'chase';
  document.querySelectorAll('[data-flight-view]').forEach(b =>
    b.classList.toggle('is-active', b.dataset.flightView === view));

  const prog = game.missions.progress(game);
  const bar = document.querySelector('#missionProgress');
  if (bar) bar.style.width = (prog * 100).toFixed(1) + '%';
  const objectiveText = Math.round(prog * 100) + '% objective · ' + game.missions.status(game);
  setText('#missionState', objectiveText + (Math.round(prog * 100) >= 100 ? ' · FLIGHT CONTINUES UNTIL ORBIT/DEPLOYMENT' : ''));
}



