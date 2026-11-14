/**
 * Post-launch mission operations model.
 * Power and science figures are intentionally normalized gameplay estimates,
 * not spacecraft datasheets. Operations only unlock after deployment into the
 * profile's supported orbit and an engine cutoff. Earth-orbit profiles require Earth.
 */
import {MISSION_PROFILES, PART_SYSTEMS} from '../construction/missionSystems.js';

const SYSTEMS = PART_SYSTEMS;

export function createMissionOperations(parts = [], profileId = 'earthObservation') {
  const profile = MISSION_PROFILES[profileId] || MISSION_PROFILES.earthObservation;
  const systems = {science:0, draw:0, generation:0, solarGeneration:0, rtgGeneration:0, storage:0, comms:0, control:0, dataRate:0, telemetryRate:0};
  for (const part of parts) {
    const spec = SYSTEMS[part.type];
    if (!spec) continue;
    for (const [key, value] of Object.entries(spec)) systems[key] = (systems[key] || 0) + value;
  }
  // Only installed hardware contributes a load; per-component draw is summed
  // directly from the configured inventory above. RTG output is independent of
  // the sunlight cycle; solar output is modulated below.
  systems.generation = systems.solarGeneration + systems.rtgGeneration;
  const maxBattery = systems.storage * 100;
  return {
    profileId, profile, systems,
    active: false, deployed: false, instrumentOn: systems.science > 0,
    elapsedSeconds: 0, battery: maxBattery, maxBattery,
    dataStoredMB: 0, dataDownlinkedMB: 0, observations: 0,
    powerGenerated: 0, energyConsumed: 0, energyWasted: 0, energyShortfallSeconds: 0, currentGeneration: 0,
    downlinkAttempts: 0, downlinkFailures: 0,
    status: 'Awaiting spacecraft deployment in a verified orbit', events: [],
    get scienceReady() { return systems.science >= profile.science && systems.science > 0; },
    get powerMargin() { return systems.generation - (systems.draw + (this.instrumentOn ? systems.science * 2 : 0)); }
  };
}

/** Separate the upper payload stack as an independent, engine-less Rocket.
 * Requires a real stage joint (separator in a lower stage), verified bound
 * orbit, engine cutoff, and a compatible command/payload stack. */
