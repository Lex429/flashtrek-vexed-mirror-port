# Persistent ship lives and distant simulation

## Ownership and saved identities

This extends the active port and the [shared ship contract](ship-system-contract.md).
There is no second population. Existing numeric civilian IDs in
`civilianTraffic.ships` and `tug:N` fleet slots in `solEconomy.freighters` remain
stable. The former normal-traffic encounter redirect toward the player is removed.
Explicit mining/ore-theft demonstrations retain their own `scriptedDemo` tag and
nearby tactical controllers; they are not ordinary economic traffic.

| Responsibility | Owner |
| --- | --- |
| Civilian role policy, saved tasks, reservation ownership, transactions and journeys | `npc-lives.js` |
| Sol company freight policy, production, deliveries and paid-material rebuilds | `sol-economy.js` |
| Acceleration, braking, rotation and analytical local command sampling | `ship-motion.js` |
| Nearby combat decisions and dialogue | `civilian-traffic.js`, `civilian-combat-ai.js` |
| Weapons, recharge, collisions, health and nearby animation | Existing shared ship modules |
| Asteroid depletion and one ore entitlement per asteroid | `asteroid-combat.js` |
| Simulation clock, pause/hidden/inventory gate | `simulation-clock.js` |
| Calendar skip conversion and owner updates | `world-time.js` |
| Category enumeration without collision/art activation | `ship-systems.js` `inspectAll` |
| Marker projection, selection, search, zoom, tracking and inspector UI | `dev-galaxy-view.js` |
| Moving the Dev observer to an inspected position | `native-game.js` |
| Bounded browser timing diagnostics | `simulation-metrics.js` |

Each migrated civilian keeps its existing name, ID, type, equipment, health,
credits, cargo and system. It gains `lifeVersion:1`, `role`, `homeBase`,
`taskSequence`, `task`, `journey`, `nextActionAt` and newest-first `recentEvents`.
The event history is capped at 24 by default. Equipment continues to use saved
owned weapon instances; there is no second recharge timer. Hull/shields and cargo
on the ship remain authoritative.

Sol tugs retain their original `assignment`, `good`, `tons`, path and fleet slot.
Their life metadata adds a stable identity, home/base, freight task, bounded
16-event history, `lifeEventAt` and optional saved `lifeLeg`. They move internal
company inventory, so their individual credits are zero and no purchase or
delivery payment is minted. An original destroyed tug is lost; a material-funded
replacement reuses its fleet slot and increments `lifeGeneration`, with an explicit
replacement event. Previously carried goods are never restored to the new hull.

## Tasks and real economic consequences

Civilian tasks store an ID, kind, reason, requirements, origin/destination,
creation time, phase, progress, status, completion criteria and failure conditions.
Freight and trading use pickup flight, loading, transit, destination approach,
docking and unloading phases. Mining reserves an asteroid, approaches, cuts using
the shared mining duration/entitlement and 4.5-second transport deadline, then
carries the ore to a market. Repairs
use owned credits and restore condition after a saved deadline. Idle work retries
when no affordable stock, unmet demand or available resource is useful.

Job selection considers cargo already aboard first, condition, role preference,
capacity, available stock, destination shortages, distance and money. The initial
connected commercial foundation is Earth/Sol, Orion and Vulcan (system IDs
1, 2 and 4); `connectedSystems` is saved configuration. Existing ships elsewhere
may work toward those systems and their home/base. Content expansion does not
require another scheduler.

`civilianTraffic.life.markets` stores real stock, targets, available credits and
reservation counts. Non-Sol markets receive a one-time saved initial inventory
and treasury; loading cannot create additional goods. Sol markets alias the
existing `solEconomy.ports` arrays used by the player, production and tugs.
Reservations are linked into `solEconomy.stockReserved` so player purchases,
freight contracts, company loading and production cannot spend the same stock.
Alias links are rebuilt on save restoration.

Loading reserves available goods for the task and then atomically moves actual
stock into the ship's capacity-limited cargo. The ship pays the source treasury.
Unloading moves carried goods into the destination and transfers the destination's
credits to the ship. A destination without funds holds the cargo and schedules a
retry. Transaction IDs and saved completion fields prevent repeated unloads.
Markets can fill their shortages or run out of purchase funds; ships then choose
other work or idle. This foundation does not simulate an unlimited galaxy-wide
industrial economy. Sol's existing production and consumption remain active.
Civilian contract purchases use the base commodity quote and destination sales
use a shortage premium; both transfer existing treasury funds. The player's
established retail quotes remain intact. Outside Sol, the legacy four-resource
player market still uses `game.stocks`; it is not yet connected to the nine-good
NPC freight market. Sol freight stock is shared with player freight commerce.

