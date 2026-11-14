import assert from 'node:assert/strict';
import {Camera} from '../js/camera.js';

const canvas = {width: 1280, height: 720};
const camera = new Camera(canvas);
camera.focus(0, 0);
camera.target = {x: 1000, y: 2000};
camera.smooth = 12;
camera.update(0.1); // common throttled-browser frame (~10 FPS)
assert.ok(camera.x > 0 && camera.x < 1000, 'camera must ease, not snap, at 10 FPS');
assert.ok(camera.y > 0 && camera.y < 2000, 'vertical camera must ease, not snap, at 10 FPS');

const startX = camera.x;
camera.update(1 / 60);
assert.ok(camera.x > startX && camera.x < 1000, 'camera must continue moving smoothly');

camera.zoom = 0.001;
camera.targetZoom = 0.00001;
camera.update(0.1);
assert.ok(camera.zoom < 0.001 && camera.zoom > 0.00001, 'zoom must ease rather than snap');

const stableZoom = camera.zoom;
camera.setZoom(Number.NaN);
camera.setTargetZoom(Number.POSITIVE_INFINITY);
assert.strictEqual(camera.zoom, stableZoom, 'invalid zoom commands must not poison camera state');
assert.ok(camera.targetZoom === undefined || Number.isFinite(camera.targetZoom),
  'invalid target zoom must be ignored');

camera.target = {x: Number.NaN, y: Number.POSITIVE_INFINITY};
camera.focus(0, 0);
camera.target = {x: 100, y: 100};
camera.update(Number.NaN);
assert.ok(Number.isFinite(camera.x) && Number.isFinite(camera.y), 'invalid frame delta must not poison camera state');
console.log('  ok  camera remains smooth at low FPS and after invalid frame deltas');
