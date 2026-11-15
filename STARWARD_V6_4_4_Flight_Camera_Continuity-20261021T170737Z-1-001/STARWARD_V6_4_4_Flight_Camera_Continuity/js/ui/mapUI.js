/* =========================================================================
   mapUI.js — the SYSTEM MAP side panel: body facts, transfer estimate and
   the maneuver-node controls.
   ========================================================================= */
import {formatDistance} from '../physics/orbitalMechanics.js';
import {transferDeltaV} from '../physics/physics.js';
import {bodyOrder, focusBody} from '../map/spaceMap.js';

function setText(sel, text) {
  const el = document.querySelector(sel);
  if (el) el.textContent = text;
}

function duration(seconds) {
  if (!isFinite(seconds)) return '—';
  if (seconds < 90) return seconds.toFixed(0) + ' s';
  if (seconds < 5400) return (seconds / 60).toFixed(0) + ' min';
  if (seconds < 172800) return (seconds / 3600).toFixed(1) + ' h';
  return (seconds / 86400).toFixed(1) + ' d';
}

/** Build click handlers for the static body-tab buttons in #bodyFocusTabs. */
export function initBodyChips(game) {
  const wrap = document.querySelector('#bodyFocusTabs');
  if (!wrap) return;
  wrap.querySelectorAll('.body-tab').forEach(btn => {
    btn.onclick = () => {
      const bodyId = btn.dataset.body;
      const body = game.bodies.find(b => b.id === bodyId);
      if (body) {
        game.selected = body;
        focusBody(game, body);
        updateBodyInfo(game);
      }
    };
  });
}

/** Body mass expressed the way mission control would read it. */
function formatMass(kg) {
  const M_EARTH = 5.972e24;
  if (kg >= 1e23) {
    const m = kg / M_EARTH;
    const digits = m >= 100 ? 0 : m >= 1 ? 1 : 3;
    return m.toFixed(digits) + ' M⊕';
  }
  if (kg >= 1e20) return kg.toExponential(2).replace('e+', 'e') + ' kg';
  return (kg / 1e9).toFixed(1) + ' Bkg';
}

