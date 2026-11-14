/* =========================================================================
   packTest.js — validates the supplied and generated artwork against the
   part definitions. Supplied root-level SVGs are referenced directly so
   their contents stay untouched; generated artwork remains in assets/parts/.
   Run with:  node tools/packTest.js
   ========================================================================= */
import assert from 'node:assert';
import {readFileSync, readdirSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {PART_DEFINITIONS} from '../js/rocket/partDefinitions.js';
import {SHEET, sizeSvg, packArt, packStatus, loadPack, fitArtRect} from '../js/rocket/partSprites.js';
import {Editor} from '../js/construction/editor.js';
import {attachmentSlots, snapPart} from '../js/rocket/attachmentSystem.js';
import {BUILD_PART_SCALE} from '../js/renderer.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const INTRINSIC = 512;

let passed = 0;
const check = (name, fn) => {
  fn();
  passed++;
  console.log('  ok  ' + name);
};

const read = rel => readFileSync(join(ROOT, rel), 'utf8');
const rootTag = text => {
  const start = text.indexOf('<svg');
  const end = text.indexOf('>', start);
  return start >= 0 && end > start ? text.slice(start, end + 1) : '';
};
const viewBox = tag => {
  const m = /viewBox\s*=\s*("([^"]*)"|'([^']*)')/.exec(tag);
  if (!m) return null;
  const n = (m[2] || m[3] || '').trim().split(/[\s,]+/).map(Number);
  return n.length === 4 && n[2] > 0 && n[3] > 0 ? {w: n[2], h: n[3]} : null;
};

const entries = Object.entries(PART_DEFINITIONS);
const suppliedPack = [
  'adapter.svg', 'battery.svg', 'capsule.svg', 'decoupler.svg',
  'docking_port.svg', 'fairing.svg', 'fin.svg', 'fuel_tank_large.svg',
  'fuel_tank_small.svg', 'landing_leg.svg', 'large_tank.svg',
  'medium_engine.svg', 'medium_tank.svg', 'nose_cone.svg',
  'parachute.svg', 'probe_core.svg', 'rcs.svg', 'reaction_wheel.svg',
  'science_module.svg', 'separator.svg', 'small_engine.svg',
  'small_tank.svg', 'solar_panel.svg', 'strut.svg', 'vacuum_engine.svg',
  'wheel.svg'
];

check('every part names artwork from the pack', () => {
  for (const [id, def] of entries) {
    assert.ok(def.svg, id + ' has no svg');
    assert.ok(!def.svg.includes('..'), id + ' svg escapes the project root');
    assert.ok(def.svg.startsWith('assets/parts/') || suppliedPack.includes(def.svg),
      id + ' does not reference pack artwork');
  }
});

check('every artwork file exists, parses and has a viewBox', () => {
  for (const [id, def] of entries) {
    const text = read(def.svg);
    assert.ok(text.includes('<svg'), def.svg + ' is not SVG');
    assert.ok(text.includes('</svg>'), def.svg + ' is truncated');
    assert.ok(viewBox(rootTag(text)), def.svg + ' has no usable viewBox');
  }
});

check('every supplied part PNG is wired into the part catalog', () => {
  const used = new Set(entries.map(([, def]) => def.png).filter(Boolean));
  const images = readdirSync(ROOT).filter(file => file.toLowerCase().endsWith('.png') && file !== 'image.png');
  for (const file of images) {
    assert.ok(used.has(file), file + ' is not used by a rocket part');
    const data = readFileSync(join(ROOT, file));
    assert.strictEqual(data.toString('hex', 0, 8), '89504e470d0a1a0a', file + ' is not a PNG');
    assert.ok(data.readUInt32BE(16) > 0 && data.readUInt32BE(20) > 0, file + ' has invalid dimensions');
  }
  for (const [, def] of entries) {
    if (def.png) assert.ok(images.includes(def.png), def.png + ' does not exist');
  }
});

check('part artwork is contained without changing its aspect ratio', () => {
  const fitted = fitArtRect(25, 100, 120, 60);
  assert.deepStrictEqual(fitted, {x: -7.5, y: -30, w: 15, h: 60});
  assert.strictEqual(fitArtRect(0, 10, 20, 20), null, 'rejects zero-sized artwork');
});

check('supplied PNG parts can be placed and selected in the editor', () => {
  const editor = new Editor();
  editor.parts = [];
  const textured = entries.filter(([, def]) => def.png);
  textured.forEach(([id, def], i) => {
    const part = editor.add(id, i * 12, 0);
    assert.strictEqual(part.type, id, id + ' was not created');
    assert.strictEqual(editor.hit(part.x, part.y), part, id + ' cannot be selected');
    assert.ok(def.width > 0 && def.height > 0, id + ' has no build hitbox');
  });
});

check('build art and hitboxes share the logical part scale', () => {
  const editor = new Editor();
  editor.parts = [];
  const part = editor.add('capsule', 0, 0);
  assert.strictEqual(BUILD_PART_SCALE, 1.0, 'hitbox uses the logical slot scale');
  assert.strictEqual(editor.hit(1.05, 0), part, 'hitbox covers the logical slot');
  assert.strictEqual(editor.hit(1.6, 0, BUILD_PART_SCALE), undefined,
    'selection stays outside the slot edge');
});

