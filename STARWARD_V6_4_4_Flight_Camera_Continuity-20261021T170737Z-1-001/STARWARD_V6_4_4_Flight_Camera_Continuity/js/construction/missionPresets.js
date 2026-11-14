/* =========================================================================
   missionPresets.js — authentic, mission-matched pre-built launch vehicles.

   Every vehicle is engineered from the existing part catalog to achieve
   100% design readiness for its target mission profile, with realistic staging,
   balanced thrust-to-weight, and seamless aerodynamic blending.
   ========================================================================= */
import {PART_DEFINITIONS as D} from '../rocket/partDefinitions.js';
import {attachmentSlots} from '../rocket/attachmentSystem.js';
import {RocketPart} from '../rocket/rocketPart.js';

export const MISSION_PRESET_CONFIGS = {
  starter: {
    id: 'starter',
    label: 'Starter Training Rocket',
    missionProfile: 'technology',
    description: 'A robust single-stage training vehicle with clustered engines for low-altitude flight practice.',
    core: ['noseCone', 'probeCore', 'adapter', 'wideTank', 'wideTank', 'wideTank', 'wideTank', 'wideTank', 'bigEngine'],
    // Engine Titan artwork is already a complete three-engine cluster.
    // Adding separate side engines here doubled the visible nozzle count.
    attachments: []
  },

  earthObservation: {
    id: 'earthObservation',
    label: 'Earth Observation Rocket',
    missionProfile: 'earthObservation',
    description: 'Two-stage orbital launcher (liftoff TWR ≈1.7) carrying a multispectral Earth observation satellite to 500 km orbit.',
    // Retuned (Phase 3 B4): liftoff TWR 1.74, ≈11.5 km/s vacuum Δv. The old
    // stack (TWR 4.2, 8.7 km/s) could not reach orbit in the simulation.
    core: [
      'noseCone', 'fairing', 'probeCore', 'science', 'battery', 'reactionWheel', 'adapter',
      'decoupler', 'hugeTank', 'vacuumEngine',
      'decoupler', 'hugeTank', 'hugeTank', 'mediumEngine'
    ],
    attachments: [
      {type: 'solarPanel', parentType: 'battery', sides: [-1, 1], align: 'center'},
      // Comms Antenna on the probe core: the Earth-observation profile needs
      // 1 comms point to downlink its imagery.
      {type: 'antenna', parentType: 'probeCore', sides: [1], align: 'center'},
      {type: 'booster', parentType: 'mediumEngine', sides: [-1, 1], align: 'bottom', capCone: 'sideCone'}
    ]
  },

  weather: {
    id: 'weather',
    label: 'Weather & Climate Satellite',
    missionProfile: 'weather',
    description: 'Meteorological launcher with side boosters (liftoff TWR ≈1.7) delivering climate sensors into 700 km orbit.',
    // Retuned (Phase 3 B4): liftoff TWR 1.73, ≈11.3 km/s vacuum Δv (was TWR 4.7, 9.1 km/s).
    core: [
      'noseConeLarge', 'fairing', 'probeCore', 'science', 'battery', 'reactionWheel', 'adapter',
      'decoupler', 'hugeTank', 'vacuumEngine',
      'decoupler', 'hugeTank', 'hugeTank', 'mediumEngine'
    ],
    attachments: [
      {type: 'highGainAntenna', parentType: 'probeCore', sides: [-1, 1], align: 'center'},
      {type: 'solarArray3', parentType: 'battery', sides: [-1, 1], align: 'center'},
      {type: 'booster', parentType: 'mediumEngine', sides: [-1, 1], align: 'bottom', capCone: 'sideCone'}
    ]
  },

  communications: {
    id: 'communications',
    label: 'Communications Relay Rocket',
    missionProfile: 'communications',
    description: 'High delta-V two-stage stack (liftoff TWR ≈1.5) engineered to place a comms relay dish into 1,200 km orbit.',
    // Retuned (Phase 3 B4): liftoff TWR 1.52, ≈11.8 km/s vacuum Δv (was TWR 4.5, 9.5 km/s).
    core: [
      'fairingCone', 'fairing', 'probeCore', 'battery', 'reactionWheel', 'rcs', 'adapter',
      'decoupler', 'hugeTank', 'vacuumEngine',
      'decoupler', 'hugeTank', 'hugeTank', 'hugeTank', 'bigEngine'
    ],
    attachments: [
      {type: 'highGainAntenna', parentType: 'probeCore', sides: [-1, 1], align: 'center'},
      {type: 'solarArray3', parentType: 'battery', sides: [-1, 1], align: 'center'},
      {type: 'finSet', parentType: 'bigEngine', sides: [-1, 1], align: 'bottom'}
    ]
  },

  lunar: {
    id: 'lunar',
    label: 'Lunar Exploration Stack',
    missionProfile: 'lunar',
    description: 'Heavy three-stage Saturn/Artemis-class launch stack with dedicated lunar lander stage and heavy boosters.',
    core: [
      'noseCone', 'fairing', 'roverCameraMast', 'science', 'probeCore', 'battery', 'reactionWheel', 'rcs', 'smallTank', 'legs', 'smallEngine',
      'decoupler', 'adapter', 'mediumTank', 'vacuumEngine',
      'decoupler', 'hugeTank', 'bigEngine'
    ],
    attachments: [
      {type: 'highGainAntenna', parentType: 'probeCore', sides: [-1, 1], align: 'center'},
      {type: 'solarArray3', parentType: 'battery', sides: [-1, 1], align: 'center'},
      {type: 'boosterLarge', parentType: 'bigEngine', sides: [-1, 1], align: 'bottom', capCone: 'sideCone'}
    ]
  },

  planetary: {
    id: 'planetary',
    label: 'Planetary Deep Space Explorer',
    missionProfile: 'planetary',
    description: 'Deep-space flagship with RTG nuclear power, robotic sampling arm, and heavy lifter for interplanetary trajectories.',
    core: [
      'roundFairing', 'science', 'roboticArm', 'probeCore', 'rtg', 'battery', 'reactionWheel', 'rcs', 'adapter',
      'decoupler', 'mediumTank', 'vacuumEngine',
      'decoupler', 'hugeTank', 'largeTank', 'bigEngine'
    ],
    attachments: [
      {type: 'highGainAntenna', parentType: 'probeCore', sides: [-1, 1], align: 'center'},
      {type: 'solarArray3', parentType: 'battery', sides: [-1, 1], align: 'center'},
      {type: 'boosterLarge', parentType: 'bigEngine', sides: [-1, 1], align: 'bottom', capCone: 'sideCone'}
    ]
  },

  technology: {
    id: 'technology',
    label: 'Technology Demonstration Launcher',
    missionProfile: 'technology',
    description: 'Three-stage launcher (liftoff TWR ≈1.5): booster and vacuum stage reach orbit; an ion kick stage flies the propulsion test.',
    // Retuned (Phase 3 B4): the 9 kN ion stage cannot climb, so a vacuum
    // upper stage now reaches orbit and the ion stage rides above it as a
    // kick stage. Liftoff TWR 1.50 (was 6.2 with no orbital capability).
    core: [
      'fairing', 'roverCameraMast', 'probeCore', 'battery', 'reactionWheel', 'solarPanel', 'adapter', 'decoupler', 'shortTank', 'ionEngine',
      'decoupler', 'hugeTank', 'vacuumEngine',
      'decoupler', 'hugeTank', 'hugeTank', 'hugeTank', 'bigEngine'
    ],
    attachments: [
      // Comms Antenna on the probe core: technology demos need 1 comms point.
      {type: 'antenna', parentType: 'probeCore', sides: [1], align: 'center'},
      {type: 'finSet', parentType: 'bigEngine', sides: [-1, 1], align: 'bottom'}
    ]
  }
};