export function deploySpacecraft(carrier, orbit, body, flightState = {}) {
  if (!carrier || !Array.isArray(carrier.parts) || !Array.isArray(carrier.groups))
    return {ok:false, message:'No launch vehicle is available.'};
  if (!hasBoundOrbit(orbit, body)) return {ok:false, message:'Deployment requires a verified bound orbit above the surface.'};
  if (!(flightState.engineCutoff === true)) return {ok:false, message:'Deployment requires engine cutoff and settled engine spool.'};
  const hasJointBelowPayload = carrier.groups.length >= 2 &&
    carrier.groups.slice(0, -1).some(g => g.some(p => ['decoupler','separator','rSeparator'].includes(p.type)));
  const engineOrFuelTypes = ['smallEngine','mediumEngine','vacuumEngine','bigEngine','booster','boosterLarge','aEngineCenter','aEngineSide','ionEngine','escapeTower','retroMotor','smallTank','shortTank','mediumTank','wideTank','largeTank','hugeTank'];
  // Staging already removes the lower group from Rocket.parts. If the player
  // has staged to an engine-less payload stack, adopt that independent object
  // rather than demanding a second, fictional separation joint.
  if (!hasJointBelowPayload && carrier.groups.length === 1) {
    const alreadySeparated = carrier.parts;
    const hasCore = alreadySeparated.some(p => p.type === 'probeCore' || p.type === 'capsule' || p.type === 'largeCapsule');
    const hasMissionHardware = alreadySeparated.some(p => ['science','roverCameraMast','roboticArm','solarPanel','solarArray3','rtg','battery','antenna','highGainAntenna'].includes(p.type));
    const hasEngineOrFuel = alreadySeparated.some(p => engineOrFuelTypes.includes(p.type));
    if (hasCore && hasMissionHardware && !hasEngineOrFuel) {
      carrier.stageIndex = -1; carrier.throttle = 0; carrier.spool = 0;
      carrier.landed = false; carrier.crashed = false;
      carrier.primaryBody = body; carrier.body = body;
      carrier.refresh();
      return {ok:true, spacecraft:carrier, parts:alreadySeparated.map(p => ({...p})), alreadySeparated:true,
        separatedMass:carrier.mass, carrierMassBefore:0, carrierMassAfter:carrier.mass,
        message:'Upper payload stage is already separated; spacecraft operations adopted its independent trajectory.'};
    }
    return {ok:false, message:'No usable stage joint below the payload. Add a separator/decoupler below the spacecraft.'};
  }
  if (!hasJointBelowPayload)
    return {ok:false, message:'No usable stage joint below the payload. Add a separator/decoupler below the spacecraft.'};
  const payload = carrier.groups[carrier.groups.length - 1];
  const payloadIds = new Set(payload.map(p => p.id));
  const hasCore = payload.some(p => p.type === 'probeCore' || p.type === 'capsule' || p.type === 'largeCapsule');
  const hasMissionHardware = payload.some(p => ['science','roverCameraMast','roboticArm','solarPanel','solarArray3','rtg','battery','antenna','highGainAntenna'].includes(p.type));
  const hasEngineOrFuel = payload.some(p => engineOrFuelTypes.includes(p.type));
  if (!hasCore || !hasMissionHardware || hasEngineOrFuel)
    return {ok:false, message:'Top stage must contain a command core and mission hardware, with no engine or propellant tank.'};
  const beforeMass = carrier.mass;
  const oldStageFuel = carrier.stageFuel.slice();
  const oldStageCapacity = carrier.stageCapacity.slice();
  const payloadCenter = payload.reduce((acc, p) => ({x:acc.x + p.x / payload.length, y:acc.y + p.y / payload.length}), {x:0, y:0});
  const craftParts = payload.map(p => ({...p, x:p.x - payloadCenter.x, y:p.y - payloadCenter.y}));
  const remaining = carrier.parts.filter(p => !payloadIds.has(p.id));
  if (!remaining.some(p => ['smallEngine','mediumEngine','vacuumEngine','bigEngine','booster','boosterLarge','aEngineCenter','aEngineSide','ionEngine'].includes(p.type)))
    return {ok:false, message:'Deployment would leave the launch vehicle without an engine assembly.'};
  carrier.parts = remaining;
  carrier.refresh();
  // Removing an unpowered top payload stage must not refill lower-stage tanks.
  carrier.stageFuel = carrier.stageCapacity.map((cap, i) => Math.min(cap, oldStageFuel[i] ?? cap));
  const craft = new (carrier.constructor)(craftParts);
  const c = Math.cos(carrier.angle), sn = Math.sin(carrier.angle);
  craft.position = {
    x:carrier.position.x + payloadCenter.x * 2 * c - payloadCenter.y * 2 * sn,
    y:carrier.position.y - (payloadCenter.x * 2 * sn + payloadCenter.y * 2 * c)
  };
  craft.velocity = {x:carrier.velocity.x, y:carrier.velocity.y};
  const dx = craft.position.x - body.position.x, dy = craft.position.y - body.position.y;
  const r = Math.max(1, Math.hypot(dx, dy));
  const separationSpeed = 0.5; // normalized low-energy relative separation impulse, m/s
  craft.position.x += dx / r * 2;
  craft.position.y += dy / r * 2;
  const totalMass = Math.max(1, carrier.mass + craft.mass);
  const craftDeltaV = separationSpeed * carrier.mass / totalMass;
  const carrierDeltaV = separationSpeed * craft.mass / totalMass;
  craft.velocity.x += dx / r * craftDeltaV;
  craft.velocity.y += dy / r * craftDeltaV;
  carrier.velocity.x -= dx / r * carrierDeltaV;
  carrier.velocity.y -= dy / r * carrierDeltaV;
  craft.angle = carrier.angle;
  craft.throttle = 0; craft.spool = 0; craft.stageIndex = -1;
  craft.landed = false; craft.crashed = false;
  craft.primaryBody = body; craft.body = body;
  craft.refresh();
  return {ok:true, spacecraft:craft, parts:craftParts, separatedMass:craft.mass, carrierMassBefore:beforeMass, carrierMassAfter:carrier.mass,
    message:`Spacecraft deployed: ${craftParts.length} payload component(s) separated with a 0.5 m/s radial impulse.`};
}

