import {buildPresetRocket, MISSION_PRESET_CONFIGS} from '../js/construction/missionPresets.js';
import {PART_DEFINITIONS as D} from '../js/rocket/partDefinitions.js';

for (const key of Object.keys(MISSION_PRESET_CONFIGS)) {
  console.log(`\n=== ${key} ===`);
  const parts = buildPresetRocket(key);
  for (const p of parts) {
    const def = D[p.type];
    const pad = p.type.padEnd(18);
    const bottom = (p.y + def.height / 2).toFixed(2);
    const top = (p.y - def.height / 2).toFixed(2);
    console.log(`  ${pad} x=${p.x.toFixed(2).padStart(7)}  y=${p.y.toFixed(2).padStart(7)}  top=${top.padStart(7)}  bot=${bottom.padStart(7)}  flip=${p.flipX}`);
  }
}
