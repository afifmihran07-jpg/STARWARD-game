/* =========================================================================
   game.js — mode switching, input routing and the fixed-step loop.

   Modes: BUILD (assemble), FLIGHT (fly the vehicle you built) and MAP (plan
   the next burn). Deep links: index.html?mode=FLIGHT&debug=1
   ========================================================================= */
import {Camera} from './camera.js';
import {Renderer} from './renderer.js?v=system-map-visual-20261023d';
import {createSolarSystem, updateOrbits} from './celestial/solarSystem.js?v=system-map-20261022';
import {Editor} from './construction/editor.js?v=rocket-build-visual-fix-20261023b';
import {symmetricParts} from './construction/symmetry.js';
import {Rocket} from './rocket/rocket.js';
import {snapPart} from './rocket/attachmentSystem.js';
import {PART_DEFINITIONS as D} from './rocket/partDefinitions.js';
import {loadSheet} from './rocket/partSprites.js';
import {terrainHeight} from './physics/collision.js';
import {createLaunchSite} from './flight/launchSite.js';
import {InputManager} from './flight/controls.js';
import {controlRocket} from './flight/flightController.js';
import {stepRocket, applyDeltaV} from './physics/physics.js';
import {orbitElements} from './physics/orbitalMechanics.js';
import {TrajectoryPredictor} from './trajectory/trajectoryPredictor.js';
import {ManeuverNode} from './trajectory/maneuverNode.js';
import {MissionManager, MISSIONS} from './missions/missionManager.js';
import {SaveManager} from './save/saveManager.js';
import {buildLibrary, updateBuildStats, getSelectedMissionProfile, setMissionProfile} from './ui/buildUI.js';
import {MISSION_PRESET_CONFIGS} from './construction/missionPresets.js';
import {updateFlightUI} from './ui/flightUI.js?v=flight-dashboard-replica-20261111';
import {updateBodyInfo, initBodyChips, initBodyFocusList, updateBridgeWarp} from './ui/mapUI.js?v=orbital-console-reference-20261023a';
import {selectBody, focusBody, fitSystem, fitBody, bodyOrder} from './map/spaceMap.js?v=orbital-console-reference-20261023a';