/** True only for a finite bound orbit with periapsis above the modeled atmosphere. */
export function hasBoundOrbit(orbit, body) {
  if (!orbit || !body || !Number.isFinite(orbit.r) || orbit.r <= 0 ||
      !Number.isFinite(orbit.periapsis) || !Number.isFinite(orbit.apoapsis) ||
      !Number.isFinite(orbit.eccentricity) || orbit.apoapsis < orbit.periapsis) return false;
  const atmosphereClearance = body.atmosphere?.height || 0;
  return Number.isFinite(orbit.semiMajor) && orbit.eccentricity >= 0 && orbit.eccentricity < 1 &&
    orbit.periapsis > body.radius + atmosphereClearance && orbit.semiMajor > 0;
}

export function stepMissionOperations(state, dt, orbit, body, flightState = {}) {
  if (!state || !Number.isFinite(dt) || dt <= 0) return state;
  if (!state.deployed) {
    state.status = 'Awaiting spacecraft deployment in a verified orbit';
    return state;
  }
  if (state.profileId === 'lunar' || state.profileId === 'planetary') {
    state.status = 'Destination transfer/arrival is not implemented for this profile';
    return state;
  }
  if (state.profile.orbitAlt > 0 && body?.id !== 'earth') {
    state.status = 'This mission profile requires Earth orbit';
    return state;
  }
  if (!hasBoundOrbit(orbit, body)) {
    state.status = state.active ? 'Operations paused · spacecraft no longer in a valid bound orbit' : 'Awaiting a verified bound orbit';
    return state;
  }
  if (flightState.engineCutoff !== true) {
    state.status = state.active ? 'Operations paused · propulsion active' : 'Bound trajectory detected · waiting for engine cutoff';
    return state;
  }
  if (!state.active) {
    const propulsionQuiet = flightState.engineCutoff === true;
    if (hasBoundOrbit(orbit, body) && propulsionQuiet) {
      state.active = true;
      state.status = 'Spacecraft deployed · orbital operations available';
      state.events.push('Verified bound orbit and deployment; operations unlocked');
    } else {
      state.status = hasBoundOrbit(orbit, body)
        ? 'Bound trajectory detected · waiting for engine cutoff'
        : 'Awaiting a verified bound orbit';
      return state;
    }
  }
  state.elapsedSeconds += dt;
  const sunlightFactor = 0.72 + 0.28 * Math.max(0, Math.sin(state.elapsedSeconds / 2400));
  const generation = state.systems.solarGeneration * sunlightFactor + state.systems.rtgGeneration;
  state.currentGeneration = generation;
  const instrumentLoad = state.instrumentOn && state.scienceReady ? state.systems.science * 2 : 0;
  const load = state.systems.draw + instrumentLoad;
  // Rates are normalized power units; battery capacity is normalized Wh.
  const energyDelta = (generation - load) * dt / 3600;
  const batteryBefore = state.battery;
  const generatedEnergy = generation * dt / 3600;
  const demandedEnergy = load * dt / 3600;
  const availableEnergy = batteryBefore + generatedEnergy;
  state.battery = Math.max(0, Math.min(state.maxBattery, batteryBefore + energyDelta));
  state.powerGenerated += generatedEnergy;
  state.energyConsumed += Math.min(demandedEnergy, availableEnergy);
  state.energyWasted += Math.max(0, batteryBefore + energyDelta - state.maxBattery);
  if (demandedEnergy > availableEnergy) state.energyShortfallSeconds += dt * Math.min(1, (demandedEnergy - availableEnergy) / Math.max(demandedEnergy, 1e-9));

  const canRunScience = state.instrumentOn && state.scienceReady && (generation >= load || state.battery > 0);
  const canRunTelemetry = state.profileId === 'communications' && state.systems.comms >= state.profile.comms &&
    state.systems.telemetryRate > 0 && (generation >= load || state.battery > 0);
  let producedThisStep = 0;
  if (canRunScience && state.systems.dataRate > 0) {
    const produced = state.systems.dataRate * dt / 60;
    state.dataStoredMB += produced;
    producedThisStep += produced;
    state.observations += Math.floor(state.dataStoredMB / 10) - Math.floor((state.dataStoredMB - produced) / 10);
  }
  if (canRunTelemetry) {
    const produced = state.systems.telemetryRate * dt / 60;
    state.dataStoredMB += produced;
    producedThisStep += produced;
  }
  if (producedThisStep > 0) {
    state.status = canRunScience && canRunTelemetry
      ? 'Science and communications telemetry accumulating'
      : canRunTelemetry ? 'Communications telemetry accumulating'
      : generation < load && state.battery === 0 ? 'Power-limited · science paused' : 'Science instrument operating';
  } else if (!state.scienceReady) {
    state.status = state.profile.science > 0
      ? 'Science unavailable · payload capability below mission requirement'
      : 'Science not required for this mission profile';
  } else if (state.battery <= 0 && generation < load) {
    state.status = 'Safe mode · power deficit and battery depleted';
  } else {
    state.status = 'Science instrument switched off';
  }
  return state;
}

