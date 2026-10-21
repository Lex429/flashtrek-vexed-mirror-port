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
| Saved civilian berth occupancy, FIFO queue, holding clearance and dedicated tug terminals | `port-docking.js` |
| Acceleration, braking, rotation and analytical local command sampling | `ship-motion.js` |
| Nearby combat decisions and dialogue | `civilian-traffic.js`, `civilian-combat-ai.js` |
| Weapons, recharge, collisions, health and nearby animation | Existing shared ship modules |
| Asteroid depletion and one ore entitlement per asteroid | `asteroid-combat.js` |
| Simulation clock, pause/hidden/inventory gate | `simulation-clock.js` |
| Shared world-position eligibility for detailed tactical work | `ship-detail.js` |
| Live host time admission, fixed physics debt and bounded task budgets | `simulation-frame.js`, with the single `nativeSimulationHost` in `native-game.js` |
| Calendar skip conversion and owner updates | `world-time.js` |
| Category enumeration without collision/art activation | `ship-systems.js` `inspectAll` |
| Marker projection, selection, search, zoom, tracking and inspector UI | `dev-galaxy-view.js` |
| Moving the Dev observer to an inspected position | `native-game.js` |
| Bounded browser timing diagnostics | `simulation-metrics.js` |

Each migrated civilian keeps its existing name, ID, type, equipment, health,
credits, cargo and system. It gains `lifeVersion:1`, `role`, `homeBase`,
`taskSequence`, `task`, `journey`, `nextActionAt` and newest-first `recentEvents`.
Legacy loaded and empty warp journeys keep their remaining arrival deadline;
migration never withdraws the carried cargo again or starts a second departure.
The event history is capped at 24 by default. Equipment continues to use saved
owned weapon instances; there is no second recharge timer. Hull/shields and cargo
on the ship remain authoritative.

Runtime membership views belong to this same owner: `find`, `members(system)`,
`systems`, `mobile(system?)`, `controlled`, `mining`, and `queryTransits(bounds)`.
They index the existing saved arrays, not copies of the population. Ordinary
task/journey changes update these views at the mutation boundary. Published array
insertions, removals and same-length element replacements carry a revision;
mutations through a retained raw alias must explicitly invalidate the owner.
The revision is reconciled by indexed membership/query reads; an already cached
same-clock full scene still requires `ship-systems.invalidateShips` at its
membership mutation boundary. Ordinary fleet owners send that notification.
Do not mutate retained route geometry or descriptor snapshots in place.

Transit visibility uses conservative galaxy-space journey/warp bounds and then
samples current poses. Extremely long bounds use a conservative overflow set;
many genuinely crossing routes can still produce many candidates. The full Dev
map intentionally enumerates global markers. Local planning, radar, contact and
render queries use indexed system/region membership without activating distant
artwork or tactical controllers.

### Local queries and route-pose notifications

`nativeShipSystems.query` retains the existing per-system physical grid between
steps. Use it for bounded local work and use `nativeNpcLives.find` or the Sol
owner's `find` for one identity. `members(state, system)` is a reused frozen array
view of the existing owner; it is not a separate population or a permission to
run every member's tactics each frame. Full `descriptors`/`inspectAll` enumeration
is reserved for callers that actually need the galaxy, such as the Dev map.

Explicit movement, contact, damage, fitting, disabling, destruction and system
changes notify `refreshShip`. It remains forceful, including an upgrade changed
inside an existing equipment object in the same clock tick. Existing committed
route owners may instead call `sampledShip` after sampling an unchanged leg. That
path acknowledges a query's already-current pose or defers an unobserved
description; it retains the same conservative route membership and updates the
velocity summary used by forecasts. A bounded read still obtains the current
authoritative pose. A retained current scene is updated immediately, and changed
condition, equipment/leg/kick references or definition revisions require an eager
refresh. This optimization is not a general replacement for mutation notification.

Local NPC detail and movement reuse the query's exact analytical sample,
including scheduled spin/kick state. Historical due-event samples still use
their own saved timestamps. Rendering interpolation uses separate immutable
pose snapshots; it cannot change collision membership, task progress or money.
Sol inspection projects current task progress without rewriting the saved task.

