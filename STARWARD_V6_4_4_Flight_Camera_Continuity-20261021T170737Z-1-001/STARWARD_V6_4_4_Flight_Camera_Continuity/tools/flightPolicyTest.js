import assert from 'node:assert/strict';
import {
  FLIGHT_WARP_MAX, LOW_ALT_FLIGHT_WARP, LOW_ALT_WARP_CEILING,
  maxFlightWarpForAltitude
} from '../js/flight/flightPolicy.js';

for (const altitude of [-100, 0, 1000, 50000, LOW_ALT_WARP_CEILING - 1, Number.NaN, Infinity]) {
  assert.strictEqual(maxFlightWarpForAltitude(altitude), LOW_ALT_FLIGHT_WARP,
    `flight warp should be capped below the safe ceiling (altitude=${altitude})`);
}
assert.strictEqual(maxFlightWarpForAltitude(LOW_ALT_WARP_CEILING), FLIGHT_WARP_MAX);
assert.strictEqual(maxFlightWarpForAltitude(250000), FLIGHT_WARP_MAX);
assert.strictEqual(maxFlightWarpForAltitude(10000000), FLIGHT_WARP_MAX);
console.log('  ok  time warp is capped in atmosphere and restored in space');
