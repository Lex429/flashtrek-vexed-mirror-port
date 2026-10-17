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
| Work budgets across an animation frame's simulation substeps | `simulation-frame.js` |
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
`resumeWork` returns operational combat survivors to this task
owner, releasing obsolete contracts while retaining health, cargo and owned
weapon recharge; disabled/destroyed ships cannot be woken by that command.

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

Production and household settlement execute at most four cycles per animation
frame and retain `nextEconomyAt` debt for subsequent frames. They use the saved
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
entries per animation frame by default; standalone owner calls use the same
per-call limits when no animation-frame context exists. Its economic settlement
budget is four cycles across those substeps. Sol executes at most 96 fleet events
and 64 production cycles per animation frame. Large skips retain saved overdue deadlines/production debt and
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
events, with at most sixteen space searches per host animation frame.

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
