/* =========================================================================
   blueprint.js — the workshop's BLUEPRINT VIEW (#rocket-preview).

   This is a mini-renderer: it draws the SAME vehicle the player assembles on
   the build field, using the SAME part artwork (Renderer.drawPart → PNG/SVG
   pack, sheet cell fallback). That means the blueprint can never drift out of
   sync with the parts bin or the build field — change a part and the blueprint
   changes with it. Tilt (previewRotation) and zoom (previewZoom) come from the
   DRAG-TO-TILT / SCROLL-TO-ZOOM view tools.
   ========================================================================= */
import {PART_DEFINITIONS as D} from './rocket/partDefinitions.js';
import {Renderer, BUILD_PART_SCALE, BUILD_DRAW_SCALE} from './renderer.js';

/** One shared renderer instance; we just repoint its canvas each draw. */
const renderer = new Renderer(document.createElement('canvas'));

/**
 * Draw the assembled rocket into #rocket-preview.
 * @param {Game} game  the running game (editor + preview view state).
 */
export function drawBlueprint(game) {
  const canvas = document.getElementById('rocket-preview');
  if (!canvas || !game || !game.editor) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;

  // Backdrop: deep-space radial + a faint blueprint grid.
  const bg = ctx.createRadialGradient(w * 0.5, h * 0.34, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.75);
  bg.addColorStop(0, '#123049');
  bg.addColorStop(1, '#030811');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.strokeStyle = 'rgba(117,212,255,.07)';
  ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 26) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = 0; y < h; y += 26) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  ctx.restore();

  const parts = game.editor.parts;
  if (!parts.length) {
    ctx.save();
    ctx.fillStyle = 'rgba(200,232,255,.7)';
    ctx.font = '600 20px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('Empty build — add parts on the field', w / 2, h * 0.5);
    ctx.font = '400 15px system-ui';
    ctx.fillStyle = 'rgba(160,200,225,.55)';
    ctx.fillText('This blueprint mirrors whatever you assemble', w / 2, h * 0.5 + 28);
    ctx.restore();
    return;
  }

  // Bounding box of the design, in build units, so the whole rocket fits.
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of parts) {
    const def = D[p.type] || {width: 1, height: 1};
    const hw = def.width * BUILD_PART_SCALE * BUILD_DRAW_SCALE / 2;
    const hh = def.height * BUILD_PART_SCALE * BUILD_DRAW_SCALE / 2;
    minX = Math.min(minX, p.x - hw); maxX = Math.max(maxX, p.x + hw);
    minY = Math.min(minY, p.y - hh); maxY = Math.max(maxY, p.y + hh);
  }
  const designW = Math.max(2, maxX - minX);
  const designH = Math.max(2, maxY - minY);

  // Fit the whole rocket inside ~80% of the canvas with a little margin.
  const scale = Math.min((w * 0.8) / designW, (h * 0.8) / designH) * (game.previewZoom || 1);
  const centerX = w / 2;
  const baseY = h * 0.5 + designH * scale / 2; // ground line sits under the rocket

  ctx.save();
  ctx.translate(centerX, baseY);
  if (game.previewRotation) ctx.rotate(-game.previewRotation);
  ctx.translate(-centerX, -baseY);

  // Ground line + ticks (drawn under the vehicle, inside the tilt transform).
  const gy = baseY;
  ctx.strokeStyle = 'rgba(211,232,241,.4)';
  ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(64, gy); ctx.lineTo(w - 64, gy); ctx.stroke();
  ctx.strokeStyle = 'rgba(211,232,241,.3)';
  ctx.lineWidth = 1;
  for (let t = 0; t <= 6; t++) {
    const x = 88 + t * (w - 176) / 6;
    ctx.beginPath(); ctx.moveTo(x, gy - 6); ctx.lineTo(x, gy + 6); ctx.stroke();
  }

  // Repoint the shared renderer's canvas at our preview canvas and draw.
  renderer.canvas = canvas;
  renderer.ctx = ctx;
  // Lowest first so upper stages overlap the ones below (matches build field).
  const ordered = parts.slice().sort((a, b) => b.y - a.y);
  for (const p of ordered) {
    const def = D[p.type];
    if (!def) continue;
    const sx = centerX + p.x * scale;
    const sy = baseY - p.y * scale;
    const wPx = def.width * scale * BUILD_PART_SCALE * BUILD_DRAW_SCALE;
    const hPx = def.height * scale * BUILD_PART_SCALE * BUILD_DRAW_SCALE;
    renderer.drawPart(p.type, sx, sy, wPx, hPx, p.rotation, 1, null, p.flipX);
  }
  ctx.restore();

  // Frame labels — same language as the build field's canvas label.
  const rocket = game.rocket;
  let heightM = 0;
  if (rocket && rocket.stats) heightM = rocket.stats().height || 0;
  if (!heightM && parts.length) {
    for (const p of parts) {
      const def = D[p.type];
      if (def) heightM = Math.max(heightM, (maxY - p.y) + def.height / 2);
    }
    heightM *= 2; // build units → metres
  }
  label(ctx, 'BLUEPRINT · SIDE ELEVATION', 28, 34, 'left', '#93b3c2', '12px "Cascadia Mono", Consolas, monospace');
  label(ctx, heightM ? '~' + Math.round(heightM) + ' m' : '—', w - 28, 34, 'right', '#d7e4e8');
  label(ctx, parts.length + (parts.length === 1 ? ' PART' : ' PARTS'), 28, h - 26, 'left', '#8fb3c4');
  label(ctx, 'MATCHES BUILD FIELD', w - 28, h - 26, 'right', '#e1ae67');
}

function label(ctx, text, x, y, align, color, font) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = font || '600 12px system-ui';
  ctx.textAlign = align;
  ctx.fillText(text, x, y);
  ctx.restore();
}

export default {draw: drawBlueprint};
