/* GitHub Pages readiness: Pages serves from a case-sensitive file system under
 * a sub-path (https://<user>.github.io/<repo>/), so every asset the game
 * references must exist with the EXACT filename case, and live code must not
 * use root-absolute paths ("/js/...") or depend on file://. Windows hides
 * case mistakes; this test does not. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {PART_DEFINITIONS} from '../js/rocket/partDefinitions.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; };

/** True when every path segment exists with exactly this case. */
function existsExactCase(rel) {
  let dir = root;
  for (const part of rel.split('/').filter(Boolean)) {
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return false;
    if (!fs.readdirSync(dir).includes(part)) return false;
    dir = path.join(dir, part);
  }
  return true;
}

// 1. Part artwork (PNG first, SVG fallback) referenced by the catalog.
const art = new Set();
for (const def of Object.values(PART_DEFINITIONS)) {
  if (def.png) art.add(def.png);
  if (def.svg) art.add(def.svg);
}
const caseProblems = [], missing = [];
for (const ref of art) {
  if (existsExactCase(ref)) continue;
  (fs.existsSync(path.join(root, ref)) ? caseProblems : missing).push(ref);
}
assert.deepEqual(caseProblems, [], 'part art referenced with the wrong filename case (breaks on GitHub Pages)'); checks++;
// SVG fallbacks may be absent when the PNG exists; a part needs at least one.
for (const [id, def] of Object.entries(PART_DEFINITIONS)) {
  if (def.retired) continue;
  ok((def.png && existsExactCase(def.png)) || (def.svg && existsExactCase(def.svg)),
    `part ${id} has artwork with exact-case filename (${def.png || ''} ${def.svg || ''})`);
}

// 2. Static references in the live page and stylesheets.
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/<template\b[\s\S]*?<\/template>/g, '');
const live = [html, fs.readFileSync(path.join(root, 'style.css'), 'utf8'), fs.readFileSync(path.join(root, 'css/flight-dashboard.css'), 'utf8')];
for (const src of live) {
  for (const m of src.matchAll(/(?:src|href)\s*=\s*["']([^"'#]+)["']|url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
    const ref = (m[1] || m[2]).split('?')[0];
    if (/^(?:https?:|data:|mailto:)/.test(ref)) continue;
    ok(!ref.startsWith('/'), `no root-absolute path (breaks under a Pages sub-path): ${ref}`);
    ok(existsExactCase(decodeURIComponent(ref)), `referenced file exists with exact case: ${ref}`);
  }
}
// Bootstrap-versioned assets (modules, CSS, favicon) — exact case.
for (const m of html.matchAll(/'((?:js\/[^']+\.js)|favicon\.svg|style\.css|css\/flight-dashboard\.css)'/g)) {
  ok(existsExactCase(m[1]), `bootstrap asset exists with exact case: ${m[1]}`);
}

// 3. Live JS: relative module imports resolve with exact case; no root-absolute fetches.
(function walk(dir) {
  for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    if (!p.endsWith('.js')) continue;
    const src = fs.readFileSync(p, 'utf8');
    for (const m of src.matchAll(/from\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
      const target = path.relative(root, path.join(path.dirname(p), m[1])).replaceAll(path.sep, '/');
      ok(existsExactCase(target), `${path.relative(root, p)} imports ${m[1]} with exact case`);
    }
    ok(!/(?:fetch|import)\(\s*['"]\//.test(src), `${path.relative(root, p)} does not fetch root-absolute URLs`);
  }
})(path.join(root, 'js'));

console.log(`${checks} checks passed: part art, page, stylesheet and module references exist with exact filename case; ` +
  `no root-absolute paths${missing.length ? ` (${missing.length} optional SVG fallbacks absent, PNG present)` : ''}`);
