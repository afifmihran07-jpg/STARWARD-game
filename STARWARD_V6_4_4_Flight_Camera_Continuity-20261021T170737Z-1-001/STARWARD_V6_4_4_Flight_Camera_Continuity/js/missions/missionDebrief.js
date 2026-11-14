import {MISSION_PROFILES} from '../construction/missionSystems.js';
import {hasBoundOrbit} from './missionOperations.js';
import {formatMoney} from '../construction/budget.js';

/** Calculate a mission outcome from observed flight and operations state.
 * Destination profiles remain incomplete until transfer/arrival mechanics exist. */
export function evaluateMissionDebrief({profileId='earthObservation', orbit=null, body=null,
  crashed=false, spacecraftDeployed=false, operations=null, budget=null, budgetCap=null, fuelUsed=0, fuelCapacity=0}={}) {
  const profile = MISSION_PROFILES[profileId] || MISSION_PROFILES.earthObservation;
  const orbitValid = hasBoundOrbit(orbit, body);
  const achievedAltitude = Number.isFinite(orbit?.semiMajor) && body
    ? orbit.semiMajor - body.radius : null;
  const correctOrbitalBody = profile.orbitAlt === 0 || body?.id === 'earth';
  const targetOrbit = profile.orbitAlt > 0 && correctOrbitalBody && orbitValid && achievedAltitude != null &&
    Math.abs(achievedAltitude - profile.orbitAlt) <= Math.max(100000, profile.orbitAlt * 0.25);
  const scienceReady = !!operations?.scienceReady || profile.science === 0;
  const commsReady = (operations?.systems?.comms || 0) >= profile.comms;
  const operationalLoad = (operations?.systems?.draw || 0) + (operations?.instrumentOn && operations?.scienceReady ? (operations?.systems?.science || 0) * 2 : 0);
  const powerGeneration = operations?.systems?.generation || 0;
  const powerReady = !!operations && powerGeneration >= profile.power && powerGeneration >= operationalLoad && (operations.energyShortfallSeconds || 0) <= 0;
  const downlinked = operations?.dataDownlinkedMB || 0;
  const dataStored = operations?.dataStoredMB || 0;
  // A successful downlink moves data; it does not mean the spacecraft never
  // collected that data. Total collected is stored + successfully downlinked.
  const dataCollected = dataStored + downlinked;
  const destinationUnsupported = profileId === 'lunar' || profileId === 'planetary';
  const dataTransferRequired = profile.science > 0 || profileId === 'communications';
  // Budget: only judged when the cap is known. Over the cap is never a
  // complete success, however good the flight was.
  const overBudget = Number.isFinite(budget) && Number.isFinite(budgetCap) && budgetCap > 0 && budget > budgetCap;
  const failures = [];
  const recommendations = [];
  if (crashed) failures.push('The launch vehicle was destroyed.');
  if (!orbitValid) failures.push('No stable, atmosphere-clearing bound orbit was verified.');
  if (!correctOrbitalBody && profile.orbitAlt > 0) failures.push('This mission profile requires an Earth orbit; an orbit around another body is not a substitute.');
  if (!targetOrbit && profile.orbitAlt > 0) failures.push(`Target orbit not met: aim for approximately ${(profile.orbitAlt/1000).toFixed(0)} km mean altitude around Earth.`);
  if (!spacecraftDeployed) failures.push('The spacecraft was not physically deployed.');
  if (!scienceReady) failures.push(`Science capability is below the ${profile.science}-point requirement.`);
  if (powerGeneration < profile.power) failures.push(`Nominal power generation ${powerGeneration} is below the ${profile.power}-unit mission requirement.`);
  if (powerGeneration < operationalLoad) failures.push(`Nominal generation ${powerGeneration} is below the configured operating load ${operationalLoad}.`);
  if ((operations?.energyShortfallSeconds || 0) > 0) failures.push('The spacecraft experienced a power shortfall during operations.');
  if (!commsReady) failures.push(`Communications capability is below the ${profile.comms}-point requirement.`);
  if (dataTransferRequired && downlinked <= 0) failures.push(profileId === 'communications'
    ? 'No communications telemetry has been successfully downlinked.'
    : 'No science data has been successfully downlinked.');
  if (destinationUnsupported) failures.push('Destination transfer and arrival are not implemented; Earth orbit is not destination success.');
  if (overBudget) failures.push(`Mission cost ${formatMoney(budget)} exceeds the ${formatMoney(budgetCap)} budget cap by ${formatMoney(budget - budgetCap)}.`);
  if (crashed) recommendations.push('Reduce liftoff mass or increase thrust-to-weight ratio, then review staging and ascent guidance.');
  if (!orbitValid || !targetOrbit) recommendations.push('Use the orbital map and maneuver planner to reach a stable Earth orbit, clear the atmosphere and match the target altitude.');
  if (!spacecraftDeployed) recommendations.push('Place a command core and mission hardware in the upper payload stage, with a decoupler below it, then deploy after cutoff in orbit.');
  if (!scienceReady) recommendations.push('Add the missing science hardware for the selected profile.');
  if (powerGeneration < profile.power) recommendations.push(`Add solar generation or an RTG to meet the ${profile.power}-unit power requirement.`);
  else if (!powerReady) recommendations.push('Increase generation/storage or reduce subsystem loads to prevent operational power shortfalls.');
  if (!commsReady) recommendations.push('Add sufficient antenna capability and confirm spacecraft power is available.');
  if (dataTransferRequired && downlinked <= 0) recommendations.push(profileId === 'communications'
    ? 'Fit a command core and capable antenna, allow telemetry to accumulate, then execute a downlink.'
    : 'Keep the instrument powered long enough to collect data, then execute a downlink.');
  if (destinationUnsupported) recommendations.push('Choose an Earth-orbit profile for this build; lunar/planetary transfer capability is not yet available.');
  if (overBudget) recommendations.push('Trim hardware mass and cost, or fund the mission with a larger budget class before launch.');
  if (operations?.energyShortfallSeconds > 0) recommendations.push('Increase generation or battery capacity, or switch the science instrument off during low-power periods.');
  const complete = !crashed && orbitValid && targetOrbit && spacecraftDeployed && scienceReady && powerReady && commsReady &&
    (!dataTransferRequired || downlinked > 0) && !destinationUnsupported && !overBudget;
  const partial = !crashed && orbitValid && spacecraftDeployed;
  const grade = complete ? 'COMPLETE SUCCESS' : partial ? 'PARTIAL SUCCESS' : 'MISSION FAILURE';
  return {grade, complete, partial, profileId, profileLabel:profile.label, orbitValid, targetOrbit, correctOrbitalBody,
    achievedAltitude, spacecraftDeployed, scienceReady, commsReady, powerReady, powerGeneration, requiredPower:profile.power, operationalLoad, dataCollected, dataStored, downlinked,
    batteryPercent: operations?.maxBattery > 0 ? 100 * operations.battery / operations.maxBattery : null,
    powerGeneration, powerGenerated: operations?.powerGenerated || 0, energyConsumed: operations?.energyConsumed || 0,
    downlinkAttempts: operations?.downlinkAttempts || 0, downlinkFailures: operations?.downlinkFailures || 0,
    fuelUsed, fuelCapacity, fuelPercentUsed:fuelCapacity > 0 ? 100 * fuelUsed / fuelCapacity : 0,
    budget, budgetCap, budgetPercent:budgetCap > 0 ? 100 * budget / budgetCap : 0, withinBudget:!overBudget, failures, recommendations};
}
