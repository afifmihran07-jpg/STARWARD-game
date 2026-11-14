export const SaveManager = {
  save(game) {
    localStorage.setItem('starward-save', JSON.stringify({
      parts: game.editor.snapshot(),
      budgetProfile: game.editor.budgetProfile,
      rocket: game.rocket && {
        parts: game.rocket.parts,
        position: game.rocket.position,
        velocity: game.rocket.velocity,
        angle: game.rocket.angle,
        stageIndex: game.rocket.stageIndex,
        stageFuel: game.rocket.stageFuel,
        stagesJettisoned: game.rocket.stagesJettisoned || 0,
        throttle: game.rocket.throttle,
        bodyId: game.rocket.body?.id,
        landed: game.rocket.landed,
        crashed: game.rocket.crashed
      },
      mission: game.missions.index,
      // Mission operations and a deployed spacecraft are not persisted; load
      // says so instead of silently resuming with stale or missing state.
      missionOpsInProgress: !!(game.missionOperations &&
        (game.missionOperations.deployed || game.missionOperations.active)),
      seededTestOrbit: !!game.seededTestOrbit
    }));
  },
  load(game) {
    const d = JSON.parse(localStorage.getItem('starward-save') || 'null');
    if (!d) return false;
    game.editor.restore(d.parts);
    if (d.budgetProfile) game.editor.setBudgetProfile(d.budgetProfile);
    game.missions.index = d.mission || 0;
    if (d.rocket) {
      const body = game.bodies?.find(b => b.id === d.rocket.bodyId) || undefined;
      game.launch(body);
      // launch() performs the usual readiness checks and sets up camera/pad.
      if (game.rocket) {
        const saved = d.rocket;
        if (Array.isArray(saved.parts)) game.rocket.parts = saved.parts.map(p => ({...p}));
        game.rocket.stageIndex = -1;
        game.rocket.refresh();
        game.rocket.stageIndex = Number.isInteger(saved.stageIndex) ? saved.stageIndex : -1;
        // Display-only counter of dropped stages; older saves default to 0.
        game.rocket.stagesJettisoned = Number.isInteger(saved.stagesJettisoned) ? Math.max(0, saved.stagesJettisoned) : 0;
        game.rocket.refresh();
        if (Array.isArray(saved.stageFuel)) {
          game.rocket.stageFuel = game.rocket.stageCapacity.map((cap, i) => Math.max(0, Math.min(cap, Number(saved.stageFuel[i] ?? cap))));
        }
        Object.assign(game.rocket.position, saved.position || {});
        Object.assign(game.rocket.velocity, saved.velocity || {});
        game.rocket.angle = Number(saved.angle) || 0;
        game.rocket.throttle = Math.max(0, Math.min(1, Number(saved.throttle) || 0));
        game.rocket.spool = 0;
        game.rocket.landed = !!saved.landed;
        game.rocket.crashed = !!saved.crashed;
        game.rocket.refresh();
        if (!Array.isArray(saved.stageFuel)) {
          // Compatibility with older saves: fill tanks in order up to the
          // saved total rather than assigning to the read-only `fuel` getter.
          let remaining = Math.max(0, Number(saved.fuel) || 0);
          game.rocket.stageFuel = game.rocket.stageCapacity.map(cap => {
            const amount = Math.min(cap, remaining); remaining -= amount; return amount;
          });
        }
        // launch() above already gave this flight fresh mission-operations state.
        game.seededTestOrbit = !!d.seededTestOrbit;
        if (d.missionOpsInProgress && typeof game.toast === 'function') {
          game.toast('Save restored · deployed spacecraft and mission-operations progress are not saved, so operations restart');
        }
      }
    }
    return true;
  }
};
