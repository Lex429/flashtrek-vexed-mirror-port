# Vexed Mirror implementation rules

Hull hardware is ownership-independent. `ship-definitions.js` owns typed slot
capacities, starting equipment, effective stats and permitted crew policies;
`weapon-loadout.js` owns version-2 equipment instances and fitting. Legacy weapon
arrays and repair bays are projections. See `docs/unified-ships.md`. Preserve
overflow equipment in the locker and reject unsafe hull purchases before charging.
Use the mode-separated save owner and verify writes. Run `unified-equipment.test.cjs`
and `browser-unified-equipment.py`, including actual Inventory evidence.

The active entry point is `html-games/broken-mirror-port/index.html`. Shared showcase artwork and shaders live in `html-games/flashtrek-broken-mirror/`. Do not migrate the archived previews as if they were active gameplay.

Preserve artwork, ship statistics, faction differences, deliveries, civilian jobs, ore rewards and old saves. Keep changes incremental. Controllers select goals and commands; they must not duplicate movement integration, weapon specifications, recharge, collision, damage or impact rendering.

The ownership contract is `docs/ship-system-contract.md`. Shared modules own ship definitions, motion, simulation time, weapon instances, firing, damage and effects. Add differences as explicit definition/profile/capability data. World coordinates and simulation time are authoritative; camera conversion belongs in rendering. Render functions cannot damage objects, complete mining or grant resources.

Civilian awareness reads `combat-shots.threats`, never obsolete dispute pending
queues or a private projectile simulation. `npcPolicy.combat` and saved crew
traits choose intent; shared equipment and motion keep their ordinary statistics.
Combat detours use `npc-lives.suspendCombat` / `resumeWork`, retaining valid cargo,
agreements and escrow while physically rebuilding the interrupted route. Held
Space latches one target and requests at most once per host frame; target changes
stop fire without clearing steering. `firingStatus` supplies shared range/recharge
feedback. Only redundant hit checkpoints use the verified save owner's bounded
queue; explicit durable actions still write immediately. Run the new civilian
tactics, combat awareness/save and player controls Node/browser regressions with
the existing suites. Use identical saves, fleets and viewports for the combat
performance comparison; report frame delivery separately from save/CPU costs.

Run the existing Node and browser tests before and after migrations. Add reusable regression coverage and real-browser beam/impact alignment checks. No completion claims for unrun checks. Preserve save compatibility through versioned migrations. Do not commit generated screenshots, profiles, caches or local installation backups.

Independent work may be delegated, with explicit file ownership and shared API agreements. Do not edit a teammate's files without coordinating. Push only the reviewed, tested result when the user authorizes it.

Persistent NPC lives extend `civilianTraffic.ships` and `solEconomy.freighters`; never seed a competing fleet. `npc-lives.js` owns civilian task selection, reservations, economic transactions, journey deadlines and bounded event scheduling. Sol freight policy remains in `sol-economy.js`. Scheduled local movement belongs to `ship-motion.js`, and calendar skips to `world-time.js`. Inspection reads the registered lightweight `inspectAll` interface; opening a map must not activate a galaxy's artwork, combat or steering. See `docs/npc-life-contract.md` for saved schemas, scheduling, conflict rules, role extension and the repeatable delivery demonstration.

Life changes must pass stock/money conservation, exactly-once delivery/mining, reservation interruption, midway save/reload, detail promotion/demotion, pause and browser observer/map-position checks. Measure the same population and browser viewport before/after scheduling changes with `tests/browser-npc-performance.py`. Run `tests/browser-npc-lives.py` along with the existing browser suites. Do not claim performance gains from different populations or omit remaining bottlenecks.

Delivery contracts reserve source goods, destination purchasing funds and incoming demand through `npc-lives.js`; never spend another contract's escrow or price a funded delivery again at arrival. Economic sources/sinks must be explicit and accounted for. Run the full 30-minute population and legacy-payment recovery regressions in `tests/npc-economy.test.cjs`.

`ship-detail.js` owns tactical eligibility from authoritative world poses and the configured radius. Combat outside that boundary breaks contact through the existing task owner; launched shots still belong to `combat-shots.js`.
`simulation-frame.js` bounds expensive scheduler work across catch-up substeps.
The registered target owner separates reusable geometry from step-local poses.
Use `ship-systems.refreshShip` / `refreshAsteroid` after an individual mutation;
use `invalidateShips` for known ship-membership batches and `invalidate` for
unclassified geometry changes. Query swept bounds
through the same owner's `query` / `collisionScene`, not a separate registry.
Completed-step read models remain valid through inspection/rendering until the
next integration step, clock change or explicit mutation. Never drop
authoritative simulation time to hide a scheduling backlog.

