/**
 * Flight-time acceleration policy.
 *
 * Low-atmosphere phases are sensitive to drag, terrain contact and camera
 * cadence, so use a maximum of 2x until the craft is safely above 120 km.
 * Once in space, the campaign can accelerate up to 50x.
 */
export const FLIGHT_WARP_MAX = 50;
export const LOW_ALT_FLIGHT_WARP = 2;
export const LOW_ALT_WARP_CEILING = 120000;

export function maxFlightWarpForAltitude(altitude) {
  return Number.isFinite(altitude) && altitude >= LOW_ALT_WARP_CEILING
    ? FLIGHT_WARP_MAX
    : LOW_ALT_FLIGHT_WARP;
}
