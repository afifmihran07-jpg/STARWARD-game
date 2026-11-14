/* =========================================================================
   budget.js — NASA-anchored mission cost model.

   Everything in this file is scaled to real NASA dollars so the numbers on
   screen line up with published figures:

   · Budget classes mirror real programme cost caps:
       Discovery      $500M   (NASA Discovery AO cost cap, excluding launch)
       New Frontiers  $850M   (NF4 / Dragonfly was selected at this cap)
       Flagship       $2.5B   (Curiosity cost $2.5B, Perseverance ~$2.7B)
       Small Explorer ~$150M  (SMEX-class PI-managed missions, approximate)
   · Hardware is costed with NASA-style parametric $/kg relationships of the
     kind used in NASA cost estimating (GAO practice does the same:
     cost = a + b·mass, then loadings on top).
   · The estimate is built up the way a real NASA project estimate is:
       mission operations   12% of hardware      (planetary MOps run ~10–20%
                                                  of lifecycle cost)
       SE/PM                16% of direct cost   (GAO: typically 15–25%)
       contingency          30% of development   (NASA practice at PDR;
                                                  fixed-price commercial
                                                  launch is excluded)
       management reserve   10% of the estimate  (typical programme MR is
                                                  5–10%)

   Every constant below quotes its source; the figures are rounded public
   numbers, not exact appropriations.
   ========================================================================= */
import {PART_DEFINITIONS as D} from '../rocket/partDefinitions.js';

/* --------------------------- hardware rates ---------------------------- *
 * $/kg by subsystem, blended development + unit cost. Anchors:
 *   COMMAND     $60k/kg  — Apollo CMC ≈ $90M/unit in 1960s dollars; modern
 *                          crew capsules cost far less per kg than robotic
 *                          science spacecraft because instruments dominate
 *                          the latter.
 *   ENGINE      $35k/kg  — RS-25 ≈ $83M/unit ÷ ~3.5 t ≈ $24k/kg, RL10
 *                          ≈ $15M ÷ 0.2 t ≈ $75k/kg → blended.
 *   FUEL         $6k/kg  — aluminium-lithium tankage (launch-vehicle
 *                          structure is the cheap part of a rocket).
 *   AERODYNAMIC $15k/kg  — composite fairings and fins.
 *   STRUCTURAL   $8k/kg  — machined primary structure, adapters, trusses.
 *   UTILITY    $120k/kg  — avionics, instruments, batteries: cost-dense,
 *                          the classic driver of spacecraft $/kg.
 *   LANDING     $40k/kg  — lander gear and mechanisms.                     */
export const PART_COST_RATES = {
  COMMAND: 60000,
  ENGINE: 35000,
  FUEL: 6000,
  AERODYNAMIC: 15000,
  STRUCTURAL: 8000,
  UTILITY: 120000,
  LANDING: 40000
};

/** No part costs less than a trivial fabrication sum. */
export const PART_COST_FLOOR = 1500;

/** Bulk LOX/RP-1 runs about $1/kg; a Falcon 9's whole propellant load costs
 *  roughly $200k. Fuel is never what breaks a mission budget — hardware is. */
export const PROPELLANT_PER_KG = 1;

/* ----------------------------- loadings -------------------------------- */
export const OPS_RATE = 0.12;          // mission operations
export const SEP_RATE = 0.16;          // systems engineering & program mgmt
export const CONTINGENCY_RATE = 0.30;  // development contingency
export const RESERVE_RATE = 0.10;      // management reserve

/* ------------------------- launch services ----------------------------- *
 * Real list prices by the class of vehicle the stack needs. Ladder keyed on
 * liftoff mass (tonnes):   Electron ≈ $7.5M · Falcon 9 ≈ $67M ·
 * Falcon Heavy ≈ $97M · New Glenn ≈ $130M · SLS ≈ $2.2B (NASA OIG).       */
export const LAUNCH_LADDER = [
  {maxTons: 8,   cost: 7.5e6,  vehicle: 'Electron-class',
   source: 'Rocket Lab Electron ≈ $7.5M per flight'},
  {maxTons: 35,  cost: 67e6,   vehicle: 'Falcon 9',
   source: 'SpaceX Falcon 9 list price ≈ $67M'},
  {maxTons: 90,  cost: 97e6,   vehicle: 'Falcon Heavy',
   source: 'SpaceX Falcon Heavy ≈ $97M'},
  {maxTons: 350, cost: 130e6,  vehicle: 'New Glenn-class heavy',
   source: 'Blue Origin New Glenn ≈ $130M'},
  {maxTons: Infinity, cost: 2.2e9, vehicle: 'SLS Block 1',
   source: 'NASA OIG: ≈ $2.2B per SLS launch'}
];

