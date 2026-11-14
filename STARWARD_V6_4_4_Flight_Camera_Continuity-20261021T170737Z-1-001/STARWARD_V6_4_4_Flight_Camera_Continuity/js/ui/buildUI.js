import {assessMission, MISSION_PROFILES} from '../construction/missionSystems.js';
/* =========================================================================
   buildUI.js — the parts bin, the assembly read-outs and the design checks.

   Thumbnails use the same PNG-first, SVG-fallback artwork as the renderer,
   so the bin and the build field always agree. Failed artwork drops back to
   its sprite-sheet cell.
   ========================================================================= */
import {PART_DEFINITIONS as D, CATEGORY_ORDER} from '../rocket/partDefinitions.js';
import {loadSheet, spriteStyle, cellOf} from '../rocket/partSprites.js';
import {
  missionBreakdown, formatMoney, budgetLevel, partCost,
  BUDGET_PROFILES, profileById
} from '../construction/budget.js';

let filter = 'ALL';
let search = '';
let missionProfile = 'earthObservation';
let missionSelectorWired = false;

export function buildLibrary(editor) {
  const root = document.querySelector('#partLibrary');
  paint(root, editor);
  wireBudgetPanel();
  loadSheet(ok => {
    if (!ok) paint(root, editor);
  });
}

