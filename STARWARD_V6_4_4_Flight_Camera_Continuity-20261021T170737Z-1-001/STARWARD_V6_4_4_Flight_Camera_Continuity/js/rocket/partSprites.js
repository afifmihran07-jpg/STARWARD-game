/* =========================================================================
   partSprites.js — textured PNG parts first, vector SVG second, sheet last.

   Supplied PNG textures take priority; their SVGs remain the fallback. Both
   render at natural aspect ratio. Parts without supplied textures use the
   vector pack, keeping the build field, flight view and parts bin crisp at
   any zoom instead of relying on a 96x128 sprite cell.

   The PNG sheet at SHEET.src is the fallback: it covers a part while its
   pack file is still loading, or permanently when that file is missing
   (`cell` is the [col, row] it occupies on the sheet).

   Swapping the sheet: drop your own image at SHEET.src (or change `src`
   here) as long as it keeps the same uniform grid, or edit the numbers
   below to match. tools/make-part-sheet.ps1 regenerates the default sheet.
   ========================================================================= */
import {PART_DEFINITIONS} from './partDefinitions.js';

export const SHEET = {
  src: 'assets/sprites/rocket-parts.png',
  cols: 13,
  rows: 9,
  cellW: 96,
  cellH: 128
};

/** partId -> [col, row] */
export const CELLS = new Map();
const ART_BOUNDS = new Map();
const CONTENT_BOUNDS = new WeakMap();

for (const [id, def] of Object.entries(PART_DEFINITIONS)) {
  CELLS.set(id, def.cell || [0, 0]);
}

export function cellOf(partId) {
  return CELLS.get(partId) || [0, 0];
}

/** Pixel rectangle of a part inside the sheet (for canvas drawImage). */
export function cellRect(partId) {
  const [col, row] = cellOf(partId);
  return ART_BOUNDS.get(partId) || {
    x: col * SHEET.cellW, y: row * SHEET.cellH,
    w: SHEET.cellW, h: SHEET.cellH
  };
}

function measureArtBounds(img) {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d', {willReadFrequently: true});
  if (!ctx) return;

  try {
    ctx.drawImage(img, 0, 0);
    const pixels = ctx.getImageData(0, 0, img.width, img.height).data;
    const bounds = new Map();
    for (let y = 0; y < img.height; y++) {
      for (let x = 0; x < img.width; x++) {
        const localX = x % SHEET.cellW;
        const localY = y % SHEET.cellH;
        if (localX < 2 || localX >= SHEET.cellW - 2 ||
            localY < 2 || localY >= SHEET.cellH - 2 ||
            !pixels[(y * img.width + x) * 4 + 3]) continue;
        const col = Math.floor(x / SHEET.cellW);
        const row = Math.floor(y / SHEET.cellH);
        const key = col + ',' + row;
        let b = bounds.get(key);
        if (!b) {
          b = {minX: x, minY: y, maxX: x, maxY: y};
          bounds.set(key, b);
        } else {
          b.minX = Math.min(b.minX, x);
          b.minY = Math.min(b.minY, y);
          b.maxX = Math.max(b.maxX, x);
          b.maxY = Math.max(b.maxY, y);
        }
      }
    }

    for (const [id, [col, row]] of CELLS) {
      const b = bounds.get(col + ',' + row);
      if (b) ART_BOUNDS.set(id, {
        x: b.minX, y: b.minY,
        w: b.maxX - b.minX + 1, h: b.maxY - b.minY + 1
      });
    }
  } catch (_) {
    ART_BOUNDS.clear();
  }
}

/** Inline CSS that shows one cell inside a fixed-aspect box. */
export function spriteStyle(partId) {
  const [col, row] = cellOf(partId);
  const px = SHEET.cols > 1 ? (col / (SHEET.cols - 1)) * 100 : 0;
  const py = SHEET.rows > 1 ? (row / (SHEET.rows - 1)) * 100 : 0;
  return 'background-image:url(' + SHEET.src + ');' +
    'background-size:' + (SHEET.cols * 100) + '% ' + (SHEET.rows * 100) + '%;' +
    'background-position:' + px.toFixed(3) + '% ' + py.toFixed(3) + '%;';
}

let image = null;
let ready = false;
let failed = false;
const watchers = [];

/* ------------------------- SVG parts pack ------------------------------ */

/** Intrinsic size asked for when a pack SVG is decoded (px). */
const PACK_INTRINSIC = 512;
/** Largest cached re-raster, in px — bounds the memory a zoomed part can use. */
const PACK_MAX = 768;