Mining calls `asteroid-combat.completeMining` once and consumes specific bits of
the saved ore mask. Player and civilian collection share that entitlement.
Destroying a claim first fails the miner's task rather than minting replacement
ore. Unused capacity and real resource availability constrain collection.
Interruption after cutting and before transport leaves the existing ore bits in
the field; no cargo is awarded. The saved collecting deadline survives reload.

Interruption releases the task's unconsumed reservations. Disabled ships retain
their loaded cargo stranded aboard and receive no delivery reward. Destruction
records cargo loss in a bounded saved `strandedCargo` ledger and clears the hold;
the destination receives nothing. There is currently no salvage pickup mechanic
for this loss ledger. Combat interrupts commercial work without destroying cargo;
an operational survivor can choose to deliver the same cargo after breaking contact.

## Travel, coordinates and calendar time

`journey.version:1` stores origin, destination, route, departure time, duration,
arrival deadline, endpoint local and galaxy positions, distance and speed. It is
not a random encounter delay. A direct route connects the task's two systems;
future route policies can supply intermediate legs without changing ship identity.

Galaxy coordinates are the continuous manual-flight coordinates: chart displacement
from Earth multiplied by 1,000 world units, plus local world position. Journey
progress is `(simulationSeconds - departedAt) / duration`, clamped to `[0,1]`.
`nativeNpcLives.galaxyPosition` interpolates the same saved endpoints for the map
and local transit inspection. At arrival the endpoint becomes local coordinates
relative to the destination anchor, then a shared movement command approaches
the actual destination berth. Changing system representation creates no jump in
galaxy position.

Default interstellar speed is 1,400 world units per simulation second, multiplied
by an explicit definition's warp factor when provided and divided by
`warpGameplayScale`. Duration is `max(8 seconds, distance / speed)`. Travel model
parameters are saved under `civilianTraffic.life.config`. These are gameplay
distances and times, not physical light years or relativistic travel.

One calendar day equals 120 active simulation seconds, matching the established
population clock. Ordinary flight, NPC jobs, economic production, owned recharge
and calendar progress use that same saved time. The saved life configuration's
`secondsPerDay` mirrors this canonical value; gameplay travel scaling does not
change the calendar conversion. A player journey that skips days
advances the clock, population and scheduling owners once on the copied committed
travel state. Its warp/report/arrival presentation does not advance the live world
a second time. Restoring its saved pending receipt does not replay the skip.
Pause, an open inventory and hidden tabs retain the existing freeze policy;
there is no wall-clock offline earnings or hidden-tab catch-up.

## Detail levels and scheduling limits

Civilian lives use a runtime index by identity and system plus a min-heap with
one current saved deadline per ship. Stale tokens are discarded on pop. Only
ships in the observer's system and within the configured radius (default 6,500
units) are sampled each frame; the rest execute scheduled actions. Transit
positions are derived directly from the journey clock. Nearby combat continues
to use shared steering, firing, collisions, damage and effects.

Local economic flight is a saved `ship-motion.planLeg` command, sampled by
`sampleLeg`. The shared module owns acceleration, cruise, braking and rotation.
Both detailed and distant modes sample the same command; switching detail does
not reset position, task progress, route, health, cargo or recharge. Promotion
does not select a new job. The inspector can sample a copied pose without updating
the real job or preparing artwork. Sol tugs sample shared commands over their
existing obstruction-avoiding waypoints, with a one-second distant pose cache.
Their inspector reads the exact projected pose rather than that cache.
Displayed native marker projections refresh every 80 ms; a custom adapter that
supplies only a fixed snapshot coordinate refreshes with its one-second
enumeration cache.

The civilian scheduler executes at most 64 actions and pops at most 256 heap
entries per call by default. Sol executes at most 96 fleet events and 64 production
cycles per call. Large skips retain saved overdue deadlines/production debt and
drain it on later updates. No economic event is dropped to meet the budget.
Consequently very large skips can temporarily show overdue actions while the
backlog drains. The inspector exposes the next deadline and diagnostics expose
the backlog. There is no unbounded per-second or per-frame replay loop.

Offscreen tactical disputes break contact rather than beginning a global combat
search or inventing random kills. Existing cargo/health and paid weapon recharge
survive. Nearby shots that have already launched remain under the shared firing
lifecycle. Future strategic conflict resolution must submit shared damage results
and interruption consequences; it may not add private weapon mechanics.

