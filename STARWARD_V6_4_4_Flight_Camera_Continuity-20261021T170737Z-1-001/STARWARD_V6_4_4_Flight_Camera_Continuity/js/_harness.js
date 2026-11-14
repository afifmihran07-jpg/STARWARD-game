/* Integration harness: boots the real Game, flies it, and reports.
   Kept out of the HTML so the markup stays readable. */
(function () {
  window.__errors = [];
  window.addEventListener('error', function (e) {
    window.__errors.push((e.filename || '?') + ':' + (e.lineno || '?') +
                         ' :: ' + (e.message || e.error));
  });

  var log = [];
  function say(s) { log.push(s); }
  function V3_str(v) {
    return '(' + v.x.toFixed(1) + ', ' + v.y.toFixed(1) + ', ' + v.z.toFixed(1) + ')';
  }
  function finish() {
    document.title = 'DONE';
    var pre = document.createElement('pre');
    pre.id = 'harness-out';
    pre.textContent = log.join('\n');
    document.body.appendChild(pre);
  }

  window.addEventListener('load', function () {
    setTimeout(function () {
      try {
        var V3 = window.Math3.Vec3;

        // --- 1. Physics suite still green? ---
        var rep = window.SelfTest.runAll();
        say('SELFTEST ' + rep.passed + '/' + rep.total + (rep.ok ? ' PASS' : ' FAIL'));
        if (!rep.ok) {
          rep.results.filter(function (r) { return !r.pass; }).forEach(function (r) {
            say('  FAILED: ' + r.name + ' :: ' + r.error);
          });
        }

        // --- 2. Start mission 1 for real ---
        var g = new window.Game();
        g.boot();
        g.startMission(window.Missions.MISSIONS[0]);
        say('MISSION started: ' + g.mission.name);
        say('  spawn speed = ' + g.ship.speed().toFixed(1) + ' m/s');
        // Direct probe of the placement helper, bypassing the mission.
        var M = window.Math3.Vec3;
        var t1 = M.mul(M.create(1, 0, 0), 6.771e6);
        say('  Vec3.mul((1,0,0), 6.771e6)   = ' + V3_str(t1));
        var t2 = M.add(g.sys.earth.pos, t1);
        say('  Vec3.add(earth.pos, t1)      = ' + V3_str(t2));
        say('  earth.radius                = ' + g.sys.earth.radius.toFixed(1));
        var probe = window.Physics.circularState(g.sys.earth, 6.771e6);
        say('  PROBE circularState(earth, 6.771e6):');
        say('    pos = ' + V3_str(probe.pos));
        say('    vel = ' + V3_str(probe.vel));
        say('    |pos-earth| = ' + V3.dist(probe.pos, g.sys.earth.pos).toFixed(0));
        say('    |vel|       = ' + V3.len(probe.vel).toFixed(1));
        say('    expected    = ' +
            window.Physics.circularSpeed(g.sys.earth.mu, 6.771e6).toFixed(1));
        say('  earth.pos   = ' + V3_str(g.sys.earth.pos));
        say('  ship.pos    = ' + V3_str(g.ship.body.pos));
        say('  station.pos = ' + V3_str(g.sys.station.pos));
        say('  ship.vel    = ' + V3_str(g.ship.body.vel));
        say('  dist(ship,earth) = ' +
            V3.dist(g.ship.body.pos, g.sys.earth.pos).toFixed(0) + ' m');
        say('  spawn alt   = ' +
            (window.Universe.altitude(g.ship.body.pos, g.sys.earth) / 1000).toFixed(0) + ' km');

        // Sanity: the rocket equation must give a non-zero budget, and the
        // station must be in orbit rather than inside the planet.
        var dv0 = g.ship.deltaVRemaining();
        say('  dv budget at spawn = ' + dv0.toFixed(0) + ' m/s' +
            (dv0 > 100 ? ' OK' : ' *** SUSPECT ***'));
        var statAlt = window.Universe.altitude(g.sys.station.pos, g.sys.earth) / 1000;
        say('  station alt = ' + statAlt.toFixed(0) + ' km' +
            (statAlt > 0 ? ' OK' : ' *** INSIDE EARTH ***'));

        // --- 3. Coast 30 s: a circular orbit must hold its radius ---
        var r0 = V3.dist(g.ship.body.pos, g.sys.earth.pos);
        for (var i = 0; i < 30 * 60; i++) g.step(1 / 60);
        var r1 = V3.dist(g.ship.body.pos, g.sys.earth.pos);
        say('COAST 30s: r ' + (r0 / 1000).toFixed(1) + ' -> ' + (r1 / 1000).toFixed(1) +
            ' km, drift ' + Math.abs(r1 - r0).toFixed(2) + ' m');

        // --- 4. Prograde burn 20 s: speed must rise, fuel must fall ---
        var v0 = g.ship.speed();
        g.ship.throttle = 1;
        for (var j = 0; j < 20 * 60; j++) g.step(1 / 60);
        g.ship.throttle = 0;
        var v1 = g.ship.speed();
        say('BURN 20s: speed ' + v0.toFixed(1) + ' -> ' + v1.toFixed(1) +
            ' m/s (+' + (v1 - v0).toFixed(1) + ')');
        say('  fuel ' + (g.ship.fuelFraction * 100).toFixed(1) + '%, dv left ' +
            g.ship.deltaVRemaining().toFixed(0) + ' m/s');

        // --- 5. Render a frame and assemble HUD state ---
        g.updatePrediction();
        g.updateCamera();
        g.render();
        var st = g.buildHudState();
        g.hud.update(st);
        say('RENDER+HUD ok: ecc=' + (st.orbit ? st.orbit.ecc.toFixed(4) : 'null') +
            ' periAlt=' + ((st.orbit.periapsis - st.primaryRadius) / 1000).toFixed(0) +
            ' km target=' + st.target.name +
            ' range=' + (st.range / 1000).toFixed(1) + ' km');
        say('  speed readout="' + document.getElementById('ro-speed').textContent +
            '"  fuel readout="' + document.getElementById('ro-fuel').textContent + '"');

        // --- 6. Every mission: spawn, then run 10 s of its own loop ---
        for (var m = 0; m < window.Missions.MISSIONS.length; m++) {
          var def = window.Missions.MISSIONS[m];
          try {
            var ctx = { sys: g.sys, ship: null, state: {}, dt: 0, warn: function () {} };
            var sp = def.spawn(ctx);
            g.ship = new window.Ship(sp.pos, sp.vel);
            ctx.ship = g.ship;
            var run = new window.Missions.MissionRunner(def, ctx);
            for (var k = 0; k < 600; k++) { g.step(1 / 60); run.update(1 / 60); }
            say('MISSION ' + (m + 1) + ' ' + def.id + ': ok, progress ' +
                (run.progress() * 100).toFixed(0) + '%  objectives done=' +
                run.done.filter(Boolean).length + '/' + run.total);
            if (m === 0) {
              say('  m1 range at spawn = ' +
                  (V3.dist(sp.pos, ctx.sys.station.pos) / 1000).toFixed(2) + ' km');
              say('  m1 range after 10s = ' +
                  (V3.dist(ctx.ship.body.pos, ctx.sys.station.pos) / 1000).toFixed(2) + ' km');
              say('  m1 relspeed = ' +
                  V3.len(V3.sub(ctx.ship.body.vel, ctx.sys.station.vel)).toFixed(1) + ' m/s');
            }
          } catch (e) {
            say('MISSION ' + (m + 1) + ' ' + def.id + ' THREW: ' + e.message);
          }
        }

        // --- 7. Time-warp frame cost ---
        g.warp = 1000;
        var t0 = performance.now();
        g.advance(1 / 60);
        var t1 = performance.now();
        say('WARP 1000x frame cost: ' + (t1 - t0).toFixed(1) + ' ms');
        g.warp = 1;

        say('JS ERRORS: ' + window.__errors.length);
        window.__errors.forEach(function (e) { say('  ' + e); });
      } catch (e) {
        say('HARNESS THREW: ' + e.message);
        say((e.stack || '').split('\n').slice(0, 4).join('\n'));
      }
      finish();
    }, 250);
  });
})();