Physical route bounds include the complete leg, rotating hull/shield extent and
collision-kick reach. Very long routes or large station hulls can enter the
conservative overflow set. They are never dropped to cap candidate counts.
Full-route bounds can admit a distant crew whose future route crosses the query;
current pose and exact collision tests then reject an irrelevant contact. Many
such routes, or many genuinely touching large hulls, still require work. Free
offscreen movers query nearby stationary blockers and connected contact chains;
camera visibility does not remove those physical consequences.

Remaining nonlocal costs include the five-Hz traffic pass over actual mobile
crews, event-time berth searches over reservations and same-system hulls, Sol
assignment/handling scans, overdue-heap diagnostic counts, and intentional global
inspection. Initial
indexing, save restoration, collection replacement and access-policy migration
also require a census. These are not claims of constant-cost simulation for
5,000 simultaneously moving or interacting crews. See the workload definitions,
counters and reproduction commands in [fleet foundation results](fleet-foundation-results.md).

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
capacity, available stock, destination shortages, distance and money. Regional
mining expands the original Earth/Sol, Orion and Vulcan foundation to all 52
systems in saved `connectedSystems`. Existing station residents return to their
operating bases after current work, mine local reserved rocks and deliver to
funded local refineries. Traders consider nearby systems. The original population,
tasks and home identities remain intact. See [regional mining](regional-mining.md)
for geology, migration, typed mineral settlement and technology ownership.

`civilianTraffic.life.markets` stores real stock, targets, credits, reserved source
stock, `incoming` tons per good and `fundsReserved`. Available purchase funds are
`credits - fundsReserved`; demand is `target - stock - incoming`, also subtracting
active Sol company freight promises at a Sol destination. A new civilian delivery
atomically reserves all three requirements at acceptance: source goods,
destination purchasing funds and the remaining destination demand. Another ship
cannot commit those goods, funds or tons of demand.

Shared settlement accepts finite positive fractional cargo and finite
nonnegative fractional agreed payments within the safe numeric range. Medical
refining can produce fractional surplus; it must use the existing atomic
`exchange` owner and saved agreement rather than truncate, reprice or strand
that cargo. Player retail quotes retain whole-lot pricing. A refill remainder
within 1e-9 tons goes into the ship's owned reserves, preserving all material
instead of creating a dust-sized delivery.
Ordinary cash admission uses capped relative floating-point tolerance. Only an
owned reservation at its exact saved price can also tolerate cancellation dust,
bounded by both 1e-7 credits and one part per million of that payment. The
remaining balance must be positive; whole-integer deficits remain strict. A tiny
negative subtraction becomes zero without changing the agreement. Real treasury
deficits still reject atomically. Cargo admission uses exact owned quantities,
with no broad epsilon that could admit unowned goods.

`task.agreement.version:1` saves the agreed unit purchase price, unit sale price,
total payment and acceptance time. The source quote uses the existing base price;
the destination quote includes its existing shortage premium. An arrival-time
price change does not alter that contract. `life.reservations[task.id].version:2`
contains `system`, `port`, `good`, `tons`, `owner`, `sourceReserved`,
`destination:{system,port}`, `destinationReserved`, `unitPrice` and `payment`.
Reservation counters do not create or transfer money: the actual treasury keeps
the credits until the funded delivery is paid.

At loading, the source stock and ship credits decrease by the agreed quantities;
owned cargo and source treasury increase by exactly those quantities. Only the
source-stock reservation is consumed. Destination funds and demand remain
reserved through travel, docking and reload. Unloading transfers that cargo into
the destination, transfers the fixed payment to the ship and releases the
remaining escrow once. Transaction IDs and saved completion fields prevent a
second unload or payment. Cancellation and interruption release each unconsumed
reservation once; disabling never awards cargo or payment to the destination.
The combat suspension described below preserves valid agreements instead of
cancelling work merely because a crew must maneuver to safety.