/** Launch services for a liftoff mass in kg: {cost, vehicle, source}. */
export function launchServices(massKg) {
  const tons = (massKg || 0) / 1000;
  if (tons <= 0) return {cost: 0, vehicle: '—', source: 'no vehicle on the pad'};
  for (const rung of LAUNCH_LADDER) {
    if (tons <= rung.maxTons) return Object.assign({}, rung);
  }
  const last = LAUNCH_LADDER[LAUNCH_LADDER.length - 1];
  return Object.assign({}, last);
}

/* --------------------------- budget classes ---------------------------- *
 * Real NASA programme cost caps, used as the player's budget classes.      */
export const BUDGET_PROFILES = [
  {id: 'smex', name: 'SMALL EXPLORER', budget: 150e6,
   note: 'SMEX-class PI-managed mission ≈ $150M'},
  {id: 'discovery', name: 'DISCOVERY', budget: 500e6,
   note: 'NASA Discovery cost cap: $500M (excluding launch)'},
  {id: 'newFrontiers', name: 'NEW FRONTIERS', budget: 850e6,
   note: 'New Frontiers 4 (Dragonfly) was selected at an $850M cap'},
  {id: 'flagship', name: 'FLAGSHIP', budget: 2.5e9,
   note: 'Flagship scale: Curiosity $2.5B · Perseverance ≈ $2.7B'}
];

export const DEFAULT_PROFILE = 'discovery';

/** Look a profile up by id, falling back to the Discovery cap. */
export function profileById(id) {
  return BUDGET_PROFILES.find(p => p.id === id) ||
         BUDGET_PROFILES.find(p => p.id === DEFAULT_PROFILE);
}

/** Smallest budget class whose cap covers a total cost (USD); the largest class
 *  when nothing covers it. Used to fund a pre-built preset sensibly. */
export function smallestProfileFor(total) {
  const ordered = BUDGET_PROFILES.slice().sort((a, b) => a.budget - b.budget);
  return ordered.find(p => total <= p.budget) || ordered[ordered.length - 1];
}

/** Default mission budget (USD) — the Discovery-class cap. */
export const DEFAULT_BUDGET = profileById(DEFAULT_PROFILE).budget;

/* ------------------------------ costing -------------------------------- */

/** Unit cost of one part, in NASA dollars (rounded to $1k). */
export function partCost(def) {
  if (!def) return 0;
  const rate = PART_COST_RATES[def.category] || PART_COST_RATES.STRUCTURAL;
  const raw = Math.max(PART_COST_FLOOR, rate * (def.mass || 0));
  return Math.max(PART_COST_FLOOR, Math.round(raw / 1000) * 1000);
}

/** Total flight-hardware cost of a parts list, in USD. */
export function hardwareCost(parts) {
  let sum = 0;
  for (const p of parts || []) {
    const def = D[p.type];
    if (def) sum += partCost(def);
  }
  return sum;
}

/** Propellant cost for a fuel load in kg. */
export function propellantCost(fuelKg) {
  return Math.round((fuelKg || 0) * PROPELLANT_PER_KG);
}

/**
 * Full NASA-style cost build-up for a design.
 *
 * @param {Array}  parts  the editor's parts list.
 * @param {object} stats  optional rocket.stats() (mass/fuel), derived from
 *                        the parts list when absent.
 * @param {object} options {externalLaunch}: buy a commercial launch for the
 *                        stack (real list prices). Default false: the player
 *                        builds and flies the launcher, whose hardware and
 *                        propellant are already costed, so no launch fee is
 *                        added on top.
 * @returns {object} {lines, hardwareByCategory, hardware, propellant,
 *                    launch, ops, sep, contingency, reserve, total,
 *                    fuel, mass, launchVehicle}
 */
