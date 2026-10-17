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