/** partId -> {img, state, url, retried, raster} */
const pack = new Map();

/**
 * Rewrite the root <svg> tag so the file rasterises at a large intrinsic
 * size. Engines differ: some raster an SVG at its intrinsic size and scale
 * that bitmap up, which blurs art authored at 100x100.
 *
 * The new width/height keep the artwork's own viewBox aspect — the bitmap
 * must never letterbox, or stretching it into a part's build-rect would
 * distort the art. Returns null when the art cannot be resized safely.
 * Exported so tools/packTest.js can verify every file in the pack.
 */
export function sizeSvg(text, size) {
  const start = text.indexOf('<svg');
  if (start < 0) return null;
  const end = text.indexOf('>', start);
  if (end < 0) return null;
  const tag = text.slice(start, end + 1);
  const vb = /viewBox\s*=\s*("([^"]*)"|'([^']*)')/.exec(tag);
  if (!vb) return null;
  const box = (vb[2] || vb[3] || '').trim().split(/[\s,]+/).map(Number);
  const vbW = box[2], vbH = box[3];
  if (!(vbW > 0) || !(vbH > 0)) return null;

  // One decimal place: rounding a very wide part's height to whole pixels
  // (a 7.5:1 decoupler) would otherwise skew the aspect by ~0.4%.
  const q = n => Math.round(n * 10) / 10;
  const w = vbW >= vbH ? size : q(size * vbW / vbH);
  const h = vbH > vbW ? size : q(size * vbH / vbW);

  const hasW = /\swidth\s*=/.test(tag);
  const hasH = /\sheight\s*=/.test(tag);
  let sized = tag.replace(/(\swidth\s*=\s*)("[^"]*"|'[^']*')/, '$1"' + w + '"')
                 .replace(/(\sheight\s*=\s*)("[^"]*"|'[^']*')/, '$1"' + h + '"');
  const add = (!hasW ? ' width="' + w + '"' : '') + (!hasH ? ' height="' + h + '"' : '');
  if (add) {
    sized = sized.endsWith('/>')
      ? sized.slice(0, -2) + add + '/>'
      : sized.slice(0, -1) + add + '>';
  }
  return text.slice(0, start) + sized + text.slice(end + 1);
}

/** Fit source artwork inside a build slot without distorting its texture. */
export function fitArtRect(sourceWidth, sourceHeight, slotWidth, slotHeight) {
  if (!(sourceWidth > 0) || !(sourceHeight > 0) ||
      !(slotWidth > 0) || !(slotHeight > 0)) return null;
  const scale = Math.min(slotWidth / sourceWidth, slotHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return {x: -width / 2, y: -height / 2, w: width, h: height};
}

/** Return the non-transparent source rectangle so sprite padding doesn't
 * become visible as a halo or consume the part's attachment length. */
export function contentRect(img) {
  if (!img) return null;
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  if (!(width > 0) || !(height > 0)) return null;
  const cached = CONTENT_BOUNDS.get(img);
  if (cached) return cached;
  let bounds = {x: 0, y: 0, w: width, h: height};
  if (typeof document !== 'undefined') {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', {willReadFrequently: true});
      ctx.drawImage(img, 0, 0);
      const pixels = ctx.getImageData(0, 0, width, height).data;
      let minX = width, minY = height, maxX = -1, maxY = -1;
      for (let y = 0; y < height; y++) {
        for (let x = 0, i = (y * width) * 4 + 3; x < width; x++, i += 4) {
          if (!pixels[i]) continue;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
      if (maxX >= minX && maxY >= minY) {
        bounds = {x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1};
      }
    } catch (_) {
      // Cross-origin or unavailable pixel access: draw the full image.
    }
  }
  CONTENT_BOUNDS.set(img, bounds);
  return bounds;
}

/** Create (once) the loader for a part's pack artwork. */
function packEntry(partId) {
  const def = PART_DEFINITIONS[partId];
  if (!def || !def.svg) return null;
  let e = pack.get(partId);
  if (e) return e;

  e = {img: null, state: 'loading', url: null, retried: false, pngFallback: false, raster: null};
  pack.set(partId, e);
  if (typeof Image === 'undefined') {
    e.state = 'failed';
    return e;
  }

  const img = new Image();
  img.decoding = 'async';
  img.onload = () => {
    if (e.state !== 'failed') e.state = 'ready';
  };
  img.onerror = () => {
    if (def.png && !e.pngFallback) {
      e.pngFallback = true;
      img.src = def.svg;
      return;
    }
    // One retry straight from the file if the generated blob was rejected.
    if (e.url && !e.retried) {
      e.retried = true;
      URL.revokeObjectURL(e.url);
      e.url = null;
      img.src = def.svg;
      return;
    }
    e.state = 'failed';
    e.raster = null;
    console.error('Failed to load part artwork: ' + (def.png ? def.png + ' or ' : '') + def.svg);
  };
  e.img = img;

  if (def.png) {
    img.src = def.png;
    return e;
  }

  // Fetch the SVG text so it can be re-authored at a large intrinsic size.
  // Over file:// the fetch fails, so the plain file is used instead — that
  // still works, just at the artwork's own 100x100 raster.
  if (typeof fetch !== 'function') {
    img.src = def.svg;
    return e;
  }
  fetch(def.svg)
    .then(r => (r.ok ? r.text() : Promise.reject(new Error('HTTP ' + r.status))))
    .then(text => {
      const sized = sizeSvg(text, PACK_INTRINSIC);
      if (!sized) {
        img.src = def.svg;
        return;
      }
      e.url = URL.createObjectURL(new Blob([sized], {type: 'image/svg+xml'}));
      img.src = e.url;
    })
    .catch(() => {
      if (!img.src) img.src = def.svg;
    });
  return e;
}

/** Kick off loading of every part's pack artwork (call once at start-up). */
export function loadPack() {
  for (const id of Object.keys(PART_DEFINITIONS)) packEntry(id);
}

/** Decoded pack artwork, or null while it loads / after it fails. */
export function vectorImage(partId) {
  const e = packEntry(partId);
  return e && e.state === 'ready' ? e.img : null;
}

/** `"ready/total"` — how much of the pack the renderer has in hand. */
export function packStatus() {
  let done = 0;
  for (const e of pack.values()) if (e.state === 'ready') done++;
  return done + '/' + pack.size;
}

/**
 * Pack artwork rasterised for the requested on-canvas size, so a part stays
 * crisp when it is drawn large: the cache is only rebuilt when the part is
 * bigger than the bitmap on hand, and always in the artwork's own aspect so
 * it maps onto the part's build-rect without distorting.
 *
 * Returns null until the artwork has decoded (the caller falls back to the
 * sheet), or when there is no artwork at all.
 */
export function packArt(partId, wPx, hPx) {
  const e = packEntry(partId);
  if (!e || e.state !== 'ready') return null;

  const natW = e.img.naturalWidth || 0;
  const natH = e.img.naturalHeight || 0;
  const natural = Math.max(natW, natH);
  if (!natural) return e.img;   // no intrinsic size to reason with — let the engine draw it

  const need = Math.ceil(Math.max(wPx, hPx) * 1.2);   // head-room for rotation
  // Past the cache ceiling, ask the engine to draw the vector straight at the
  // destination size — better than scaling a fixed bitmap up.
  if (need > PACK_MAX || typeof document === 'undefined') return e.img;
  const size = Math.max(need, 32);
  if (natural >= size) return e.img;                  // intrinsic raster already covers it
  // The cache keeps the artwork's own aspect, so its long side is what has to
  // cover the request (a wide part's cache is wide, not square).
  if (e.raster && Math.max(e.raster.w, e.raster.h) >= size) return e.raster.canvas;

  try {
    const k = size / natural;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(natW * k));
    canvas.height = Math.max(1, Math.round(natH * k));
    const g = canvas.getContext('2d');
    if (!g) return e.img;
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(e.img, 0, 0, canvas.width, canvas.height);
    e.raster = {canvas, w: canvas.width, h: canvas.height};
    return canvas;
  } catch (_) {
    return e.img;
  }
}

/** Load the sheet once; `cb(ok)` fires immediately when already resolved. */
export function loadSheet(cb) {
  if (ready || failed) {
    if (cb) cb(ready);
    return;
  }
  if (cb) watchers.push(cb);
  if (image) return;
  image = new Image();
  image.decoding = 'async';
  image.onload = () => {
    measureArtBounds(image);
    ready = true;
    watchers.splice(0).forEach(fn => fn(true));
  };
  image.onerror = () => {
    failed = true;
    image = null;
    watchers.splice(0).forEach(fn => fn(false));
  };
  image.src = SHEET.src;
}

export function sheetImage() {
  return ready ? image : null;
}

export function sheetFailed() {
  return failed;
}