check('magnetic placement reaches nearby slots and respects rotated parts', () => {
  const editor = new Editor();
  editor.parts = [];
  const base = editor.add('mediumTank', 0, 0);
  const preview = editor.previewSlot('smallEngine', {x: 0, y: 3});
  assert.deepStrictEqual(preview, {x: 0, y: 2.7},
    'preview snaps when the pointer is within magnetic range');
  const attached = editor.add('smallEngine', 0.1, 2.9);
  assert.deepStrictEqual({x: attached.x, y: attached.y}, {x: 0, y: 2.7},
    'new parts snap onto their attachment point');

  base.rotation = Math.PI / 2;
  const rotated = attachmentSlots('smallEngine', base)[0];
  assert.ok(Math.abs(rotated.x) < 1e-10);
  assert.ok(Math.abs(rotated.y + 1.7) < 1e-10,
    'slot follows the rotated part bounds');

  const rotatedCandidate = attachmentSlots('mediumTank',
    {type: 'smallEngine', x: 0, y: 0}, Math.PI / 2)[0];
  assert.ok(Math.abs(rotatedCandidate.y + 1.7) < 1e-10,
    'slot accounts for the rotated part being moved');

  const moving = {type: 'smallEngine', x: 0, y: -1.8, rotation: 0};
  assert.ok(snapPart(moving, [base], 0.2), 'release snaps a moved part');
  assert.deepStrictEqual({x: moving.x, y: moving.y}, {x: 0, y: -1.7});
});

check('artwork aspect matches its build slot — nothing can distort', () => {
  for (const [id, def] of entries) {
    if (def.png || !def.svg.startsWith('assets/parts/')) continue;
    const vb = viewBox(rootTag(read(def.svg)));
    const want = def.width / def.height;
    const got = vb.w / vb.h;
    assert.ok(Math.abs(got - want) / want < 0.02,
      `${id} aspect ${got.toFixed(3)} vs build ${want.toFixed(3)}`);
  }
});

check('no generated artwork is left unused', () => {
  const used = new Set(entries.map(([, d]) => d.svg));
  const art = readdirSync(join(ROOT, 'assets', 'parts')).filter(f => f.endsWith('.svg'));
  for (const file of art) {
    const id = file.replace(/\.svg$/, '');
    if (PART_DEFINITIONS[id] && PART_DEFINITIONS[id].svg === 'assets/parts/' + file) {
      assert.ok(used.has('assets/parts/' + file), file + ' is not used by any part');
    }
  }
});

check('sizing keeps the viewBox aspect — no letterboxed, stretchable bitmap', () => {
  for (const [, def] of entries) {
    const text = read(def.svg);
    const before = viewBox(rootTag(text));
    const sized = sizeSvg(text, INTRINSIC);
    assert.ok(sized, def.svg + ' could not be re-sized');
    const tag = rootTag(sized);
    const after = viewBox(tag);
    assert.deepStrictEqual(after, before, def.svg + ' viewBox changed');

    const w = Number(/\swidth="([\d.]+)"/.exec(tag)[1]);
    const h = Number(/\sheight="([\d.]+)"/.exec(tag)[1]);
    assert.ok(w > 0 && h > 0, def.svg + ' lost its dimensions');
    assert.strictEqual(Math.max(w, h), INTRINSIC, def.svg + ' long side is not ' + INTRINSIC);
    // Relative tolerance: a 7.5:1 decoupler has far more aspect to lose to
    // rounding than a 1:1 capsule, so compare proportions, not deltas.
    assert.ok(Math.abs(w / h - before.w / before.h) / (before.w / before.h) < 0.01,
      def.svg + ' aspect drifted: ' + (w / h).toFixed(3) + ' vs ' + (before.w / before.h).toFixed(3));
    // Percent sizing would leave the browser guessing a raster size.
    assert.ok(!/\swidth="100%"/.test(tag) && !/\sheight="100%"/.test(tag),
      def.svg + ' kept percentage sizing');
  }
});

check('sizing is idempotent and tolerates missing dimensions', () => {
  const once = sizeSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"></svg>', 512);
  assert.ok(/\swidth="512"/.test(once) && /\sheight="256"/.test(once), 'adds missing width/height');
  const twice = sizeSvg(once, 512);
  assert.strictEqual(twice, once, 're-sizing twice must be stable');
  const single = sizeSvg("<svg viewBox='0 0 10 40'/>", 100);
  assert.ok(/\swidth="25"/.test(single) && /\sheight="100"/.test(single), 'handles quotes and self-closing tags');
  assert.strictEqual(sizeSvg('<svg>no viewBox</svg>', 512), null, 'refuses artwork without a viewBox');
  assert.strictEqual(sizeSvg('not svg at all', 512), null, 'refuses non-SVG input');
});

check('every sheet cell sits inside the sprite sheet grid', () => {
  for (const [id, def] of entries) {
    const cell = def.cell || [0, 0];
    assert.ok(cell[0] >= 0 && cell[0] < SHEET.cols, id + ' column out of range');
    assert.ok(cell[1] >= 0 && cell[1] < SHEET.rows, id + ' row out of range');
  }
});

check('the pack loader is safe where there is no DOM', () => {
  loadPack();
  assert.strictEqual(typeof packStatus(), 'string');
  // No Image in Node, so nothing can be ready — and nothing may throw.
  for (const id of Object.keys(PART_DEFINITIONS)) {
    assert.strictEqual(packArt(id, 300, 300), null, id + ' must fall back without a DOM');
  }
});

console.log('\n' + passed + ' checks passed');
