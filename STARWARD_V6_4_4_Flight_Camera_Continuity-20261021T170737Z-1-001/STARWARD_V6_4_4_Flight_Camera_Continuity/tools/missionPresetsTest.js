import assert from 'node:assert/strict';
import {Editor} from '../js/construction/editor.js';
import {Rocket} from '../js/rocket/rocket.js';
import {assessMission, MISSION_PROFILES} from '../js/construction/missionSystems.js';
import {MISSION_PRESET_CONFIGS, buildPresetRocket} from '../js/construction/missionPresets.js';

console.log('Testing mission presets...');

const missionKeys = ['earthObservation', 'weather', 'communications', 'lunar', 'planetary', 'technology'];

for (const key of missionKeys) {
  assert.ok(MISSION_PRESET_CONFIGS[key], `Preset config must exist for mission "${key}"`);
  const parts = buildPresetRocket(key);
  assert.ok(parts.length >= 8, `Preset "${key}" should have a realistic part count`);

  const rocket = new Rocket(parts);
  const stats = rocket.stats();

  assert.ok(stats.mass > 0, `Preset "${key}" mass must be positive`);
  assert.ok(stats.engines > 0, `Preset "${key}" must include engines`);
  assert.ok(stats.twr >= 1.0, `Preset "${key}" TWR must be >= 1.0 (got ${stats.twr})`);
  assert.ok(stats.dv > 4000, `Preset "${key}" must provide sufficient orbital Delta-V (got ${stats.dv})`);

  const assessment = assessMission(parts, stats, key);
  assert.equal(assessment.score, 100, `Preset "${key}" must achieve 100% mission readiness (got ${assessment.score}%)`);
  assert.equal(assessment.warnings.length, 0, `Preset "${key}" must have 0 warnings (got ${assessment.warnings.join('; ')})`);

  console.log(`  ok  ${MISSION_PRESET_CONFIGS[key].label}: 100% readiness, ${Math.round(stats.dv)} m/s dv, ${stats.twr.toFixed(2)} TWR`);
}

// Check Editor integration
const editor = new Editor();
editor.loadPreset('lunar');
assert.equal(editor.parts.length, buildPresetRocket('lunar').length, 'Editor.loadPreset("lunar") sets parts');

editor.loadStarter();
assert.ok(editor.parts.length > 0, 'Editor.loadStarter() loads starter rocket');

console.log('All mission presets verified successfully!');

