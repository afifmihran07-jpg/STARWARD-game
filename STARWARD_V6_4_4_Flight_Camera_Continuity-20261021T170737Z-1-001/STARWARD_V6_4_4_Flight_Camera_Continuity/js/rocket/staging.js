export function nextStage(rocket) {
  rocket.stage++;
  rocket.activeEngine = rocket.engines[rocket.stage] || rocket.engines[rocket.engines.length - 1] || null;
  return rocket.stage;
}
