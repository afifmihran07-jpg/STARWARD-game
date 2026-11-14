/* =========================================================================
   input.js — keyboard state and action mapping.

   Exposes a polled `Input` object. Keys are tracked by `event.code` so the
   controls work identically on non-QWERTY layouts.
   ========================================================================= */
(function (global) {
  'use strict';

  const { Util } = global.Math3;

  function Input(target) {
    this.down = Object.create(null);      // code -> true while held
    this.pressed = Object.create(null);   // code -> true for one frame
    this.invertPitch = false;
    this.enabled = true;
    this.throttle = 0;

    const self = this;

    this._onKeyDown = function (e) {
      if (!self.enabled) return;
      // Let the browser handle refresh/devtools shortcuts.
      if (e.metaKey || e.ctrlKey) return;
      if (!self.down[e.code]) self.pressed[e.code] = true;
      self.down[e.code] = true;

      // Stop the page scrolling out from under the game.
      if (PREVENT.has(e.code)) e.preventDefault();
    };

    this._onKeyUp = function (e) {
      self.down[e.code] = false;
    };

    // Losing focus must clear held keys, otherwise the ship thrusts forever.
    this._onBlur = function () {
      for (const k in self.down) self.down[k] = false;
      for (const k in self.pressed) self.pressed[k] = false;
      self.throttle = 0;
    };

    const t = target || global;
    t.addEventListener('keydown', this._onKeyDown, false);
    t.addEventListener('keyup', this._onKeyUp, false);
    t.addEventListener('blur', this._onBlur, false);
  }

  // Keys whose default browser behaviour (scrolling) must be suppressed.
  const PREVENT = new Set([
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space',
    'Tab', 'Slash', 'Quote', 'Comma', 'Period'
  ]);

  Input.prototype = {
    setHeld: function (code, held) {
      this.down[code] = held;
    },

    /** True while the key is held. */
    held: function (code) { return !!this.down[code]; },

    /** True only on the frame the key went down. */
    hit: function (code) { return !!this.pressed[code]; },

    /** Any of the given codes held. */
    anyHeld: function () {
      for (let i = 0; i < arguments.length; i++) {
        if (this.down[arguments[i]]) return true;
      }
      return false;
    },

    /** Clear one-frame presses; call at the end of each frame. */
    endFrame: function () {
      for (const k in this.pressed) this.pressed[k] = false;
    },

    /**
     * Read flight controls into a ship. Returns an object describing the
     * aggregated control state for the HUD.
     */
    applyTo: function (ship, ctx) {
      const ip = this.invertPitch ? -1 : 1;

      // --- Main engine ------------------------------------------------
      // W = prograde throttle, S = retrograde throttle.
      let keyboardThrottle = 0;
      if (this.held('KeyW')) keyboardThrottle += 1;
      if (this.held('KeyS')) keyboardThrottle -= 1;
      ship.throttle = keyboardThrottle || this.throttle;
      ship.afterburner = this.anyHeld('ShiftLeft', 'ShiftRight');

      // --- Attitude ---------------------------------------------------
      let pitch = 0;
      if (this.held('ArrowUp')) pitch += 1;
      if (this.held('ArrowDown')) pitch -= 1;
      ship.pitchCmd = Util.clamp(pitch * ip, -1, 1);

      let yaw = 0;
      if (this.held('KeyA')) yaw += 1;
      if (this.held('KeyD')) yaw -= 1;
      ship.yawCmd = Util.clamp(yaw, -1, 1);

      let roll = 0;
      if (this.held('KeyQ')) roll += 1;
      if (this.held('KeyE')) roll -= 1;
      ship.rollCmd = Util.clamp(roll, -1, 1);

      // --- Assist burns (held) ---------------------------------------
      ship.assistPrograde = this.held('KeyC');
      ship.assistRetrograde = this.held('KeyZ');
      ship.assistStop = this.held('KeyX');
      ship.assistMatch = this.held('Space') && !!(ctx && ctx.target);
    },

    detach: function (target) {
      const t = target || global;
      t.removeEventListener('keydown', this._onKeyDown, false);
      t.removeEventListener('keyup', this._onKeyUp, false);
      t.removeEventListener('blur', this._onBlur, false);
    }
  };

  global.Input = Input;
})(window);