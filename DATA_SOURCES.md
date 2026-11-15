# STARWARD — Data sources

STARWARD is an educational 2D simulation. The figures below are **static values compiled into the game** (`js/celestial/solarSystem.js`). **There is no live data feed** and nothing is downloaded from NASA at run time. NASA has not reviewed or endorsed STARWARD.

## Planetary data — NASA NSSDCA fact sheets

Mass, radius, displayed surface gravity and orbital semi-major axis come from the **NASA Space Science Data Coordinated Archive (NSSDCA) Planetary Fact Sheets**:
<https://nssdc.gsfc.nasa.gov/planetary/planetfact.html>

| Bodies | NSSDCA page |
|---|---|
| Mercury, Venus, Earth, Moon, Mars, Jupiter, Saturn, Uranus, Neptune, Pluto | Planetary Fact Sheet (metric summary) and each planet's detailed fact sheet, e.g. <https://nssdc.gsfc.nasa.gov/planetary/factsheet/jupiterfact.html> |
| Sun | <https://nssdc.gsfc.nasa.gov/planetary/factsheet/sunfact.html> |
| Europa | Jovian Satellite Fact Sheet <https://nssdc.gsfc.nasa.gov/planetary/factsheet/joviansatfact.html> |
| Titan | Saturnian Satellite Fact Sheet <https://nssdc.gsfc.nasa.gov/planetary/factsheet/saturniansatfact.html> |
| Ceres | Asteroid Fact Sheet <https://nssdc.gsfc.nasa.gov/planetary/factsheet/asteroidfact.html> |

**How this is checked.** `tools/planetDataTest.js` holds the fact-sheet values (retrieved 2026-11-15). It fails if any body's mass, volumetric mean radius or semi-major axis in the game differs by more than 1%. Currently every value is within 1%; the largest deviation is Pluto's semi-major axis at 0.63%, because the game uses the summary table's mean distance. Displayed gravity is checked against the summary table within its two-significant-figure rounding. The map's body panel names the fact sheet each body's figures come from.

Notes on the values:
- Radii are **volumetric mean** radii from the detailed sheets. The summary table lists equatorial diameters, which differ by 2–3.5% for Jupiter and Saturn.
- Ceres' radius is derived from the listed 965 × 961 × 891 km dimensions as (965 + 961 + 891) / 6 ≈ 469.5 km.
- Gravity is display-only. The simulation computes gravity from each body's mass (μ = G·M), and Jupiter's and Saturn's displayed values are the equatorial values at the 1-bar level.

## Physics relationships — NASA Glenn Research Center, Beginner's Guide to Aeronautics

These pages ground the relationships the game uses. STARWARD implements simplified versions; it is not a NASA model.

1. Flight to Orbit — horizontal velocity, not altitude, makes an orbit: <https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/flight-to-orbit/>
2. Rocket Thrust Equation: <https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/rocket-thrust-equation/>
3. Ideal Rocket Equation (Δv, used for stage-by-stage Δv and maneuver propellant): <https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/ideal-rocket-equation/>
4. Earth Atmosphere Equation (Metric): <https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/earth-atmosphere-equation-metric/>

Further context:
- NASA Science, *Earth's Atmosphere: A Multi-layered Cake*: <https://science.nasa.gov/earth/earth-atmosphere/earths-atmosphere-a-multi-layered-cake/>
- NASA NTRS, *Launch Vehicle Ascent Trajectory Simulation Using POST2*: <https://ntrs.nasa.gov/citations/20170001620>. STARWARD is not equivalent to POST2.

(Also listed in `NASA_REFERENCES_V6_4_3.md` in the game folder.)

## Simplifications (stated honestly)

- **2D.** Motion is in a single plane. Vehicles have no roll or yaw, and there are no out-of-plane orbits.
- **Orbits are circular and coplanar, on rails.** Planets and moons follow circular orbits at their semi-major axis. There is no eccentricity, no inclination and no real ephemeris (positions are not J2000), and planets do not rotate.
- **Gravity** is summed over all bodies for the vehicle. The vehicle stays bound to the body it launched from: there is no sphere-of-influence switching yet, so Moon landings are not possible.
- **Atmosphere.** Density is a single exponential, ρ = ρ₀·e^(−h/8.5 km), used for every body. Earth's atmosphere is cut off at 100 km. Earth's Mach number uses a piecewise temperature approximation; other bodies use a simple envelope.
- **Venus atmosphere density is scaled.** The real surface density is about 65 kg/m³ (NSSDCA); the game uses 2.0 kg/m³ so a launch is possible.
- **Drag** uses a fixed 4 m reference diameter and a drag coefficient that depends on angle of attack, not the vehicle's shape.
- **Engines** have configured thrust and Isp. Isp is blended between sea level and vacuum, and there is no nozzle-flow solution.
- **Mission costs** use parametric $/kg rates anchored on public NASA cost caps (Discovery $500M, New Frontiers $850M, Flagship $2.5B). They are not NASA cost estimates.
- **Mission operations** (power, battery, science data, downlink) use normalized gameplay units with a simplified range model, not an RF link budget.