/** Build and return a fully positioned and snapped array of RocketPart objects. */
export function buildPresetRocket(presetKey) {
  const config = MISSION_PRESET_CONFIGS[presetKey] || MISSION_PRESET_CONFIGS.starter;
  const parts = [];
  let prev = null;

  // 1. Build the central vertical stack
  for (const item of config.core) {
    const type = typeof item === 'string' ? item : item.type;
    const rot = (typeof item === 'object' && item.rotation) || 0;
    const flipX = (typeof item === 'object' && item.flipX) || false;
    const slot = prev ? attachmentSlots(type, prev, rot)[1] : {x: 0, y: 0};
    const part = new RocketPart(type, slot.x, slot.y, rot, flipX);
    parts.push(part);
    prev = part;
  }

  // 2. Attach symmetric side boosters / fins
  if (config.attachments) {
    for (const att of config.attachments) {
      const parent = parts.find(p => p.type === att.parentType) || parts[parts.length - 1];
      const parentDef = D[parent.type];
      const attDef = D[att.type];
      if (!parentDef || !attDef) continue;

      for (const side of (att.sides || [1])) {
        const slotIdx = side === -1 ? 2 : 3;
        // Use attachment system for correct horizontal (X) positioning
        const slot = attachmentSlots(att.type, parent, att.rotation || 0)[slotIdx];

        // Calculate Y: align the bottom of the side part with the bottom of the parent
        let y;
        const align = att.align || 'center';
        if (align === 'bottom') {
          // Bottom of parent = parent.y + parentDef.height/2
          // Bottom of side part should be at same Y, so:
          //   sidePartY + attDef.height/2 = parent.y + parentDef.height/2
          //   sidePartY = parent.y + (parentDef.height - attDef.height) / 2
          y = parent.y + (parentDef.height - attDef.height) / 2;
        } else {
          // 'center' — vertically centered on parent (default attachment behavior)
          y = slot.y;
        }

        const part = new RocketPart(
          att.type,
          slot.x,
          y,
          att.rotation || 0,
          side === -1
        );
        parts.push(part);

        // Optional aerodynamic nose cone atop side booster
        if (att.capCone) {
          const coneSlot = attachmentSlots(att.capCone, part, 0)[0];
          parts.push(new RocketPart(att.capCone, coneSlot.x, coneSlot.y, 0, side === -1));
        }
      }
    }
  }

  return parts;
}

