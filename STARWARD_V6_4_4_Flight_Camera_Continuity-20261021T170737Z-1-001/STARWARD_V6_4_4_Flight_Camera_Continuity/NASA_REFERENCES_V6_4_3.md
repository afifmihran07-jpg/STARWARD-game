# STARWARD V6.4.3 — NASA and Technical References

These sources ground the educational relationships used in STARWARD. They do **not** mean NASA has endorsed or validated STARWARD.

1. **NASA Glenn Research Center — Flight to Orbit**  
   https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/flight-to-orbit/  
   Supports the distinction between altitude and orbit: a vehicle must build horizontal velocity, and orbital speed depends on altitude. NASA's page describes about 17,478 mph for a 100-mile Earth orbit.

2. **NASA Glenn Research Center — Rocket Thrust Equation**  
   https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/rocket-thrust-equation/  
   Gives the generalized thrust relationship including exhaust momentum and the nozzle exit-pressure/ambient-pressure term. STARWARD uses simplified configured engine thrust and Isp rather than solving nozzle flow.

3. **NASA Glenn Research Center — Ideal Rocket Equation**  
   https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/ideal-rocket-equation/  
   Supports the changing-mass and ideal delta-v relationship. The starter's approximately 6.10 km/s ideal delta-v is calculated from its configured stage mass and Isp; it is not enough for orbital insertion once real trajectory losses are considered.

4. **NASA Glenn Research Center — Earth Atmosphere Equation (Metric)**  
   https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/earth-atmosphere-equation-metric/  
   Describes altitude-dependent temperature, pressure, and density and the limitations of simple atmospheric approximations. STARWARD still uses an exponential density model; its Earth Mach estimate uses a piecewise temperature approximation, not the full NASA model.

5. **NASA — Earth's Atmosphere: A Multi-layered Cake**  
   https://science.nasa.gov/earth/earth-atmosphere/earths-atmosphere-a-multi-layered-cake/  
   Supports the layered nature of the atmosphere and the distinction between a conventional space boundary and a sharp physical discontinuity. STARWARD's atmosphere fade remains gradual.

6. **NASA NTRS — Launch Vehicle Ascent Trajectory Simulation Using POST2**  
   https://ntrs.nasa.gov/citations/20170001620  
   Used as context for the architecture of real ascent-trajectory simulations; STARWARD is not equivalent to POST2.

7. **Supplied research report**  
   `docs/STARWARD_Space_Mission_Design_Game_Research_Report_Implementation_Blueprint.pdf`  
   Relevant topics include the 2D force model and drag approximation (printed pages 8–10), stage-by-stage launch sequence and camera strategy (pages 21–24), and physics/visual validation plan (pages 26–27).
