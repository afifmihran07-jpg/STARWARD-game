/* =========================================================================
   partDefinitions.js — every part that can be bolted onto a rocket.

   Sizes are in build units (1 unit = 2 m in flight). `png` selects supplied
   textured part art when available; `svg` remains the crisp vector fallback.
   `cell` is the [column, row] of the sprite sheet used if both fail.
   ========================================================================= */
export const PART_DEFINITIONS = {
  /* COMMAND ------------------------------------------------------------- */
// Retained for old saves and flight compatibility; retired from the workshop catalog.
capsule: {name:'Pioneer Capsule', category:'COMMAND', mass:900, crew:2, width:2.2, height:2.4, color:'#e6edf2', png:'Capsule.png', svg:'capsule.svg', cell:[0,0], cost:120000, retired:true},
largeCapsule: {name:'Atlas Capsule', category:'COMMAND', mass:1700, crew:4, width:3.2, height:3, color:'#e6edf2', png:'RA Capsule.png', svg:'assets/parts/largeCapsule.svg', cell:[1,0], cost:250000, retired:true},
probeCore: {name:'Beacon Probe Core', category:'COMMAND', mass:120, width:1.6, height:1.2, color:'#cfd8de', png:'Probe.png', svg:'probe_core.svg', cell:[1,1], cost:45000},

  /* FUEL ---------------------------------------------------------------- */
  smallTank: {name:'Compact Tank', category:'FUEL', mass:350, fuelCapacity:2200, width:2, height:3.2, color:'#e8eef2', png:'Fuel Tank.png', svg:'fuel_tank_small.svg', cell:[2,0], cost:35000},
  shortTank: {name:'Squat Tank', category:'FUEL', mass:260, fuelCapacity:1600, width:2.6, height:1.8, color:'#e8eef2', png:'Side Fuselage.png', svg:'small_tank.svg', cell:[2,1], cost:25000},
  mediumTank: {name:'Standard Tank', category:'FUEL', mass:700, fuelCapacity:6000, width:3, height:5, color:'#e8eef2', png:'A Tank.png', svg:'medium_tank.svg', cell:[2,2], cost:80000},
  wideTank: {name:'Broad Tank', category:'FUEL', mass:900, fuelCapacity:8000, width:3.8, height:4.4, color:'#e8eef2', png:'R Fuselage.png', svg:'assets/parts/wideTank.svg', cell:[2,3], cost:110000},
  largeTank: {name:'Long Tank', category:'FUEL', mass:1200, fuelCapacity:13000, width:3.8, height:8, color:'#e8eef2', png:'R Tank.png', svg:'large_tank.svg', cell:[2,4], cost:180000},
  hugeTank: {name:'Monster Tank', category:'FUEL', mass:1900, fuelCapacity:24000, width:4.4, height:10.5, color:'#e8eef2', svg:'fuel_tank_large.svg', cell:[2,5], cost:350000},

  /* ENGINE -------------------------------------------------------------- */
  smallEngine: {name:'Kite Engine', category:'ENGINE', mass:280, thrust:160000, isp:320, width:2, height:1.5, color:'#e4762f', png:'Engine Kolibri.png', svg:'small_engine.svg', cell:[0,4], cost:85000},
  mediumEngine: {name:'Aster Engine', category:'ENGINE', mass:620, thrust:650000, isp:340, width:3, height:2, color:'#e4762f', png:'Engine Hawk.png', svg:'medium_engine.svg', cell:[0,5], cost:220000},
  vacuumEngine: {name:'Vela Vacuum', category:'ENGINE', mass:430, thrust:240000, isp:420, width:2.4, height:2.5, color:'#e4762f', png:'Engine Frontier.png', svg:'vacuum_engine.svg', cell:[0,6], cost:150000},
  bigEngine: {name:'Caldron Heavy', category:'ENGINE', mass:1450, thrust:1600000, isp:330, width:4.4, height:3.4, color:'#e4762f', png:'Engine Titan.png', svg:'assets/parts/bigEngine.svg', cell:[0,7], cost:550000},
  booster: {name:'Side Booster', category:'ENGINE', mass:520, thrust:420000, isp:340, fuelCapacity:3000, width:1.6, height:5.4, color:'#e4762f', png:'Engine Valiant.png', svg:'assets/parts/booster.svg', cell:[4,6], cost:120000},
  boosterLarge: {name:'Heavy Booster', category:'ENGINE', mass:980, thrust:850000, isp:345, fuelCapacity:6500, width:2.2, height:7.2, color:'#e4762f', png:'R Engine.png', svg:'assets/parts/boosterLarge.svg', cell:[4,7], cost:280000},
  aEngineCenter: {name:'A-Series Center Engine', category:'ENGINE', mass:720, thrust:700000, isp:335, width:1.8, height:3.4, color:'#e4762f', png:'A Eng Center.png', svg:'assets/parts/mediumEngine.svg', cell:[0,5], cost:210000},
  aEngineSide: {name:'A-Series Side Engine', category:'ENGINE', mass:420, thrust:320000, isp:330, width:1.8, height:3.2, color:'#e4762f', png:'A Eng Side.png', svg:'assets/parts/smallEngine.svg', cell:[0,4], cost:115000},
  ionEngine: {name:'Placeholder Ion Engine', category:'ENGINE', mass:65, thrust:9000, isp:1800, width:1.4, height:.9, color:'#ad93d8', png:'Placeholder ION.png', svg:'assets/parts/smallEngine.svg', cell:[0,4], cost:95000},
  escapeTower: {name:'Launch Escape Tower', category:'ENGINE', mass:620, thrust:180000, isp:250, fuelCapacity:500, width:1.2, height:4, color:'#e4762f', png:'RA LES.png', svg:'assets/parts/booster.svg', cell:[4,6], cost:90000},
  retroMotor: {name:'Retro Motor Pack', category:'ENGINE', mass:190, thrust:45000, isp:230, fuelCapacity:160, width:2.2, height:.9, color:'#e4762f', png:'RA Retro.png', svg:'assets/parts/smallEngine.svg', cell:[0,4], cost:18000},
  /* AERODYNAMIC --------------------------------------------------------- */
  noseCone: {name:'Nose Cone', category:'AERODYNAMIC', mass:80, width:2, height:1.8, color:'#eef3f6', png:'Cone.png', svg:'nose_cone.svg', cell:[0,1], cost:15000},
  noseConeLarge: {name:'Broad Nose Cone', category:'AERODYNAMIC', mass:160, width:3, height:2.8, color:'#eef3f6', png:'Cone Round.png', svg:'assets/parts/noseConeLarge.svg', cell:[0,2], cost:30000},
  fairing: {name:'Payload Fairing', category:'AERODYNAMIC', mass:220, width:3.4, height:3.2, color:'#eef3f6', png:'Fairing.png', svg:'fairing.svg', cell:[0,3], cost:55000},
  fairingCone: {name:'Fairing Cone', category:'AERODYNAMIC', mass:140, width:2.4, height:2.2, color:'#eef3f6', png:'Fairing Cone.png', svg:'assets/parts/fairing.svg', cell:[0,3], cost:26000},
  roundFairing: {name:'Rounded Fairing Cone', category:'AERODYNAMIC', mass:150, width:2.6, height:2.8, color:'#eef3f6', png:'Fairing Cone Round.png', svg:'assets/parts/fairing.svg', cell:[0,3], cost:28000},
  sideCone: {name:'Side Cone', category:'AERODYNAMIC', mass:95, width:1.6, height:2.2, color:'#eef3f6', png:'Cone Side.png', svg:'assets/parts/noseCone.svg', cell:[0,1], cost:18000},
  leftCover: {name:'Left Payload Cover', category:'AERODYNAMIC', mass:100, width:.8, height:4.2, color:'#eef3f6', png:'A Left Cover.png', svg:'assets/parts/fairing.svg', cell:[0,3], cost:24000},
  rightCover: {name:'Right Payload Cover', category:'AERODYNAMIC', mass:100, width:.8, height:4.2, color:'#eef3f6', png:'A Right Cover.png', svg:'assets/parts/fairing.svg', cell:[0,3], cost:24000},
  fin: {name:'Fin', category:'AERODYNAMIC', mass:70, width:1, height:2.2, color:'#cfd8de', svg:'fin.svg', cell:[4,0], cost:8000},
  finSet: {name:'Fin Set', category:'AERODYNAMIC', mass:140, width:2.2, height:2.2, color:'#cfd8de', svg:'assets/parts/finSet.svg', cell:[4,1], cost:18000},
  winglet: {name:'Winglets', category:'AERODYNAMIC', mass:110, width:2.6, height:1.6, color:'#cfd8de', svg:'assets/parts/winglet.svg', cell:[4,2], cost:22000},
  gridFin: {name:'Grid Fin', category:'AERODYNAMIC', mass:90, width:2, height:2.2, color:'#cfd8de', svg:'assets/parts/gridFin.svg', cell:[4,3], cost:35000},

  /* STRUCTURAL ---------------------------------------------------------- */
  adapter: {name:'Adapter', category:'STRUCTURAL', mass:180, width:3, height:1, color:'#aeb9c1', png:'A Adapter.png', svg:'adapter.svg', cell:[2,7], cost:12000},
  adapterShort: {name:'Low Adapter', category:'STRUCTURAL', mass:120, width:3, height:.6, color:'#aeb9c1', png:'A Bulkhead.png', svg:'assets/parts/adapterShort.svg', cell:[2,8], cost:8000},
  roverChassis: {name:'Rover Chassis', category:'STRUCTURAL', mass:820, width:3.5, height:3, color:'#d4a43e', png:'A Base.png', svg:'assets/parts/roverChassis.svg', cell:[5,0], cost:160000},
  rockerBogie: {name:'Rocker-Bogie Suspension', category:'STRUCTURAL', mass:460, width:4.6, height:3.4, color:'#aeb9c1', svg:'assets/parts/rockerBogie.svg', cell:[5,1], cost:95000},
  decoupler: {name:'Decoupler', category:'STRUCTURAL', mass:100, width:3, height:.4, color:'#e8c561', png:'Separator.png', svg:'decoupler.svg', stage:true, cell:[3,0], cost:25000},
  separator: {name:'Separator', category:'STRUCTURAL', mass:130, width:3, height:.8, color:'#e8c561', png:'A Separator.png', svg:'separator.svg', stage:true, cell:[3,1], cost:35000},
  rSeparator: {name:'R-Series Stage Separator', category:'STRUCTURAL', mass:90, width:2.8, height:.5, color:'#e8c561', png:'R Separator.png', svg:'assets/parts/decoupler.svg', stage:true, cell:[3,0], cost:22000},
  ring: {name:'Structural Ring', category:'STRUCTURAL', mass:60, width:2.6, height:.5, color:'#aeb9c1', svg:'assets/parts/ring.svg', cell:[3,2], cost:5000},
  plate: {name:'Mount Plate', category:'STRUCTURAL', mass:90, width:3, height:.5, color:'#aeb9c1', svg:'assets/parts/plate.svg', cell:[3,3], cost:7000},
  truss: {name:'Open Truss', category:'STRUCTURAL', mass:140, width:1.8, height:3.4, color:'#aeb9c1', svg:'assets/parts/truss.svg', cell:[3,4], cost:15000},
  strut: {name:'Strut', category:'STRUCTURAL', mass:40, width:1.4, height:1.6, color:'#aeb9c1', png:'Strut.png', svg:'strut.svg', cell:[3,5], cost:4000},
  conduit: {name:'Fuel Conduit', category:'STRUCTURAL', mass:25, width:.8, height:3, color:'#aeb9c1', svg:'assets/parts/conduit.svg', cell:[2,6], cost:3000},
  /* UTILITY ------------------------------------------------------------- */
  battery: {name:'Battery', category:'UTILITY', mass:90, width:1.4, height:1, color:'#cfd8de', svg:'battery.svg', cell:[1,4], cost:12000},
  solarPanel: {name:'Solar Panel', category:'UTILITY', mass:110, width:2.6, height:1, color:'#26467a', png:'Solar Array 2.png', svg:'solar_panel.svg', cell:[1,7], cost:35000},
  solarArray3: {name:'Deployable Solar Array', category:'UTILITY', mass:150, width:1.4, height:3.8, color:'#26467a', png:'Solar Array 3.png', svg:'assets/parts/solarPanel.svg', cell:[1,7], cost:48000},
  rcs: {name:'RCS Block', category:'UTILITY', mass:35, width:1, height:1, color:'#aeb9c1', png:'RCS.png', svg:'rcs.svg', cell:[1,6], cost:8000},
  reactionWheel: {name:'Reaction Wheel', category:'UTILITY', mass:130, width:1.6, height:1.4, color:'#aeb9c1', svg:'reaction_wheel.svg', cell:[1,5], cost:25000},
  science: {name:'Science Bay', category:'UTILITY', mass:150, width:2, height:1, color:'#ad93d8', svg:'science_module.svg', cell:[1,3], cost:45000},
  dockingPort: {name:'Docking Port', category:'UTILITY', mass:80, width:1.8, height:.8, color:'#aeb9c1', png:'Docking Port.png', svg:'docking_port.svg', cell:[1,2], cost:30000},
  antenna: {name:'Comms Antenna', category:'UTILITY', mass:45, width:1.2, height:1.6, color:'#aeb9c1', svg:'assets/parts/antenna.svg', cell:[1,8], cost:10000},
  roverCameraMast: {name:'Rover Camera Mast', category:'UTILITY', mass:135, width:2.4, height:3.6, color:'#9aa3ad', svg:'assets/parts/roverCameraMast.svg', cell:[5,2], cost:65000},
  highGainAntenna: {name:'High-Gain Antenna', category:'UTILITY', mass:70, width:3, height:2.9, color:'#c7cdd4', svg:'assets/parts/highGainAntenna.svg', cell:[5,3], cost:42000},
  roboticArm: {name:'Robotic Arm + Drill', category:'UTILITY', mass:185, width:4.2, height:2.2, color:'#c7cdd4', svg:'assets/parts/roboticArm.svg', cell:[5,4], cost:78000},
  rtg: {name:'RTG Power Source', category:'UTILITY', mass:220, width:3.6, height:2.4, color:'#7a828c', svg:'assets/parts/rtg.svg', cell:[5,5], cost:125000},

  /* LANDING ------------------------------------------------------------- */
  parachute: {name:'Parachute', category:'LANDING', mass:60, width:1.5, height:.6, color:'#f1f5f8', png:'Parachute.png', svg:'parachute.svg', cell:[0,8], cost:18000},
  backupParachute: {name:'Reserve Parachute', category:'LANDING', mass:55, width:1.5, height:.6, color:'#f1f5f8', png:'Parachute (1).png', svg:'assets/parts/parachute.svg', cell:[0,8], cost:16000},
  sideParachute: {name:'Side Parachute', category:'LANDING', mass:70, width:.8, height:3.2, color:'#f1f5f8', png:'Parachute Side.png', svg:'assets/parts/parachute.svg', cell:[0,8], cost:20000},
  heatShield: {name:'Heat Shield', category:'LANDING', mass:280, width:3.2, height:.6, color:'#aeb9c1', png:'Heat Sheild.png', svg:'assets/parts/adapter.svg', cell:[2,7], cost:52000},
  legs: {name:'Landing Legs', category:'LANDING', mass:130, width:2.8, height:1, color:'#7f8b96', png:'Landing Leg.png', svg:'landing_leg.svg', cell:[3,7], cost:45000},
  gear: {name:'Rover Gear', category:'LANDING', mass:120, width:1.6, height:1.6, color:'#7f8b96', png:'Landing Leg Big.png', svg:'assets/parts/gear.svg', cell:[3,8], cost:55000},
  wheel: {name:'Rover Wheel', category:'LANDING', mass:90, width:1.6, height:1.6, color:'#2a323a', png:'Wheel Medium.png', svg:'wheel.svg', cell:[4,8], cost:30000},
  roverWheel: {name:'Rover Wheel with Grousers', category:'LANDING', mass:145, width:2.6, height:2.8, color:'#2a323a', png:'Wheel Big.png', svg:'assets/parts/roverWheel.svg', cell:[5,6], cost:38000}
};

/** Category display order for the parts bin. */
export const CATEGORY_ORDER = ['COMMAND', 'FUEL', 'ENGINE', 'AERODYNAMIC', 'STRUCTURAL', 'UTILITY', 'LANDING'];
