import assert from 'node:assert/strict';
import {flightCameraProfile, flightCameraLeadOffset, combinePlanetReveal, atmosphereVisualProfile, rocketDisplayScale} from '../js/flight/flightCameraProfile.js';
import {Camera, flightFocusFraction} from '../js/camera.js';

const sample = alt => flightCameraProfile({viewportHeight:900,rocketHeight:80,altitude:alt,
  bodyRadius:6371000,atmosphereHeight:100000,minZoom:2e-6,maxZoom:60});
const alts = [0,50,100,250,500,1000,1490,1500,1510,1600,1700,2000,3000,5000,
  10000,15000,20000,30000,40000,50000,60000,80000,100000,150000];
let priorZoom = Infinity, priorReveal = -1;
for (const alt of alts) {
  const p = sample(alt);
  assert.ok(Number.isFinite(p.zoom) && p.zoom > 0, `zoom finite at ${alt}m`);
  assert.ok(p.zoom <= priorZoom + 1e-12, `target zoom should be monotonic at ${alt}m`);
  assert.ok(p.reveal >= priorReveal - 1e-12, `planet reveal should be monotonic at ${alt}m`);
  priorZoom = p.zoom; priorReveal = p.reveal;
}
const low = sample(1500), high = sample(1700);
assert.ok(1700 * high.zoom > 1500 * low.zoom * 1.01,
  'ground horizon must recede between 1.5 and 1.7 km, not stay pinned');
assert.ok(sample(0).reveal === 0, 'globe reveal starts at launch');
assert.ok(sample(60000).reveal > 0.5 && sample(60000).reveal < 0.9, 'Earth reveal remains in progress through upper-atmosphere ascent');
assert.ok(sample(5000).reveal < 0.02, 'globe does not dominate while the vehicle is still in the lower atmosphere');
assert.ok(sample(8000).reveal < 0.05, 'local horizon still carries the early-ascent view');
assert.ok(sample(30000).reveal > 0.2, 'Earth begins to take over as the local horizon approaches the viewport edge');
assert.ok(sample(80000).reveal > 0.8, 'globe is substantially visible near the upper atmosphere');
assert.ok(sample(92000).reveal === 1, 'Earth reveal completes near the configured atmospheric upper boundary');
for (let alt=1400; alt<=61000; alt+=50) {
  const a=sample(alt), b=sample(alt+1);
  assert.ok(Math.abs(Math.log(b.zoom/a.zoom)) < 0.02,
    `no zoom discontinuity between ${alt}m and ${alt+1}m`);
}
for (let fixedAltitudeReveal = 0; fixedAltitudeReveal <= 1; fixedAltitudeReveal += 0.1) {
  let previous = -1;
  for (let i = 0; i <= 100; i++) {
    const combined = combinePlanetReveal(i / 100, fixedAltitudeReveal);
    assert.ok(combined >= previous - 1e-12, 'combined reveal is monotonic in zoom mix');
    previous = combined;
  }
}
for (let fixedZoomMix = 0; fixedZoomMix <= 1; fixedZoomMix += 0.1) {
  let previous = -1;
  for (let i = 0; i <= 100; i++) {
    const combined = combinePlanetReveal(fixedZoomMix, i / 100);
    assert.ok(combined >= previous - 1e-12, 'combined reveal is monotonic in altitude reveal');
    previous = combined;
  }
}
assert.ok(Math.abs(combinePlanetReveal(0,0))<1e-12);
assert.ok(Math.abs(combinePlanetReveal(1,0)-1)<1e-12);
assert.ok(Math.abs(combinePlanetReveal(0,1)-1)<1e-12);
// Exercise the live Camera class against the exact profile under variable RAF
// deltas. The rocket's screen anchor must remain coherent while the horizon
// profile moves out and the globe reveal takes over.
const camera = new Camera({width:1280,height:900});
camera.limits(2e-6,60);
const variableDts = [1/60, 1/60, 0.033, 0.05, 1/60, 0.1, 1/60];
let previousScreenY = null;
for (let i=0; i<=1200; i++) {
  const alt = i * 50;
  const p = flightCameraProfile({viewportHeight:900,rocketHeight:80,altitude:alt,
    bodyRadius:6371000,atmosphereHeight:100000,minZoom:2e-6,maxZoom:60});
  const rocketY = 6371000 + alt;
  camera.setTargetZoom(p.zoom);
  const fraction = flightFocusFraction(alt);
  camera.setScreenAnchor(149600000000, rocketY, fraction);
  camera.update(variableDts[i % variableDts.length]);
  const screen = camera.worldToScreen(149600000000, rocketY);
  const expectedY = 450 - 900 * fraction;
  assert.ok(Number.isFinite(screen.x) && Number.isFinite(screen.y) && Number.isFinite(camera.zoom),
    `camera state stays finite at ${alt}m`);
  assert.ok(Math.abs(screen.y - expectedY) < 1e-5,
    `screen-space rocket anchor stays stable at ${alt}m`);
  if (previousScreenY !== null) assert.ok(Math.abs(screen.y - previousScreenY) < 3,
    `rocket screen position has no vertical pop between frames at ${alt}m`);
  previousScreenY = screen.y;
}