Sol markets alias the existing `solEconomy.ports` arrays used by the player,
production and tugs. `stockReserved` and `incomingReserved` link to the civilian
arrays. Player purchases, recipes and tug loading exclude reserved source stock;
tug dispatch/loading also subtract civilian inbound tons from demand. Tug
assignments are provisional internal company freight, rechecked against actual
stock and demand at loading; they are not paid civilian purchase contracts.
All aliases and reservation totals are rebuilt from saved contract records on
restoration. Invalid/missing Sol port IDs resolve to the actual Earth market,
without creating a second port inventory.

### Unpaid legacy cargo and bounded recovery

`configVersion:2` merges the new defaults and `contractVersion:2` migrates the old
reservation representation without replacing the population, cargo or journeys.
Existing funded version 2 contracts retain their exact quotes. Legacy pickup
contracts acquire destination escrow if real funds and demand remain; otherwise
they cancel before loading, releasing stock without spending money. Legacy loaded
cargo is already owned and is never withdrawn or purchased a second time.

Unfunded carried cargo receives `task.recovery.version:1` with `startedAt`,
`deadlineAt`, `attempts`, `reason` and an eventual `outcome`. The default recovery
window is 120 active simulation seconds, with at most five attempts spaced by
30 seconds. A buyer needs real uncommitted money and unmet demand for the entire
hold. A successful renegotiation saves a new fixed quote and changes the existing
task's destination. An interstellar reroute uses a real saved journey followed by
local approach, docking and handling; a local buyer requires actual local flight.
Identity and paid cargo remain aboard throughout.

Without a legitimate buyer, the task becomes `status:'blocked',
phase:'payment-idle'`. Its inspector reason explains why cargo is held and when
it will recheck. It does not retry every frame, invent a payment, discard the
hold or teleport. At the next 120-second economic cycle it may select a new funded
sale for the same owned cargo. Recovery deadlines and blocked retry deadlines
survive save/load. A blocked recheck retains the original task and expired
recovery deadline; it does not repeatedly open a new waiting-payment window.
`resumeWork` returns operational combat survivors to this task owner, retaining a
valid suspended contract and releasing obsolete contracts while retaining health,
cargo and owned weapon recharge. Disabled/destroyed ships cannot be woken by it.

### Combat detours and crew survival

`ship-definitions.npcPolicy.combat` supplies cargo, medical and general civilian
behavior. `crewTraits.version:1` saves each crew's caution and aggression once;
`combatAI.version:2` saves perceptions, reaction times, maneuver reasons and a
committed escape goal. Old tactical records migrate without changing equipment,
statistics, cargo or identity. Fitted shared weapons determine useful engagement
distances. Maneuver changes respond to actual threats, damage, range and clearance,
instead of reversing direction on a repeating timer. Cargo policy protects loaded
holds; medical policy prioritizes survival and its work. These policies add no
movement, damage, shield or recharge bonuses.

Ordinary traffic checks a bounded rotating set of nearby crews for live shared
projectiles, including stray shots. Perceptions wait for a saved reaction interval
and expire when their shared projectile disappears. A no-hit dodge can temporarily
suspend a job without creating retaliation against a harmless/stray shooter.

`suspendCombat` samples the current authoritative pose, releases berth occupancy,
and saves `combatInterruption.version:1` with task ID, phase, remaining deadline
and optional berth/handling intent (older records infer that intent from cargo).
It retains the task's stock/funds/demand reservations and cargo. Escape uses shared
motion and avoidance toward a useful refuge or physical separation, without the
old combat-area boundary pulling the ship back. An escaping crew must achieve
actual safe separation before declaring escape. A pursued crew extends or replans
its physical escape leg before reaching or passing an unsafe waypoint; saved
waypoints never pull it back toward its attacker. `resumeWork` rebuilds the retained
job's real approach/docking/mining leg
from its current pose. A temporary disable keeps valid commercial escrow until
shared repairs finish; destruction and genuine cancellation still release it once.
Medical claim ownership remains under the shared repair owner.

Queued pickups retain their original loading port and intent. Interrupted ore
collection returns physically before collecting the retained entitlement once.
An interrupted paid port repair requests an actual berth and resumes its saved
remaining repair time only after arriving, without charging for the repair again.