export function updateBodyInfo(game) {
  const body = game.selected || game.bodies[1];
  if (!body) return;

  const kind = body.type || (!body.parent ? 'STAR'
    : (body.parent.id === 'sun' ? 'PLANET' : 'MOON'));
  setText('#bodyName', body.id === 'sun' ? 'SOL' : body.name.toUpperCase());
  setText('#bodyInfo', kind + ' · Gravity ' + body.gravity.toFixed(2) + ' m/s² · ' +
    (body.atmosphere ? 'atmosphere ' + body.atmosphere.height + ' m' : 'airless'));

  // The "little detail" line — one real fact per world.
  const fact = document.querySelector('#bodyFact');
  if (fact) {
    fact.textContent = body.fact || '';
    fact.hidden = !body.fact;
  }

  const rows = [];
  rows.push(['Radius', (body.radius / 1000).toFixed(0) + ' km']);
  rows.push(['Mass', formatMass(body.mass)]);
  if (body.parent) {
    rows.push(['Orbit', formatDistance(body.orbit.radius) + ' from ' + body.parent.name]);
    // Kepler's third law — the period and speed the panel quotes live.
    const period = 2 * Math.PI * Math.sqrt(Math.pow(body.orbit.radius, 3) / body.parent.mu);
    rows.push(['Period', duration(period)]);
    rows.push(['Speed', Math.sqrt(body.parent.mu / body.orbit.radius).toFixed(0) + ' m/s']);
  }
  const sun = game.bodies.find(b => b.id === 'sun');
  if (sun && body !== sun) {
    const d = Math.hypot(body.position.x - sun.position.x, body.position.y - sun.position.y);
    rows.push(['From Sun', formatDistance(d)]);
  }
  if (body.rotation) rows.push(['Day', body.rotation.toFixed(2) + ' d']);
  rows.push(['Moons', body.moons != null ? String(body.moons) : '—']);
  if (body.tempC != null) rows.push(['Avg temp', body.tempC + ' °C']);

  const rocket = game.rocket;
  if (rocket) {
    const d = Math.hypot(rocket.position.x - body.position.x, rocket.position.y - body.position.y);
    const rel = Math.hypot(rocket.velocity.x - body.velocity.x, rocket.velocity.y - body.velocity.y);
    rows.push(['Range', formatDistance(Math.max(0, d - body.radius))]);
    rows.push(['Rel. speed', rel.toFixed(0) + ' m/s']);

    // Hohmann estimate between the current orbit and the body's orbit.
    const from = rocket.body;
    const centre = from.parent;
    if (body.parent && centre && centre === body.parent) {
      const transfer = transferDeltaV(
        Math.hypot(rocket.position.x - centre.position.x, rocket.position.y - centre.position.y),
        body.orbit.radius,
        centre.mu);
      if (transfer) {
        rows.push(['Transfer ΔV', transfer.total.toFixed(0) + ' m/s']);
        rows.push(['Transfer time', duration(transfer.time)]);
      }
    } else if (body.id === 'earth' || (from.parent && body.parent === from.parent)) {
      rows.push(['Transfer ΔV', 'plan the burn from orbit']);
    } else {
      rows.push(['Transfer ΔV', '—']);
    }
  }

  // Data attribution: every figure above comes from a NASA NSSDCA fact sheet.
  const source = dataSource(body);
  const link = document.querySelector('#bodySourceLink');
  if (link) { link.textContent = source.name; link.href = source.url; }
  const list = document.querySelector('#bodyStats');
  if (list) {
    list.innerHTML = rows.map(([k, v]) =>
      '<div><dt>' + k + '</dt><dd>' + v + '</dd></div>').join('');
  }

  const node = game.node;
  setText('#nodeDeltaV', node.deltaV ? (node.deltaV > 0 ? '+' : '') + Math.round(node.deltaV) + ' m/s' : 'none');
  const planned = document.querySelector('#plannedOrbit');
  if (planned) {
    planned.textContent = node.active && node.deltaV
      ? 'Planned burn ' + (node.deltaV > 0 ? 'prograde' : 'retrograde') + ' ' + Math.round(Math.abs(node.deltaV)) + ' m/s — cyan line on the map'
      : 'No maneuver armed';
  }
  const targetBtn = document.querySelector('#mapTarget');
  if (targetBtn) targetBtn.textContent = game.target ? 'CLEAR TARGET' : 'SET TARGET';

  document.querySelectorAll('.body-tab').forEach(el =>
    el.classList.toggle('is-active', el.dataset.body === body.id));

  // ---- Left: Celestial Body Focus tabs ----
  const focusWrap = document.querySelector('#bodyFocusTabs');
  if (focusWrap) {
    focusWrap.innerHTML = '';
    for (const b of bodyOrder(game.bodies)) {
      if (b.id !== 'sun' && (!b.parent || b.parent.id !== 'sun' || b.type === 'DWARF PLANET')) continue;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'body-tab' +
        (game.target === b ? ' is-target' : '') +
        (game.selected === b ? ' is-active' : '');
      btn.dataset.body = b.id;
      btn.textContent = b.id === 'sun' ? 'SOL' : b.name.toUpperCase();
      btn.title = 'Select ' + b.name;
      if (game.target === b) {
        const tag = document.createElement('span');
        tag.className = 'target-tag';
        tag.textContent = 'TARGET';
        btn.appendChild(tag);
      }
      btn.onclick = () => {
        game.selected = b;
        focusBody(game, b);
        updateBodyInfo(game);
      };
      focusWrap.appendChild(btn);
    }
  }

  // ---- Right: Astrodynamics telemetry ----
  // `rocket`, `sun` and `node` are already bound above in this scope — reuse them.
  const nodeDv = node ? (node.deltaV || 0) : 0;

  if (game.target) {
    const t = game.target;
    setText('#targetBodyName', t.name.toUpperCase() +
      (t.orbit ? ' (' + (t.orbit.radius / 1.496e11).toFixed(2) + ' AU)' : ''));
  } else {
    setText('#targetBodyName', 'NO TARGET');
  }

  // Hohmann transfer time between the vehicle's primary and the target, when
  // both orbit the same parent (e.g. Earth -> Mars). Not an intercept ETA.
  const transferTime = (() => {
    const from = rocket ? rocket.body : null;
    const to = game.target;
    if (!from || !to || from === to || !from.orbit || !to.orbit || !from.parent || from.parent !== to.parent) return null;
    const t = transferDeltaV(from.orbit.radius, to.orbit.radius, from.parent.mu);
    return t ? t.time : null;
  })();

  if (rocket && sun && game.target) {
    // Velocities are m/s internally; display km/s.
    const rel = Math.hypot(rocket.velocity.x - game.target.velocity.x,
      rocket.velocity.y - game.target.velocity.y);
    setText('#targetRelativeVelocity', (rel / 1000).toFixed(2) + ' km/s');
    setText('#targetEta', transferTime ? duration(transferTime) : '—');
    setText('#targetDeltaV', Math.round(nodeDv) + ' m/s');
  } else {
    setText('#targetRelativeVelocity', '—');
    setText('#targetEta', '—');
    setText('#targetDeltaV', '—');
  }

  setText('#nodeBurnName', node && node.active ? 'MANEUVER ARMED' : 'NO BURN');
  setText('#nodeTimeToBurn', node && node.active && node.timeToBurn
    ? duration(node.timeToBurn) : '—');
  setText('#nodeDeltaV', nodeDv ? (nodeDv > 0 ? '+' : '') + Math.round(nodeDv) + ' m/s' : '—');

  // ---- Bottom: Telemetry Bridge ----
  setText('#bridgeWarpMultiplier', appliedWarp(game) + '×');
  if (rocket) {
    const speed = Math.hypot(rocket.velocity.x, rocket.velocity.y) / 1000;
    setText('#bridgeVelocity', speed.toFixed(1) + ' km/s');
    const nu = trueAnomaly(rocket, rocket.body);
    setText('#bridgeAnomaly', nu == null ? '—' : nu.toFixed(1) + '°');
  } else {
    setText('#bridgeVelocity', '—');
    setText('#bridgeAnomaly', '—');
  }
  setText('#bridgeEta', transferTime ? duration(transferTime) : '—');
  if (game.target) {
    setText('#bridgeEncounter', 'TARGET · ' + game.target.name.toUpperCase());
    setText('#bridgeDv', (nodeDv ? Math.round(nodeDv) : '—') + ' m/s');
  } else {
    setText('#bridgeEncounter', 'NO TARGET');
    setText('#bridgeDv', '—');
  }

  // Telemetry rack: live vehicle state, not canned status text.
  setText('#rackVehicle', !rocket ? 'NO VEHICLE'
    : rocket.crashed ? 'DESTROYED'
    : rocket.landed ? 'ON SURFACE'
    : game.deployedSpacecraft ? 'SPACECRAFT DEPLOYED' : 'IN FLIGHT');
  setText('#rackPrimary', rocket && rocket.body ? rocket.body.name.toUpperCase() : '—');
}

