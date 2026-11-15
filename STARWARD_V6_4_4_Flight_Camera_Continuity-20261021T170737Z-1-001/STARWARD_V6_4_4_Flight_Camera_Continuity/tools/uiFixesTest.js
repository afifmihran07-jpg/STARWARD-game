/* UI fixes (demo polish): one section per fix. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {makeGame, element} from './_gameHarness.js';

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; };
const eq = (a, b, m) => { assert.equal(a, b, m); checks++; };
const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');

/** CSS specificity (ids, classes+attributes+pseudo-classes, elements). */
function specificity(sel) {
  const ids = (sel.match(/#[\w-]+/g) || []).length;
  const cls = (sel.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)[\w-]+/g) || []).length;
  const el = (sel.replace(/#[\w-]+|\.[\w-]+|\[[^\]]+\]|::?[\w-]+/g, ' ').match(/[a-z][\w-]*/gi) || []).length;
  return ids * 10000 + cls * 100 + el;
}
/** Selectors (outside @media) that set font-size on the pause button. */
function pauseFontRules(css) {
  const base = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...base.matchAll(/([^{}]*#pauseButton[^{}]*)\{([^}]*)\}/g)]
    .filter(m => /font-size/.test(m[2]))
    .map(m => ({sel: m[1].trim(), size: /font-size:\s*([\d.]+)(?:px)?\s*[;}]?/.exec(m[2])?.[1]}));
}

/* ---- Fix 1: PAUSE button paints only its glyph; accessible name ---------- */
{
  const rules = [...pauseFontRules(read('style.css')), ...pauseFontRules(read('css/flight-dashboard.css'))]
    .filter(r => r.sel.includes('flight'));
  const winner = rules.reduce((a, b) => (specificity(b.sel) >= specificity(a.sel) ? b : a));
  eq(winner.size, '0', `most specific flight pause rule hides the text label (${winner.sel})`);
  ok(rules.some(r => r.size === '7' && specificity(r.sel) < specificity(winner.sel)), 'the 7px style.css rule is out-ranked, not deleted');
  const g = makeGame();
  g.paused = false; g.syncFlightTools();
  eq(element('pauseButton').getAttribute('aria-label'), 'Pause (P)', 'aria-label while running');
  g.paused = true; g.syncFlightTools();
  eq(element('pauseButton').getAttribute('aria-label'), 'Resume (P)', 'aria-label while paused');
}

console.log(`${checks} checks passed: UI fixes`);