// Velocity-relative camera lead adds restrained perceived motion without touching physics.
const noLead = flightCameraLeadOffset({vx: 0, vy: 0, viewportWidth: 1280, viewportHeight: 720, zoom: 0.01});
assert.equal(noLead.x, 0);
assert.equal(noLead.y, 0);
const leadSlow = flightCameraLeadOffset({vx: 50, vy: 0, viewportWidth: 1280, viewportHeight: 720, zoom: 0.01});
const leadFast = flightCameraLeadOffset({vx: 1800, vy: 0, viewportWidth: 1280, viewportHeight: 720, zoom: 0.01});
assert.equal(leadSlow.x, 0, 'lead should fade in below the speed threshold');
assert.ok(Math.abs(leadFast.x * 0.01 / 1280 - 0.045) < 1e-12, 'maximum lead is capped at 4.5% viewport width');
const centerLead = flightCameraLeadOffset({vx: 1800, vy: 0, viewportWidth: 1280, viewportHeight: 720, zoom: 0.01, mode: 'center'});
assert.equal(centerLead.x, 0, 'center camera mode remains centered');

// Atmosphere and rocket sprite scale are presentation-only, smooth, and monotonic.
let priorScattering = Infinity, priorStars = -1, priorDisplayScale = Infinity;
for (let alt = 0; alt <= 120000; alt += 100) {
  const atmosphere = atmosphereVisualProfile(alt, 100000);
  const displayScale = rocketDisplayScale(alt);
  assert.ok(atmosphere.scattering <= priorScattering + 1e-12, 'atmospheric scattering must fade monotonically');
  assert.ok(atmosphere.starVisibility >= priorStars - 1e-12, 'stars must emerge monotonically');
  assert.ok(displayScale <= priorDisplayScale + 1e-12, 'rocket display scale must recede monotonically');
  assert.ok(displayScale >= 0.34 && displayScale <= 1.6, 'display scale must stay bounded');
  priorScattering = atmosphere.scattering;
  priorStars = atmosphere.starVisibility;
  priorDisplayScale = displayScale;
}
assert.ok(atmosphereVisualProfile(0, 100000).starVisibility === 0, 'stars stay hidden at the pad');
assert.ok(atmosphereVisualProfile(83000, 100000).starVisibility === 1, 'stars fully emerge near upper-atmosphere transition');
assert.ok(Math.abs(rocketDisplayScale(1500) - 1.6) < 1e-12, 'rocket retains close framing at the pad');
assert.ok(Math.abs(rocketDisplayScale(66500) - 0.34) < 1e-12, 'rocket detail scale recedes smoothly by high altitude');
console.log('  ok  continuous zoom, Earth reveal, atmosphere fade and rocket display scale through 100 km');
