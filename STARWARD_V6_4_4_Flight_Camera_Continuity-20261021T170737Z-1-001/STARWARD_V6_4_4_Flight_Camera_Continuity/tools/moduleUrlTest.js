/* A1 / P3-1: every physical module file is imported through exactly one URL,
 * so stateful modules (partSprites, rocket, collision, partDefinitions, ...)
 * are never instantiated twice; one build ID versions everything. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks++; };

const IMPORT_RE = /(?:(?:import|export)\s[^'"]*?from\s*|import\s*\(\s*|import\s+)['"](\.{1,2}\/[^'"]+)['"]/g;
const rel = p => path.relative(root, p).replaceAll(path.sep, '/');

/** Relative import specifiers of one source text. */
export function importsOf(source) {
  return [...source.matchAll(IMPORT_RE)].map(m => m[1]);
}

/**
 * Group the URLs each physical file is imported through.
 * @param {Array<{file:string, specs:string[]}>} modules  importer path + specifiers
 * @returns {Map<string, Set<string>>} physical file -> set of distinct URLs
 */
export function urlsPerFile(modules) {
  const out = new Map();
  for (const {file, specs} of modules) {
    for (const spec of specs) {
      const [p, query = ''] = spec.split('?');
      const physical = path.normalize(path.join(path.dirname(file), p));
      const url = physical + (query ? '?' + query : '');
      if (!out.has(physical)) out.set(physical, new Set());
      out.get(physical).add(url);
    }
  }
  return out;
}
const duplicates = map => [...map].filter(([, urls]) => urls.size > 1);

/* ---- 1. The checker itself detects duplicates (pre-A1 situation) ------- */
{
  const fake = urlsPerFile([
    {file: 'js/game.js', specs: ['./rocket/rocket.js', './rocket/partSprites.js']},
    {file: 'js/renderer.js', specs: ['./rocket/rocket.js?v=starward-flight-realism-20261016-v644', './rocket/partSprites.js?v=x']},
    {file: 'js/ui/buildUI.js', specs: ['../rocket/partSprites.js']}
  ]);
  const d = duplicates(fake).map(([f]) => f.replaceAll(path.sep, '/')).sort();
  eq(d, ['js/rocket/partSprites.js', 'js/rocket/rocket.js'], 'checker flags a file imported with two different query strings');
  const same = urlsPerFile([{file: 'js/a/x.js', specs: ['../b/y.js']}, {file: 'js/b/z.js', specs: ['./y.js']}]);
  eq(duplicates(same).length, 0, 'different relative spellings of the same file are one URL');
}

/* ---- 2. Live module graph from js/main.js -------------------------------- */
const graph = new Map();                                    // absolute file -> specifiers
(function visit(file) {
  if (graph.has(file)) return;
  ok(fs.existsSync(file), `module exists: ${rel(file)}`);
  const specs = importsOf(fs.readFileSync(file, 'utf8'));
  graph.set(file, specs);
  for (const s of specs) visit(path.join(path.dirname(file), s.split('?')[0]));
})(path.join(root, 'js', 'main.js'));
const live = [...graph.keys()].map(rel).sort();
ok(live.length >= 30, `live module graph found (${live.length} modules)`);

const liveUrls = urlsPerFile([...graph].map(([file, specs]) => ({file, specs})));
eq(duplicates(liveUrls).map(([f]) => rel(f)), [], 'no live module is imported through two different URLs');
for (const [file, specs] of graph) {
  for (const s of specs) ok(!s.includes('?'), `${rel(file)} imports ${s} without a query string`);
}
// Every js/** file (live or legacy) uses plain specifiers too.
(function walk(dir) {
  for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (p.endsWith('.js')) {
      const q = importsOf(fs.readFileSync(p, 'utf8')).filter(s => s.includes('?'));
      eq(q, [], `${rel(p)} has no versioned import specifiers`);
    }
  }
})(path.join(root, 'js'));

/* ---- 3. One build ID; the import map lists exactly the live graph -------- */
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
// The live page is everything except an inert <template> block, if any.
const livePage = html.replace(/<template\b[\s\S]*?<\/template>/g, '');
const builds = [...livePage.matchAll(/window\.STARWARD_BUILD\s*=\s*'([^']+)'/g)].map(m => m[1]);
eq(builds.length, 1, 'exactly one build ID definition');
ok(/^STARWARD-\d{8}-/.test(builds[0]), `build ID looks like a release id: ${builds[0]}`);
const listed = (/window\.STARWARD_MODULES\s*=\s*\[([\s\S]*?)\]/.exec(livePage) || [, ''])[1]
  .match(/'[^']+'/g).map(s => s.slice(1, -1)).sort();
eq(listed, live, 'import map module list == modules reachable from js/main.js');
ok(/type\s*=\s*'importmap'/.test(livePage), 'import map is generated from the build ID');
ok(/js\/main\.js\?v=' \+ encodeURIComponent\(window\.STARWARD_BUILD\)/.test(livePage), 'entry module versioned with the same build ID');
eq([...livePage.matchAll(/\?v=[A-Za-z0-9-]/g)].length, 0, 'no hard-coded ?v= tokens left in the live page');
// The assets the bootstrap versions dynamically exist (static audits cannot see them).
for (const asset of ['js/main.js', 'favicon.svg', 'style.css', 'css/flight-dashboard.css']) {
  ok(livePage.includes("'" + asset + "'") || livePage.includes("'" + asset + "?v="), `bootstrap references ${asset}`);
  ok(fs.existsSync(path.join(root, asset)), `bootstrap asset exists: ${asset}`);
}
const mainSrc = fs.readFileSync(path.join(root, 'js', 'main.js'), 'utf8');
ok(/window\.STARWARD_BUILD/.test(mainSrc) && !/STARWARD-SYSTEM-MAP-20261022/.test(mainSrc), 'main.js reports the central build ID');

console.log(`${checks} checks passed: duplicate-URL checker verified, ${live.length} live modules each imported through one URL, ` +
  `no versioned import specifiers, one build ID (${builds[0]}) versioning an import map that matches the module graph`);
