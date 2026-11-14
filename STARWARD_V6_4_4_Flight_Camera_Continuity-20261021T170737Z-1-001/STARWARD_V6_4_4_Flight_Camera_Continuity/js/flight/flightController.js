/**
 * Map keyboard input to rocket controls each frame.
 *
 * W/S ramp the throttle smoothly; A/D steer (turn the rocket).
 * When the rocket is landed with engines not lit, steering is locked so the
 * vehicle doesn't topple on the pad before launch.
 */
export function controlRocket(rocket, input, dt) {
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