function paint(root, editor) {
  if (!root) return;
  const cats = ['ALL'].concat(CATEGORY_ORDER);
  const visible = Object.entries(D).filter(([, d]) => !d.retired &&
    (filter === 'ALL' || d.category === filter) &&
    (!search || (d.name + ' ' + d.category).toLowerCase().includes(search)));

  root.innerHTML =
    '<label class="part-search"><span class="part-search__icon" aria-hidden="true">⌕</span>' +
    '<input type="search" id="partSearch" placeholder="Search parts…" value="' +
    search.replace(/[&<>"']/g, '') + '" aria-label="Search parts"></label>' +
    '<p class="part-count">' + visible.length + ' AVAILABLE PARTS</p>' +
    '<div class="part-filter" role="tablist">' +
    cats.map(c => '<button class="part-chip' + (c === filter ? ' is-active' : '') +
      '" type="button" data-cat="' + c + '">' + c + '</button>').join('') +
    '</div>' +
    CATEGORY_ORDER.filter(c => filter === 'ALL' || filter === c).map(cat => {
      const parts = visible.filter(([, d]) => d.category === cat);
      if (!parts.length) return '';
      return '<div class="part-group"><h3>' + cat + '</h3>' +
        parts.map(([id, d]) => {
          // Pack artwork is the material for every part; the sheet cell is
          // only a stand-in if that file never loads.
          const artPath = d.png || d.svg;
          const art = artPath
            ? '<img src="' + artPath + '" alt="" class="part-icon" data-pack-art="' + id + '"' +
              (d.png ? ' data-svg-fallback="' + d.svg + '"' : '') + '>'
            : '<span class="part-sprite" style="' + spriteStyle(id) + '"></span>';
          const price = formatMoney(partCost(d));
          return '<button class="part" type="button" data-part="' + id + '"' +
            ' title="' + d.name + ' · ' + d.mass + ' kg' + (d.fuelCapacity ? ' · ' + d.fuelCapacity + ' kg fuel' : '') +
            (d.thrust ? ' · ' + Math.round(d.thrust / 1000) + ' kN' : '') + ' · ' + price + '">' +
            art +
            '<span class="part-text"><span class="part-name">' + d.name + '</span>' +
            '<small>' + d.mass + ' kg' + (d.thrust ? ' · ' + Math.round(d.thrust / 1000) + ' kN' : '') + '</small></span>' +
            '<span class="part-price">' + price + '</span>' +
            '</button>';
        }).join('') +
        '</div>';
    }).join('') + (visible.length ? '' :
      '<p class="part-empty">No parts match “' + search.replace(/[&<>"']/g, '') + '”.</p>');

  const searchBox = root.querySelector('#partSearch');
  if (searchBox) searchBox.oninput = () => {
    const start = searchBox.selectionStart;
    search = searchBox.value.trim().toLowerCase();
    paint(root, editor);
    const next = root.querySelector('#partSearch');
    next.focus();
    next.setSelectionRange(start, start);
  };

  root.querySelectorAll('[data-cat]').forEach(b => {
    b.onclick = () => {
      filter = b.dataset.cat;
      paint(root, editor);
    };
  });

  // Try the vector artwork if a supplied PNG is unavailable, then the sheet.
  root.querySelectorAll('[data-pack-art]').forEach(img => {
    img.addEventListener('error', () => {
      if (img.dataset.svgFallback) {
        const fallback = img.dataset.svgFallback;
        delete img.dataset.svgFallback;
        img.src = fallback;
        return;
      }
      const id = img.dataset.packArt;
      const stand = document.createElement('span');
      stand.className = 'part-sprite';
      stand.style.cssText = spriteStyle(id);
      img.replaceWith(stand);
    }, {once: true});
  });

  root.querySelectorAll('[data-part]').forEach(b => {
    b.onclick = () => {
      editor.pending = editor.pending === b.dataset.part ? null : b.dataset.part;
      root.querySelectorAll('[data-part]').forEach(o =>
        o.classList.toggle('is-active', o.dataset.part === editor.pending));
      const hint = document.querySelector('#partHint');
      if (hint) {
        hint.textContent = editor.pending
          ? 'Placing ' + D[editor.pending].name + ' — click the build field (pack art ' +
            (D[editor.pending].png || D[editor.pending].svg ||
              'sheet cell ' + cellOf(editor.pending).join(', ')) + ')'
          : 'Click a part, then click the build field. Drag parts to reposition.';
      }
    };
  });
}

/** Last render's inputs so the budget panel can refresh itself live. */
let last = {rocket: null, editor: null};

export function updateBuildStats(rocket, editor) {
  last = {rocket, editor: editor || last.editor || null};
  const effEditor = editor || last.editor;
  const parts = (effEditor && effEditor.parts) || (rocket && rocket.parts) || [];
  const s = rocket.stats();
  renderMissionSystems(parts, s);
  const profile = profileById(effEditor && effEditor.budgetProfile);
  const budget = profile.budget;
  const bd = missionBreakdown(parts, s);
  const level = budgetLevel(bd.total, budget);
  const over = level.key === 'over';
  const set = (sel, text) => {
    const el = document.querySelector(sel);
    if (el) el.textContent = text;
  };

  set('#statMass', (s.mass / 1000).toFixed(1) + ' t');
  set('#statDv', Math.round(s.dv) + ' m/s');
  set('#statTwr', s.twr.toFixed(2));
  set('#statStages', s.stages);
  set('#statCost', formatMoney(bd.total));
  set('#statBudget', formatMoney(budget));
  set('#budgetProfile', profile.name);
  set('#budgetPct', Math.round(level.pct) + '%');

  // Live spending meter under the budget number.
  const meter = document.querySelector('#budgetMeter');
  if (meter) meter.style.width = Math.max(0, Math.min(100, level.pct)).toFixed(1) + '%';
  const toggle = document.querySelector('#budgetToggle');
  if (toggle) {
    toggle.className = 'budget-cell is-' + level.key;
    toggle.title = formatMoney(bd.total) + ' of ' + formatMoney(budget) + ' ' +
      profile.name.toLowerCase() + '-class budget — ' +
      (over
        ? 'over by ' + formatMoney(bd.total - budget)
        : formatMoney(budget - bd.total) + ' remaining') +
      ' · click for the full breakdown';
  }
  const costEl = document.querySelector('#statCost');
  if (costEl) costEl.classList.toggle('is-over', over);

  const warn = document.querySelector('#statWarn');
  if (warn) {
    const msgs = [];
    if (!s.mass) msgs.push('Empty build — add parts');
    if (!s.engines) msgs.push('No engine — cannot lift off');
    if (s.engines && s.twr < 1) msgs.push('TWR below 1 — will not leave the pad');
    if (!s.command) msgs.push('No command module');
    if (over) msgs.push('OVER BUDGET by ' + formatMoney(bd.total - budget));
    else if (level.key === 'critical') {
      msgs.push('Budget critical — ' + formatMoney(budget - bd.total) + ' left');
    }
    warn.textContent = msgs.join(' · ');
    warn.className = 'stat-warning' + (over ? ' is-over' : '');
    warn.hidden = !msgs.length;
  }

  // The budget is real: an unaffordable vehicle does not fly.
  const launchBtn = document.querySelector('#launchButton');
  if (launchBtn) {
    launchBtn.disabled = over;
    launchBtn.title = over
      ? 'Over budget by ' + formatMoney(bd.total - budget) +
        ' — raise the budget class or trim the design'
      : 'Fly the design';
  }

  if (isBudgetOpen()) renderBudgetPanel();
}

function renderMissionSystems(parts, stats) {
  const selector = document.querySelector('#missionProfile');
  if (selector) {
    selector.value = missionProfile;
    if (!missionSelectorWired) {
      missionSelectorWired = true;
      selector.addEventListener('change', () => {
        missionProfile = selector.value;
        if (last.rocket) updateBuildStats(last.rocket, last.editor);
      });
    }
  }
  const a = assessMission(parts, stats, missionProfile);
  const set = (sel, value) => { const el = document.querySelector(sel); if (el) el.textContent = value; };
  set('#missionReadiness', a.score + '%');
  const meter = document.querySelector('#missionReadinessMeter');
  if (meter) meter.style.width = a.score + '%';
  const metrics = document.querySelector('#missionSystemsMetrics');
  if (metrics) metrics.innerHTML = [
    ['SCIENCE', a.systems.science + ' / ' + a.profile.science],
    ['POWER', a.systems.generation + ' gen · ' + a.systems.draw + ' demand'],
    ['COMMS', a.systems.comms + ' / ' + a.profile.comms],
    ['ATTITUDE', a.controlReady ? 'AVAILABLE' : 'MISSING']
  ].map(([label, value]) => '<div><span>' + label + '</span><b>' + value + '</b></div>').join('');
  const warnings = document.querySelector('#missionDesignWarnings');
  if (warnings) warnings.innerHTML = a.warnings.length
    ? a.warnings.map(w => '<li>' + w.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])) + '</li>').join('')
    : "<li class=\"is-ready\">Core systems meet this profile\'s simplified requirements.</li>";
  const loadBtn = document.querySelector('#loadMissionRocket');
  if (loadBtn && a.profile) {
    loadBtn.textContent = '🚀 LOAD PRE-BUILT ' + (a.profile.label || '').toUpperCase();
  }
}

/* ---------------------------- budget panel ------------------------------ *
 * A modal breakdown of the whole NASA-style estimate, with live switching
 * between the real programme budget classes. */

let budgetWired = false;

function isBudgetOpen() {
  const modal = document.querySelector('#budgetModal');
  return !!modal && !modal.hidden;
}

function wireBudgetPanel() {
  if (budgetWired) return;
  budgetWired = true;

  const opener = document.querySelector('#budgetToggle');
  if (opener) opener.onclick = () => (isBudgetOpen() ? closeBudgetPanel() : openBudgetPanel());

  document.querySelectorAll('[data-budget-close]').forEach(el => {
    el.onclick = closeBudgetPanel;
  });

  // Profile chips are re-rendered, so delegate their clicks.
  const chips = document.querySelector('#budgetProfiles');
  if (chips) {
    chips.onclick = e => {
      const btn = e.target.closest('[data-profile]');
      if (!btn || !last.editor) return;
      last.editor.setBudgetProfile(btn.dataset.profile);
      updateBuildStats(last.rocket, last.editor);
    };
  }

  addEventListener('keydown', e => {
    if (e.key === 'Escape') closeBudgetPanel();
  });
}

export function openBudgetPanel() {
  const modal = document.querySelector('#budgetModal');
  if (!modal) return;
  modal.hidden = false;
  renderBudgetPanel();
}

export function closeBudgetPanel() {
  const modal = document.querySelector('#budgetModal');
  if (modal) modal.hidden = true;
}

function renderBudgetPanel() {
  const editor = last.editor;
  if (!editor) return closeBudgetPanel();
  const profile = profileById(editor.budgetProfile);
  const budget = profile.budget;
  const bd = missionBreakdown(editor.parts, last.rocket ? last.rocket.stats() : null);
  const level = budgetLevel(bd.total, budget);
  const remaining = budget - bd.total;
  const set = (sel, text) => {
    const el = document.querySelector(sel);
    if (el) el.textContent = text;
  };

  set('#budgetTitle', profile.name + '-CLASS');
  set('#budgetNote', profile.note);

  // Budget-class chips.
  const chips = document.querySelector('#budgetProfiles');
  if (chips) {
    chips.innerHTML = BUDGET_PROFILES.map(p =>
      '<button type="button" class="budget-chip' + (p.id === profile.id ? ' is-active' : '') +
      '" data-profile="' + p.id + '" title="' + p.note + '">' +
      '<b>' + p.name + '</b><span>' + formatMoney(p.budget) + '</span>' +
      '<small>' + p.note + '</small></button>').join('');
  }

  // Donut gauge (conic-gradient, animated through the --budget-p property).
  const ring = document.querySelector('#budgetRing');
  if (ring) {
    ring.className = 'budget-ring is-' + level.key;
    ring.style.setProperty('--budget-p', Math.max(0, Math.min(100, level.pct)).toFixed(1));
  }
  set('#budgetRingPct', Math.round(level.pct) + '%');
  set('#budgetRingLabel', 'of cap used');
  set('#budgetSpent', formatMoney(bd.total));
  set('#budgetCap', formatMoney(budget));

  const rem = document.querySelector('#budgetRemaining');
  if (rem) {
    rem.textContent = remaining >= 0
      ? formatMoney(remaining) + ' left'
      : formatMoney(-remaining) + ' over';
    rem.classList.toggle('is-over', remaining < 0);
  }
  set('#budgetStatus', level.label + ' · ' + formatMoney(bd.total) + ' of ' + formatMoney(budget));
  const status = document.querySelector('#budgetStatus');
  if (status) status.className = 'budget-status is-' + level.key;

  // Line items — share bars scaled against the largest line, animated in.
  const linesEl = document.querySelector('#budgetLines');
  if (linesEl) {
    const max = Math.max.apply(null, bd.lines.map(l => l.value).concat([1]));
    linesEl.innerHTML = bd.lines.map(l =>
      '<div class="budget-line">' +
        '<div class="budget-line__row"><span>' + l.label + '</span><b>' +
          formatMoney(l.value) + '</b></div>' +
        '<div class="budget-line__track"><i class="tone-' + l.tone +
          '" data-w="' + ((l.value / max) * 100).toFixed(1) + '"></i></div>' +
        '<small>' + l.note + '</small>' +
      '</div>').join('') +
      '<div class="budget-line budget-line--total"><div class="budget-line__row">' +
      '<span>Total mission cost</span><b>' + formatMoney(bd.total) + '</b></div></div>';

    requestAnimationFrame(() => requestAnimationFrame(() => {
      linesEl.querySelectorAll('[data-w]').forEach(i => {
        i.style.width = i.dataset.w + '%';
      });
    }));
  }

  // Reference footer — the number that puts it all in perspective.
  const foot = document.querySelector('#budgetFoot');
  if (foot) {
    const agencyShare = (bd.total / 25.4e9) * 100;
    foot.innerHTML = profile.note + ' · NASA\'s total budget request was ' +
      '$25.4B (FY2025), so this mission alone is ' +
      (agencyShare < 0.1 ? agencyShare.toPrecision(2) : agencyShare.toFixed(1)) +
      '% of the agency for a year. Contingency (30%) and management reserve ' +
      '(10%) are loaded exactly the way NASA builds a real estimate.';
  }
}

/** Current selected mission profile for flight/operations systems. */
export function getSelectedMissionProfile() { return missionProfile; }

export function setMissionProfile(profileKey) {
  if (profileKey && MISSION_PROFILES[profileKey]) {
    missionProfile = profileKey;
    const selector = document.querySelector('#missionProfile');
    if (selector) selector.value = profileKey;
  }
}
