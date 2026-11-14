/* =========================================================================
   editor.js — the assembly: add, drag, rotate, duplicate, delete, undo.

   Coordinates are build units; +y points down the stack, so the lowest part
   has the largest y (that is also the order stages are numbered in).
   ========================================================================= */
import {PART_DEFINITIONS as D} from '../rocket/partDefinitions.js';
import {RocketPart} from '../rocket/rocketPart.js';
import {attachmentSlots, snapPart} from '../rocket/attachmentSystem.js';
import {buildPresetRocket} from './missionPresets.js';
import {BuildGrid} from './buildGrid.js';
import {DEFAULT_BUDGET, DEFAULT_PROFILE, profileById, partCost} from './budget.js';

/** Default mission budget (USD) — re-exported from the NASA cost model in
 *  budget.js, which owns all budget arithmetic now. */
export {DEFAULT_BUDGET};

/** Flight-hardware cost of the current build, in USD (see budget.js for the
 *  full NASA-style estimate: propellant, launch, ops, loadings). */
export function buildCost(parts) {
  return parts.reduce((s, p) => s + (D[p.type] ? partCost(D[p.type]) : 0), 0);
}

export class Editor {
  constructor() {
    // Start with a clean pad so players can build their own vehicle.
    this.parts = [];
    this.grid = new BuildGrid;
    this.selected = null;
    this.pending = null;
    this.ghost = null;
    this.undoStack = [];
    this.redoStack = [];
    /** Selected NASA budget class (see budget.js BUDGET_PROFILES). */
    this.budgetProfile = DEFAULT_PROFILE;
    this.budget = DEFAULT_BUDGET;
  }

  /** Switch the funded budget class, e.g. 'discovery' → 'flagship'. */
  setBudgetProfile(id) {
    const profile = profileById(id);
    this.budgetProfile = profile.id;
    this.budget = profile.budget;
    return profile;
  }

  /* ------------------------------ history ----------------------------- */
  snapshot() {
    return this.parts.map(p => p.serialize());
  }

  commit() {
    this.undoStack.push(this.snapshot());
    if (this.undoStack.length > 40) this.undoStack.shift();
    this.redoStack = [];
  }

  restore(s) {
    this.parts = s.map(d => Object.assign(new RocketPart(d.type), d));
    this.selected = null;
  }

  undo() {
    const s = this.undoStack.pop();
    if (!s) return false;
    this.redoStack.push(this.snapshot());
    this.restore(s);
    return true;
  }

  redo() {
    const s = this.redoStack.pop();
    if (!s) return false;
    this.undoStack.push(this.snapshot());
    this.restore(s);
    return true;
  }

  /* ------------------------------- editing ---------------------------- */
  snapTolerance() {
    const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
    return Math.max(0.25, Math.min(0.65, 18 * dpr / Math.max(1, this.grid.scale)));
  }

  snapRadius() {
    const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
    return Math.max(1.25, Math.min(2.6, 48 * dpr / Math.max(1, this.grid.scale)));
  }

  add(type, x, y) {
    this.commit();
    const p = new RocketPart(type, x, y);
    this.parts.push(p);
    snapPart(p, this.parts, this.snapRadius());
    this.selected = p;
    return p;
  }

  /** Replace the current design with a ready-to-fly, single-stage starter. */
  loadStarter() {
    return this.loadPreset('starter');
  }

  /** Load an authentic, flight-ready vehicle pre-engineered for a specific mission. */
  loadPreset(presetKey = 'starter') {
    this.commit();
    this.parts = buildPresetRocket(presetKey);
    this.selected = null;
    this.pending = null;
    this.ghost = null;
    return this.parts;
  }

  remove() {
    if (!this.selected) return false;
    this.commit();
    this.parts = this.parts.filter(p => p !== this.selected);
    this.selected = null;
    return true;
  }

  rotate() {
    if (!this.selected) return false;
    this.commit();
    this.selected.rotation += Math.PI / 2;
    return true;
  }

  duplicate() {
    if (!this.selected) return false;
    this.commit();
    const p = new RocketPart(this.selected.type, this.selected.x + 1, this.selected.y,
      this.selected.rotation, this.selected.flipX);
    this.parts.push(p);
    snapPart(p, this.parts, this.snapRadius());
    this.selected = p;
    return true;
  }

  clear() {
    if (!this.parts.length) return false;
    this.commit();
    this.parts = [];
    this.selected = null;
    return true;
  }

  /** Part under a point in build units, topmost first. */
  hit(x, y, visualScale = 1) {
    return this.parts.slice().reverse().find(p => {
      const def = D[p.type];
      if (!def) return false;
      return Math.abs(p.x - x) < def.width * visualScale / 2 &&
        Math.abs(p.y - y) < def.height * visualScale / 2;
    });
  }

  /* ---------------------------- placement ----------------------------- */

  /** Nearest sensible slot for `type` near a build-unit position. */
  previewSlot(type, world, exclude = null, rotation = 0) {
    const def = D[type];
    if (!def) return null;
    let best = null;
    const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
    const magnetRadius = this.snapRadius();
    for (const p of this.parts) {
      if (p === exclude) continue;
      const other = D[p.type];
      if (!other) continue;
      for (const cand of attachmentSlots(type, p, rotation)) {
        const dist = Math.hypot(cand.x - world.x, cand.y - world.y);
        if (dist < magnetRadius && (!best || dist < best.dist)) best = {x: cand.x, y: cand.y, dist};
      }
    }
    return best ? {x: best.x, y: best.y} : {x: world.x, y: world.y};
  }