Regression checks include `civilian-tactics.test.cjs` and
`browser-civilian-tactics.py`, alongside the existing life, economy, traffic and
repair suites. Midway JSON/page reloads retain crew choices, escape intent, cargo,
agreements and owned weapon deadlines.

### Explicit economic sources and sinks

The initial connected industrial loop remains Earth/Sol, Orion and Vulcan. Every
120 active simulation seconds, the commercial economy settles one cycle. The
saved interval scales the following rates from their 30-second base:

| Flow | Default 120-second cycle | Accounting |
| --- | --- | --- |
| Offworld specialty manufacture/extraction | Up to 48 t components at Orion and 48 t fuel at Vulcan; each output stops at stock 300 | Explicit external production, `economicLedger.produced[good]` |
| Local household demand at each connected hub | Consume up to 16 unreserved tons of each non-specialty good | Actual stock removed, `economicLedger.consumed[good]` |
| Household purchases | Pay the market `ceil(basePrice * 1.35)` per consumed ton | External household-sector spending, `economicLedger.householdSpending`; no goods means no treasury income |
| New market's initial allocation | One-time 25,000 credits; offworld specialty stock 120, other stock 12 | Saved initial conditions, `initialMarketCredits` / `initialMarketGoods`; Sol goods already exist and are not added again |
| Sol industry and civic consumption | Existing extraction, recipes, food/fuel/medicine demand and rebuilding | `solEconomy.flows.produced`, `.consumed` and `.lost`; recipe inputs and capped actual outputs are counted |
| Player Sol retail | Goods and money transfer atomically between the player and the actual port treasury; committed NPC funds/stock/storage cannot be spent | `npc-lives.exchange`; no external ordinary retail source/sink. Explicit free Dev purchases record `.devPurchaseSubsidy` |
| Sealed player freight service | Existing completed service contracts retain their external service budget | `flows.externalPlayerPayments`; historical retail flow counters remain saved |
| Destroyed carried goods | Lost once; no destination receipt or payment | Aggregate `economicLedger.lost[good]` plus bounded `strandedCargo` history; Sol losses use `flows.lost` |

These are deliberate external goods/money sources and goods sinks. Households
are outside the ship/port treasury ledger: their spending is credited only for
goods they actually consume, rather than periodically resetting a treasury.
Sol production is not run a second time by the commercial owner. Ship purchases,
sales and paid repairs transfer existing credits; commercial deliveries do not
mint rewards. Mining converts actual shared resource entitlements into cargo
once. Aggregate counters remain available after the bounded event histories roll
over and begin when this ledger migrates; older world history is not fabricated.
Ordinary player freight retail and NPC delivery settlement now share
`npc-lives.exchange`: rejected transactions change no inventory or balance, and
port funds/stock already committed to another contract are unavailable. Sealed
player freight-service contracts retain their existing external service budget.
Historical external-retail counters remain intact; they are not retroactively
credited to treasuries or used to seed new money.
Market allocations are lazy initial conditions for the already registered
population's homes/current ports, not a payment-recovery grant. The full
population reaches 60 actual market keys (51 offworld markets and nine Sol ports),
so its first use allocates 1,500,000 credits in total across those markets even
though only three connected hubs receive the new industrial cycles. Existing
saved market balances are retained; reopening a market, cancelling contracts and
reloading cannot repeat that allocation.

Production and household settlement execute at most four cycles per bounded
simulation task and retain `nextEconomyAt` debt for subsequent tasks. They use the saved
simulation clock, including its pause/hidden/inventory gate and 120 seconds/day
conversion. Satisfied demand and exhausted real supplies can legitimately leave
ships idle. This is a small connected economy rather than an unlimited industrial
model for every system. Player lot quotes integrate the stock price curve ton by ton, with a sale spread
and integer rounding per ton. The UI displays the exact lot total and execution
rejects a stale quote. Splitting a lot gives exactly the same total. Storage
overflow rejects the entire retail lot; no retail stock or cargo is silently discarded.
Outside Sol, the legacy four-resource player market still uses `game.stocks`;
it is not yet connected to the nine-good NPC freight market. Sol freight stock
continues to be shared with player freight commerce.

### Repeatable economic regressions

