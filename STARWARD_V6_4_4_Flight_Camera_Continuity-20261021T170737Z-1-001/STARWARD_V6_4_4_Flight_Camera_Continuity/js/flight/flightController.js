import {guide} from './guidance.js';

/** Keys that mean "the player is flying": any of them overrides the autopilot. */
export const MANUAL_FLIGHT_KEYS = ['KeyW', 'KeyS', 'ArrowUp', 'ArrowDown', 'KeyZ', 'KeyX',
  'ShiftLeft', 'ShiftRight', 'KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight'];

/**
 * Map keyboard input to rocket controls each frame.
 *
 * W/S ramp the throttle smoothly; A/D steer (turn the rocket).
 * When the rocket is landed with engines not lit, steering is locked so the
 * vehicle doesn't topple on the pad before launch.
 *
 * Autopilot (rocket.autoGuidance, toggled with G): the pure guidance function
 * computes throttle/steer/stage commands and this controller applies them.
 * Override policy: any manual flight key disengages the autopilot in the same
 * frame and the player's input takes effect immediately; it stays off until
 * the player presses G again. The autopilot never fights the player.
 */
export function controlRocket(rocket, input, dt) {
  if (rocket.autoGuidance && MANUAL_FLIGHT_KEYS.some(k => input.pressed(k))) {
    rocket.autoGuidance = false;
    rocket.guidancePhase = 'MANUAL_OVERRIDE';
    rocket.guidanceOverridden = true;          // the game announces it once
  }

  if (rocket.autoGuidance) {
    const body = rocket.primaryBody || rocket.body;
    if (body) {
      const cmd = guide(rocket, body, {
        altitude: rocket.guidanceTargetAltitude,
        maxG: rocket.guidanceMaxG,
        maxQ: rocket.guidanceMaxQ
      }, rocket.guidanceMemory || null);
      rocket.guidanceMemory = cmd.memory;
      rocket.guidancePhase = cmd.phase;
      rocket.guidanceInfo = cmd.info;
      rocket.throttle = cmd.throttle;
      rocket.steer = cmd.steer;
      if (cmd.stage && rocket.canStage()) {
        const from = rocket.stageNumber;
        if (rocket.nextStage() && from > 0) {
          rocket.recordStageSeparation(from, 'AUTOPILOT', body.altitude(rocket.position));
        }
      }
      return;
    }
  }

  const throttleUp = input.pressed('KeyW') || input.pressed('ArrowUp');
  const throttleDown = input.pressed('KeyS') || input.pressed('ArrowDown');
  if (input.pressed('KeyZ') || input.pressed('ShiftLeft') || input.pressed('ShiftRight')) {
    rocket.throttle = 1;
  } else if (input.pressed('KeyX')) {
    rocket.throttle = 0;
  } else {
    const throttleInput = Number(throttleUp) - Number(throttleDown);
    rocket.throttle = Math.max(0, Math.min(1, rocket.throttle + throttleInput * dt * 0.8));
  }

  const canSteer = !rocket.landed || (rocket.throttle > 0.01 && rocket.activeEngine && rocket.currentFuel > 0);
  const steerLeft = input.pressed('KeyA') || input.pressed('ArrowLeft');
  const steerRight = input.pressed('KeyD') || input.pressed('ArrowRight');
  rocket.steer = canSteer ? Number(steerRight) - Number(steerLeft) : 0;
}
