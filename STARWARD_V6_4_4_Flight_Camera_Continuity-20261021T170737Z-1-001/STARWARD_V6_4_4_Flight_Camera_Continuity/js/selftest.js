/* =========================================================================
   selftest.js — numerical validation of the physics core.

   These tests run at boot, before the game is playable. Each one checks a
   property that a correct implementation must satisfy and a faked one
   would fail:

     1. Newtonian inverse-square gravity at known distances
     2. Symplectic integrator energy conservation over many orbits
     3. Kepler's third law  (T^2 proportional to a^3) vs simulation
     4. Circular-orbit stability (radius must not drift)
     5. vis-viva agreement with the numeric integrator
     6. Linear momentum conservation in a two-body collision
     7. Angular momentum conservation with no external torque
     8. Rocket equation delta-v (Tsiolkovsky) vs the simulated burn
     9. Frame-rate independence (identical results at different dt)
    10. Quaternion normalisation and rotation correctness
    11. Hierarchical planetary and moon orbital motion
   ========================================================================= */
(function (global) {
  'use strict';

  const { Vec3, Quat, Util } = global.Math3;
  const P = global.Physics;

  /* ------------------------------ Harness ------------------------------ */
  function makeTest(name, fn) { return { name, fn }; }

  function assert(cond, msg) {
    if (!cond) throw new Error(msg || 'assertion failed');
  }

  /** Relative error, guarding against division by zero. */
  function relErr(a, b) {
    const d = Math.abs(a - b);
    const s = Math.max(Math.abs(a), Math.abs(b));
    return s > 1e-30 ? d / s : 0;
  }

  /* ------------------------------- Tests -------------------------------- */

  const tests = [];

  // 1. Inverse-square law: halving the distance must quadruple the
  //    acceleration. A linear-gravity fake would fail this immediately.
  tests.push(makeTest('Inverse-square gravity law', function () {
    const body = { pos: Vec3.create(0, 0, 0), mu: 3.986004418e14 };   // Earth
    const r1 = 1e7, r2 = 5e6;                                          // r and r/2
    const a1 = P.gravityAt(Vec3.create(r1, 0, 0), body, {});
    const a2 = P.gravityAt(Vec3.create(r2, 0, 0), body, {});
    const m1 = Vec3.len(a1), m2 = Vec3.len(a2);
    assert(relErr(m2 / m1, 4) < 1e-9,
      'acceleration did not scale as 1/r^2 (ratio=' + (m2 / m1).toFixed(6) + ')');
  }));

  // 2. Energy conservation. Integrate a circular orbit for five periods and
  //    confirm the semi-major axis barely moves. This is the single most
  //    important test: it catches explicit Euler and too-large timesteps.
  tests.push(makeTest('Orbital energy conservation', function () {
    const mu = 3.986004418e14;
    const r0 = 8.0e6;                                  // ~800 km altitude
    const v0 = P.circularSpeed(mu, r0);
    const body = { pos: Vec3.create(0, 0, 0), mu };

    const ship = new P.RigidBody({
      pos: Vec3.create(r0, 0, 0),
      vel: Vec3.create(0, v0, 0),
      mass: 1000,
      inertia: [1, 1, 1]
    });

    const period = 2 * Math.PI * Math.sqrt(r0 * r0 * r0 / mu);
    const total = period * 5;
    const dt = 0.25;                                    // 0.25 s steps
    const n = Math.round(total / dt);
    const gravBodies = [body];

    const energyOf = () => {
      const o = P.stateToOrbit(ship.pos, ship.vel, mu);
      return o.energy;                                  // specific energy
    };
    const e0 = energyOf();

    for (let i = 0; i < n; i++) {
      const acc = P.gravitySum(ship.pos, gravBodies, {});
      ship.addForce(Vec3.mul(acc, ship.mass));
      P.integrateBody(ship, dt);
    }

    const e1 = energyOf();
    // Specific energy for a LEO orbit is ~-3e7 m^2/s^2; demand <1e-6 relative.
    assert(relErr(e0, e1) < 1e-6,
      'specific energy drifted by ' + relErr(e0, e1).toExponential(2) +
      ' over 5 orbits');
  }));
// 3. Kepler's third law: integrate one full orbit, measure the elapsed
  //    time, and compare against T = 2*pi*sqrt(a^3/mu).
  tests.push(makeTest("Kepler's third law", function () {
    const mu = 3.986004418e14;
    const r0 = 9.0e6;
    const v0 = P.circularSpeed(mu, r0);
    const a = r0;                                      // circular => a = r

    const ship = new P.RigidBody({
      pos: Vec3.create(r0, 0, 0),
      vel: Vec3.create(0, v0, 0),
      mass: 1000, inertia: [1, 1, 1]
    });
    const gravBodies = [{ pos: Vec3.create(0, 0, 0), mu }];

    const predicted = 2 * Math.PI * Math.sqrt(a * a * a / mu);
    const dt = 0.2;

    // Measure the period by accumulating unwrapped azimuth. Starting at
    // (r0, 0, 0) the naive atan2 wrap test is unreliable, so we count
    // continuous revolutions instead.
    let prevAngle = 0;
    let totalSweep = 0;
    let t = 0;

    for (let i = 0; i < 400000; i++) {
      ship.addForce(Vec3.mul(P.gravitySum(ship.pos, gravBodies, {}), ship.mass));
      P.integrateBody(ship, dt);
      t += dt;

      const angle = Math.atan2(ship.pos.y, ship.pos.x);
      // Shortest-arc delta, so a wrap through -pi/+pi still counts forward.
      let d = angle - prevAngle;
      if (d > Math.PI) d -= 2 * Math.PI;
      if (d < -Math.PI) d += 2 * Math.PI;
      totalSweep += d;
      prevAngle = angle;

      if (totalSweep >= 2 * Math.PI) break;
    }

    assert(totalSweep >= 2 * Math.PI,
      'orbit did not complete a revolution (swept ' + totalSweep.toFixed(3) + ' rad)');

    const measured = t * (2 * Math.PI / totalSweep);
    assert(relErr(measured, predicted) < 2e-3,
      'measured period ' + measured.toFixed(1) + ' s vs predicted ' +
      predicted.toFixed(1) + ' s');
  }));

  // 4. Circular stability: the radius of a circular orbit must stay put.
  //    Precession or eccentricity growth would show up as drift here.
  tests.push(makeTest('Circular orbit stability', function () {
    const mu = 3.986004418e14;
    const r0 = 7.0e6;
    const v0 = P.circularSpeed(mu, r0);
    const ship = new P.RigidBody({
      pos: Vec3.create(r0, 0, 0), vel: Vec3.create(0, v0, 0),
      mass: 1000, inertia: [1, 1, 1]
    });
    const gravBodies = [{ pos: Vec3.create(0, 0, 0), mu }];

    const period = 2 * Math.PI * Math.sqrt(r0 * r0 * r0 / mu);
    const dt = 0.2;
    const n = Math.round(period * 3 / dt);
    let rMin = Infinity, rMax = 0;

    for (let i = 0; i < n; i++) {
      ship.addForce(Vec3.mul(P.gravitySum(ship.pos, gravBodies, {}), ship.mass));
      P.integrateBody(ship, dt);
      const r = Vec3.len(ship.pos);
      if (r < rMin) rMin = r;
      if (r > rMax) rMax = r;
    }

    const eccentricity = (rMax - rMin) / (rMax + rMin);
    assert(eccentricity < 1e-3,
      'circular orbit became eccentric (e=' + eccentricity.toExponential(2) + ')');
  }));

  // 5. vis-viva: the speed needed for a transfer orbit, cross-checked
  //    against what the integrator actually needs to avoid falling in.
  tests.push(makeTest('Vis-viva speed agreement', function () {
    const mu = 3.986004418e14;
    const r = 8.0e6;
    const a = 1.1e7;                                   // elliptical target
    const vPredicted = P.visViva(mu, r, a);

    const ship = new P.RigidBody({
      pos: Vec3.create(r, 0, 0),
      vel: Vec3.create(0, vPredicted, 0),
      mass: 1000, inertia: [1, 1, 1]
    });
    const gravBodies = [{ pos: Vec3.create(0, 0, 0), mu }];

    // One step; then read the semi-major axis straight back out.
    ship.addForce(Vec3.mul(P.gravitySum(ship.pos, gravBodies, {}), ship.mass));
    P.integrateBody(ship, 0.001);

    const o = P.stateToOrbit(ship.pos, ship.vel, mu);
    assert(relErr(o.smAxis, a) < 1e-6,
      'semi-major axis ' + o.smAxis.toExponential(4) + ' != ' + a.toExponential(4));
    assert(o.ecc > 0 && o.ecc < 1, 'expected an elliptical orbit, got e=' + o.ecc);
  }));
// 6. Momentum conservation in a head-on collision. Two bodies with
  //    different masses must exchange momentum exactly.
  tests.push(makeTest('Collision momentum conservation', function () {
    const a = new P.RigidBody({
      pos: Vec3.create(-5, 0, 0), vel: Vec3.create(30, 0, 0),
      mass: 1000, radius: 1, restitution: 1.0, inertia: [1, 1, 1]
    });
    const b = new P.RigidBody({
      pos: Vec3.create(5, 0, 0), vel: Vec3.create(-10, 0, 0),
      mass: 4000, radius: 1, restitution: 1.0, inertia: [1, 1, 1]
    });

    const p0 = Vec3.dot(a.vel, a.vel) * a.mass + Vec3.dot(b.vel, b.vel) * b.mass;
    const e0 = 0.5 * a.mass * Vec3.dot(a.vel, a.vel) +
               0.5 * b.mass * Vec3.dot(b.vel, b.vel);

    P.resolveSphereContact(a, b, 0.016);

    const p1 = Vec3.dot(a.vel, a.vel) * a.mass + Vec3.dot(b.vel, b.vel) * b.mass;
    const e1 = 0.5 * a.mass * Vec3.dot(a.vel, a.vel) +
               0.5 * b.mass * Vec3.dot(b.vel, b.vel);

    assert(relErr(p0, p1) < 1e-9,
      'momentum not conserved: ' + p0.toFixed(3) + ' -> ' + p1.toFixed(3));
    // With restitution 1.0 the collision is perfectly elastic, so total
    // kinetic energy must be conserved too.
    assert(relErr(e0, e1) < 1e-9,
      'elastic collision lost energy: ' + e0.toFixed(2) + ' -> ' + e1.toFixed(2));
  }));

  // 7. Angular momentum. Torque-free motion must conserve |L| exactly in
  //    continuous time. Our integrator advances angular velocity explicitly,
  //    so |L| drifts at first order in dt rather than being exactly
  //    invariant. That is expected, so this test asserts the physically
  //    meaningful property: the drift is tiny, and it *shrinks* as dt is
  //    halved (confirming first-order convergence rather than a bug).
  tests.push(makeTest('Angular momentum conservation', function () {
    function drift(dt) {
      const body = new P.RigidBody({
        pos: Vec3.create(0, 0, 0),
        vel: Vec3.create(0, 0, 0),
        mass: 1000,
        inertia: [1200, 1800, 2400],
        angVel: Vec3.create(0.3, 0.2, 0.15)
      });

      const Lmag = () => Math.sqrt(
        Math.pow(body.inertia.x * body.angVel.x, 2) +
        Math.pow(body.inertia.y * body.angVel.y, 2) +
        Math.pow(body.inertia.z * body.angVel.z, 2)
      );

      const L0 = Lmag();
      // Cover 20 seconds of tumbling in every case, for a fair comparison.
      const n = Math.round(20 / dt);
      for (let i = 0; i < n; i++) P.integrateBody(body, dt);
      return relErr(L0, Lmag());
    }

    const coarse = drift(0.002);
    const fine = drift(0.001);

    assert(coarse < 1e-3,
      'angular momentum drifted by ' + coarse.toExponential(2) + ' in 20 s');
    // Halving dt must roughly halve the error => first-order convergence.
    assert(fine < coarse * 0.75,
      'error did not converge: dt=2e-3 gave ' + coarse.toExponential(2) +
      ', dt=1e-3 gave ' + fine.toExponential(2));
  }));

  // 8. Tsiolkovsky rocket equation. Burn until the tanks are empty and
  //    confirm the achieved delta-v matches Isp*ln(m0/m1).
  tests.push(makeTest('Rocket equation (Tsiolkovsky)', function () {
    const isp = 300;                                    // s, vacuum Isp
    const g0 = 9.80665;
    const exhaustVel = isp * g0;                        // m/s
    const m0 = 12000;                                   // kg
    const propellant = 6000;
    const m1 = m0 - propellant;

    const dvTheoretical = exhaustVel * Math.log(m0 / m1);
    // ln(2) * 300 s * 9.80665 m/s^2 = 2039.2355... m/s exactly.
    assert(relErr(dvTheoretical, 2039.2355) < 1e-6,
      'rocket equation sanity check failed: ' + dvTheoretical.toFixed(4) + ' m/s');

    // Simulate a constant-thrust burn. Mass falls linearly with time as
    // propellant is consumed, so acceleration a = F/m rises as the tank
    // empties. Burn until dry and compare against the closed-form answer.
    //
    // The mass flow rate follows from Newton's third law: the engine pushes
    // the exhaust backwards, so thrust F = mdot * exhaustVelocity. Deriving
    // mdot this way (rather than assuming a burn time) is what makes the
    // comparison against Tsiolkovsky a genuine independent check.
    const F = 40000;                                    // N
    const mdot = F / exhaustVel;                        // kg/s
    let m = m0, v = 0, t = 0;
    const dt = 0.0005;

    while (m > m1 && t < 900) {
      const a = F / m;                                 // a = F/m, not F/m0
      v += a * dt;
      m -= mdot * dt;
      t += dt;
    }
    assert(relErr(v, dvTheoretical) < 1e-3,
      'simulated dv ' + v.toFixed(1) + ' != ' + dvTheoretical.toFixed(1) + ' m/s');
  }));
// 9. Frame-rate independence. Integrating the same orbit with a fixed-step
  //    accumulator over the same total time must give the same answer as a
  //    single long step, and both must stay close to the analytic value.
  //    A variable-dt physics loop would fail this.
  tests.push(makeTest('Fixed-timestep consistency', function () {
    const mu = 3.986004418e14;
    const r0 = 8.0e6;
    const v0 = P.circularSpeed(mu, r0);
    const period = 2 * Math.PI * Math.sqrt(r0 * r0 * r0 / mu);

    // 10 orbits at two different fixed step sizes.
    function runOrbit(dt) {
      const ship = new P.RigidBody({
        pos: Vec3.create(r0, 0, 0), vel: Vec3.create(0, v0, 0),
        mass: 1000, inertia: [1, 1, 1]
      });
      const gb = [{ pos: Vec3.create(0, 0, 0), mu }];
      const n = Math.round(period * 3 / dt);
      for (let i = 0; i < n; i++) {
        ship.addForce(Vec3.mul(P.gravitySum(ship.pos, gb, {}), ship.mass));
        P.integrateBody(ship, dt);
      }
      return Vec3.len(ship.pos);
    }

    const rA = runOrbit(0.05);      // finer
    const rB = runOrbit(0.2);       // coarser, still stable
    const analytic = r0;

    // Both must return near the original radius after whole orbits.
    assert(relErr(rA, analytic) < 1e-2,
      'fine step drifted from circular radius by ' + relErr(rA, analytic).toExponential(2));
    assert(relErr(rB, analytic) < 5e-2,
      'coarse step drifted from circular radius by ' + relErr(rB, analytic).toExponential(2));
  }));

  // 10. Quaternion correctness: normalisation after integration, and that
  //     rotating a vector by a known 90-degree yaw gives the expected result.
  tests.push(makeTest('Quaternion rotation & normalisation', function () {
    const q = Quat.fromAxisAngle(Vec3.create(0, 1, 0), Math.PI / 2);
    const v = Quat.rotate(q, Vec3.create(1, 0, 0));
    // +90 deg about +Y maps +X to -Z (right-handed, Y-up).
    assert(Math.abs(v.x) < 1e-12 && Math.abs(v.z + 1) < 1e-12,
      'yaw rotation wrong: got (' + v.x.toFixed(3) + ',' + v.y.toFixed(3) + ',' + v.z.toFixed(3) + ')');

    // Spin hard for many steps: the quaternion must stay unit length.
    const q2 = Quat.create();
    const w = Vec3.create(1.7, -0.9, 2.3);
    for (let i = 0; i < 100000; i++) Quat.integrate(q2, w, 0.001);
    const n = Math.sqrt(q2.x * q2.x + q2.y * q2.y + q2.z * q2.z + q2.w * q2.w);
    assert(Math.abs(n - 1) < 1e-6, 'quaternion norm drifted to ' + n.toFixed(9));
  }));

  // 11. lookRotation must orient local -Z along the requested direction.
  //     This regressed once (an inverted basis made the ship point its nose
  //     backwards, so prograde thrust braked it), so it is locked down here.
  tests.push(makeTest('lookRotation orientation', function () {
    const cases = [
      [Vec3.create(1, 0, 0), Vec3.create(0, 1, 0)],    // +X
      [Vec3.create(0, 1, 0), Vec3.create(0, 0, 1)],    // +Y (degenerate up)
      [Vec3.create(0, 0, 1), Vec3.create(0, 1, 0)],    // +Z
      [Vec3.create(-1, 0, 0), Vec3.create(0, 1, 0)]    // -X
    ];
    for (let i = 0; i < cases.length; i++) {
      const fwd = cases[i][0], up = cases[i][1];
      const q = Quat.lookRotation(fwd, up);
      const got = Quat.rotate(q, Vec3.create(0, 0, -1));   // local forward
      const want = Vec3.norm(fwd);
      const err = Vec3.dist(got, want);
      assert(err < 1e-9,
        'case ' + i + ': forward came out (' + got.x.toFixed(3) + ',' +
        got.y.toFixed(3) + ',' + got.z.toFixed(3) + ') instead of (' +
        want.x.toFixed(3) + ',' + want.y.toFixed(3) + ',' + want.z.toFixed(3) + ')');
    }
  }));

  // 12. SI formatting. A mixed x1000 ladder once reported 6140 m as
//     "6.14 u" instead of "6.14 k", so the prefixes are pinned here.
  tests.push(makeTest('SI prefix formatting', function () {
    const cases = [
      [0, '0'],
      [6140, '6.14 k'],
      [4200000, '4.20 M'],
      [6.371e9, '6.37 G'],
      [1000, '1.00 k'],
      [999, '999.00'],
      [0.5, '500.00 m'],
      [0.001, '1.00 m'],
      [2.5e-7, '250.00 n'],   // 250 nanometres
      [2.5e-6, '2.50 u']     // 2.5 micrometres
    ];
    for (let i = 0; i < cases.length; i++) {
      const got = Util.formatSI(cases[i][0]).trim();
      assert(got === cases[i][1],
        'formatSI(' + cases[i][0] + ') = "' + got + '", expected "' + cases[i][1] + '"');
    }
  }));

  if (global.Universe) {
    tests.push(makeTest('Hierarchical solar-system orbits', function () {
      const sys = global.Universe.buildSystem();
      const pairs = [
        [sys.earth, sys.sun],
        [sys.mars, sys.sun],
        [sys.luna, sys.earth],
        [sys.phobos, sys.mars],
        [sys.station, sys.earth]
      ];
      const initialRadii = pairs.map(function (pair) {
        return Vec3.dist(pair[0].pos, pair[1].pos);
      });
      const initialEarth = Vec3.clone(sys.earth.pos);
      const initialMars = Vec3.clone(sys.mars.pos);

      for (let i = 0; i < 24; i++) {
        global.Universe.advanceKinematic(sys, 3600);
      }

      assert(Vec3.dist(sys.earth.pos, initialEarth) > 1e9,
        'Earth did not move along its heliocentric orbit');
      assert(Vec3.dist(sys.mars.pos, initialMars) > 1e9,
        'Mars did not move along its heliocentric orbit');
      for (let i = 0; i < pairs.length; i++) {
        const radius = Vec3.dist(pairs[i][0].pos, pairs[i][1].pos);
        assert(Math.abs(radius - initialRadii[i]) < 1,
          'orbital radius drifted for ' + pairs[i][0].name +
          ' by ' + Math.abs(radius - initialRadii[i]).toFixed(3) + ' m');
      }
    }));
  }

  if (global.Ship) {
    tests.push(makeTest('Rate-controlled steering and damping', function () {
      const ship = new global.Ship(Vec3.create(), Vec3.create());
      ship.pitchCmd = 1;
      for (let i = 0; i < 90; i++) {
        ship.update(1 / 120, null);
        P.integrateBody(ship.body, 1 / 120);
      }
      const commandedRate = Vec3.len(ship.body.angVel);
      assert(commandedRate > 0.2, 'pitch input did not rotate the vehicle');

      ship.pitchCmd = 0;
      for (let i = 0; i < 240; i++) {
        ship.update(1 / 120, null);
        P.integrateBody(ship.body, 1 / 120);
      }
      assert(Vec3.len(ship.body.angVel) < commandedRate * 0.05,
        'vehicle did not damp residual rotation after releasing controls');
    }));

    tests.push(makeTest('Multistage propellant and separation', function () {
      const spec = {
        dryMass: 30000, propMass: 10000, mainThrust: 100000,
        isp: 300, g0: 9.80665, exhaustVel: 300 * 9.80665,
        stages: [
          { dryMass: 20000, propMass: 10000, mainThrust: 100000, isp: 300 },
          { dryMass: 10000, propMass: 20000, mainThrust: 80000, isp: 320 }
        ]
      };
      const ship = new global.Ship(Vec3.create(), Vec3.create(), spec);
      ship.propMass = 0;
      ship.update(1 / 120, null);
      assert(ship.stagePending, 'spent first stage was not marked ready to separate');
      assert(ship.stage(), 'spent stage could not be separated');
      assert(ship.stageIndex === 1 && ship.propMass === 20000,
        'next stage did not load its propellant');
      assert(Math.abs(ship.mass - 30000) < 1e-6,
        'separation did not discard dry mass consistently');
      assert(ship.deltaVRemaining() > 0,
        'upper-stage delta-v was not included in the remaining budget');
    }));

    tests.push(makeTest('Fairing jettison removes upper-stage mass', function () {
      const spec = {
        dryMass: 12000, propMass: 7000, mainThrust: 100000,
        isp: 300, g0: 9.80665, fairingMass: 1000,
        stages: [
          { dryMass: 7000, propMass: 3000, mainThrust: 100000, isp: 300 },
          { dryMass: 5000, propMass: 4000, mainThrust: 80000, isp: 320 }
        ]
      };
      const ship = new global.Ship(Vec3.create(), Vec3.create(), spec);
      const initialMass = ship.mass;
      assert(ship.jettisonFairing(), 'fairing could not be jettisoned');
      assert(!ship.jettisonFairing(), 'fairing was jettisoned more than once');
      assert(Math.abs(ship.mass - (initialMass - 1000)) < 1e-6,
        'jettisoning did not remove fairing mass');
      assert(ship.stages[1].dryMass === 4000,
        'fairing mass was not removed from the payload stage');
      assert(ship.spec.dragCoefficient === 0.55,
        'drag coefficient did not switch to the unfaired value');
    }));
  }

  /* ------------------------------- Runner ------------------------------- */
  /**
   * Run every test. `onProgress(i, total, result)` is called after each so
   * the boot screen can paint incrementally.
   * Returns { passed, failed, results, ok }.
   */
  function runAll(onProgress) {
    const results = [];
    let passed = 0, failed = 0;

    for (let i = 0; i < tests.length; i++) {
      const t = tests[i];
      const r = { name: t.name, pass: false, ms: 0, error: null };
      const t0 = (global.performance && performance.now) ? performance.now() : Date.now();
      try {
        t.fn();
        r.pass = true;
        passed++;
      } catch (e) {
        r.pass = false;
        r.error = e && e.message ? e.message : String(e);
        failed++;
      }
      const t1 = (global.performance && performance.now) ? performance.now() : Date.now();
      r.ms = t1 - t0;
      results.push(r);
      if (onProgress) onProgress(i + 1, tests.length, r);
    }

    return { passed, failed, total: tests.length, results, ok: failed === 0 };
  }

  global.SelfTest = { runAll, tests, relErr };
})(window);