`tests/npc-economy-fixture.cjs` loads the actual simulation owners, the tracked
Sol coordinates and all 262 deterministic asteroid placements; artwork is mocked.
It retains the existing 159 civilians, nine tugs and player, and advances at
`1/60` second for 108,000 steps (30 simulated minutes). Its Git-revision option
loads every available runtime source from that exact revision, while keeping the
unchanged asset catalog:

```sh
node tests/npc-economy-fixture.cjs test-results/economy-before.json --revision c41559c
node --test tests/npc-economy.test.cjs
node tests/npc-economy-fixture.cjs test-results/economy-after.json
```

The test report records five-minute counts of deliveries, useful work, idle
ships and payment waits. It checks all source/funds/incoming reservations and
balances all nine goods plus credits against the recorded initial allocations,
production, consumption, recipes, actual ore claims and losses. Functional CPU
test execution time is not a frame-rate or browser-smoothness measurement.

A separate migration stress scenario gives the same 159 ships already-paid
cargo withdrawn from actual source stock, then explicitly depletes every
treasury in the initial fixture. It saves the legacy arrival-payment form and
restores it through the real migration. At 600 simulated seconds the verified
scenario completed 229 deliveries with zero waiting-payment ships: 28 were
working, 49 normally idle, 51 holding paid cargo in explained payment-idle and
31 between completed jobs. The remaining held goods are not reported as
delivered: they lack a funded buyer with unmet demand and stay owned aboard.
This proves bounded recovery and useful resumed work without pretending that
filled demand or insolvency must produce another sale.

Other reusable checks cover simultaneous commitments, arrival-price changes,
preloading cancellation, loaded disabling/destruction, fixed escrow priority
independent of ship array order on reload, mid-recovery reload, real rerouting,
market-allocation idempotence, invalid/zero-distance saved legs and animation-frame
catch-up budgets. Normal local/browser delivery and inspector suites remain
required alongside these calculation/state regressions.

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

The shared host's `createHostTime` / live `nativeSimulationHost` checkpoints RAF
and actual pause, inventory, visibility and travel gate edges. It preserves
active tails and excludes inactive intervals between two RAFs without doing
physical integration in events. Generic gates notify `native-flightgatechange`;
live diagnostics replacing/restoring a raw blocked predicate must checkpoint at
that exact edge. Stale RAF timestamps cannot rewind the boundary. RAF and bounded
background tasks drain the same fixed `run(state, 0, ...)`; background work adds
no wall time. Saved pending physics debt survives gates and restoration; host
reset is reserved for explicit state/fixture rebinding, never clearing that debt.

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
Version 2 movement commands complete identical or tiny start/goal distances
(`<= 1e-6` world units) immediately with finite pose and zero velocity. Invalid
saved commands interrupt work and release escrow, keeping already owned cargo;
they cannot load goods, complete mining or deliver while reporting an invalid
arrival. A legacy zero-distance command whose JSON duration became `null` is
recognized as arrived and schedules its next real task phase once.
Displayed native marker projections refresh every 80 ms; a custom adapter that
supplies only a fixed snapshot coordinate refreshes with its one-second
enumeration cache.

The civilian scheduler executes at most 64 actions and pops at most 256 heap
entries per bounded simulation task by default; standalone owner calls use the same
per-call limits when no task context exists. Its economic settlement
budget is four cycles across those substeps. Sol executes at most 96 fleet events
and 64 production cycles per bounded task. A task may cover several fixed physics
steps; a display callback and a between-display service task have independent
admission budgets. Large skips retain saved overdue deadlines/production debt and
drain it on later updates. No economic event is dropped to meet the budget.
Consequently very large skips can temporarily show overdue actions while the
backlog drains. The inspector exposes the next deadline and diagnostics expose
the backlog. There is no unbounded per-second or per-frame replay loop.

`nativeShipDetail.isDetailed` is the shared eligibility rule for nearby civilian
and Sol tactical work. It uses the actual player/world pose and a saved leg's
authoritative sampled pose, the current system and the configured detail radius
(default 6,500 world units). It rejects transit, inactive ships and a landed
observer. Dev-map visibility is not an input. Disputes and retaliations check
both participants before requesting a combat scene, steering or attempting fire.
Ships can therefore be distant within the same system; sharing a system alone
does not keep a million-unit fight active.

