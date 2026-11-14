/* Mission systems model: transparent, game-scale engineering trade-offs.
 * Power figures are deliberately normalized gameplay estimates, not hardware datasheets. */
export const MISSION_PROFILES = {
  earthObservation: {label:'Earth observation', science:2, power:12, comms:1, orbitAlt:500000, budgetFactor:1},
  weather: {label:'Weather & climate', science:2, power:16, comms:2, orbitAlt:700000, budgetFactor:1.05},
  communications: {label:'Communications', science:0, power:8, comms:3, orbitAlt:1200000, budgetFactor:1.1},
  lunar: {label:'Lunar exploration', science:3, power:18, comms:2, orbitAlt:0, budgetFactor:1.4},
  planetary: {label:'Planetary exploration', science:3, power:20, comms:2, orbitAlt:0, budgetFactor:1.6},
  technology: {label:'Technology demonstration', science:1, power:8, comms:1, orbitAlt:400000, budgetFactor:0.8}
};

export const PART_SYSTEMS = {
  science: {science:2, draw:8, dataRate:18},
  roverCameraMast: {science:1, draw:4, dataRate:8},
  roboticArm: {science:2, draw:6, dataRate:10},
  solarPanel: {generation:18, solarGeneration:18},
  solarArray3: {generation:30, solarGeneration:30},
  rtg: {generation:22, rtgGeneration:22},
  battery: {storage:24},
  antenna: {comms:1, draw:1},
  highGainAntenna: {comms:3, draw:3},
  probeCore: {control:1, draw:2, telemetryRate:6},
  reactionWheel: {control:1, draw:2},
  rcs: {control:1, draw:1}
};

export function assessMission(parts = [], stats = {}, profileId = 'earthObservation') {
  const profile = MISSION_PROFILES[profileId] || MISSION_PROFILES.earthObservation;
  const systems = {science:0, draw:0, generation:0, solarGeneration:0, rtgGeneration:0, storage:0, comms:0, control:0, solar:0, rtg:0, battery:0, dataRate:0, telemetryRate:0};
  for (const part of parts) {
    const spec = PART_SYSTEMS[part.type];
    if (!spec) continue;
    for (const [key, value] of Object.entries(spec)) systems[key] = (systems[key] || 0) + value;
    if (part.type === 'solarPanel' || part.type === 'solarArray3') systems.solar++;
    if (part.type === 'rtg') systems.rtg++;
    if (part.type === 'battery') systems.battery++;
  }
  // Mission readiness and post-launch operations share the same component
  // inventory. Batteries buffer a deficit but do not masquerade as generation.
  const instrumentLoad = systems.science > 0 ? systems.science * 2 : 0;
  const operationalLoad = systems.draw + instrumentLoad;
  const powerMargin = systems.generation - operationalLoad;
  const scienceReady = profile.science === 0 || systems.science >= profile.science;
  const powerReady = systems.generation >= profile.power && systems.generation >= operationalLoad;
  const commsReady = systems.comms >= profile.comms;
  const controlReady = systems.control > 0;
  const launchReady = Number(stats.mass || 0) > 0 && Number(stats.engines || 0) > 0 && Number(stats.twr || 0) >= 1;
  const score = Math.round(100 * ([launchReady, scienceReady, powerReady, commsReady, controlReady].filter(Boolean).length / 5));
  const warnings = [];
  if (!launchReady) warnings.push('Launch system: add a command/payload stack and ensure TWR is at least 1.00.');
  if (!scienceReady) warnings.push(`${profile.label}: add ${Math.max(0, profile.science - systems.science)} science capability point(s).`);
  if (!powerReady) warnings.push(`Power insufficient: generation ${systems.generation} units vs ${operationalLoad} operating load and ${profile.power} required; battery storage buffers outages but does not replace generation.`);
  if (!commsReady) warnings.push(`Communications below mission requirement (${systems.comms}/${profile.comms}); add an antenna.`);
  if (!controlReady) warnings.push('No attitude-control component detected; add a reaction wheel or RCS block.');
  return {profile, systems, operationalLoad, powerMargin, scienceReady, powerReady, commsReady, controlReady, launchReady, score, warnings};
}