`nativeSimulationFrame.createHostTime` owns live wall-time admission through the single
`nativeSimulationHost` instance. Its `checkpoint(timestamp?)` runs at RAF and the
actual pause, inventory, visibility and travel gate edges; stale RAF timestamps
cannot move its boundary backward. Gate checkpoints retain the preceding active
tail and exclude inactive intervals even when both edges occur between RAFs.
The same timestamp also feeds optional `displayActive` into transient
`displayPendingSeconds`, consumed once per RAF by `consumeDisplay()`. Physical
time excludes warp; display time retains warp visuals while excluding exact
pause/inventory/hidden intervals. Only physical debt is saved.
Notify generic flight gates with `native-flightgatechange`; a diagnostic that
directly replaces/restores `nativeSimulation.blocked` must checkpoint at that
exact edge. `reset` is for explicit state activation or fixture time rebinding,
clearing transient display accumulation without removing saved physical debt.
Events admit time without integrating physics.
RAF and bounded MessageChannel service tasks drain the same fixed 60-Hz
`simulation-frame.run(state, 0, ...)` integrator. Unpaid active time stays in saved
`shipSimulation.schedule.pendingSeconds`. Never reset that debt to improve FPS.
Background tasks never accept additional time, request held fire or paint.
Keep task admission budgets separate from accumulated diagnostic counters.
`renderPose` is a pure interpolated copy for drawing;
queries, contacts, damage and deadlines use authoritative poses. Run
`fixed-schedule.test.cjs` and `browser-foundation.py`, including stall recovery,
pause, saved debt and 60/120/144-Hz synthetic host inputs. Synthetic timestamps do
not prove physical monitor delivery at those rates. Unchanged-clock displays
retain completed shared read models; `zero-step-retained-scene.test.cjs` covers
mutation and definition/category invalidation without a census per display.

The existing NPC-life owner maintains runtime-only ID/system/mobile/transit
membership indexes over the saved fleet arrays. Notify it when changing a
retained raw array alias or changing task, journey or mobility classification.
Local controllers use these indexes and the shared target spatial owner, rather
than reconstructing the galaxy. Explicit `refreshShip` must observe same-clock
equipment edits as well as pose changes. Retained descriptors are immutable.
Run `fleet-scalability.test.cjs` and `scheduled-pose-cache.test.cjs`; use `browser-fleet-scalability.py` separately for
sequential timing, never as a concurrent CI timing gate.

The shared renderer and its bounded cache/preparation budgets are documented in
`docs/fleet-rendering.md`. Cull before loading and composition, including beam
segments crossing the viewport. Offscreen physical consequences remain active.
Canvas is the production backend; the explicit WebGL2 comparison backend uses
the same interfaces and must retain ordering barriers and fallback behavior.
Run optional-worker, cache, visibility and real pixel regressions. Do not weaken
existing Canvas alignment or colour gates to accommodate another backend.

Physical ship fragments use definition-owned `debrisGeometry`, built from the
original aligned artwork by `python tools/build-debris-geometry.py`. The generated
`ship-debris-geometry.js` is source metadata, never regenerated bitmap artwork.
Run its `--check` build after changing artwork, alignment or fracture profiles;
the Node source-signature/coverage checks and `browser-debris-geometry.py` are
required. Damage events emit the canonical physical pieces immediately. Visible
painting may request/bind their original textures, never emit pieces or replay
contacts. Asteroid shards similarly use catalog dimensions before images load.
Keep decorative random streams private: camera, menu, warp and optional texture
readiness must not consume gameplay randomness or change physical consequences.

`save-storage.js` retains durable transaction ownership. `save-codec.js` uses a
versioned lossless representation for large fleets; old JSON slots remain
readable. Never cache a stale serialized snapshot or postpone a durable purchase,
delivery or travel commit. Profile serialization, storage and verification
separately. Run `large-save-codec.test.cjs` and the 5,000-record gameplay reload.