export function missionBreakdown(parts, stats, options = {}) {
  parts = parts || [];

  // --- 1. Flight hardware, split by subsystem ---------------------------
  const hardwareByCategory = {};
  let hardware = 0;
  let fuel = 0;
  let mass = 0;
  for (const p of parts) {
    const def = D[p.type];
    if (!def) continue;
    const c = partCost(def);
    hardware += c;
    hardwareByCategory[def.category] = (hardwareByCategory[def.category] || 0) + c;
    fuel += def.fuelCapacity || 0;
    mass += (def.mass || 0) + (def.fuelCapacity || 0);
  }
  if (stats) {
    fuel = stats.fuel != null ? stats.fuel : fuel;
    mass = stats.mass != null ? stats.mass : mass;
  }

  // --- 2. Propellant & fluids ------------------------------------------
  const propellant = propellantCost(fuel);

  // --- 3. Launch services ---------------------------------------------
  // The player's own rocket is the launcher: charging a commercial launch
  // as well would bill the same flight twice. An external launch keeps the
  // real vehicle ladder.
  const launchInfo = options.externalLaunch
    ? launchServices(parts.length ? mass : 0)
    : {cost: 0, vehicle: 'Own launch vehicle',
       source: 'player-built launcher — its hardware and propellant are costed above'};

  // --- 4. Mission operations (12% of hardware + propellant) -------------
  const ops = Math.round(OPS_RATE * (hardware + propellant));

  // --- 5. Systems engineering & program management (16% of direct) ------
  const direct = hardware + propellant + launchInfo.cost + ops;
  const sep = Math.round(SEP_RATE * direct);

  // --- 6. Contingency: 30% of the development scope. Fixed-price
  //        commercial launch carries no contingency. ----------------------
  const devScope = hardware + propellant + ops + sep;
  const contingency = Math.round(CONTINGENCY_RATE * devScope);

  // --- 7. Management reserve: 10% of the funded estimate ---------------
  const subtotal = direct + sep + contingency;
  const reserve = Math.round(RESERVE_RATE * subtotal);

  const total = subtotal + reserve;

  const lines = [
    {id: 'hardware', label: 'Flight hardware', tone: 'hw',
     value: hardware,
     note: Object.keys(hardwareByCategory).length
       ? Object.entries(hardwareByCategory)
           .sort((a, b) => b[1] - a[1])
           .map(([k, v]) => k.charAt(0) + k.slice(1).toLowerCase() + ' ' + formatMoney(v))
           .join(' · ')
       : 'no parts yet'},
    {id: 'propellant', label: 'Propellant & fluids', tone: 'fuel',
     value: propellant,
     note: Math.round(fuel) + ' kg × ' + formatMoney(PROPELLANT_PER_KG) +
       '/kg — bulk LOX/RP-1 is almost free'},
    {id: 'launch', label: 'Launch services', tone: 'launch',
     value: launchInfo.cost,
     note: launchInfo.vehicle + ' · ' + launchInfo.source},
    {id: 'ops', label: 'Mission operations', tone: 'ops',
     value: ops,
     note: Math.round(OPS_RATE * 100) + '% of hardware + propellant' +
       ' (NASA planetary MOps run ~10–20% of lifecycle)'},
    {id: 'sep', label: 'Systems engineering & program mgmt', tone: 'sep',
     value: sep,
     note: Math.round(SEP_RATE * 100) + '% of direct cost' +
       ' (GAO: SE/PM typically 15–25% of development)'},
    {id: 'contingency', label: 'Contingency', tone: 'cont',
     value: contingency,
     note: Math.round(CONTINGENCY_RATE * 100) + '% of development scope' +
       ' — fixed-price commercial launch is excluded'},
    {id: 'reserve', label: 'Management reserve', tone: 'mr',
     value: reserve,
     note: Math.round(RESERVE_RATE * 100) + '% of the funded estimate' +
       ' (typical programme MR is 5–10%)'}
  ];

  return {
    lines, hardwareByCategory, hardware, propellant,
    launch: launchInfo.cost, launchVehicle: launchInfo.vehicle,
    launchSource: launchInfo.source,
    ops, sep, contingency, reserve, total, fuel, mass
  };
}

/* --------------------------- formatting -------------------------------- */

function trimDecimals(x) {
  if (x >= 100) return String(Math.round(x));
  if (x >= 10) return x.toFixed(1).replace(/\.0$/, '');
  return x.toFixed(2).replace(/\.?0+$/, '');
}

/** Compact money: $61 · $61.2k · $466M · $2.5B */
export function formatMoney(v) {
  if (!isFinite(v)) return '—';
  const abs = Math.abs(v);
  const sign = v < 0 ? '−' : '';
  if (abs >= 1e9) return sign + '$' + trimDecimals(abs / 1e9) + 'B';
  if (abs >= 1e6) return sign + '$' + trimDecimals(abs / 1e6) + 'M';
  // 999.5k would round to "$1000k" — promote it to whole millions instead.
  if (abs >= 9.995e5) return sign + '$' + trimDecimals(abs / 1e6) + 'M';
  if (abs >= 1e3) return sign + '$' + trimDecimals(abs / 1e3) + 'k';
  return sign + '$' + Math.round(abs);
}

/**
 * Spending state for a total vs. a cap.
 * @returns {{pct:number, key:string, label:string}} key: ok | watch |
 *          critical | over
 */
export function budgetLevel(total, budget) {
  const pct = budget > 0 ? (total / budget) * 100 : 0;
  let key = 'ok', label = 'Within budget';
  if (total > budget) { key = 'over'; label = 'Over budget'; }
  else if (pct >= 90) { key = 'critical'; label = 'Budget critical'; }
  else if (pct >= 70) { key = 'watch'; label = 'Watch spending'; }
  return {pct, key, label};
}
