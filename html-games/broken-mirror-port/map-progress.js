// Browser-side discovery ledger, seeded from each Flash save the first time it is seen.
(() => {
  const memory = new Map();
  const validIds = values => new Set((Array.isArray(values) ? values : []).map(Number).filter(id => Number.isInteger(id) && id >= 1 && id <= 55));
  window.BrokenMirrorMapProgress = Object.freeze({
    sync(state) {
      const identity = [state.saveSlot, state.captain, state.shipName, state.faction, state.race]
        .map(value => String(value ?? ''))
        .join('\u001f');
      const key = `broken-mirror-port:survey-v1:${identity}`;
      let known = memory.get(key);
      if (!known) {
        try { known = validIds(JSON.parse(localStorage.getItem(key) || '[]')); }
        catch { known = new Set(); }
        memory.set(key, known);
      }
      const before = known.size;
      for (const system of state.nodes || []) if (system.known) known.add(Number(system.id));
      for (const system of state.systemNames || []) if (system.known) known.add(Number(system.id));
      if (Number.isInteger(Number(state.current)) && Number(state.current) >= 1 && Number(state.current) <= 55) known.add(Number(state.current));
      if (known.size !== before) {
        try { localStorage.setItem(key, JSON.stringify([...known].sort((a, b) => a - b))); }
        catch { /* Keep the session copy when persistent storage is unavailable. */ }
      }
      return new Set(known);
    }
  });
})();