Civilian tactical intent can be reused for at most 1/30 simulation second per
crew; damage, changed targets, fitted capabilities and expired threats refresh it.
Integrate movement, nearby traffic avoidance, contacts and firing eligibility on
every required physics substep. Active slow frames retain their full elapsed time;
pause, inventory and hidden-tab gates still stop simulation. Run
`tactical-cadence.test.cjs`, `shared-spatial-scene.test.cjs`,
`swept-collision-search.test.cjs`, `browser-spatial-performance.py` and
`browser-incremental-art.py` with the existing suites. Keep heavy traces and
preparation diagnostics separate from the sequential clean timing runs in
`browser-performance-review.py`.

Optional pixel preparation uses the bounded cooperative queue exported by the existing stage-fragment library. Keep base ships visible while it runs; preparation and painting cannot apply damage, create resources or replay an explosion. Player lighting/warp uses the bounded shared sprite cache. Require the render-path pixel checks and cold-art preparation browser checks in CI. For smoothness measurements use `tests/browser-performance-review.py` before/after with the same save, device and viewport; it extends the stability scenarios with crowded flight and fresh browser contexts for each window. Keep `browser-stability.py` functional checks in CI and distinguish CPU costs from frame delivery.

Directional light changes update a reusable mask and sprite composition, not
the animated-effect cache identity. Preserve 60 Hz player/damaged/warp effects
and the intended 20 Hz healthy NPC cadence. `ship-effects.request` admits the
current damage plate before deferred unused plates; explicit `prepare` retains
full fragment/wreck readiness. Keep old valid art visible during stage loading
or failure. Profile image load, decode, preparation and first visible paint
separately; appearance latency alone does not establish a game freeze. Run
`browser-ship-lighting.py`, `browser-cold-ship-loading.py` and the same-save
`browser-performance-review.py` alongside existing rendering checks. This extended
review includes the original `browser-render-review-performance.py` flight,
crowded-flight, combat and cold-appearance workloads.

`port-docking.js` owns civilian berth/queue/holding occupancy and hull clearance.
NPC tasks must request a berth and physically reach it before handling cargo.
The same port owner maintains runtime reservation/point/queue indexes. Published
assignment/deletion updates those views; retained raw aliases require
`nativePortDocking.invalidate`. Reuse shared hull queries for candidate clearance;
keep clearing berths, FIFO tickets and cross-port exclusions. Run
`port-docking-scalability.test.cjs` alongside the existing docking/economy suites.
Never restore ID-modulo parking coordinates or default normal Sol freight to Earth.
`npc-lives.exchange` is the shared atomic player/NPC freight settlement boundary;
player quotes come from `sol-economy.quote` and use marginal lot pricing. Preserve
existing treasury balances and escrow. Run `player-market.test.cjs`,
`port-docking.test.cjs` and `browser-earth-jam.py`; the latter restores the actual
36-ship audited jam and exercises the ordinary market buttons outside Dev mode.

`regional-minerals.js` owns immutable geological profiles and mineral technology
data. `sol-asteroids.js` preserves the original 262 seeded Sol slots through its legacy
`placements` accessor; use `forSystem(system)`, `find(id)` and `nearby` for active
world content. Regional IDs are `system * 100000 + index`. Never reseed depleted
rocks, change their IDs, or load distant artwork to advance NPC mining.
`npc-lives.js` owns local refinery settlement and material/credit consumption for
engineering. Typed raw minerals refine into the existing industrial Ore good;
they do not create a competing currency or duplicate ore entitlements.
Run `regional-mining.test.cjs` with its regional fixture enabled and
`browser-regional-mining.py`; older economy fixtures deliberately retain the
legacy three-system configuration to cover existing contracts and saves.

`ore-sprite-cache.js` owns bounded display-sized ore colour/glow surfaces only.
Cull ore and collection visuals before artwork requests or sampling; keep expiry
and all mining/cargo consequences in simulation. Run `ore-rendering.test.cjs` and
`browser-ore-performance.py` for the offscreen mining/flight regression.

`civilian-access.js` owns the permanent five-system exclusion and current
population eligibility. Enforce it in initial placement and the `npc-lives.js`
task/transaction owner; never hide or delete prohibited residents in rendering.
Empty systems admit actual reserved mining trips only, returning ore to inhabited
buyers. Retain cargo, credits and identities when repairing old unsafe saves.
`port-docking.relocate` owns immediate refuge clearance. Run
`civilian-access.test.cjs` and `browser-civilian-access.py`; set fixture `access:true`
with `regional:true` for current policy, while legacy fixtures retain old contracts.