export function downlinkMissionData(state, orbit, body) {
  if (!state?.active) return {ok:false, message:'Operations are not available until spacecraft deployment and orbit verification.'};
  state.downlinkAttempts++;
  if (state.systems.comms < state.profile.comms) {
    state.downlinkFailures++;
    return {ok:false, message:`Downlink unavailable: communications capability ${state.systems.comms}/${state.profile.comms}.`};
  }
  if (!orbit || !body || !Number.isFinite(orbit.r) || orbit.r <= 0 || !hasBoundOrbit(orbit, body)) {
    state.downlinkFailures++;
    return {ok:false, message:'Downlink unavailable: spacecraft is not in a verified bound orbit.'};
  }
  if (state.profile.orbitAlt > 0 && body.id !== 'earth') {
    state.downlinkFailures++;
    return {ok:false, message:'Downlink unavailable: this mission profile requires Earth orbit.'};
  }
  if (state.dataStoredMB <= 0) {
    state.downlinkFailures++;
    return {ok:false, message:'No stored science data is available to downlink.'};
  }
  const downlinkCost = 2; // normalized Wh per successful downlink session
  const operationalLoad = state.systems.draw + (state.instrumentOn && state.scienceReady ? state.systems.science * 2 : 0);
  if (state.battery < downlinkCost && state.currentGeneration < operationalLoad + downlinkCost) {
    state.downlinkFailures++;
    return {ok:false, message:'Downlink unavailable: insufficient power for the communications session.'};
  }
  // Simplified relative link-quality model; explicitly not an RF link budget.
  const distance = Math.max(1, orbit.r);
  const rangeFactor = Math.max(0.1, Math.min(1, body.radius / distance));
  const amount = Math.min(state.dataStoredMB, state.systems.comms * 50 * rangeFactor);
  if (!(amount > 0)) {
    state.downlinkFailures++;
    return {ok:false, message:'Link conditions prevented a data transfer.'};
  }
  if (state.battery >= downlinkCost) state.battery -= downlinkCost;
  else state.powerGenerated += downlinkCost; // direct generation covers this simplified session
  state.dataStoredMB = Math.max(0, state.dataStoredMB - amount);
  state.dataDownlinkedMB += amount;
  state.energyConsumed += downlinkCost;
  state.events.push(`Downlinked ${amount < 10 ? amount.toFixed(3) : amount.toFixed(1)} MB (simplified range model)`);
  state.status = 'Data downlink complete';
  return {ok:true, amount};
}

export function setScienceInstrument(state, enabled) {
  if (!state) return;
  state.instrumentOn = !!enabled && state.systems.science > 0;
  state.status = state.instrumentOn ? 'Science instrument operating' : 'Science instrument switched off';
}
