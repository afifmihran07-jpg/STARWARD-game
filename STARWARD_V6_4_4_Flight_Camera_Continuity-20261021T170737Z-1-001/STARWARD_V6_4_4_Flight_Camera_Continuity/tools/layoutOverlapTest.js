/* A4: the two demo-flow overlaps stay fixed (CSS geometry, 1920x1080 base
 * layout). Measured in headless Chrome: telemetry card 58..222 px, its
 * dropdown 225..415 px; velocity unit "m/s" starts at card-top + 94 px. */
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../css/flight-dashboard.css', import.meta.url), 'utf8');
const base = css.split('@media')[0];
let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; };
const px = re => { const m = re.exec(base); assert.ok(m, 'rule found: ' + re); return Number(m[1]); };

// 1. Full telemetry dropdown vs mission/ops panels.
const dropdownMax = px(/\.fh-more \.metrics--more \{[^}]*max-height:\s*(\d+)px/);
const cardTop = px(/\.fh-card--telemetry \{[^}]*top:\s*(\d+)px/);
const CARD_HEIGHT = 164, SUMMARY_GAP = 3;                  // measured in the browser
const dropdownBottom = cardTop + CARD_HEIGHT + SUMMARY_GAP + dropdownMax;
const missionOpen = px(/:has\(#hud \.fh-more\[open\]\) #missionPanel \{ top:\s*(\d+)px/);
const opsOpen = px(/:has\(#hud \.fh-more\[open\]\) #missionOpsPanel \{ top:\s*(\d+)px/);
ok(missionOpen > dropdownBottom, `mission panel (${missionOpen}px) starts below the open telemetry list (${dropdownBottom}px)`);
ok(opsOpen > missionOpen + 145, `ops panel (${opsOpen}px) stays below the moved mission panel`);
ok(/\.fh-more \.metrics--more \{[^}]*grid-template-columns:\s*1fr;/.test(base), 'telemetry rows are one label/value per row');

// 2. Mach/regime column vs the velocity unit.
const metaTop = px(/\.fh-velocity-meta \{[^}]*top:\s*(\d+)px/);
const META_HEIGHT = 22, UNIT_TOP_FROM_CARD = 94;          // measured in the browser
ok(metaTop + META_HEIGHT < UNIT_TOP_FROM_CARD, `regime label ends (${metaTop + META_HEIGHT}px) above the velocity unit (${UNIT_TOP_FROM_CARD}px)`);

console.log(`${checks} checks passed: telemetry dropdown no longer covers the mission/ops panels, one-column rows, VACUUM clear of m/s`);