  /** Screen-space preview of the pending part (what the build view draws). */
  preview(type, screenPoint, canvasW, canvasH) {
    if (!type || !screenPoint) return null;
    const world = this.grid.world(screenPoint, canvasW, canvasH);
    const slot = this.previewSlot(type, world);
    return slot ? this.grid.screen(slot, canvasW, canvasH) : null;
  }

  /** Bounding box of the design in build units. */
  bounds() {
    if (!this.parts.length) return {minX: -3, maxX: 3, minY: -6, maxY: 6};
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of this.parts) {
      const def = D[p.type];
      if (!def) continue;
      minX = Math.min(minX, p.x - def.width / 2);
      maxX = Math.max(maxX, p.x + def.width / 2);
      minY = Math.min(minY, p.y - def.height / 2);
      maxY = Math.max(maxY, p.y + def.height / 2);
    }
    if (!isFinite(minX)) return {minX: -3, maxX: 3, minY: -6, maxY: 6};
    return {minX, maxX, minY, maxY};
  }

  /** Device-pixel ratio the canvas is rendered at (2 max, see renderer). */
  _dpr(canvasW, canvasH) {
    if (typeof window !== 'undefined' && window.innerWidth && canvasW) {
      const d = canvasW / window.innerWidth;
      if (isFinite(d) && d > 0.5 && d < 4) return d;
    }
    return 1;
  }

  /**
   * Zoom the grid so the whole design fits between the side panels.
   * Uses CSS pixels (device px / dpr) so HiDPI screens don't inflate the
   * zoom, and clamps to a comfortable band — the old 10..64 range let a
   * single tank fill the whole screen after CLEAR BUILD.
   */
  fit(canvasW, canvasH) {
    if (!isFinite(canvasW) || !isFinite(canvasH) || canvasW <= 0 || canvasH <= 0) return;
    const dpr = this._dpr(canvasW, canvasH);
    const cssW = canvasW / dpr, cssH = canvasH / dpr;
    const side = cssW > 900 ? 520 : 300;
    const top = cssH > 700 ? 240 : 170;
    const b = this.bounds();
    const w = Math.max(10, b.maxX - b.minX + 6);
    const h = Math.max(14, b.maxY - b.minY + 8);
    const availW = Math.max(200, cssW - side);
    const availH = Math.max(200, cssH - top);
    const scaleCss = Math.min(availW / w, availH / h);
    // Allow taller designs to zoom out enough to fit, then center their full
    // bounds. Presets are built from the nose downward and cannot use origin
    // centering without pushing the lower stages offscreen.
    this.grid.scale = Math.max(8, Math.min(30, scaleCss)) * dpr;
    this.grid.x = -(b.minX + b.maxX) * 0.5;
    this.grid.y = -(b.minY + b.maxY) * 0.5;
  }

  /**
   * Gentle reframe used after every edit: only zooms OUT when the new part
   * would leave the view, never zooms in — so placing parts no longer
   * yanks the camera. Called with the live canvas size.
   */
  ensureVisible(canvasW, canvasH) {
    if (!isFinite(canvasW) || !isFinite(canvasH) || canvasW <= 0 || canvasH <= 0) return;
    if (!isFinite(this.grid.scale) || this.grid.scale <= 0) { this.fit(canvasW, canvasH); return; }
    const dpr = this._dpr(canvasW, canvasH);
    const cssW = canvasW / dpr, cssH = canvasH / dpr;
    const side = cssW > 900 ? 520 : 300;
    const top = cssH > 700 ? 240 : 170;
    const b = this.bounds();
    const w = Math.max(10, b.maxX - b.minX + 6);
    const h = Math.max(14, b.maxY - b.minY + 8);
    const availW = Math.max(200, cssW - side);
    const availH = Math.max(200, cssH - top);
    const needCss = Math.min(availW / w, availH / h);
    const need = needCss * dpr;
    const cur = this.grid.scale;
    // Only shrink (with hysteresis) — growing back is the user's wheel-zoom.
    if (need < cur * 0.92) this.grid.scale = Math.max(12 * dpr, Math.min(34 * dpr, need));
    this.grid.scale = Math.max(10 * dpr, Math.min(40 * dpr, this.grid.scale));
  }

  /** Cursor-anchored zoom for the build field (wheel). */
  zoomAt(canvasW, canvasH, cursorX, cursorY, factor) {
    if (!isFinite(canvasW) || !canvasW || !isFinite(canvasH) || !canvasH) return;
    const dpr = this._dpr(canvasW, canvasH);
    const lo = 10 * dpr, hi = 56 * dpr;
    const before = this.grid.world({x: cursorX, y: cursorY}, canvasW, canvasH);
    this.grid.scale = Math.max(lo, Math.min(hi, this.grid.scale * factor));
    const after = this.grid.world({x: cursorX, y: cursorY}, canvasW, canvasH);
    this.grid.x += after.x - before.x;
    this.grid.y += after.y - before.y;
  }
}
