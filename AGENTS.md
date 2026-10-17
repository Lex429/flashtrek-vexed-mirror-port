# Vexed Mirror implementation rules

The active entry point is `html-games/broken-mirror-port/index.html`. Shared showcase artwork and shaders live in `html-games/flashtrek-broken-mirror/`. Do not migrate the archived previews as if they were active gameplay.

Preserve artwork, ship statistics, faction differences, deliveries, civilian jobs, ore rewards and old saves. Keep changes incremental. Controllers select goals and commands; they must not duplicate movement integration, weapon specifications, recharge, collision, damage or impact rendering.

The ownership contract is `docs/ship-system-contract.md`. Shared modules own ship definitions, motion, simulation time, weapon instances, firing, damage and effects. Add differences as explicit definition/profile/capability data. World coordinates and simulation time are authoritative; camera conversion belongs in rendering. Render functions cannot damage objects, complete mining or grant resources.

Run the existing Node and browser tests before and after migrations. Add reusable regression coverage and real-browser beam/impact alignment checks. No completion claims for unrun checks. Preserve save compatibility through versioned migrations. Do not commit generated screenshots, profiles, caches or local installation backups.

Independent work may be delegated, with explicit file ownership and shared API agreements. Do not edit a teammate's files without coordinating. Push only the reviewed, tested result when the user authorizes it.

Persistent NPC lives extend `civilianTraffic.ships` and `solEconomy.freighters`; never seed a competing fleet. `npc-lives.js` owns civilian task selection, reservations, economic transactions, journey deadlines and bounded event scheduling. Sol freight policy remains in `sol-economy.js`. Scheduled local movement belongs to `ship-motion.js`, and calendar skips to `world-time.js`. Inspection reads the registered lightweight `inspectAll` interface; opening a map must not activate a galaxy's artwork, combat or steering. See `docs/npc-life-contract.md` for saved schemas, scheduling, conflict rules, role extension and the repeatable delivery demonstration.

Life changes must pass stock/money conservation, exactly-once delivery/mining, reservation interruption, midway save/reload, detail promotion/demotion, pause and browser observer/map-position checks. Measure the same population and browser viewport before/after scheduling changes with `tests/browser-npc-performance.py`. Run `tests/browser-npc-lives.py` along with the existing browser suites. Do not claim performance gains from different populations or omit remaining bottlenecks.

Delivery contracts reserve source goods, destination purchasing funds and incoming demand through `npc-lives.js`; never spend another contract's escrow or price a funded delivery again at arrival. Economic sources/sinks must be explicit and accounted for. Run the full 30-minute population and legacy-payment recovery regressions in `tests/npc-economy.test.cjs`.

`ship-detail.js` owns tactical eligibility from authoritative world poses and the configured radius. Combat outside that boundary breaks contact through the existing task owner; launched shots still belong to `combat-shots.js`. `simulation-frame.js` bounds expensive scheduler work across catch-up substeps. Scene caches last only a physics step and must be invalidated after movement or collision consequences. Never drop authoritative simulation time to hide a scheduling backlog.

Optional pixel preparation uses the bounded cooperative queue exported by the existing stage-fragment library. Keep base ships visible while it runs; preparation and painting cannot apply damage, create resources or replay an explosion. Player lighting/warp uses the bounded shared sprite cache. Require the render-path pixel checks and cold-art preparation browser checks in CI. For smoothness measurements use `tests/browser-stability.py --measure` before/after with the same save, device and viewport; distinguish CPU costs from frame delivery.

`port-docking.js` owns civilian berth/queue/holding occupancy and hull clearance.
NPC tasks must request a berth and physically reach it before handling cargo.
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
`ship-motion.js` owns prediction, swept shield/hull geometry, mass impulses and
saved version-3 composite routes. Keep existing version-2 saves valid. Rerouting
must update the task owner's real deadline through `npc-lives.reroute` or
`sol-economy.reroute`, retaining the original goal, berth lease and economic escrow.
Use `ship-systems.applyContact` for all ship displacement/knockback. Contacts
preserve ship health and cargo; native effects are visual only. The player is
manual; combat and ordinary traffic share avoidance mechanics. Distant contacts
must sample authoritative routes without preparing artwork. Run
`ship-traffic.test.cjs`, `browser-ship-traffic.py`, Earth jam and economy suites,
plus same-save population/viewport performance checks before/after.
