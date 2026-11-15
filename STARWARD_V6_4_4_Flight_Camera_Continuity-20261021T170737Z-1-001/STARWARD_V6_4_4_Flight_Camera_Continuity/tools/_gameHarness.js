/* Shared test helper (not a test): a minimal DOM/browser stub plus a Game
 * built from its prototype, so DOM-free Node tests can drive the REAL
 * js/game.js methods. No layout or rendering happens. */
export const elements = new Map();

export const stubElement = id => ({
  id, textContent: '', innerHTML: '', hidden: false, disabled: false, value: '',
  dataset: {}, scrollTop: 0, scrollHeight: 500, onclick: null, title: '', className: '',
  style: {setProperty() {}},
  classList: {toggle() {}, add() {}, remove() {}, contains: () => false},
  attrs: {},
  setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
  addEventListener() {}, focus() {},
  appendChild: n => n, append() {}, remove() {},
  querySelector: () => null, querySelectorAll: () => [],
  replaceChildren(...nodes) { this.textContent = nodes.map(n => typeof n === 'string' ? n : '\n').join(''); }
});

/** Stub element for an id selector, created on first use. */
export function element(id) {
  if (!elements.has(id)) elements.set(id, stubElement(id));
  return elements.get(id);
}

export function installDomStub() {
  globalThis.document = {
    querySelector: sel => (/^#[\w-]+$/.test(sel) ? element(sel.slice(1)) : null),
    querySelectorAll: () => [],
    createElement: () => stubElement(null),
    body: {dataset: {}, classList: {toggle() {}, add() {}, remove() {}, contains: () => false}},
    activeElement: null
  };
  globalThis.location = {search: ''};
  globalThis.addEventListener = () => {};
  globalThis.requestAnimationFrame = () => 0;
  if (!globalThis.localStorage) {
    const store = new Map();
    globalThis.localStorage = {setItem: (k, v) => store.set(k, v), getItem: k => store.get(k) || null};
  }
}

installDomStub();

const {Game} = await import('../js/game.js');
const {Editor} = await import('../js/construction/editor.js');
const {createSolarSystem} = await import('../js/celestial/solarSystem.js');
const {MissionManager} = await import('../js/missions/missionManager.js');
const {ManeuverNode} = await import('../js/trajectory/maneuverNode.js');
const {TrajectoryPredictor} = await import('../js/trajectory/trajectoryPredictor.js');

/** A Game with real state objects and stubbed canvas/camera/input. */
export function makeGame(options = {}) {
  const g = Object.create(Game.prototype);
  const pressed = new Set();
  Object.assign(g, {
    canvas: {width: 1280, height: 720, style: {}, classList: {add() {}, remove() {}}},
    camera: {zoom: 1, x: 0, y: 0, limits() {}, setZoom(z) { this.zoom = z; }, focus() {}, update() {}},
    bodies: createSolarSystem(), editor: new Editor(),
    input: {
      pressed: k => pressed.has(k), pressedOnce: () => false, edges: new Set(),
      mouse: {x: 0, y: 0, down: false}, keys: pressed
    },
    predictor: new TrajectoryPredictor(), node: new ManeuverNode(), missions: new MissionManager(),
    mode: 'BUILD', debug: false, paused: false, warp: 1, rocket: null, orbit: null, plannedPoints: [],
    flightZoomScale: 1.2, flightReveal: 0, launches: 0, physicsSteps: 0,
    missionOperations: null, deployedSpacecraft: null, spacecraftOrbit: null, missionLaunchRecord: null,
    opsAccum: 0, seededTestOrbit: false
  }, options);
  g.camera.canvas = Object.assign(g.canvas, {clientWidth: g.canvas.width, clientHeight: g.canvas.height});
  g.selected = g.bodies[1];
  g.toasts = [];
  g.toast = msg => { g.toasts.push(msg); };
  return g;
}

/** Advance the real game loop (update() runs the physics substeps). */
export function run(g, seconds) {
  for (let i = 0; i < Math.round(seconds * 60); i++) g.update(1 / 60);
}