/** True anomaly (degrees) of the vehicle about its primary, or null when the
 *  orbit is near-circular or unbound (where the angle is not meaningful). */
function trueAnomaly(rocket, body) {
  if (!body || !body.mu) return null;
  const rx = rocket.position.x - body.position.x, ry = rocket.position.y - body.position.y;
  const vx = rocket.velocity.x - body.velocity.x, vy = rocket.velocity.y - body.velocity.y;
  const r = Math.hypot(rx, ry);
  if (!(r > 0)) return null;
  const v2 = vx * vx + vy * vy, rv = rx * vx + ry * vy;
  // Eccentricity vector e = ((v² − μ/r)·r − (r·v)·v) / μ
  const ex = ((v2 - body.mu / r) * rx - rv * vx) / body.mu;
  const ey = ((v2 - body.mu / r) * ry - rv * vy) / body.mu;
  const e = Math.hypot(ex, ey);
  if (e < 1e-4 || e >= 1) return null;
  const h = rx * vy - ry * vx;
  let nu = Math.atan2((ex * ry - ey * rx) * Math.sign(h || 1), ex * rx + ey * ry) * 180 / Math.PI;
  if (nu < 0) nu += 360;
  return nu;
}

/** Build the clickable body focus list at the left panel (run once). */
export function initBodyFocusList(game) {
  const wrap = document.querySelector('#bodyFocusTabs');
  if (!wrap) return;
  wrap.innerHTML = '';
  for (const b of bodyOrder(game.bodies)) {
    if (!b.parent || b.parent.id !== 'sun') continue;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'body-tab' +
      (game.target === b ? ' is-target' : '') +
      (game.selected === b ? ' is-active' : '');
    btn.dataset.body = b.id;
    btn.textContent = b.name.toUpperCase();
    btn.title = 'Select ' + b.name;
    if (game.target === b) {
      const tag = document.createElement('span');
      tag.className = 'target-tag';
      tag.textContent = 'TARGET';
      btn.appendChild(tag);
    }
    btn.onclick = () => {
      game.selected = b;
      focusBody(game, b);
      updateBodyInfo(game);
    };
    wrap.appendChild(btn);
  }
}

/** Update the warp scale display on the bottom bridge. */
export function updateBridgeWarp(game) {
  const val = document.querySelector('#bridgeWarpValue');
  if (val) val.textContent = appliedWarp(game).toFixed(2) + 'x/s';
}

/** The warp the simulation actually runs at (altitude-limited). */
function appliedWarp(game) {
  return typeof game.appliedWarp === 'function' ? game.appliedWarp() : (game.warp || 1);
}

/** NASA NSSDCA fact sheet the body's mass/radius/orbit/gravity come from. */
function dataSource(body) {
  const base = 'https://nssdc.gsfc.nasa.gov/planetary/';
  const special = {
    sun: ['NASA NSSDCA Sun Fact Sheet', base + 'factsheet/sunfact.html'],
    ceres: ['NASA NSSDCA Asteroid Fact Sheet', base + 'factsheet/asteroidfact.html'],
    europa: ['NASA NSSDCA Jovian Satellite Fact Sheet', base + 'factsheet/joviansatfact.html'],
    titan: ['NASA NSSDCA Saturnian Satellite Fact Sheet', base + 'factsheet/saturniansatfact.html']
  };
  const [name, url] = special[body && body.id] || ['NASA NSSDCA Planetary Fact Sheet', base + 'planetfact.html'];
  return {name, url};
}