const WARP_STEPS = [1, 2, 5, 10, 25, 50, 100, 500, 1000, 2500, 10000];
// Flight integrates the vehicle every substep, so it stays on the slow end of
// the ladder; the SYSTEM MAP can safely run the whole system much faster.
const FLIGHT_WARP = 50;
const FLIGHT_ZOOM = [0.03, 60];
const MAP_ZOOM = [1e-12, 0.2];

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new Renderer(canvas);
    this.camera = new Camera(canvas);
    this.bodies = createSolarSystem();
    this.editor = new Editor();
    this.editor.loadStarter();
    this.input = new InputManager(canvas);
    this.predictor = new TrajectoryPredictor();
    this.node = new ManeuverNode();
    this.missions = new MissionManager();

    this.mode = 'BUILD';
    this.debug = false;
    this.paused = false;
    this.warp = 1;
    this.rocket = null;
    this.orbit = null;
    this.plannedPoints = [];
    this.selected = this.bodies[1];
    this.target = null;
    this.hover = null;
    this.mapCompressed = true;
    this.dragging = null;
    this.physicsSteps = 0;
    this.launches = 0;
    this.flightZoomScale = 1.2;
    this.flightReveal = 0;
    this.flash = null;
    this.atmosphereExitPulse = null;
    this.atmosphereExitAnnounced = false;

    this.acc = 0;
    this.last = performance.now();
    this.fps = 60;
    this.steps = 0;
    this.debugAccum = 0;

    this.bind();
    buildLibrary(this.editor);
    initBodyChips(this);
    initBodyFocusList(this);
    loadSheet();
    this.editor.fit(canvas.width, canvas.height);
    addEventListener('resize', () => {
      if (this.mode === 'BUILD') this.editor.fit(this.canvas.width, this.canvas.height);
    });

    const params = new URLSearchParams(location.search);
    if (params.get('debug') === '1') this.setDebug(true);
    const wanted = (params.get('mode') || 'BUILD').toUpperCase();
    this.setMode(wanted === 'MAP' ? 'MAP' : wanted === 'FLIGHT' ? 'FLIGHT' : 'BUILD');

    requestAnimationFrame(t => this.loop(t));
  }

  /* ------------------------------- wiring ------------------------------ */
  bind() {
    // Bind defensively: a missing optional control must never stop the game.
    const on = (sel, fn) => {
      const el = document.querySelector(sel);
      if (el) el.onclick = fn;
      return !!el;
    };

    document.querySelectorAll('[data-mode]').forEach(b => {
      b.onclick = () => this.setMode(b.dataset.mode);
    });

    on('#launchButton', () => this.launch());
    on('#stageButton', () => this.stage());
    on('#flightAbort', () => this.abortFlight());
    on('#mapButton', () => this.setMode(this.mode === 'MAP' ? 'FLIGHT' : 'MAP'));
    on('#starterRocket', () => {
      this.loadPresetRocket('starter');
    });

    on('#loadMissionRocket', () => {
      const profile = getSelectedMissionProfile();
      this.loadPresetRocket(profile);
    });

    const presetSelect = document.querySelector('#presetRocketSelect');
    if (presetSelect) {
      presetSelect.onchange = () => {
        const val = presetSelect.value;
        if (val) {
          this.loadPresetRocket(val);
          presetSelect.value = '';
        }
      };
    }

    on('#newGame', () => {
      this.editor = new Editor();
      buildLibrary(this.editor);
      this.editor.fit(this.canvas.width, this.canvas.height);
      this.rocket = null;
      this.node.clear();
      this.plannedPoints = [];
      updateBuildStats(new Rocket([]), this.editor);
      this.setMode('BUILD');
      this.toast('Blank custom rocket canvas ready');
    });

    on('#saveGame', () => SaveManager.save(this));
    on('#loadGame', () => SaveManager.load(this) || this.toast('No save found'));

    on('#debugButton', () => this.setDebug(!this.debug));

    on('#rotatePart', () => this.edit(() => this.editor.rotate()));
    on('#duplicatePart', () => this.edit(() => this.editor.duplicate()));
    on('#deletePart', () => this.edit(() => this.editor.remove()));
    on('#clearDesign', () => this.edit(() => this.editor.clear()));
    on('#undo', () => this.edit(() => this.editor.undo()));
    on('#redo', () => this.edit(() => this.editor.redo()));

    const throttle = document.querySelector('#throttle');
    if (throttle) {
      throttle.oninput = e => {
        if (this.rocket) {
          this.rocket.throttle = e.target.value / 100;
          updateFlightUI(this, this.orbit);
        }
      };
    }

    document.querySelectorAll('[data-node]').forEach(b => {
      b.onclick = () => {
        this.node.adjust(b.dataset.node === 'prograde' ? 1 : -1);
        this.planNode();
        updateBodyInfo(this);
      };
    });
    on('#clearNode', () => {
      this.node.clear();
      this.plannedPoints = [];
      updateBodyInfo(this);
    });
    on('#executeBurn', () => this.executeBurn());
    on('#mapFocus', () => focusBody(this, this.selected));
    on('#mapFit', () => fitSystem(this));
    on('#mapFitBody', () => fitBody(this, this.selected));
    on('#mapScale', () => {
      this.mapCompressed = !this.mapCompressed;
      const btn = document.querySelector('#mapScale');
      if (btn) btn.textContent = this.mapCompressed ? 'SCALE: COMPRESSED' : 'SCALE: TRUE';
      fitSystem(this);
      updateBodyInfo(this);
    });
    on('#mapTarget', () => {
      this.target = this.target ? null : this.selected;
      updateBodyInfo(this);
    });
    on('#mapLaunch', () => this.launch(this.selected));

    // Bottom bridge warp controls
    on('#warpMinus', () => { this.stepWarp(-1); });
    on('#warpPlus', () => { this.stepWarp(1); });

    // Right panel add node
    on('#addNodeBtn', () => {
      if (this.selected) {
        this.node.adjust(1);
        this.planNode();
        updateBodyInfo(this);
      }
    });

    on('#nextMission', () => {
      this.missions.index = (this.missions.index + 1) % MISSIONS.length;
      this.syncMission();
    });

    on('#helpToggle', () => {
      const help = document.querySelector('#help');
      if (help) help.hidden = !help.hidden;
    });

    document.querySelectorAll('[data-warp-step]').forEach(b => {
      b.onclick = () => this.stepWarp(Number(b.dataset.warpStep));
    });
    document.querySelectorAll('[data-warp-value]').forEach(b => {
      b.onclick = () => {
        const requested = WARP_STEPS.indexOf(Number(b.dataset.warpValue));
        const max = this.mode === 'FLIGHT' ? WARP_STEPS.indexOf(FLIGHT_WARP) : WARP_STEPS.length - 1;
        this.warp = WARP_STEPS[Math.max(0, Math.min(max, requested))];
        this.syncFlightTools();
      };
    });
    on('#pauseButton', () => { this.paused = !this.paused; });
    on('#mapPause', () => { this.paused = !this.paused; });

    this.canvas.addEventListener('pointerdown', e => this.onDown(e));
    this.canvas.addEventListener('pointermove', e => this.onMove(e));
    addEventListener('pointerup', () => this.onUp());
    this.canvas.addEventListener('pointerleave', () => {
      this.hover = null;
      if (this.mode === 'MAP') this.canvas.style.cursor = '';
    });

    // Double-click a body on the map to snap the camera onto it.
    this.canvas.addEventListener('dblclick', e => {
      if (this.mode !== 'MAP') return;
      const p = this.point(e);
      const body = selectBody(p.x, p.y, this);
      if (body) {
        this.selected = body;
        focusBody(this, body);
        updateBodyInfo(this);
      }
    });

    // Keep the arrow keys for cycling bodies instead of scrolling the page.
    addEventListener('keydown', e => {
      if (this.mode === 'MAP' &&
          ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code)) {
        e.preventDefault();
      }
    });
  }

  /**
   * Move the shared time warp one rung up or down. FLIGHT integrates the
   * vehicle directly, so it is capped at FLIGHT_WARP; the map may run the
   * whole system up to the top of the ladder.
   */
  stepWarp(delta) {
    const i = WARP_STEPS.indexOf(this.warp);
    const current = i >= 0 ? i : 0;
    const max = this.mode === 'FLIGHT' ? WARP_STEPS.indexOf(FLIGHT_WARP) : WARP_STEPS.length - 1;
    this.warp = WARP_STEPS[Math.max(0, Math.min(max, current + delta))];
  }

  /** Selection index helpers for keyboard navigation on the map. */
  cycleSelection(step) {
    const order = bodyOrder(this.bodies);
    const i = Math.max(0, order.indexOf(this.selected));
    this.selected = order[(i + step + order.length) % order.length];
    updateBodyInfo(this);
  }

  selectByIndex(i) {
    const order = bodyOrder(this.bodies);
    if (order[i]) {
      this.selected = order[i];
      updateBodyInfo(this);
    }
  }

  /** Load a pre-built rocket or clear to a custom canvas. */
  loadPresetRocket(presetKey) {
    if (presetKey === 'custom') {
      this.editor.clear();
      this.editor.fit(this.canvas.width, this.canvas.height);
      this.rocket = null;
      this.inspect();
      updateBuildStats(new Rocket([]), this.editor);
      this.setMode('BUILD');
      this.toast('Custom build canvas cleared — build your own rocket');
      return;
    }
    const config = MISSION_PRESET_CONFIGS[presetKey] || MISSION_PRESET_CONFIGS.starter;
    this.editor.loadPreset(presetKey);
    this.editor.fit(this.canvas.width, this.canvas.height);
    this.inspect();
    const rocket = new Rocket(this.editor.parts);
    if (config.missionProfile) {
      setMissionProfile(config.missionProfile);
    }
    updateBuildStats(rocket, this.editor);
    this.setMode('BUILD');
    this.toast(`Loaded ${config.label} (100% readiness)`);
  }

  /** Every build edit funnels through here so the read-outs stay in sync. */
  edit(fn) {
    fn();
    this.editor.fit(this.canvas.width, this.canvas.height);
    this.editor.ghost = null;
    this.inspect();
    updateBuildStats(new Rocket(this.editor.parts));
  }

  toast(text) {
    const el = document.querySelector('#toast');
    if (!el) return;
    el.textContent = text;
    el.hidden = false;
    clearTimeout(this._toast);
    this._toast = setTimeout(() => { el.hidden = true; }, 2600);
  }

  /* ------------------------------- input -------------------------------- */
  point(e) {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * this.canvas.width / r.width,
      y: (e.clientY - r.top) * this.canvas.height / r.height
    };
  }

  onDown(e) {
    const p = this.point(e);
    if (this.mode === 'BUILD') {
      const world = this.editor.grid.world(p, this.canvas.width, this.canvas.height);
      if (this.editor.pending) {
        const slot = this.editor.previewSlot(this.editor.pending, world) || world;
        const mirrors = Number((document.querySelector('#symmetry') || {value: 1}).value) || 1;
        this.edit(() => {
          this.editor.add(this.editor.pending, slot.x, slot.y);
          if (mirrors > 1) {
            this.editor.parts.push(...symmetricParts(this.editor.pending, slot.x, slot.y, mirrors).slice(1));
          }
          this.editor.pending = null;
        });
        document.querySelectorAll('.part.is-active').forEach(el => el.classList.remove('is-active'));
      } else {
        const hit = this.editor.hit(world.x, world.y);
        this.editor.selected = hit;
        if (hit) this.editor.commit();
        this.dragging = hit ? {part: hit, moved: false} : null;
        this.inspect();
      }
      return;
    }

    if (this.mode === 'MAP') {
      const body = selectBody(p.x, p.y, this);
      if (body) {
        this.selected = body;
        updateBodyInfo(this);
      } else {
        this.camera.beginDrag(p.x, p.y);
      }
    }
  }

  onMove(e) {
    const p = this.point(e);
    if (this.mode === 'BUILD') {
      if (this.editor.pending) {
        this.editor.ghost = this.editor.preview(this.editor.pending, p, this.canvas.width, this.canvas.height);
      }
      if (this.dragging && this.input.mouse.down) {
        const world = this.editor.grid.world(p, this.canvas.width, this.canvas.height);
        this.dragging.part.x = world.x;
        this.dragging.part.y = world.y;
        this.dragging.moved = true;
      }
    }
    if (this.mode === 'MAP') {
      this.hover = this.camera.drag ? null : selectBody(p.x, p.y, this);
      this.canvas.style.cursor = this.camera.drag ? 'grabbing'
        : (this.hover ? 'pointer' : 'grab');
    } else if (this.canvas.style.cursor) {
      this.canvas.style.cursor = '';
    }
    if (this.camera.drag) this.camera.dragTo(p.x, p.y);
  }

  onUp() {
    if (this.dragging) {
      const part = this.dragging.part;
      if (this.dragging.moved) {
        snapPart(part, this.editor.parts.filter(p => p !== part));
        this.editor.fit(this.canvas.width, this.canvas.height);
        updateBuildStats(new Rocket(this.editor.parts));
      }
      this.dragging = null;
    }
    this.camera.endDrag();
  }

  /* -------------------------------- modes ------------------------------ */
  setMode(mode) {
    this.mode = mode;
    // Publish the mode on <body> (data-ui-mode, NOT data-mode — the tab
    // buttons own [data-mode] and must stay the only matches) so the
    // stylesheet can gate each docked dashboard per mode.
    document.body.dataset.uiMode = mode.toLowerCase();
    document.body.classList.toggle('map-mode', mode === 'MAP');
    if (mode !== 'FLIGHT') {
      document.body.classList.remove('mission-tools-open');
      const missionToggle = document.querySelector('#missionDockToggle');
      if (missionToggle) {
        missionToggle.setAttribute('aria-expanded', 'false');
        const label = missionToggle.querySelector('span');
        if (label) label.textContent = '+';
      }
    }
    document.querySelectorAll('[data-mode]').forEach(b =>
      b.classList.toggle('active', b.dataset.mode === mode));
    this.hover = null;
    this.canvas.style.cursor = mode === 'MAP' ? 'grab' : '';

    const show = (sel, on) => {
      const el = document.querySelector(sel);
      if (el) el.style.display = on ? '' : 'none';
    };
    show('#partsPanel', mode === 'BUILD');
    show('#inspector', mode === 'BUILD');
    show('#buildStats', mode === 'BUILD');
    show('#missionDesign', mode === 'BUILD');
    show('#missionPanel', mode === 'FLIGHT');
    show('#hud', mode === 'FLIGHT');
    show('#flightTools', mode === 'FLIGHT');
    const mapInfo = document.querySelector('#mapInfo');
    if (mapInfo) mapInfo.hidden = mode !== 'MAP';
    const bodyFocus = document.querySelector('#bodyFocusPanel');
    if (bodyFocus) bodyFocus.hidden = mode !== 'MAP';
    const bottomBridge = document.querySelector('#bottomTelemetryBridge');
    if (bottomBridge) bottomBridge.hidden = mode !== 'MAP';
    const canvas = document.querySelector('#gameCanvas');
    if (canvas) {
      if (mode === 'MAP') canvas.classList.add('map-view');
      else canvas.classList.remove('map-view');
    }

    if (mode === 'BUILD') {
      this.camera.target = null;
      this.editor.fit(this.canvas.width, this.canvas.height);
      updateBuildStats(new Rocket(this.editor.parts));
    }
    if (mode === 'FLIGHT') {
      if (this.warp > FLIGHT_WARP) {
        this.warp = FLIGHT_WARP;
        this.toast('Time warp limited to ' + FLIGHT_WARP + '× while flying');
      }
      if (!this.rocket || this.rocket.crashed) {
        this.launch();
        // launch() can reject an empty or invalid design. Don't leave the
        // application in a flight scene with no vehicle and no useful
        // dashboards; return to the build workspace so the design can be fixed.
        if (!this.rocket || this.rocket.crashed) {
          this.setMode('BUILD');
          return;
        }
      }
      this.camera.limits(FLIGHT_ZOOM[0], FLIGHT_ZOOM[1]);
      this.updateFlightCamera(true);
      this.syncMission();
    }
    if (mode === 'MAP') {
      this.camera.limits(MAP_ZOOM[0], MAP_ZOOM[1]);
      this.camera.target = null;
      if (!this.selected) this.selected = this.bodies[1];
      // Give the first map visit the same Earth-to-Mars planning context as
      // the reference console. A user can clear or replace this target as usual.
      if (!this.mapTargetInitialized) {
        this.target = this.bodies.find(body => body.id === 'mars') || null;
        this.mapTargetInitialized = true;
      }
      fitSystem(this);
      updateBodyInfo(this);
    }
  }

  updateFlightCamera(immediate = false, dt = 1 / 60) {
    const rocket = this.rocket;
    if (!rocket) return;
    // Keep the chase zoom tied to the vehicle, not its distance from the
    // ground. This preserves the stable close framing throughout ascent.
    const frameHeight = rocket.heightMeters + 120;
    const desiredZoom = Math.max(FLIGHT_ZOOM[0], Math.min(FLIGHT_ZOOM[1],
      this.canvas.height * 0.72 / frameHeight * this.flightZoomScale));

    if (immediate) {
      this.camera.setZoom(desiredZoom);
    } else {
      this.camera.setZoom(this.camera.zoom +
        (desiredZoom - this.camera.zoom) * Math.min(1, dt * 2));
    }
    this.flightReveal = 0;
    this.camera.focus(rocket.position.x, rocket.position.y);
    this.camera.target = {x: rocket.position.x, y: rocket.position.y};
  }

  abortFlight() {
    if (this.rocket) this.rocket.throttle = 0;
    this.warp = 1;
    this.paused = false;
    this.setMode('BUILD');
    this.toast('Flight aborted');
  }

  checkAtmosphereExit(body, previousAltitude) {
    const rocket = this.rocket;
    const top = body && body.atmosphere && body.atmosphere.height;
    if (!rocket || !top || this.atmosphereExitAnnounced || rocket.landed || !rocket.hasFlown) return;
    const altitude = rocket.altitudeAboveSurface(body);
    if (previousAltitude >= top || altitude < top) return;

    this.atmosphereExitAnnounced = true;
    const now = performance.now();
    const name = body.id === 'earth' ? 'EARTH' : body.name.toUpperCase();
    this.flash = {
      title: name + "'S ATMOSPHERE",
      sub: 'EXITED · SPACE ACHIEVED',
      at: now,
      until: now + 5200
    };
    this.atmosphereExitPulse = {at: now, until: now + 2600};
    this.toast("You've left " + body.name + "'s atmosphere");
  }

  inspect() {
    const el = document.querySelector('#selectedInfo');
    if (!el) return;
    const p = this.editor.selected;
    const def = p ? D[p.type] : null;
    if (!p || !def) {
      el.textContent = 'Select a component';
      return;
    }
    el.innerHTML = '<b>' + def.name + '</b><small>' + def.category + ' · ' + def.mass + ' kg</small>' +
      '<small>drag to move · R rotate · DEL remove</small>';
  }

  syncMission() {
    const m = this.missions.current;
    const name = document.querySelector('#missionName');
    const objective = document.querySelector('#missionObjective');
    if (name) name.textContent = m.name;
    if (objective) objective.textContent = m.objective;
  }

  /* ------------------------------- flight ------------------------------ */

  /** Put the designed vehicle on a pad and start the clock. */
  launch(body) {
    const pad = body || this.bodies.find(b => b.id === 'earth') || this.bodies[1];
    const rocket = new Rocket(this.editor.parts);
    if (!rocket.parts.length) {
      this.toast('Nothing to launch — add parts first');
      return;
    }
    if (!rocket.engines.length) {
      this.toast('No engine fitted — the vehicle cannot fly');
      return;
    }

    // Stack height in metres, measured from the pad up to the nose.
    const surfaceR = pad.radius + terrainHeight(Math.PI / 2, pad);
    rocket.launchSite = createLaunchSite(pad, Math.PI / 2, terrainHeight(Math.PI / 2, pad));
    // The sim's planets translate but do not spin, so the pad inherits the
    // body's velocity verbatim — no rotation term, or the stack slides away.
    const support = rocket.supportExtent(0, 1);
    rocket.position = {x: pad.position.x, y: pad.position.y + surfaceR + support};
    rocket.velocity = {x: pad.velocity.x, y: pad.velocity.y};
    rocket.angle = 0;
    rocket.throttle = 0;
    rocket.stageIndex = -1;
    rocket.landed = true;
    rocket.crashed = false;
    rocket.refresh();
    rocket.primaryBody = pad;
    rocket.body = pad;

    this.rocket = rocket;
    this.flightReveal = 0;
    this.flash = null;
    this.atmosphereExitPulse = null;
    this.atmosphereExitAnnounced = false;
    this.launches++;
    this.orbit = orbitElements(rocket.position, rocket.velocity, pad);
    this.plannedPoints = [];
    this.node.clear();

    const cam = this.camera;
    cam.limits(FLIGHT_ZOOM[0], FLIGHT_ZOOM[1]);
    this.flightZoomScale = 1.2;
    this.updateFlightCamera(true);
    this.setMode('FLIGHT');
    this.syncMission();
    updateFlightUI(this, this.orbit);
    this.toast('On the pad — set throttle, then press SPACE to ignite');
  }

  stage() {
    const rocket = this.rocket;
    if (!rocket || rocket.crashed) return;
    const lit = rocket.nextStage();
    if (!lit) {
      this.toast('All stages used');
      return;
    }
    this.predictor.last = 0;
    updateBuildStats(new Rocket(this.editor.parts));
    updateFlightUI(this, this.orbit);
  }

  /** Recompute the cyan "planned burn" path from the current node. */
  planNode() {
    if (!this.rocket || !this.node.active || !this.node.deltaV) {
      this.plannedPoints = [];
      return;
    }
    this.plannedPoints = this.predictor.plan(this.rocket, this.bodies, this.node.deltaV);
  }

  executeBurn() {
    if (!this.rocket || !this.node.active || !this.node.deltaV) {
      this.toast('No maneuver armed');
      return;
    }
    applyDeltaV(this.rocket, this.node.deltaV);
    this.toast('Burn executed: ' + Math.round(this.node.deltaV) + ' m/s');
    this.node.clear();
    this.plannedPoints = [];
    this.predictor.last = 0;
    updateBodyInfo(this);
  }

  setDebug(on) {
    this.debug = !!on;
    const panel = document.querySelector('#debug');
    if (panel) panel.hidden = !this.debug;
    const btn = document.querySelector('#debugButton');
    if (btn) btn.classList.toggle('active', this.debug);
  }

  /* -------------------------------- loop -------------------------------- */
  keys() {
    const input = this.input;
    // One-shot keys use key EDGES (recorded by InputManager on keydown), so a
    // press fires exactly once — and a fast tap between frames is not lost.
    const hit = (k) => input.pressedOnce(k);

    if (hit('F3')) this.setDebug(!this.debug);
    if (hit('KeyM')) this.setMode(this.mode === 'MAP' ? 'FLIGHT' : 'MAP');
    if (hit('KeyP')) this.paused = !this.paused;
    if (hit('Slash')) {
      this.toast('W/S throttle · A/D steer · SPACE stage · M map · P pause · , . time warp · arrows cycle map targets');
    }

    if (hit('Comma') || hit('BracketLeft')) this.stepWarp(-1);
    if (hit('Period') || hit('BracketRight')) this.stepWarp(1);

    if (this.mode === 'BUILD') {
      if (hit('KeyR')) this.edit(() => this.editor.rotate());
      if (hit('Delete') || hit('Backspace')) this.edit(() => this.editor.remove());
      if (hit('KeyZ') && (input.ctrl || input.meta)) this.edit(() => this.editor.undo());
      if (hit('KeyY') && (input.ctrl || input.meta)) this.edit(() => this.editor.redo());
      if (hit('Escape')) {
        this.editor.pending = null;
        this.editor.ghost = null;
        document.querySelectorAll('.part.is-active').forEach(el => el.classList.remove('is-active'));
      }
    }

    if (this.mode === 'MAP') {
      // ←/→ (or ↑/↓) walk the system in orbital order, 1–9 jump straight in.
      if (hit('ArrowRight') || hit('ArrowDown')) this.cycleSelection(1);
      if (hit('ArrowLeft') || hit('ArrowUp')) this.cycleSelection(-1);
      for (let n = 1; n <= 9; n++) {
        if (hit('Digit' + n)) this.selectByIndex(n - 1);
      }
      if (hit('KeyF')) focusBody(this, this.selected);
      if (hit('KeyT')) {
        this.target = this.target ? null : this.selected;
        updateBodyInfo(this);
      }
      if (hit('Escape')) {
        this.target = null;
        updateBodyInfo(this);
      }
    }

    if (this.mode === 'FLIGHT' && this.rocket && hit('KeyT')) {
      this.rocket.sas = !this.rocket.sas;
      updateFlightUI(this, this.orbit);
    }

    if (this.mode === 'FLIGHT' && this.rocket && hit('Space')) this.stage();

    // Discard edges belonging to keys no active mode cared about, so a press
    // made in one mode cannot fire when its mode is re-entered.
    input.edges.clear();
  }

  loop(now) {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.fps += (1 / Math.max(dt, 0.0001) - this.fps) * 0.08;
    this.acc += dt;
    this.steps = 0;
    while (this.acc >= 1 / 60) {
      this.update(1 / 60);
      this.acc -= 1 / 60;
      this.steps++;
    }

    const wheel = this.input.consumeWheel();
    if (wheel) {
      if (this.mode === 'MAP') this.camera.wheelAt(wheel, this.input.mouse.x, this.input.mouse.y);
      else if (this.mode === 'FLIGHT') {
        this.flightZoomScale = Math.max(0.25, Math.min(4,
          this.flightZoomScale * (wheel < 0 ? 1.18 : 1 / 1.18)));
      }
    }
    if (this.mode === 'FLIGHT' && this.rocket) this.updateFlightCamera(false, dt);
    this.camera.update(dt);

    this.debugAccum += dt;
    if (this.debug && this.debugAccum > 0.25) {
      this.debugAccum = 0;
      this.paintDebugPanel();
    }

    this.renderer.frame(this);
    requestAnimationFrame(t => this.loop(t));
  }

  update(dt) {
    this.keys();
    this.syncFlightTools();

    // More substeps keep the integrator honest when the map runs the whole
    // system at thousands of × — the total simulated time is dt * warp.
    if (this.mode === 'BUILD') {
      updateOrbits(this.bodies, dt);
    } else if (!this.paused) {
      const substeps = Math.min(this.warp, 60);
      const sdt = (dt * this.warp) / substeps;

      for (let i = 0; i < substeps; i++) {
        updateOrbits(this.bodies, sdt);
        if (this.rocket) {
          const flightBody = this.rocket.body || this.rocket.primaryBody;
          const previousAltitude = flightBody ? this.rocket.altitudeAboveSurface(flightBody) : 0;
          controlRocket(this.rocket, this.input, sdt);
          stepRocket(this.rocket, this.bodies, sdt);
          if (flightBody) this.checkAtmosphereExit(flightBody, previousAltitude);
          this.physicsSteps++;
        }
      }

      if (this.rocket) {
        this.orbit = orbitElements(this.rocket.position, this.rocket.velocity, this.rocket.body);
        this.predictor.update(this.rocket, this.bodies, performance.now());
        if (this.node.active) this.planNode();
        updateFlightUI(this, this.orbit);
      }
    }

    if (this.mode === 'MAP' && this.rocket) {
      this.predictor.update(this.rocket, this.bodies, performance.now());
      if (this.node.active) this.planNode();
    }

    if (this.mode === 'MAP') {
      // Keep the side panel's live figures (range, distance from the Sun)
      // fresh without rebuilding the DOM on every frame.
      this.infoAccum = (this.infoAccum || 0) + dt;
      if (this.infoAccum > 0.25) {
        this.infoAccum = 0;
        updateBodyInfo(this);
        updateBridgeWarp(this);
      }
    }

    if (this.mode === 'BUILD' && this.editor.pending) {
      this.editor.ghost = this.editor.preview(this.editor.pending, this.input.mouse,
        this.canvas.width, this.canvas.height);
    }
  }

  syncFlightTools() {
    const warp = document.querySelector('#warpValue');
    if (warp) warp.textContent = this.warp + '\u00D7';
    const mapWarp = document.querySelector('#mapWarpValue');
    if (mapWarp) mapWarp.textContent = this.warp + '\u00D7';
    const pause = document.querySelector('#pauseButton');
    if (pause) {
      pause.classList.toggle('active', this.paused);
      pause.textContent = this.paused ? 'RESUME [P]' : 'PAUSE [P]';
    }
    const mapPause = document.querySelector('#mapPause');
    if (mapPause) {
      mapPause.classList.toggle('active', this.paused);
      mapPause.textContent = this.paused ? '▶' : 'Ⅱ';
    }
    document.querySelectorAll('[data-warp-value]').forEach(b =>
      b.classList.toggle('is-active', Number(b.dataset.warpValue) === this.warp));
  }

  paintDebugPanel() {
    const panel = document.querySelector('#debug');
    if (!panel) return;
    const r = this.rocket;
    const lines = [
      'mode      ' + this.mode + (this.paused ? ' (paused)' : ''),
      'fps       ' + this.fps.toFixed(0) + '   steps/frame ' + this.steps + '   warp ' + this.warp + 'x',
      'parts     ' + this.editor.parts.length + '   grid ' + this.editor.grid.scale.toFixed(1) + ' px/unit',
      'camera    x ' + this.camera.x.toFixed(0) + '  y ' + this.camera.y.toFixed(0) +
        '  zoom ' + this.camera.zoom.toExponential(2),
      'bodies    ' + this.bodies.length + '   selected ' + (this.selected ? this.selected.name : '—'),
      'predict   ' + this.predictor.points.length + ' pts in ' + this.predictor.ms.toFixed(1) + ' ms'
    ];
    if (r) {
      const shipScreen = this.camera.worldToScreen(r.position.x, r.position.y);
      const dx = r.position.x - r.body.position.x;
      const dy = r.position.y - r.body.position.y;
      const angle = Math.atan2(dy, dx);
      const surfaceRadius = r.body.radius + terrainHeight(angle, r.body);
      const groundScreen = this.camera.worldToScreen(
        r.body.position.x + Math.cos(angle) * surfaceRadius,
        r.body.position.y + Math.sin(angle) * surfaceRadius
      );
      lines.push('vehicle   alt ' + (r.altitudeAboveSurface(r.body) / 1000).toFixed(2) + ' km   v ' +
        Math.hypot(r.velocity.x - r.body.velocity.x, r.velocity.y - r.body.velocity.y).toFixed(0) +
        ' m/s (rel)   mass ' + (r.mass / 1000).toFixed(2) + ' t');
      lines.push('screen    ship ' + shipScreen.x.toFixed(0) + ',' + shipScreen.y.toFixed(0) +
        '   ground ' + groundScreen.x.toFixed(0) + ',' + groundScreen.y.toFixed(0));
      lines.push('stage     ' + (r.stageIndex + 1) + '/' + r.groups.length + '   fuel ' +
        r.currentFuel.toFixed(0) + '/' + r.currentCapacity.toFixed(0) + ' kg   angle ' +
        (r.angle * 180 / Math.PI).toFixed(0) + '°' +
        (r.crashed ? '   CRASHED' : '') + (r.landed ? '   LANDED' : ''));
    }
    panel.textContent = lines.join('\n');
  }
}









