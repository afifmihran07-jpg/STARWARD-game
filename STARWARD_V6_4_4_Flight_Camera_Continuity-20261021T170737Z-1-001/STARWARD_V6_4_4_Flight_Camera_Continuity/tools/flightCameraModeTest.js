import assert from 'node:assert/strict';
import {flightCameraProfile, flightCameraModeProfile} from '../js/flight/flightCameraProfile.js';

const base = flightCameraProfile({viewportHeight:900, rocketHeight:80, altitude:8000,
  bodyRadius:6371000, atmosphereHeight:100000, minZoom:2e-6, maxZoom:60});
const modes = ['chase','close','planet','center'];
const result = Object.fromEntries(modes.map(mode => [mode,
  flightCameraModeProfile(base, mode, 8000, 1, 2e-6, 60)]));
for (const [mode, profile] of Object.entries(result)) {
  assert.ok(Number.isFinite(profile.zoom) && profile.zoom >= 2e-6 && profile.zoom <= 60,
    `${mode} zoom must stay inside flight limits`);
  assert.ok(Number.isFinite(profile.focusFraction) && Math.abs(profile.focusFraction) <= 0.45,
    `${mode} focus must remain in the safe screen-anchor range`);
}
assert.ok(result.close.zoom > result.chase.zoom,
  'close follow should retain more local detail than the chase camera');
assert.ok(result.planet.zoom < result.chase.zoom,
  'planet view should frame a wider world than chase view');
assert.equal(result.center.focusFraction, 0,
  'center view keeps the vehicle at the viewport center');
assert.equal(result.planet.focusFraction, 0.12,
  'planet view keeps room for the globe below the vehicle');
const zoomed = flightCameraModeProfile(base, 'planet', 8000, 1.5, 2e-6, 60);
assert.ok(zoomed.zoom > result.planet.zoom,
  'manual flight zoom must apply to all camera presets');
console.log('  ok  chase, close, planet and centered camera presets remain bounded and distinct');