`asteroid-motion.js` owns saved displaced rock poses and contact dispatch;
`ship-motion.js` owns the swept contact, mass response and spin calculation.
Whole rocks exchange momentum through `asteroidPairContact`, including offscreen
drift; query swept geometry without requesting artwork. Ship `motionKick`
belongs to shared motion and must survive steering/save/load while scheduled
NPC samples recover their route without replaying offsets or changing escrow.
`sol-asteroids.relocate` must update the same spatial index used by mining,
targeting and radar. Preserve seeded geometry/IDs when starting a different save.
Combat weapon contacts use `asteroid-combat.weaponHit`; debris uses `debrisHit`
for up to 25% of maximum health per distinct fragment. All environmental damage
uses `asteroid-combat.hit` and stops at 25% remaining health, preserving older
rocks already below that floor. Live pressure waves cannot damage/destroy rocks.
Ship and asteroid fragments use `ship-motion.debrisContact` through the shared
environment collector and `asteroid-motion` dispatcher. Reflect the actual
simulation particle; painting must read its resolved world position. Emit at
most three cached-art chips per damage-stage change, never at the health floor
and never as ore. Keep mining timed and ore claims exactly once.
Run `asteroid-physics.test.cjs` and `browser-asteroid-physics.py`, including the
30-minute production-policy fixture with `physics:true`, plus existing suites.

`ship-traffic.js` owns shared ship avoidance intent and ship-pair contact dispatch;
`ship-motion.js` owns prediction, swept physical hull geometry, mass impulses and
saved version-3 composite routes. Keep existing version-2 saves valid. Rerouting
must update the task owner's real deadline through `npc-lives.reroute` or
`sol-economy.reroute`, retaining the original goal, berth lease and economic escrow.
Use `ship-systems.applyContact` for all ship displacement/knockback. Contacts
preserve ship health and cargo; native effects are visual only. The player is
manual; combat and ordinary traffic share avoidance mechanics. Distant contacts
must sample authoritative routes without preparing artwork. Run
`ship-traffic.test.cjs`, `browser-ship-traffic.py`, Earth jam and economy suites,
plus same-save population/viewport performance checks before/after.

Ship-pair angular response belongs to `ship-motion.shipPairContact`; use the
actual contact lever arms and inertia for momentum/energy-consistent impulses.
Saved `motionSpin` is separate from steering angular velocity. Sample it in
`sampleLeg` and inspector poses, carry it through `ship-systems.applyContact`,
and rebase it when rerouting. Manual steering/thrust counter free collision drift;
unpowered coasting retains linear momentum. Do not change manual ship profiles
to compensate for a collision-control bug. Run `impact-controls.test.cjs` and
`browser-impact-controls.py`, including actual WASD/arrows and post-ram braking.

Free collision spin changes hull orientation without redirecting hands-off
manual velocity. Preserve the world course during coasting and pure braking;
actual turn/thrust/goal commands still control movement. Fractional medical
refinery surplus and its existing agreed payment settle atomically through
`npc-lives.exchange`. Transfer numerical refill dust into owned reserves rather
than discarding it. Run `review-gameplay.test.cjs` and
`browser-review-gameplay.py`, including fractional escrow reload/conservation
and six-to-one-to-six hull fitting with the same owned Dots.

Physical ship contact and traffic clearance use definition-owned `hullRadii`,
independent of shield charge. Combat `radii` still select the shield/hull surface.
Ship, asteroid and fragment dispatchers mark effects `physicalContact`; shared
effects keep their brief hull-local glint separate from weapon shield flashes.
Never change weapon interception to make navigation easier. Run
`hull-navigation.test.cjs` and real-key hull-clear passage/weapon pixel checks.

Deuranium deposits append reserved `system * 100000 + 90000 + index` IDs using
an independent seed; never change the original regional ore sequence or poses.
Raw deuranium refines into existing good 7/repair supplies, unlike other minerals'
industrial Ore output. NPC collection records its material source once in
`economicLedger.produced[7]`; refinery transfer cannot produce it again.
Olympic refill hysteresis (below 60 t through a 200 t goal), buying/mining choices,
claims, real refinery docking and trade/rescue interruption belong to
`npc-lives.js`. Keep raw cargo, completed claims, reserves and policy flags saved.
`asteroid-combat.js` owns saved mining damage; rendering only reads it. Retain the
environmental floor and prevent weapon destruction from granting deuranium ore.
Run `deuranium-mining.test.cjs` and `browser-deuranium-mining.py` plus regional,
repair, conservation, traffic, physics and same-save browser performance checks.