For a drained scheduler at the same timestamp, task/cargo/economic outcomes and
analytically sampled economic flight positions are identical across detail levels,
apart from floating-point tolerance (tests use `1e-7` world units). Visible event
dispatch can lag by one normal simulation step (typically `1/60` s). Frame-rate
combat keeps its existing collision tolerances. Distant cached tug `x/y` may lag
up to one second; authoritative projected inspector/map position does not.

## Extending roles and inspection

1. Register a ship definition/capabilities through the existing shared definition
   API and add an entity to the existing appropriate saved collection with a unique
   identity. Existing civilian hulls automatically receive a life migration.
2. Set a civilian's role or register `nativeNpcLives.registerRole(name, policy)`.
   The policy receives `(state, ship, {at, startDelivery, chooseMining, schedule})`.
   Choose work with common commands and return whether a task was selected.
   Persist additional requirements on a versioned task; do not add a population,
   frame loop, weapon specification, movement integrator or damage calculation.
3. An escort can choose a followed identity and protection goal; a pirate can
   select a target and demand/interception task. Nearby tactical decisions should
   call shared movement commands and `nativeCombatShots.fireFor`; consequences
   call the existing hit/interruption owners. Add explicit strategic scheduling
   and offscreen conflict policy before supporting remote attacks.
4. A new ship category registers the existing `collect`/`hit` target adapter and
   optionally `inspect(state)` for lightweight enumeration of all its saved ships,
   including transit/inactive records. The default inspection fallback uses its
   existing collection per system. `inspectAll` excludes asteroid markers and
   deduplicates stable IDs. It must not preload artwork or activate simulation.
5. Pass serializable identity, category, role, faction, system/local pose, galaxy
   position, task/journey, cargo, money, health, equipment, history and next deadline.
   Keep gameplay entity references out of serialized inspector reports.

The Dev inspector caches enumeration for one second, position projection for
80 ms and DOM refreshes for 500 ms. Galaxy clusters cycle/select individual IDs;
the searchable list always exposes individuals. Local zoom uses actual coordinates.
Tracking follows an identity without steering it. **DEV: inspect locally** moves
only the player/observer beside its current authoritative position; it does not
reset the ship, complete its task or change its route. Transit inspection likewise
uses its current galaxy position rather than moving it to a destination.

## Repeatable delivery demonstration

Start a Dev game, open Dev tools and choose **Follow a persistent freighter
delivery**. This selects an existing ship and labels it **ISS Meridian**; it does
not add a ship, stock or credits. If already delivering, it continues that job.

1. Select Meridian in the inspector. Record its task ID, cargo good/tons, source
   market stock and destination stock. Use **Track ship** and **Local positions**.
2. Choose **DEV: inspect locally** to observe loading/departure. Reopen Dev tools
   and the galaxy inspector to track transit and inspect it during travel and
   after arrival. The task ID stays the same through system travel and docking.
3. On completion verify source stock fell at loading, cargo stayed aboard during
   transit, destination stock rose at unloading, and one delivery/payment event
   exists. Other working ships and Sol production can also change port totals;
   inspect the named ship's transaction event to identify its contribution.
4. Choose the demonstration again after completion. Let the same freighter select
   its next available delivery, then watch exclusively through the Dev map from
   another system. The same transactions complete without a nearby render pass.
5. Save during transit, reload and Continue. The identity, cargo, task, endpoints,
   departure/arrival times and owned recharge deadlines remain saved.

Automated reproduction: `python tests/browser-npc-lives.py`. It uses a fresh
browser profile, follows the named existing ship through real UI inspection,
checks actual inventory changes, restores midway through a real reload, and
repeats with map-only observation. See its ignored JSON and screenshots under
`test-results/`. Existing smoke/Canvas suites remain required.

## Performance evidence

`tests/browser-npc-performance.py` records raw frame samples under the same browser,
viewport and saved population. The pre-change reference is commit `90998f0`;
measurements use 159 civilians, nine Sol tugs and the player at 1280 × 850 in
headless Microsoft Edge on the same device. The comparison records simulation
and render time, frame spikes, distinct detailed movement, distant updates,
scheduled events and artwork requests, for normal flight and the Dev map.

Final measured results and remaining bottlenecks are recorded after verification
in `docs/npc-performance.md`. Timings are measurements of that machine, not fixed
performance promises or portable CI thresholds.
