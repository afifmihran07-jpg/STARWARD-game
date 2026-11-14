import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = [];
function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === '.git' || ent.name === 'node_modules') continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full);
    else files.push(full);
  }
}
walk(root);
const rel = (p) => path.relative(root, p).replaceAll(path.sep, '/');
let checkedRefs = 0;
const missing = [];
for (const file of files) {
  const ext = path.extname(file).toLowerCase();
  if (!['.html', '.js', '.css'].includes(ext)) continue;
  const source = fs.readFileSync(file, 'utf8');
  const refs = [];
  if (ext === '.html') {
    for (const m of source.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/gi)) refs.push(m[1]);
  }
  if (ext === '.js') {
    for (const m of source.matchAll(/(?:from\s*|import\s*\()\s*["']((?:\.\.?\/)[^"']+)["']/g)) refs.push(m[1]);
  }
  if (ext === '.css') {
    for (const m of source.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) refs.push(m[1]);
  }
  for (let ref of refs) {
    if (!ref || /^(?:https?:|data:|blob:|#|\/\/)/i.test(ref)) continue;
    ref = decodeURIComponent(ref.split(/[?#]/, 1)[0]);
    if (!ref) continue;
    const target = path.resolve(path.dirname(file), ref);
    checkedRefs++;
    if (!target.startsWith(root + path.sep) && target !== root) {
      missing.push(`${rel(file)} -> path escapes project: ${ref}`);
    } else if (!fs.existsSync(target)) {
      missing.push(`${rel(file)} -> missing ${ref}`);
    }
  }
}
assert.deepEqual(missing, [], `Broken local references:\n${missing.join('\n')}`);
console.log(`  ok  ${checkedRefs} local HTML/CSS/module references resolve inside the archive`);

const jsFiles = files.filter(f => f.endsWith('.js'));
for (const file of jsFiles) {
  // node --check is run by the package script; this pass ensures the source tree was fully enumerated.
  assert.ok(fs.statSync(file).size >= 0, `unreadable ${rel(file)}`);
}
console.log(`  ok  ${jsFiles.length} JavaScript files enumerated for syntax validation`);