Offscreen tactical disputes break contact rather than beginning a global combat
search or inventing random kills. The old fight is removed and operational
commercial survivors call `resumeWork`; existing cargo, health, identity and
owned weapon `readyAt` deadlines survive. Crossing back cannot restart that old
fight, so no boundary hysteresis is needed; a new eligible hit is required for a
new retaliation. Saved old fights receive the same eligibility check after
reload. Already launched shots remain under the authoritative firing lifecycle
and resolve or expire normally. Future strategic conflict resolution must submit
shared damage results and interruption consequences; it may not add private
weapon mechanics.

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

1. Open **Find a ship**, search for Meridian and select it. Record its task ID,
   cargo good/tons and market inventories under **More ship details**. Use
   **Follow ship** and **Zoom to ship**. **Source stock** and **Buyer stock** read
   real market inventories directly, including outside Sol's player retail UI.
2. Choose **More ship details → View in flight** to observe loading/departure. Reopen Dev tools
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

## Port selection and traffic-jam recovery

Normal delivery selection considers all nine actual Sol ports, their funds,
uncommitted demand, already promised deliveries and route distance. A default
`startDelivery` into Sol chooses an available buyer rather than silently choosing
Earth. Explicit named-port contracts keep that destination and fixed payment.
Recovery considers the same complete port set. New jobs can also meet shortages
between ports in the current system through actual local flight.

`portDocking.version:1` saves one occupancy record per civilian owner. Each port
has four commercial berths, a FIFO queue capped at twelve, and individually
spaced overflow/idle holding points. Bounding circles derive from ship dimensions
with 40 world units of clearance. Allocation excludes nearby physical hulls,
planet surfaces and the nine dedicated company tug terminals. Those tug terminals
are uniquely assigned by existing fleet slot and their spacing scales with hull
size; they do not share the four civilian berths. Allocation runs only at life
events, with at most sixteen space searches per bounded simulation task.

Runtime indexes within this owner group saved reservations by system, port and
queue/berth/clearing status, and index their conservative point bounds. Candidate
searches retain the original order and circle-clearance test, querying nearby
reservations and the existing shared physical civilian index.
Published ordinary assignments/deletions, including row and clearing fields,
update those views.
Retained raw aliases, `Object.defineProperty` or unclassified external edits must
call `nativePortDocking.invalidate`; reconciliation rebuilds after restoration.
Before life initialization finishes, allocation retains the migration fallback
over the saved residents. A zero-hull corrupt record is retained with its cargo
but is not a physical blocker once the shared live-target owner is ready.

At most 256 indexed same-system residents are sampled once for each synchronous
allocation. Larger local populations use conservative shared spatial searches;
an allocation-local map reuses each encountered hull's unchanged pose and radius
across rejected candidates. These snapshots expire when that allocation returns,
so subsequent movement, hull changes and membership updates are observed by the
next request. Reservation points remain spatially indexed in either mode.

Pickup and delivery handling require reaching the assigned berth. Queued ships
fly to their holding positions and request service every three seconds. They
cannot load/unload while still approaching or holding. A completed/blocked job
retains its task identity while a separate saved `dockingMove` takes the ship to
parking; its old berth remains reserved until that flight finishes. Departure,
cancellation and destruction release reservations. An abandoned or disabled hull
still excludes its occupied physical space from new berth allocation.

Restoration reconciles occupancy with the saved population. Legacy docked ships
receive `dockingVersion:1` and a scheduled recovery action; positions, wallets,
owned cargo and identities do not change during migration. Existing journeys
continue. Loading/unloading ships physically approach new berths; unpaid ships
negotiate a funded buyer or move to an explained holding state. There is no fleet
reset or treasury refill. Inspector reads expose berth, queue position and clearing
status without creating ships, moving them or preparing artwork.

See [Earth traffic recovery verification](earth-traffic-recovery.md) for the
recreated c41559c save, conserved balances, thirty-minute runs and browser checks.
