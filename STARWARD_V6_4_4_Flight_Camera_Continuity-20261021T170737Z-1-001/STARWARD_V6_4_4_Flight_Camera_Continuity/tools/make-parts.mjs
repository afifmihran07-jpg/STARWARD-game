/* =========================================================================
   make-parts.mjs — generates the part artwork in assets/parts/.

     node tools/make-parts.mjs

   One SVG per part, named <partId>.svg, authored at EXACTLY that part's
   build aspect (viewBox = width x height in build units) so the renderer
   can stretch it into the part's slot without distorting it — which is what
   shared, square-canvas artwork could never do.

   Style: clean flat vector in the Spaceflight Simulator idiom — light
   grey/white bodies with soft cylinder shading, darker end caps, thin soft
   edges (no heavy ink outlines) and a functional accent colour per part.
   All geometry here is original and drawn from scratch.

   Every shape deliberately touches all four viewBox edges: a part must fill
   its slot so stacked rockets read as one continuous vehicle.
   ========================================================================= */
import {writeFileSync, mkdirSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {PART_DEFINITIONS} from '../js/rocket/partDefinitions.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'assets', 'parts');
const UNITS = 200;              // viewBox units per build unit

/* ------------------------------- palette -------------------------------- */
const P = {
  edge: '#5f6b76',
  ink: '#333c45',
  body: '#eef3f6',
  bodyDim: '#cfd8de',
  cap: '#7f8b96',
  capDark: '#5a646e',
  steel: '#aeb9c1',
  steelDark: '#77828c',
  dark: '#3d464f',
  darker: '#2a323a',
  glass: '#5fa4dc',
  glassDeep: '#2c6fae',
  gold: '#e8c561',
  goldDeep: '#b08d2c',
  orange: '#e4762f',
  red: '#c8483c',
  blue: '#2f6bb5',
  blueDeep: '#1f4a85',
  cell: '#26467a',
  cellLine: '#5b8ed0',
  green: '#4fae6a',
  white: '#ffffff'
};

/* Shared gradients (objectBoundingBox, so one definition fits every shape). */
const DEFS = [
  // horizontal — reads as a lit cylinder
  ['cyl', [[0, '#8b98a4'], [0.1, '#d8e1e8'], [0.3, '#ffffff'], [0.52, '#f0f4f7'], [0.78, '#c4ced6'], [1, '#83909c']]],
  ['cylSoft', [[0, '#a7b3bd'], [0.22, '#eef3f6'], [0.5, '#ffffff'], [0.76, '#dfe7ec'], [1, '#9aa7b2']]],
  ['cap', [[0, '#58626c'], [0.18, '#98a4ae'], [0.44, '#c8d1d8'], [0.72, '#8d99a3'], [1, '#525c66']]],
  ['steelV', [[0, '#dde4e9'], [0.45, '#adb8c0'], [1, '#7d8993']]],
  ['noz', [[0, '#9ba6af'], [0.3, '#6a757e'], [0.7, '#454e57'], [1, '#2b323a']]],
  ['darkV', [[0, '#4d5760'], [0.5, '#3a434b'], [1, '#272e35']]],
  ['glassV', [[0, '#b6dcfa'], [0.4, '#5fa4dc'], [1, '#2c6fae']]],
  ['cellH', [[0, '#1d3763'], [0.5, '#2d5693'], [1, '#1b3358']]],
  ['goldV', [[0, '#f3dd95'], [0.5, '#d7b04f'], [1, '#a67f1e']]],
  ['orangeV', [[0, '#f39a4d'], [0.5, '#e4762f'], [1, '#bd5a1e']]],
  ['redV', [[0, '#d96a5c'], [1, '#a63a30']]],
  ['whiteV', [[0, '#ffffff'], [0.55, '#f1f5f8'], [1, '#ccd5dc']]]
].map(([id, stops]) =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">` +
  stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('') +
  `</linearGradient>`).concat([
  `<linearGradient id="cylH" x1="0" y1="0" x2="1" y2="0">` +
  [[0, '#8b98a4'], [0.1, '#d8e1e8'], [0.3, '#ffffff'], [0.52, '#f0f4f7'], [0.78, '#c4ced6'], [1, '#83909c']]
    .map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('') + `</linearGradient>`
]);

/* ------------------------------- helpers -------------------------------- */
const f = n => (Math.round(n * 100) / 100).toString();
const attr = o => Object.entries(o).map(([k, v]) => ` ${k}="${v}"`).join('');
const rect = (x, y, w, h, fill, o = {}) =>
  `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="${fill}"${attr(o)}/>`;
const rrect = (x, y, w, h, r, fill, o = {}) =>
  `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${f(r)}" ry="${f(r)}" fill="${fill}"${attr(o)}/>`;
const poly = (pts, fill, o = {}) =>
  `<polygon points="${pts.map(p => `${f(p[0])},${f(p[1])}`).join(' ')}" fill="${fill}"${attr(o)}/>`;
const path = (d, fill, o = {}) => `<path d="${d}" fill="${fill}"${attr(o)}/>`;
const ell = (cx, cy, rx, ry, fill, o = {}) =>
  `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(Math.max(0, rx))}" ry="${f(Math.max(0, ry))}" fill="${fill}"${attr(o)}/>`;
const circ = (cx, cy, r, fill, o = {}) =>
  `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(Math.max(0, r))}" fill="${fill}"${attr(o)}/>`;
const line = (x1, y1, x2, y2, stroke, w, o = {}) =>
  `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${stroke}" stroke-width="${f(w)}"${attr(o)}/>`;

/** Soft edge stroke shared by every part (replaces the old heavy ink line). */
const edge = (c, w = 1) => ({
  stroke: P.edge, 'stroke-width': f(c.sw * w), 'stroke-linejoin': 'round', 'stroke-linecap': 'round'
});

/** `c` carries the geometry every draw function needs. */
const ART = {};

/* ------------------------------ COMMAND --------------------------------- */
function pod(c, {capsules = 1, base = 0.14}) {
  const {W, H, sw} = c;
  const top = H * 0.07, shield = H * base;
  let s = '';
  // Heat-shield / base skirt — full width, so the part seats on the stack.
  s += rrect(0, H - shield, W, shield, shield * 0.35, 'url(#darkV)', edge(c));
  // Pressure vessel: narrow shoulders flaring to full width at the base.
  s += poly([[W * 0.3, top], [W * 0.7, top], [W, H - shield * 0.9], [0, H - shield * 0.9]],
    'url(#cyl)', edge(c));
  // Docking ring at the tip.
  s += rrect(W * 0.3, 0, W * 0.4, top * 1.2, top * 0.4, 'url(#cap)', edge(c));
  // Porthole(s).
  const wy = top + (H - shield - top) * 0.42;
  const rx = W * (capsules > 1 ? 0.14 : 0.17), ry = H * 0.1;
  const spots = capsules > 1 ? [0.34, 0.66] : [0.5];
  for (const sx of spots) {
    s += ell(W * sx, wy, rx, ry, 'url(#glassV)', edge(c, 0.8));
    s += ell(W * sx - rx * 0.3, wy - ry * 0.35, rx * 0.28, ry * 0.26, 'rgba(255,255,255,.75)');
  }
  // Seam between crew compartment and heat shield.
  s += line(0, H - shield * 0.9, W, H - shield * 0.9, 'rgba(40,50,60,.35)', sw * 0.7);
  return s;
}
ART.capsule = c => pod(c, {capsules: 1});
ART.largeCapsule = c => pod(c, {capsules: 2, base: 0.16});

ART.probeCore = c => {
  const {W, H, sw} = c;
  let s = '';
  s += rrect(0, H * 0.12, W, H * 0.76, H * 0.1, 'url(#cyl)', edge(c));
  s += rect(0, 0, W, H * 0.13, 'url(#darkV)', edge(c));      // avionics deck
  s += rect(0, H * 0.87, W, H * 0.13, 'url(#darkV)', edge(c)); // base
  s += circ(W * 0.32, H * 0.5, Math.min(W, H) * 0.13, 'url(#glassV)', edge(c, 0.8));
  s += rect(W * 0.55, H * 0.36, W * 0.28, H * 0.28, P.cap, {stroke: P.edge, 'stroke-width': f(sw * 0.8)});
  s += line(W * 0.6, H * 0.46, W * 0.78, H * 0.46, 'rgba(255,255,255,.6)', sw * 0.7);
  s += line(W * 0.6, H * 0.56, W * 0.78, H * 0.56, 'rgba(255,255,255,.35)', sw * 0.7);
  return s;
};

/* -------------------------------- FUEL ---------------------------------- */
function tank(c, {stripe, seams = 0}) {
  const {W, H, sw} = c;
  const capH = Math.min(H * 0.075, W * 0.14);
  let s = rect(0, 0, W, H, 'url(#cyl)', edge(c));
  s += rect(0, 0, W, capH, 'url(#cap)', edge(c));
  s += rect(0, H - capH, W, capH, 'url(#cap)', edge(c));
  const inner = H - capH * 2;
  for (let i = 1; i <= seams; i++) {
    const y = capH + (inner * i) / (seams + 1);
    s += line(0, y, W, y, 'rgba(60,72,84,.32)', sw * 0.8);
  }
  if (stripe) {
    const sh = Math.max(H * 0.035, sw * 1.6);
    const y = capH + inner * 0.22;
    s += rect(0, y, W, sh, stripe);
    s += rect(0, y + sh, W, sh * 0.35, 'rgba(30,40,50,.25)');
  }
  return s;
}
ART.smallTank = c => tank(c, {});
ART.shortTank = c => tank(c, {stripe: 'url(#goldV)'});
ART.mediumTank = c => tank(c, {stripe: P.blue, seams: 1});
ART.wideTank = c => tank(c, {stripe: 'url(#orangeV)', seams: 1});
ART.largeTank = c => tank(c, {stripe: P.blue, seams: 2});
ART.hugeTank = c => tank(c, {stripe: 'url(#orangeV)', seams: 3});

/* -------------------------------- ENGINE -------------------------------- */
function engine(c, {bell = 0.92, accent = P.orange, nozzle = 0.05}) {
  const {W, H, sw} = c;
  const cx = W / 2;
  const plate = Math.min(H * 0.12, W * 0.1);
  const blockH = H * 0.2;
  const y0 = plate + blockH * 0.55;
  const yT = H * (0.42 + nozzle);
  const hw0 = W * 0.15, hwT = W * 0.115, hwE = (W * bell) / 2;
  let s = rect(0, 0, W, plate, 'url(#darkV)', edge(c));                 // mount plate
  s += rrect(cx - W * 0.22, plate, W * 0.44, blockH, sw * 1.4, 'url(#steelV)', edge(c)); // turbopump
  s += rect(cx - W * 0.3, plate + blockH * 0.28, W * 0.6, H * 0.05, 'url(#orangeV)');    // accent collar
  // Chamber, throat and bell.
  const bellPath =
    `M${f(cx - hw0)},${f(y0)} L${f(cx - hwT)},${f(yT)}` +
    ` Q${f(cx - hwE * 0.92)},${f(yT + (H - yT) * 0.55)} ${f(cx - hwE)},${f(H)}` +
    ` L${f(cx + hwE)},${f(H)}` +
    ` Q${f(cx + hwE * 0.92)},${f(yT + (H - yT) * 0.55)} ${f(cx + hwT)},${f(yT)}` +
    ` L${f(cx + hw0)},${f(y0)} Z`;
  s += path(bellPath, 'url(#noz)', edge(c));
  // Exit plane reads as an opening.
  s += ell(cx, H, hwE, Math.min(H * 0.045, hwE * 0.16), P.darker, {stroke: P.ink, 'stroke-width': f(sw * 0.6)});
  s += ell(cx, H, hwE * 0.78, Math.min(H * 0.035, hwE * 0.12), '#171d23');
  // Thrust structure band.
  s += rect(cx - hwT * 1.25, yT - sw, hwT * 2.5, sw * 1.8, P.cap);
  return s;
}
ART.smallEngine = c => engine(c, {bell: 0.86});
ART.mediumEngine = c => engine(c, {bell: 0.94});
ART.vacuumEngine = c => engine(c, {bell: 0.9, nozzle: 0.02});
ART.bigEngine = c => engine(c, {bell: 0.98});

function booster(c, {stripe = 'url(#orangeV)'}) {
  const {W, H, sw} = c;
  const nose = H * 0.13;
  const noz = H * 0.11;
  let s = poly([[W / 2, 0], [W, nose], [0, nose]], 'url(#cylSoft)', edge(c));  // nose cone
  s += rect(0, nose, W, H - nose - noz, 'url(#cyl)', edge(c));                 // body
  const bh = Math.max(H * 0.02, sw * 1.6);
  s += rect(0, nose + (H - nose - noz) * 0.16, W, bh, stripe);
  s += line(0, nose + (H - nose - noz) * 0.5, W, nose + (H - nose - noz) * 0.5, 'rgba(60,72,84,.3)', sw * 0.8);
  s += line(0, nose + (H - nose - noz) * 0.78, W, nose + (H - nose - noz) * 0.78, 'rgba(60,72,84,.3)', sw * 0.8);
  // Aft skirt and nozzle.
  const hw = W * 0.48;
  s += path(`M${f(W * 0.5 - hw * 0.7)},${f(H - noz)} L${f(W * 0.5 - hw)},${f(H)} L${f(W * 0.5 + hw)},${f(H)} L${f(W * 0.5 + hw * 0.7)},${f(H - noz)} Z`,
    'url(#noz)', edge(c));
  s += ell(W / 2, H, hw, Math.min(H * 0.02, hw * 0.1), P.darker);
  return s;
}
ART.booster = c => booster(c, {});
ART.boosterLarge = c => booster(c, {stripe: P.blue});

/* ---------------------------- AERODYNAMIC ------------------------------- */
function cone(c, {ogive = false, rim = 0.08}) {
  const {W, H, sw} = c;
  const y0 = H * (1 - rim);
  let s;
  if (ogive) {
    s = path(`M${f(W / 2)},0 Q${f(W * 1.02)},${f(y0 * 0.62)} ${f(W)},${f(y0)}` +
      ` L0,${f(y0)} Q${f(-W * 0.02)},${f(y0 * 0.62)} ${f(W / 2)},0 Z`, 'url(#cylSoft)', edge(c));
  } else {
    s = poly([[W / 2, 0], [W, y0], [0, y0]], 'url(#cylSoft)', edge(c));
  }
  s += rect(0, y0, W, H - y0, 'url(#cap)', edge(c));     // base ring
  s += line(W * 0.5, H * 0.08, W * 0.5, y0, 'rgba(60,72,84,.28)', sw * 0.8);
  return s;
}
ART.noseCone = c => cone(c, {});
ART.noseConeLarge = c => cone(c, {});
ART.fairing = c => cone(c, {ogive: true, rim: 0.06});

/** Two mirrored fins with a gap between them (fin set / winglets). */
function finPair(c, {sweep, gap}) {
  const {W, H} = c;
  const left = [[W * gap, 0], [0, H * sweep], [0, H], [W * gap, H]];
  const right = [[W * (1 - gap), 0], [W, H * sweep], [W, H], [W * (1 - gap), H]];
  let s = '';
  for (let i = 0; i < 2; i++) {
    const pts = i === 0 ? left : right;
    s += poly(pts, 'url(#cylSoft)', edge(c));
    const tipX = i === 0 ? 0 : W;
    s += poly([[pts[0][0], pts[0][1]], [tipX, H * sweep], [tipX, H], [pts[3][0], pts[3][1]]],
      'rgba(70,82,94,.28)');
  }
  return s;
}
ART.fin = c => {
  const {W, H} = c;
  let s = poly([[0, 0], [W, H * 0.58], [W, H], [0, H]], 'url(#cylSoft)', edge(c));
  s += rect(0, 0, W * 0.09, H, 'rgba(90,102,114,.45)');      // root chord
  s += poly([[W, H * 0.58], [W, H], [W * 0.86, H], [W * 0.86, H * 0.66]], 'rgba(70,82,94,.3)');
  return s;
};
ART.finSet = c => finPair(c, {sweep: 0.58, gap: 0.46});
ART.winglet = c => finPair(c, {sweep: 0.72, gap: 0.46});
ART.gridFin = c => {
  const {W, H, sw} = c;
  const t = Math.max(W * 0.07, sw * 1.2);
  let s = rect(0, 0, W, H, 'url(#cylSoft)', edge(c));
  s += rect(t, t, W - t * 2, H - t * 2, 'rgba(35,45,55,.55)');   // openings
  for (let i = 1; i < 3; i++) s += rect((W / 3) * i - t / 2, 0, t, H, P.steel, {stroke: P.edge, 'stroke-width': f(sw * 0.5)});
  for (let j = 1; j < 4; j++) s += rect(0, (H / 4) * j - t / 2, W, t, P.steel, {stroke: P.edge, 'stroke-width': f(sw * 0.5)});
  s += rect(0, 0, W, H, 'none', edge(c, 0.9));
  return s;
};

/* ----------------------------- STRUCTURAL ------------------------------- */
function adapter(c, {topRatio = 0.56}) {
  const {W, H} = c;
  const tw = W * topRatio, x0 = (W - tw) / 2;
  const rim = Math.min(H * 0.16, W * 0.06);
  let s = poly([[x0, rim * 0.4], [x0 + tw, rim * 0.4], [W, H - rim * 0.4], [0, H - rim * 0.4]], 'url(#cyl)', edge(c));
  s += rect(x0, 0, tw, rim, 'url(#cap)', edge(c));          // small end
  s += rect(0, H - rim, W, rim, 'url(#cap)', edge(c));       // large end
  return s;
}
ART.adapter = c => adapter(c, {topRatio: 0.56});
ART.adapterShort = c => adapter(c, {topRatio: 0.62});

let clipSeq = 0;
/** Clip a decorative run to a box (hazard stripes, cell grids, …). */
function clipped(x, y, w, h, inner) {
  const id = `clip${clipSeq++}`;
  return `<defs><clipPath id="${id}"><rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}"/></clipPath></defs>` +
    `<g clip-path="url(#${id})">${inner}</g>`;
}

/** Yellow/black caution banding used by the stage joints. */
function hazardBand(c, y, h) {
  const {W} = c;
  let inner = rect(0, y, W, h, P.darker);
  const step = Math.max(h * 1.1, W * 0.055);
  for (let x = -h; x < W + h; x += step) {
    inner += poly([[x, y + h], [x + h, y], [x + h + step * 0.45, y], [x + step * 0.45, y + h]], P.gold);
  }
  return clipped(0, y, W, h, inner);
}
ART.decoupler = c => {
  const {W, H} = c;
  const flange = H * 0.24;
  let s = rect(0, 0, W, H, 'url(#cap)', edge(c));
  s += hazardBand(c, flange, H - flange * 2);
  s += rect(0, 0, W, flange, 'url(#darkV)', edge(c));
  s += rect(0, H - flange, W, flange, 'url(#darkV)', edge(c));
  s += rect(0, 0, W, H, 'none', edge(c));
  return s;
};
ART.separator = c => {
  const {W, H, sw} = c;
  const flange = H * 0.2;
  let s = rect(0, 0, W, H, 'url(#darkV)', edge(c));
  s += hazardBand(c, flange, H - flange * 2);
  const r = Math.min(H * 0.07, W * 0.02);
  for (let i = 0; i < 6; i++) {
    const x = W * (0.08 + i * 0.168);
    s += circ(x, flange * 0.5, r, P.steelDark);
    s += circ(x, H - flange * 0.5, r, P.steelDark);
  }
  s += rect(0, 0, W, H, 'none', edge(c));
  return s;
};
ART.ring = c => {
  const {W, H, sw} = c;
  let s = rect(0, 0, W, H, 'url(#cyl)', edge(c));
  s += rect(0, H * 0.34, W, H * 0.32, 'url(#cap)');
  s += line(0, H * 0.2, W, H * 0.2, 'rgba(60,72,84,.4)', sw * 0.8);
  s += line(0, H * 0.8, W, H * 0.8, 'rgba(60,72,84,.4)', sw * 0.8);
  return s;
};
ART.plate = c => {
  const {W, H, sw} = c;
  let s = rect(0, 0, W, H, 'url(#steelV)', edge(c));
  s += rect(0, H * 0.3, W, H * 0.4, 'url(#cap)');
  const r = H * 0.11;
  for (let i = 0; i < 5; i++) s += circ(W * (0.1 + i * 0.2), H * 0.5, r, P.steelDark, {stroke: P.edge, 'stroke-width': f(sw * 0.5)});
  return s;
};

ART.truss = c => {
  const {W, H, sw} = c;
  const rail = W * 0.14;
  let s = rect(0, 0, rail, H, 'url(#steelV)', edge(c));
  s += rect(W - rail, 0, rail, H, 'url(#steelV)', edge(c));
  const bays = 5;
  for (let i = 0; i < bays; i++) {
    const y0 = (H / bays) * i, y1 = (H / bays) * (i + 1);
    s += line(rail, y0, W - rail, y1, P.steelDark, sw * 1.1, {'stroke-linecap': 'round'});
    s += line(W - rail, y0, rail, y1, P.steelDark, sw * 1.1, {'stroke-linecap': 'round'});
  }
  return s;
};
ART.strut = c => {
  const {W, H} = c;
  const capH = Math.min(H * 0.16, W * 0.3);
  let s = rect(W * 0.26, 0, W * 0.48, H, 'url(#cyl)', edge(c));
  s += rect(0, 0, W, capH, 'url(#cap)', edge(c));
  s += rect(0, H - capH, W, capH, 'url(#cap)', edge(c));
  s += rect(W * 0.18, H * 0.42, W * 0.64, H * 0.16, 'url(#steelV)', edge(c, 0.7));
  return s;
};
ART.conduit = c => {
  const {W, H} = c;
  const collar = Math.min(H * 0.05, W * 0.25);
  let s = rect(0, 0, W, H, 'url(#cyl)', edge(c));
  for (const y of [0, H * 0.5 - collar / 2, H - collar]) s += rect(0, y, W, collar, 'url(#cap)', edge(c, 0.7));
  return s;
};
ART.roverChassis = c => {
  const {W, H, sw} = c;
  const body = H * 0.62;
  let s = rrect(0, 0, W, body, Math.min(W, H) * 0.06, 'url(#cyl)', edge(c));
  s += rect(W * 0.06, H * 0.12, W * 0.88, H * 0.14, 'url(#cap)', edge(c, 0.7));
  s += rect(W * 0.06, H * 0.34, W * 0.5, H * 0.18, P.gold, {stroke: P.edge, 'stroke-width': f(sw * 0.7)});
  s += circ(W * 0.78, H * 0.43, Math.min(W, H) * 0.1, 'url(#glassV)', edge(c, 0.7));
  // Axle mounts reach the bottom edge so the wheels sit under the chassis.
  s += rect(W * 0.1, body - sw, W * 0.16, H - body + sw, 'url(#steelV)', edge(c, 0.7));
  s += rect(W * 0.74, body - sw, W * 0.16, H - body + sw, 'url(#steelV)', edge(c, 0.7));
  return s;
};
ART.rockerBogie = c => {
  const {W, H, sw} = c;
  const wr = Math.min(W * 0.16, H * 0.16);
  let s = '';
  for (const cx of [wr * 1.1, W - wr * 1.1]) {                       // wheels
    s += circ(cx, H - wr, wr, 'url(#darkV)', edge(c));
    s += circ(cx, H - wr, wr * 0.45, P.steel, {stroke: P.edge, 'stroke-width': f(sw * 0.6)});
  }
  const sx = W * 0.5, sy = H * 0.14;                                  // saddle pivot
  s += line(wr * 1.1, H - wr, sx - W * 0.1, sy + H * 0.2, P.steelDark, sw * 2.4, {'stroke-linecap': 'round'});
  s += line(W - wr * 1.1, H - wr, sx + W * 0.1, sy + H * 0.2, P.steelDark, sw * 2.4, {'stroke-linecap': 'round'});
  s += line(sx - W * 0.1, sy + H * 0.2, sx, sy, P.steelDark, sw * 2, {'stroke-linecap': 'round'});
  s += line(sx + W * 0.1, sy + H * 0.2, sx, sy, P.steelDark, sw * 2, {'stroke-linecap': 'round'});
  s += rrect(sx - W * 0.14, 0, W * 0.28, H * 0.14, sw, 'url(#cap)', edge(c, 0.7));
  s += circ(sx, sy + H * 0.2, Math.min(W, H) * 0.05, P.gold, edge(c, 0.6));
  return s;
};

/* ------------------------------- UTILITY -------------------------------- */
ART.battery = c => {
  const {W, H, sw} = c;
  let s = rrect(0, H * 0.08, W, H * 0.92, Math.min(W, H) * 0.08, 'url(#cyl)', edge(c));
  s += rect(W * 0.18, 0, W * 0.16, H * 0.12, P.steelDark, {stroke: P.edge, 'stroke-width': f(sw * 0.6)});  // terminals
  s += rect(W * 0.66, 0, W * 0.16, H * 0.12, P.steelDark, {stroke: P.edge, 'stroke-width': f(sw * 0.6)});
  s += rect(W * 0.12, H * 0.3, W * 0.76, H * 0.34, 'url(#cap)', edge(c, 0.7));
  for (let i = 0; i < 3; i++) {
    s += rect(W * (0.17 + i * 0.24), H * 0.38, W * 0.16, H * 0.18, i < 2 ? P.green : P.steelDark);
  }
  return s;
};
ART.solarPanel = c => {
  const {W, H, sw} = c;
  const t = Math.min(W, H) * 0.07;
  let s = rect(0, 0, W, H, 'url(#cellH)', edge(c));
  const cols = 6, rows = 3;
  for (let i = 1; i < cols; i++) s += line((W / cols) * i, t, (W / cols) * i, H - t, P.cellLine, sw * 0.7);
  for (let j = 1; j < rows; j++) s += line(t, (H / rows) * j, W - t, (H / rows) * j, P.cellLine, sw * 0.7);
  s += rect(0, 0, W, t * 0.7, P.steel);                    // frame rails
  s += rect(0, H - t * 0.7, W, t * 0.7, P.steel);
  s += rect(0, 0, W, H, 'none', edge(c));
  return s;
};
ART.rcs = c => {
  const {W, H, sw} = c;
  const t = Math.min(W, H) * 0.16;
  let s = rrect(W * 0.16, H * 0.16, W * 0.68, H * 0.68, t * 0.4, 'url(#steelV)', edge(c));
  const noz = (x, y, dx, dy) =>
    poly([[x, y], [x + dx * t, y + dy * t], [x + dx * t * 0.4 + dy * t, y + dy * t * 0.4 - dx * t],
      [x + dy * t, y - dx * t]], 'url(#darkV)', edge(c, 0.6));
  const e = t * 0.9;
  s += noz(W * 0.16, H * 0.3, -e, 0);                       // four plumes
  s += noz(W * 0.84, H * 0.7, e, 0);
  s += noz(W * 0.3, H * 0.16, 0, -e);
  s += noz(W * 0.7, H * 0.84, 0, e);
  s += circ(W * 0.5, H * 0.5, Math.min(W, H) * 0.12, P.cap, edge(c, 0.6));
  return s;
};
ART.reactionWheel = c => {
  const {W, H, sw} = c;
  let s = rrect(0, 0, W, H, Math.min(W, H) * 0.14, 'url(#cyl)', edge(c));
  s += rect(W * 0.08, H * 0.16, W * 0.84, H * 0.14, 'url(#cap)');
  s += rect(W * 0.08, H * 0.7, W * 0.84, H * 0.14, 'url(#cap)');
  s += circ(W * 0.5, H * 0.5, Math.min(W, H) * 0.2, 'url(#steelV)', edge(c, 0.7));
  s += circ(W * 0.5, H * 0.5, Math.min(W, H) * 0.07, P.dark);
  return s;
};
ART.science = c => {
  const {W, H, sw} = c;
  let s = rrect(0, 0, W, H, Math.min(W, H) * 0.1, 'url(#cyl)', edge(c));
  s += rect(W * 0.06, H * 0.14, W * 0.42, H * 0.72, 'url(#cap)', edge(c, 0.7));   // sample drawer
  for (let i = 0; i < 3; i++) {
    s += circ(W * (0.15 + i * 0.13), H * 0.5, Math.min(W, H) * 0.1, '#ad93d8', edge(c, 0.5));
  }
  s += rect(W * 0.56, H * 0.2, W * 0.36, H * 0.24, P.dark, {stroke: P.edge, 'stroke-width': f(sw * 0.6)});
  s += rect(W * 0.56, H * 0.56, W * 0.36, H * 0.08, P.green);
  s += rect(W * 0.56, H * 0.72, W * 0.36, H * 0.08, P.steelDark);
  return s;
};
ART.dockingPort = c => {
  const {W, H, sw} = c;
  let s = rect(0, 0, W, H, 'url(#steelV)', edge(c));
  s += rect(0, H * 0.16, W, H * 0.68, 'url(#cap)', edge(c, 0.7));
  s += ell(W * 0.5, H * 0.5, W * 0.3, H * 0.34, P.darker, {stroke: P.edge, 'stroke-width': f(sw * 0.7)});
  s += ell(W * 0.5, H * 0.5, W * 0.16, H * 0.18, '#12171c');
  const r = H * 0.07;
  for (let i = 0; i < 6; i++) s += circ(W * (0.07 + i * 0.172), H * 0.5, r, P.steelDark);
  return s;
};
ART.antenna = c => {
  const {W, H, sw} = c;
  let s = rect(W * 0.42, H * 0.3, W * 0.16, H * 0.7, 'url(#steelV)', edge(c, 0.7));   // mast
  s += ell(W * 0.5, H * 0.24, W * 0.46, H * 0.24, 'url(#cylSoft)', edge(c));           // dish
  s += ell(W * 0.5, H * 0.24, W * 0.14, H * 0.07, P.cap, edge(c, 0.6));                // feed
  s += rect(0, H * 0.88, W, H * 0.12, 'url(#cap)', edge(c));                           // base
  return s;
};
ART.roverCameraMast = c => {
  const {W, H, sw} = c;
  let s = rrect(0, 0, W, H * 0.22, Math.min(W, H) * 0.06, 'url(#cyl)', edge(c));   // camera head
  s += ell(W * 0.7, H * 0.11, W * 0.14, H * 0.07, 'url(#glassV)', edge(c, 0.6));
  s += rect(W * 0.36, H * 0.22, W * 0.28, H * 0.78 - H * 0.22, 'url(#steelV)', edge(c, 0.7)); // column
  s += rect(0, H * 0.78, W, H * 0.22, 'url(#cap)', edge(c));                        // base
  s += rect(W * 0.08, H * 0.84, W * 0.84, H * 0.06, P.steelDark);
  return s;
};
ART.highGainAntenna = c => {
  const {W, H, sw} = c;
  let s = '';
  s += rect(W * 0.44, H * 0.5, W * 0.12, H * 0.4, 'url(#steelV)', edge(c, 0.7));    // boom
  s += ell(W * 0.5, H * 0.34, W * 0.47, H * 0.34, 'url(#cylSoft)', edge(c));        // dish
  s += ell(W * 0.5, H * 0.34, W * 0.3, H * 0.21, 'none', {stroke: P.steelDark, 'stroke-width': f(sw * 0.8)});
  s += ell(W * 0.5, H * 0.34, W * 0.1, H * 0.07, P.cap, edge(c, 0.6));              // feed horn
  s += rect(0, H * 0.9, W, H * 0.1, 'url(#cap)', edge(c));                          // baseplate
  return s;
};
ART.roboticArm = c => {
  const {W, H, sw} = c;
  const t = Math.min(W, H) * 0.16;
  let s = rrect(0, 0, W * 0.16, H, Math.min(W, H) * 0.05, 'url(#cap)', edge(c));    // shoulder mount
  s += line(W * 0.16, H * 0.32, W * 0.5, H * 0.68, P.steelDark, t, {'stroke-linecap': 'round'});
  s += line(W * 0.5, H * 0.68, W * 0.84, H * 0.3, P.steelDark, t * 0.85, {'stroke-linecap': 'round'});
  s += circ(W * 0.5, H * 0.68, t * 0.42, 'url(#steelV)', edge(c, 0.7));             // elbow
  s += circ(W * 0.16, H * 0.32, t * 0.42, 'url(#steelV)', edge(c, 0.7));
  s += rrect(W * 0.84, 0, W * 0.16, H, Math.min(W, H) * 0.05, 'url(#darkV)', edge(c)); // drill head
  s += poly([[W * 0.86, H * 0.28], [W, H * 0.5], [W * 0.86, H * 0.72]], '#1d242b', edge(c, 0.6));
  s += rect(0, H * 0.4, W * 0.16, H * 0.2, P.gold);                                 // hazard band
  return s;
};
ART.rtg = c => {
  const {W, H, sw} = c;
  const fin = W * 0.05;
  let s = rect(W * 0.06, H * 0.22, W * 0.88, H * 0.56, 'url(#cyl)', edge(c));       // stack body
  for (let i = 0; i < 8; i++) {                                                     // radiator fins
    const x = W * (0.08 + i * 0.107);
    s += rect(x, H * 0.04, fin, H * 0.92, 'url(#steelV)', edge(c, 0.6));
  }
  s += rect(0, H * 0.3, W * 0.08, H * 0.4, 'url(#goldV)', edge(c, 0.7));            // gold end caps
  s += rect(W * 0.92, H * 0.3, W * 0.08, H * 0.4, 'url(#goldV)', edge(c, 0.7));
  s += rect(W * 0.4, H * 0.34, W * 0.2, H * 0.32, P.dark, edge(c, 0.7));
  return s;
};
/* ------------------------------- LANDING -------------------------------- */
ART.parachute = c => {
  const {W, H, sw} = c;
  // Control point is placed so the canopy apex lands exactly on y = 0 —
  // the part has to fill its slot like every other one.
  let s = path(`M0,${f(H * 0.62)} Q${f(W * 0.5)},${f(-H * 0.62)} ${f(W)},${f(H * 0.62)} Z`,
    'url(#whiteV)', edge(c));
  for (let i = 1; i < 5; i++) {
    const x = (W / 5) * i;
    s += line(W * 0.5, H * 0.02, x, H * 0.62, 'rgba(90,102,114,.4)', sw * 0.5);   // gore seams
  }
  s += rect(0, H * 0.62, W, H * 0.18, 'url(#cap)', edge(c, 0.7));      // pack collar
  s += rect(0, H * 0.8, W, H * 0.2, 'url(#goldV)', edge(c));           // riser block
  return s;
};
ART.legs = c => {
  const {W, H, sw} = c;
  let s = rect(0, 0, W, H * 0.16, 'url(#cap)', edge(c));               // mount rail
  const t = Math.min(W, H) * 0.12;
  for (const dir of [-1, 1]) {
    const x0 = dir < 0 ? W * 0.36 : W * 0.64;
    const x1 = dir < 0 ? 0 : W;
    s += line(x0, H * 0.16, x1, H * 0.78, P.steelDark, t, {'stroke-linecap': 'round'});
    s += line(x0, H * 0.16, dir < 0 ? W * 0.12 : W * 0.88, H * 0.7, P.steel, t * 0.7, {'stroke-linecap': 'round'});
    s += rect(dir < 0 ? 0 : W * 0.78, H * 0.78, W * 0.22, H * 0.22, 'url(#darkV)', edge(c, 0.7));  // foot
  }
  s += rect(0, H * 0.78, W, H * 0.06, 'none', edge(c, 0.7));
  return s;
};
ART.gear = c => {
  const {W, H, sw} = c;
  const wr = Math.min(W, H) * 0.3;
  let s = rect(0, 0, W, H * 0.12, 'url(#cap)', edge(c));               // mount
  s += line(W * 0.5, H * 0.12, W * 0.5, H - wr, P.steelDark, W * 0.16, {'stroke-linecap': 'round'});
  s += rect(0, H - wr * 1.5, W, wr * 0.3, 'url(#steelV)', edge(c, 0.7));   // axle beam
  s += circ(W * 0.5, H - wr, wr, 'url(#darkV)', edge(c));
  s += circ(W * 0.5, H - wr, wr * 0.42, P.steel, {stroke: P.edge, 'stroke-width': f(sw * 0.6)});
  return s;
};
function wheelArt(c, {grousers = 0}) {
  const {W, H, sw} = c;
  const r = Math.min(W, H) * 0.5;
  const cx = W / 2, cy = H / 2;
  let s = '';
  for (let i = 0; i < grousers; i++) {                     // tread lugs
    const a = (i / grousers) * Math.PI * 2;
    s += rect(cx + Math.cos(a) * r * 0.86 - r * 0.09, cy + Math.sin(a) * r * 0.86 - r * 0.09,
      r * 0.18, r * 0.18, P.darker, {transform: `rotate(${f((a * 180) / Math.PI)} ${f(cx + Math.cos(a) * r * 0.86)} ${f(cy + Math.sin(a) * r * 0.86)})`});
  }
  s += circ(cx, cy, r, 'url(#darkV)', edge(c));
  s += circ(cx, cy, r * 0.82, P.darker);
  s += circ(cx, cy, r * 0.6, 'url(#steelV)', edge(c, 0.8));             // rim
  s += circ(cx, cy, r * 0.18, P.cap, edge(c, 0.7));                     // hub
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    s += line(cx + Math.cos(a) * r * 0.2, cy + Math.sin(a) * r * 0.2,
      cx + Math.cos(a) * r * 0.56, cy + Math.sin(a) * r * 0.56, P.steelDark, r * 0.1, {'stroke-linecap': 'round'});
  }
  return s;
}
ART.wheel = c => wheelArt(c, {});
ART.roverWheel = c => wheelArt(c, {grousers: 12});

/* ------------------------------- writing -------------------------------- */
mkdirSync(OUT, {recursive: true});
const missing = Object.keys(PART_DEFINITIONS).filter(id => !ART[id]);
if (missing.length) {
  console.error('no artwork defined for: ' + missing.join(', '));
  process.exit(1);
}

const svg = (W, H, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
  `<defs>${DEFS.join('')}</defs>${body}</svg>\n`;

let written = 0;
for (const [id, def] of Object.entries(PART_DEFINITIONS)) {
  const W = Math.round(UNITS * def.width);
  const H = Math.round(UNITS * def.height);      // viewBox aspect == build aspect
  const c = {W, H, sw: Math.max(1.5, Math.min(W, H) * 0.028)};
  const body = ART[id](c);
  writeFileSync(join(OUT, `${id}.svg`), svg(W, H, body));
  written++;
}
console.log(`wrote ${written} part artworks to ${OUT}`);







