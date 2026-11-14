import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createLaunchSite, resolveLaunchSite, launchPadMetrics} from '../js/flight/launchSite.js';
import {flightCameraProfile} from '../js/flight/flightCameraProfile.js';

const game = fs.readFileSync(new URL('../js/game.js', import.meta.url), 'utf8');
const renderer = fs.readFileSync(new URL('../js/renderer.js', import.meta.url), 'utf8');
assert.match(game, /createLaunchSite\(pad, Math\.PI \/ 2/, 'launch captures a body-local radial site');
assert.match(renderer, /resolveLaunchSite\(body, site\)/, 'renderer resolves the same site against the current body position');
assert.doesNotMatch(renderer, /alt >= 3000/, 'pad must not be hidden with a discontinuous altitude gate');
assert.doesNotMatch(renderer, /Math\.max\(24, Math\.min\(180, 48 \* zoom\)\)/, 'pad must not have a minimum screen size that makes it pop back');

const body = {id:'earth', radius:6371000, position:{x:149.6e9,y:0}};
const angle = Math.PI / 2;
const site = createLaunchSite(body, angle, 300);
const before = resolveLaunchSite(body, site);
const shift = {x: 410000, y: -230000};
body.position.x += shift.x;
body.position.y += shift.y;
const after = resolveLaunchSite(body, site);
assert.ok(Math.abs((after.x-before.x)-shift.x) < 1e-4, 'surface site follows the translating body exactly in x');
assert.ok(Math.abs((after.y-before.y)-shift.y) < 1e-4, 'surface site follows the translating body exactly in y');
assert.ok(Math.abs(Math.atan2(after.y-body.position.y, after.x-body.position.x)-angle) < 1e-12,
  'site radial angle remains body-relative when the body moves');

const heights = [0,250,500,1000,1500,1600,1700,2000,3000,5000,10000,20000,30000,50000,60000,100000];
let priorZoom = Infinity, priorOffset = -Infinity, seenHidden = false;
for (const altitude of heights) {
  const profile = flightCameraProfile({viewportHeight:900,rocketHeight:80,altitude,bodyRadius:6371000,atmosphereHeight:100000});
  assert.ok(Number.isFinite(profile.zoom) && profile.zoom > 0, 'zoom stays finite at '+altitude+' m');
  assert.ok(profile.zoom <= priorZoom + 1e-12, 'zoom should not jump inwards as altitude rises at '+altitude+' m');
  const offset = altitude * profile.zoom;
  assert.ok(offset >= priorOffset - 1e-6 || altitude >= profile.revealStart,
    'local horizon should not reverse before the globe transition at '+altitude+' m');
  const metrics = launchPadMetrics({x:640,y:400+offset}, profile.zoom, 1280, 900);
  if (!metrics) seenHidden = true;
  if (seenHidden) assert.equal(metrics, null, 'a offscreen or low-detail pad must not reappear after its projected size falls below the detail threshold at '+altitude+' m');
  priorZoom = profile.zoom;
  priorOffset = offset;
}
const p15 = flightCameraProfile({viewportHeight:900,rocketHeight:80,altitude:1500,bodyRadius:6371000,atmosphereHeight:100000});
const p17 = flightCameraProfile({viewportHeight:900,rocketHeight:80,altitude:1700,bodyRadius:6371000,atmosphereHeight:100000});
assert.ok(1700*p17.zoom > 1500*p15.zoom*1.01,
  'screen-space ground offset must progress, not remain constant from 1.5–1.7 km');
console.log('  ok  launch site is body-relative and the pad cannot pop back into view');
