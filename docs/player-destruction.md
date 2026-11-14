# Player destruction and command recovery

At zero hull, or after the authoritative destroyed phase, the shared ship
renderer stops drawing the ship's hull artwork. A disabled ship with positive
hull remains visible and keeps the existing manual-flight and repair behavior.

The existing `ship-damage`, `ship-effects`, physical wreck geometry, and
environmental impact owners still create and advance destruction exactly once.
`player-destruction.js` does not emit an explosion or move debris. It observes
the normal simulation clock and waits eight seconds before revealing recovery, so
the existing blast and moving wreckage are visible first. Pausing or hiding
the game does not consume that interval. The recovery dialog then gates time
through `nativeSimulation.blocked` and the existing host checkpoint event.

The recovery screen fades in over three seconds, with a slower card reveal and
staggered heading/buttons. Its only regular message is **Reincarnate**. The
emblem uses the same `startup/factions/faction-N.png` artwork as faction setup,
selected from the saved player's zero-based `faction`, not the owner of the
current system or the player's custom government name. Its glow and moving
masked light use that faction's setup color and keep the original artwork.
Controls become available after the fade. Hover and
keyboard focus share illuminated borders, moving edge traces, a sweeping sheen,
and a pointer-position light; pointer motion adds a small tilt. Button activation
plays its 320 ms press effect once before dispatching the existing restore/menu
action. Original menu sounds respect the existing sound preference. Resetting
or changing state cancels pending reveal/activation callbacks.

Reduced-motion users keep the eight-second wait, with a short opacity
fade and static focus/hover feedback instead of movement. Legacy dead saves
continue to skip the wait and reveal the recovery screen directly.

**Reincarnate** restores a separate safe timeline in the same normal/Dev
mode. The snapshot contains the entire saved world: simulation time, faction
standing and alerts, NPC crews and jobs, inventories, markets and reservations.
Decisions since that point disappear together with their consequences. An
existing faction enemy remains an enemy. Continue still uses the ordinary
latest save; successful reincarnation writes the earlier branch there before
activation so a reload cannot bring back the abandoned future.

`reincarnation.js` owns eligibility, not storage or physical movement. Ordinary
successful saves reuse their exact complete encoded graph for the safe copy,
at most once per 15 simulation seconds. The first valid safe save is immediate;
the player fire path also captures a current safe point before starting combat.
A safe point requires at least 75% hull, a non-hostile physical region, no
player security alert/defence order/retaliation or active player weapon event,
no incoming projectile threat, and no pending transit. Incoming damage and
player fire protect the checkpoint for at least 15 active seconds. Paused or
hidden time cannot satisfy that interval. Worker results must pass the same
live eligibility and encounter-generation checks before becoming a safe copy.

`save-storage.js` owns the `normal` and `dev` entries in IndexedDB database
`vexed-mirror-reincarnation`, separate from Continue's localStorage quota. It
captures an immutable complete encoded graph, retains it in memory, and verifies
the asynchronous database transaction before marking the operation finished.
Startup preloads the copies, and recovery waits for outstanding loads/writes
before deciding which point is available. The initial local-only checkpoint
keys migrate after verification; test/non-browser storage retains the verified
local-key fallback. Two 5,000-record Continue slots still fit their original
quota without competing with the rewind copies. The small version-1
`reincarnation` field binds each copy to its campaign, retaining old save
compatibility and preventing a new game from borrowing an older captain's
checkpoint. An auxiliary checkpoint failure leaves Continue intact and reports
the error; an already captured immutable copy remains available in memory for
the current session. Destroyed graphs cannot capture another snapshot.

Old living saves without a safe history remain recoverable. If their saved
location is dangerous, `manual-flight.relocateOutside` finds refuge beyond all
catalog system envelopes and away from saved ships and active projectiles.
It retains the existing coordinate frame, including Sol body-relative offsets,
without changing normal entry boundaries. No NPCs, hostility, cargo, funded
jobs or projectiles are deleted. Re-entry stops the player's movement and old
cruise/arrival orders, leaving the next route under player control.

**Main menu** returns to the game menu. An old zero-hull save goes straight
to recovery; if it has no playable point, the restore button is disabled with an
explanation. No free replacement ship or fabricated healthy save is created.

`save-storage.retire(state)` invalidates queued/in-flight checkpoints for this
destroyed live state and prevents its later autosaves from replacing the last
playable file. It uses a runtime WeakSet, not a saved field or schema migration.
Other modes remain intact; a restored fresh state can save normally again.
Immediate and asynchronous writes keep their existing verification behavior.

Checks:

```
node --test tests/ship-effects.test.cjs tests/combat-save.test.cjs tests/reincarnation.test.cjs
python tests/browser-player-destruction.py
python tests/browser-reincarnation.py
python tests/browser-engine-failure.py
python tests/browser-unified-equipment.py
```

The destruction browser check uses an isolated origin/profile. It verifies zero
dead-hull draw calls, physical movement of player wreck pieces, normal/Dev restore,
last-live save preservation, surviving critical hulls, and recovery of old dead
saves. It also checks all eight original faction emblems and colors, the masked
logo light, and reduced-motion behavior. Screenshots are written under ignored
`test-results/player-destruction`.

The reincarnation checks exercise real faction penalties, death and the actual
Reincarnate/Continue buttons on an isolated origin. They verify world-time and
reputation rollback, preserved NPC jobs and other-mode saves, campaign isolation,
encoder races, and safe refuge for an imported hostile legacy save.
