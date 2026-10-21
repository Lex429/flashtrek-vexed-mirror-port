# Ship system contract

The current hardware/equipment migration is specified in [unified ships](unified-ships.md).
It supersedes the old ownership-specific capacity and movement exceptions below.
Verified writes, legacy recovery and large-fleet encoding are specified in the
[save contract](save-contract.md).

The active game starts at `html-games/broken-mirror-port/index.html` and
`native-game.js`. The archived previews are not alternate gameplay engines.
The live game and damage showcase share their weapon and shield shaders in
`html-games/flashtrek-broken-mirror/`.

## Ownership

| Behavior | Authoritative owner | Controller responsibility |
| --- | --- | --- |
| Ship statistics, equipment, dimensions, role capabilities, emitters, collision geometry | `ship-definitions.js`, using the existing `world-data.js`, flight reference and artwork profiles | Select a registered definition/profile |
| World targets, category adapters and collision dispatch | `ship-systems.js` | Register business consequences and which entities currently exist |
| Acceleration, turning, braking, speed constraints, goal arrival, path following and inertial steering | `ship-motion.js` | Choose commands and a named movement profile |
| Saved simulation time and pause gate | `simulation-clock.js` | Use shared seconds/deadlines and report actual gate changes |
| Live wall-time admission, fixed physics scheduling, bounded catch-up debt and pure render interpolation | `simulation-frame.js`; `native-game.js` holds `nativeSimulationHost` | Checkpoint RAF/gate edges, then drain admitted 1/60-second steps through the common integrator |
| Tactical detail eligibility | `ship-detail.js` | Ask the common predicate before steering, firing or collecting combat scenes |
| Owned weapon identities, fitting, locker transfers, recharge deadlines and legacy equipment migration | `weapon-loadout.js` | Request an equipment operation |
| Model/upgrade weapon specifications, eligibility, ballistic simulation, interception and swept collisions | `weapon-rules.js` | Choose a weapon/target, or request fire |
| Firing lifecycle, emitter attachment, pending attacks, resolution, visual shot instances and cleanup | `combat-shots.js` | Call `fire` for player input or `fireFor` for NPC intent |
| Live projectile awareness and fitted-weapon eligibility reports | `combat-shots.js`, querying `weapon-rules.js` geometry/eligibility | Choose a response or present the report; never simulate a private projectile |
| Held player fire intent and target ordering | `player-combat-controls.js`, hosted by `native-game.js` | Latch one selected target and request at most one shot per host frame |
| Shield-first damage, hull overflow, nonlethal floors, stage transitions and disabled/destroyed results | `ship-damage.js` | Respond to the result |
| Ship artwork cache, shared ship rendering, shield/hull impacts, stage fragments and wreck simulation | `ship-effects.js`, using existing showcase shaders and destruction assets | Request a hit/visual event and draw the resulting state |
| Explosion/debris contact collection, common physical dispatch and ship surface effects | `explosion-impacts.js` and shared `debris-impacts.js`, delegating to `asteroid-motion.js` / `ship-motion.js` | Supply the explosion/debris source; environmental asteroid damage stops at 25% remaining health |
| Asteroid hit points, asteroid destruction, mining progress and ore entitlement | `asteroid-combat.js`, registered through `ship-systems.js` | Choose mine/fire and collect completed simulation results |
| Persistent asteroid drift, indexed world poses and ship contact dispatch | `asteroid-motion.js`, using contact impulses from `ship-motion.js` and `sol-asteroids.relocate` | Supply the active simulation step; never move rocks while painting |
| Ship traffic prediction, passing/yield intent and ship-pair contact dispatch | `ship-traffic.js`, using `ship-motion.js` geometry and `ship-systems.applyContact` | Keep job/berth ownership; request a revised saved leg through the task owner |
| Tug deliveries, assignments, cargo loss, rebuilding and economic consequences | `sol-economy.js` | Use shared mechanics; retain delivery policy |
| Civilian jobs, trading, mining choices, retaliation, faction consequences and dialogue | `civilian-traffic.js` and `civilian-combat-ai.js` | Decide travel/dock/mine/trade/pursue/flee/fire |
| Persistent civilian tasks, stock reservations, commercial transactions, interstellar journeys and distant scheduling | `npc-lives.js`, extending `civilianTraffic.ships` | Role policies choose useful work using the common task commands |
| Scheduled local movement commands sampled at any detail level | `ship-motion.js` `planLeg` / `sampleLeg` | Choose a goal, definition movement profile and start time |
| Calendar skips and conversion between days and job time | `world-time.js`, using the saved simulation clock | Advance a committed journey once; its presentation animation does not add economic time |
| Lightweight ship inspection across registered categories | `ship-systems.js` `inspectAll`, `dev-galaxy-view.js` | Read authoritative position/task state; relocate the Dev observer only |
| Bounded instance lighting, shared animation, lamps and ordered Canvas/GPU comparison submission | `ship-sprite-cache.js`, called by `flight-assets.js` | Supply original artwork, entity, stage, lighting, scale, heading, simulation time and warp appearance |
| Cooperative/worker optional damage-pixel preparation | Existing `showcase-stage-fragments.js` queue and `ship-art-readback.js` owner; original generators supply pixels | Request preparation through `ship-effects.js`; keep base artwork visible |
| Verified mode-separated saves and bounded combat checkpoint coalescing | `save-storage.js`; `save-codec.js` provides versioned large-save encoding | Commit durable actions immediately and report failures |

`player-combat.js` is a compatibility adapter for shared definitions, damage and
effects. It does not contain a second player damage model. In the active game,
`native-game.js` advances and paints the shared effects collection once per step
and frame. Do not additionally call the adapter's legacy `advance`/`paint` passes.

## Ship traffic and contact

`nativeSimulationFrame.createHostTime` supplies one live wall-time admission owner,
exposed as `nativeSimulationHost`. `checkpoint(timestamp?)` records elapsed active
time at RAF and actual pause, inventory, visibility and travel gate edges. It
remembers the preceding gate state: entering an inactive interval retains its
active tail, and leaving excludes the inactive interval, including one entirely
between two RAFs. Stale RAF timestamps cannot move the boundary backward.
These event checkpoints admit time without running physical integration.

The same checkpoint timestamp also samples optional `displayActive` and retains
its preceding gate state. Its runtime-only `displayPendingSeconds` is consumed
once per RAF by `consumeDisplay()`. The physical gate excludes warp; the display
gate preserves warp presentation while excluding pause, inventory and hidden
intervals, including complete gate intervals between RAFs. Display accumulation
is not saved simulation time and cannot advance jobs, recharge or transactions.

The host handles `native-pausechange`, `native-inventorychange`,
`visibilitychange` and generic `native-flightgatechange`; optional event
`detail.at` uses the same monotonic time origin as RAF/performance time. A live
diagnostic that replaces or restores `nativeSimulation.blocked` must call
`nativeSimulationHost?.checkpoint()` immediately at that edge. `reset` only
rebinds an explicitly activated state or fixture time and clears transient
display accumulation; it never clears saved physical
`shipSimulation.schedule.pendingSeconds`.

RAF and the bounded between-display service call
`simulation-frame.run(state, 0, ...)` to drain admitted debt. Physics advances at
60 fixed steps per simulation second independently of display refresh. Each task
integrates at most eight steps and stops catch-up after its work budget; unpaid
time remains in the versioned saved schedule. Background tasks add no wall time,
yield between tasks and cannot draw or request held fire. Diagnostic carry is
distinct from each task's scheduler admission budget. Pause, hidden-tab and
inventory gates preserve existing debt without accepting suspended time.
Overload remains observable. Calendar skips retain their committed owner.
Travel/calendar transitions reject unpaid whole physics steps with explicit
catch-up feedback, allowing the existing schedule to settle them before the
transition is retried. They cannot move pre-departure collision debt into a new
system. The ordinary fractional display remainder stays owned by the clock.

`trackPose` records the previous/current authoritative poses for an integrated
actor. `renderPose` returns an immutable, short-turn interpolated copy. A teleport,
system/hull change or separately advanced calendar clock snaps to the current
pose. Only rendering uses interpolation: physics, range, shots and transactions
continue to read authoritative state. Beams re-trace their visual contact against
the same interpolated ship surfaces without applying damage again.

See [fleet rendering](fleet-rendering.md) for culling, ordering, cache limits,
worker admission and adding artwork without bypassing the shared interfaces.

`ship-traffic.js` uses the existing player, civilians and company tugs. It predicts
relative closest approach from one simultaneous snapshot, queries local spatial
buckets, and chooses starboard detours or yielding. Larger/slower-turning ships
get more clearance; mass and stable category/identity resolve crossing priority.
The player remains manually controlled. Combat intent passes through the same
`ship-motion.avoidShips` advice; overlapping spawns steer outward rather than
remaining stopped inside another ship.

Traffic planning and distant contacts run at 5 Hz on simulation time; active-system
contacts run each physics step. Distant poses are sampled without preparing art.
Registered per-system geometry and spatial membership persist across physics
steps. An individual movement/contact/fitting change replaces that actor's
immutable descriptor; explicit unknown membership changes reconcile the owner.
Scheduled legs use conservative expiring route envelopes with complete-route
fallbacks, then local queries sample their current authoritative poses. A retained traffic snapshot never changes
under another owner's refresh. Swept bounding circles reject distant pairs first.
Sweeps use previous authoritative poses and ignore system changes/teleports.
Ship-pair narrow phase uses 32 supporting axes plus both ships' orientation axes
for a conservative approximation of their curved physical hull ellipses.
Mass, relative speed and angle determine the impulse; restitution is 0.12 and
bounded tangential friction dissipates energy. Contact never subtracts ship health
or changes cargo, credits, reputation, ore entitlements or weapon rules. Effects
use a brief hull-local contact glint and are gated per pair for 250 ms.
Descriptors carry definition-owned `hullRadii` for ship, asteroid and fragment
contacts, inertia and traffic clearance. These never depend on shield charge;
combat `radii` and weapon interception keep their existing shield/hull selection.
NPC prediction adds six units of gap, relative-speed padding up to 24 units and
the existing turn room to both hull bounds. Player steering stays manual.

Physical dispatchers set `physicalContact:true`. `ship-effects.visualImpact`
projects that event onto the hull and admits a separate 180 ms contact glint
at most once every 160 ms per ship. It paints only in the front pass and follows
the ship's local position/heading. It neither replaces an active weapon flash
nor paints a full shield bubble. Unmarked legacy visual events and blasts keep
their previous shield/hull art. See `hull-navigation.test.cjs` and the real-key
passage in `browser-impact-controls.py`.

Saved version-2 straight legs remain valid. Version-3 legs contain ordinary
version-2 acceleration/braking segments, including a braking segment before a
yielding hold. Detours retain the original goal, and `npc-lives.reroute` or
`sol-economy.reroute` reschedules its real deadline. No cargo handler runs merely
because the previous straight-route deadline passed. Dock occupancy and berth
arrival remain owned by `port-docking.js`. Saved `motionKick` is rebased at a new
route's sampled start, preserving velocity without replaying displacement.
Sampling/inspection never changes the saved segments or activates traffic.

Regression coverage: `ship-traffic.test.cjs`, `browser-ship-traffic.py`, existing
Earth-jam/economy/asteroid suites and the same-save NPC performance comparison.

Ship-pair impacts also use the contact point's lever arm and both bodies' moments
of inertia (`mass * (rx² + ry²) / 4`, or explicit definition `inertia`). Relative
velocity includes saved angular motion at that point. Normal and bounded friction
impulses exchange linear and angular momentum without adding kinetic energy.
An end hit twists the ship; a centered hit primarily moves it. Closing speed
scales the impulse, so a fast small ship can visibly affect a heavier hull.

Optional saved `motionSpin.version:1` separates collision rotation from engine
steering. Free spin integrates in shared motion and damps; scheduled spin is a
pure critically damped offset sampled alongside the leg. Route replanning rebases
it without replaying rotation, and lightweight inspector poses carry the same
field. Stopping, pausing and JSON restoration use the existing common boundaries.
Steering/thrust damp free collision drift at 2/s and spin at 4/s; braking uses
4/s and 5/s respectively. Unpowered coasting preserves linear collision momentum.
An uncommanded angular impulse rotates the hull without repeatedly replacing
world velocity with that nose direction. Manual coasting and pure braking retain
their existing world course; turn, thrust and explicit heading/speed/goal commands
continue to use the common movement profile. This does not change impulse,
mass, spin damping, hull statistics or manual acceleration/turn/brake settings.
The existing manual speed, acceleration, turn and braking profiles stay intact.
See `impact-controls.test.cjs` and `browser-impact-controls.py` for the real-key,
speed/offset, conservation, saved-spin and rotating shield-attachment regressions.

## Removed duplication

Previously `sol-economy.js` had tug-specific artwork buffers, contact transforms,
shield subtraction, hull bursts, stage fragments and wreck update/draw loops.
`civilian-traffic.js` independently repeated that machinery and stored dispute
and retaliation shots separately. `player-combat.js` repeated shield-first damage,
contact projection and player-only particles. Some NPC wrecks were first emitted
while painting. These callers now delegate to shared definitions, damage, effects
and the single firing lifecycle; their superseded implementations were removed.
Player local cruise/approach, tug steering, ordinary civilian flight and combat
steering also call the common integrator with explicit profiles.

## Definitions, profiles and controllers

`nativeShipDefinitions.get(type, category)` combines the existing ship statistics
with explicit role data. `describe(state, entity, {category})` returns the common
world target descriptor: `id`, `category`, `entity`, `system`, `shipType`, `x`, `y`,
`heading`, velocity, prior world position, `dimensions`, physical `hullRadii`,
current combat `radii` and `definition`.
`registered()` includes every native world ship and explicitly registered override.
`forEntity(state, entity, {category})` resolves effective statistics, including
definition `statUpgrades`. The player's existing regular tug engine upgrade still
uses speed stat `35 + 15 * min(2, tugEngineLevel)`; its shared manual movement
profile derives from that effective value. A definition/profile `movement`
override is honored by commands that omit an explicit profile.

Effective statistics and hull/shield shapes reuse configuration-owned data.
Their cache checks the hull/category, definition registration revision, fitted
engineering/shield IDs and live instance presence, configured engineering upgrade
fields, all five mineral technology levels and explicit dimensions. Ordinary
movement, damage and weapon charge do not rebuild effective statistics. Shield
charge still chooses the current shield or hull surface on every description.
`forEntity` returns a top-level copy; shared nested definition, dimensions and
radii data are read-only. A consumer that needs to annotate a shape must copy it.
Definition changes go through `register`; fitting and upgrade transactions notify
the target owner after changing the authoritative equipment or capabilities.

Intentional differences belong in data, including default equipment, hull/shield
capacities, emitter offsets, geometry, dimensions, movement profile and explicit
capabilities. The civilian display heights remain shuttle size for type 18, 22.5
for type 23, 72 for type 47 and 90 for type 52. Regular delivery tugs retain the
164/512 artwork aspect ratio at the established flight height. Delivery tugs select a cargo-only job policy and an initially empty weapon
loadout; their hull supports the same equipment and capabilities as a player tug. Civilian fallback defensive weapon IDs are
definition data, not a private NPC weapon implementation.

The standard damage stages are hull fractions below .75, .5 and .25. The old tug
implementation alone switched its last frame at exactly .25; all ships now use
the canonical flight-art threshold `< .25`. The disabled threshold remains its
separate explicit capability, normally .25 for all ordinary hulls, regardless of controller. Disabling and a damage-stage frame are separate results.

Controllers may set goals, choose paths, select movement profiles, choose a
target/weapon and react to completed commands. They may not introduce private
shot damage, recharge, collision math, movement integration, shield drawing or
destruction animation loops. Economic policies and dialogue are controller work:
the shared damage result does not decide faction penalties, confiscate cargo,
rebuild a delivery tug or start a conversation.

## Coordinate and time conventions

* World X increases right and world Y increases down. Distances and artwork
  dimensions are world units; velocities are units/second and acceleration is
  units/second².
* Headings are radians: zero faces right and positive rotation turns toward down.
  Artwork and its local collision surface use `heading + Math.PI / 2`. The
  player save's `angle` is exposed as `heading` by its descriptor.
* Sol player saves retain coordinates relative to the selected local body.
  `vexedSolFlight.shipPosition` converts them to world coordinates. NPCs already
  store world coordinates. `nativeShipSystems.move` converts shared motion back
  to the player's compatible storage representation.
* Local impact positions are absolute world-sized offsets in the artwork frame.
  Definition emitters are fractions of artwork width/height, for example
  `{x:0,y:-.36}`. Emitters and local impact positions are not camera coordinates.
* Simulation steps and recharge deadlines use seconds. Shader and fragment
  `born` values use simulation milliseconds from `nativeSimulation.now(state)`.
  Browser wall time enters through the shared host's RAF/gate checkpoints;
  simulation deadlines never use it directly.
* Hidden tabs, pause and inventory opening stop the shared simulation clock.
  A fixed simulation timestamp also freezes shield flashes, hull particles,
  weapon animation and destruction. Rendering does not age or prune attacks.
* Camera conversion occurs at drawing: `screen = center + (world - camera) * zoom`.
  `ship-effects` and `combat-shots` accept world-space descriptors. Optional
  `paintShip` `x`/`y` overrides are already screen coordinates for warp visuals.
  Its optional `dimensions` override is in world units.

Active beams transform the selected emitter-local offset with the shooter's current
world pose. Beam weapons have a full 360-degree arc for every controller. Native
hulls expose forward `emitters.beam` and rear `emitters.beamAft` banks; firing selects
the configured bank nearest the lock. Custom hulls may supply a single beam bank.
`weapon-rules.beamTrace` aims from that bank at the target's current world position,
limited by weapon range, and finds the first current physical shield, hull or rock.
The 70 ms resolution delay and owned recharge deadlines remain unchanged. Beams
use instantaneous poses; projectile sweeps retain previous positions and homing.

Preview, hit resolution and the remaining beam visual use the same pure query.
After interception the visual retains the lock's current firing line and
re-intersects the first current shield/hull surface rather than steering toward
an off-axis blocker's center or rotating a saved local contact behind its shield.
A new obstruction may shorten the visual, without taking any additional damage.
The hot shield flash reads that same contact while the beam is visible; its
historical flash then decays normally. A destroyed target leaves a world contact,
bounded by range. If hull-clear ships' shields overlap and a weapon mount is
already inside the receiving surface, contact is immediate at that mount
(`contact.embedded`); no backward beam is drawn. Painting never resolves a shot
or changes its saved contact.
A projectile owns its simulated world `x`/`y`; camera changes
cannot move it in the world or recompute its flight from screen endpoints.

## Collision, damage and effects

`nativeShipSystems.scene(state, {system})` supplies every registered target type.
Stable IDs are `player`, `tug:N`, numeric civilian IDs and `rock:N`; new categories
must use distinct IDs. Collection excludes entities that cannot currently be hit.
Collision dispatch refreshes the target before applying a hit so an earlier shot
destroying it does not cause a second destruction/reward.

The registry separates asteroid geometry, current ship descriptions and spatial
membership. `nativeSimulationFrame.step` clears pose collections before the next
integration step. `simulationFrame.cache` also exposes the final completed-step
read model until another step, authoritative clock advance or explicit mutation;
inspection between host frames does not need another fleet census. Snapshot
descriptors stay unchanged when their entities move. The step's scene/ship arrays
are live registry views: copy an array when retaining a simultaneous snapshot.
Immutability covers descriptor pose/value fields, not a deep clone of the world:
`descriptor.entity` and membership entries reference authoritative live entities.
Shared definitions and shapes are read-only. A historical owner must retain the
specific values it needs rather than later reading mutable entity fields.

`refreshShip(state, entity, category, system)` replaces that actor's description
and grid membership without rebuilding other ships or asteroids. Shared motion,
contact, damage, fitting and upgrade paths notify this owner. A custom category
may supply `adapter.resolve(state, id, system)` for individual refresh; otherwise
it uses full collection invalidation to preserve its IDs and metadata.
`refreshAsteroid(state, rock)` updates only its pose/depletion view; unchanged
size geometry remains reusable. Known ship-membership batches (docking and drone
missions) use `invalidateShips(state, system)` without dirtying asteroid indexes.
Mission advancement must invalidate after terminal transitions too: a returned
Dot is owned equipment immediately and cannot remain in same-step physical queries.
Unclassified geometry mutations outside these owners must call
`invalidate(state, system)`; this also lazily reconciles the existing asteroid
index. Field-array length changes are detected directly; same-length replacement
and direct geometry edits require explicit invalidation. Built-in ID resolution reads
the current entity without constructing the entire scene. Destruction, system
changes, landing and warp cannot leave a valid old collision target behind.

`query(state, {system, minX, minY, maxX, maxY, swept, predictSeconds, categories})`
returns fresh result arrays from the existing registered ship grid and asteroid
index. Its conservative bounds include previous/current translation, the maximum
oriented hull/shield extent and optional velocity prediction; extreme sweeps use
bounded overflow storage rather than truncating a path. The asteroid owner grows
conservative component-wise displacement
and velocity bounds on relocation and recomputes them once after drift integration,
before contacts. Queries expand its existing center grid and then filter actual
swept bounds; they must not scan every moving rock per actor/fragment. Contact
responses can enlarge the bounds during the same step. Private bound objects are
reused. `broadphaseVisits` and `summaryVisits` distinguish candidate filtering from
the once-per-step motion scan; exact-test counters alone do not prove bounded work.
Very large calendar sweeps retain a conservative full-field fallback. Exact
collision remains in the shared weapon/motion owners. `collisionScene(state, {system})` is a light
query-only view whose `querySwept(from, to, padding, {instant, horizon})` prepares
only candidates, while `scene` remains the full collection API. It must not be
used as an empty full scene by a consumer that does not call `querySwept`.

Validated civilian/tug routes use the same registry entries and grid with a
rotation-safe envelope covering the current sweep and 0.2 seconds of
simulation-time validity, with verified route padding and one fixed-step margin.
Prediction expands the query using a velocity band that includes each validated
route's speed bound, including while its last stored velocity is still zero.
One indexed expiry-heap slot per entry
keeps scheduling bounded. Queries refresh every due envelope before lookup;
forward/backward clock changes, including direct resolution or scene preparation
between queries, and explicit pose, damage, fitting, definition or
membership changes cannot leave expired geometry in service. Unsupported routes,
impulses and custom geometry keep conservative complete-route bounds; forecasts
beyond six seconds use complete-route bounds plus verified speed padding.
Descriptors retained by another owner remain immutable. Aggregate grid bounds,
entry and cell-write counters distinguish lookup savings from index maintenance.
Run the eight regressions
with `node --test tests/scheduled-spatial-horizon.test.cjs`, alongside the existing
scheduled-pose, shared-spatial, swept-collision and traffic suites.

The same canonical entries have aligned 256-unit and 4,096-unit cell memberships.
Query selection estimates occupied-cell work and chooses the fine grid, coarse
grid or a direct check for genuinely small systems. Both memberships and their
overflow sets update together on pose, bounds, expiry and membership changes;
they are acceleration structures, not additional actors or retained snapshots.
Queries preserve the prior direct/fine traversal order for interception and
traffic ties. Stored bounds reject unchanged bucket neighbors before describing
them; nearby raw pose changes still pass through authoritative freshness checks.
Long forecasts retain the conservative complete-route fallback. Count
`spatialShipCostProbeCells` separately from selected-path cell visits: estimating
small occupied windows also reads buckets. Coarse entry/cell writes and bounds
checks remain visible in the shared counters. Run
`tests/coarse-spatial-query.test.cjs` with the route, beam and collision suites.

Counters distinguish full `sceneCollections`, `asteroidGeometryBuilds` when size
data is first needed, `asteroidDescriptors` for changed rock pose descriptions,
`shipDescriptors`, `effectiveStatsBuilds` and conservative spatial candidates.
Never reuse stale poses or geometry to reduce these counters.

Collision results carry the struck target, approach direction, world point and
`contact`, including `local`, `world`, `from`, `dx`, `dy`, `shielded`, `radii` and
`dimensions`. `ship-damage.apply(descriptor, amount, impact)` preserves the
authoritative contact for its matching surface. A shield overflow calculates a
separate hull contact using the same incoming direction. The returned
`contacts.shield` and `contacts.hull` drive effects; role renderers do not project
the collision again. For a moving-target sweep, overflow uses the recorded local
collision ray at the current target pose, so the earlier projectile position
cannot shift the hull contact to a different side. Custom shield radii flow to both shared shield shader passes
through the optional `surfaceRadii` argument.

`ship-damage.apply` mutates only shield and hull values. Its result includes the
actual absorbed/hull amounts, before/after stages and disabled/destroyed flags.
`ship-effects.hit` creates the matching visuals and dispatches one destruction
explosion. Controller adapters then apply cargo, reputation, phase or rebuild
consequences. `ship-effects.visualImpact` creates shield/hull art without changing
health, retaliation or resources. Environmental explosions and debris retain that
visual-only ship policy while asteroid damage stops at the environmental floor.

Artwork preparation may happen asynchronously. Native hull definitions carry
immutable `debrisGeometry` from `ship-debris-geometry.js`. This metadata records
the original aligned art's fragment/wreck topology, source pixel counts and
existing physical parameters. Damage events emit physical pieces immediately,
including before any images have loaded. Poses, contacts and environmental
effects advance through the existing simulation owners. Visible painting binds
only original prepared texture surfaces by stable piece index; late readiness,
cache eviction and expired earlier pieces cannot replace geometry, reset motion,
emit another piece or replay a contact. Offscreen native debris needs no artwork
request. Mining completion and ore awards likewise happen in simulation.

`tools/build-debris-geometry.py` extracts this source metadata through the existing
preparation owner without regenerating artwork. Its `--check` mode validates
geometry and material conservation; source signatures normalize text line endings
and hash original image bytes. Changing an aligned frame or fracture profile
requires rebuilding it. A custom artwork definition supplies matching
`debrisGeometry`; unsupported legacy custom profiles retain their older deferred
compatibility path and do not establish camera-independent cold collision timing.
This runtime definition asset does not change the saved schema.

Asteroid physical shard sampling uses the catalog's original image dimensions
even while images are cold. Painting clips the original image to the already
chosen polygon; it cannot choose velocities or admit a physical shard. Decorative
mining pieces, stars, hull sparks and wreck trails use private visual random
streams. Camera-dependent preparation or painting cannot advance gameplay's
random stream.

The live path publishes base artwork before optional fragment/wreck preparation
finishes. Pixel loops and striped native transfers share one cooperative queue
(2 ms target slice, 64 queued or waiting generators, at most 4096 pixels per
read/upload stripe). Pure pixel buffers stay CPU-backed; GPU colour filters and
clipping retain their original rasterization. Foreground appearances pass optional
work with a bounded service opportunity for the oldest task every eighth step.
The queue owns one lazy `ship-art-readback.js` worker for snapshots of already
filtered GPU artwork. A generator can suspend on its snapshot promise and resumes
with its pixels or an exception; suspended tasks still count toward admission.
Foreground readback is bounded to eight requests, one million pixels per request and 16 MiB
of staging reservations (bitmap, worker surface and returned RGBA), with a
15-second timeout. Failed or unsupported readback records its failure and uses
the same striped main-thread fallback without dropping valid artwork. Native
bitmap creation cannot be cancelled, so its reservation remains until a late
bitmap settles and is closed. Report main-queue steps, bitmap snapshot time,
worker work and total worker wait separately; these overlapping times must not
be added together, and the slice target is not a hard native-operation deadline.
Optional fragment/wreck tasks use separate 96-MiB admission reservations and a
60-second timeout. These estimates include their bounded output surfaces; they
are not process RSS or native-operation duration limits. See
[rendering preparation ownership](fleet-rendering.md) for both budgets and live
effect retention.
Synchronous entry points remain for showcase and exact pixel regressions;
specialized egg/creature preparation retains its own mask work and live readiness.
Explicit full preparation still waits for fragment and wreck readiness.
Preparation completion cannot mutate health or replay explosion
consequences. Legacy deferred emission drains only during unpaused simulation;
native physical debris does not wait for optional preparation.
The damage-art owner bounds retained prepared classes and reports its byte
estimate; active effects and external live artwork references have separate
lifetimes. See the performance report for measured cold-path limits.

`planLeg` rejects nonfinite endpoints/time through `valid:false`. Distances at or
below `1e-6` world units are complete commands with zero duration and velocity.
`sampleLeg` also repairs old zero-distance legs whose JSON duration became null.
Callers must handle `invalid` without awarding arrival, goods or resources.
Repeated waypoints are consumed in bounded batches, with the remaining route
scheduled for later rather than repeatedly queuing immediate work.

Player and civilian mining share `asteroid-combat.completeMining` and its
`miningTiming` constants. Completion is idempotent: a second caller cannot create
another ore entitlement. Ship `canMine` capabilities govern equipment and job
commands; controllers retain the decision to mine and what to do with collected ore.

## Adding a ship, weapon or AI role

1. Add the native ship row, preserved artwork/catalog frames and artwork profile
   as appropriate. An existing ship automatically has a definition. Optional
   `nativeShipDefinitions.register(type, overrides)` supplies dimensions,
   capabilities, geometry, equipment or per-category `profiles` data without
   introducing a controller implementation. `geometry.hull`/`shield` may specify
   fixed `rx`/`ry` or dimension fractions; the default shield uses the showcase
   geometry. Call `ship-effects.prepare(type, category)` to preload its four
   frames and destruction assets.
2. Give each spawned entity a stable ID, `shipType`, system, pose and current hull
   and shields. Existing civilian or tug collections automatically produce common
   descriptors. A new category registers `{collect, hit, visualImpact}` through
   `nativeShipSystems.register`; its hit adapter must call shared damage/effects
   and then its own business consequences. The regression suite includes an
   independent escort-category example.
3. Implement an AI decision function using existing movement commands (`goal`,
   `heading`, `throttle`, `turn`, `brake`, `hold`, `coast`) and profile data.
   `nativeShipMotion.step`/`followPath` execute the command. For player-relative
   saved coordinates use `nativeShipSystems.move`.
   Optional definition/profile `combatMovement` configures combat motion through
   the same integrator; tactical AI still only chooses its desired command.
4. Request firing through `nativeCombatShots.fireFor({state, shooter, getTarget,
   ...})`; `fire` is the player convenience entry. Equip real owned weapons with
   `nativeWeaponLoadout`. A new model goes in the weapon catalog and showcase
   style catalog; changes to its mechanics belong in `weapon-rules.weaponSpec`,
   shared by every shooter. An AI can select a weapon but cannot override its
   damage, recharge, range, speed, tracking or collision model.
5. Render through `ship-effects.paintShip`, then the centrally invoked shared
   effects pass. Add only role UI such as a target frame in the controller.

## Save compatibility

The existing numeric `weapons` and `weaponInventory` arrays remain projections
for compatible saves and UI. `shipEquipment.version:2` stores typed owned equipment; `weaponLoadout.version:1`
is its compatibility projection. Instances retain fitted/locker IDs and
per-instance `readyAt` deadlines. Moving
the same weapon between slots or the locker preserves its recharge. Granting a
new weapon creates a new identity. Loading projects the saved instance state
back to the existing arrays.

`shipSimulation.version:1` migrates the former player and civilian clocks to one
clock, retaining their old values for explicit deadline conversion. Old slot
cooldown keys migrate to instance deadlines relative to their original clock.
`weaponCombat.version:2` stores serializable pending events; legacy dispute,
retaliation and stray-shot queues migrate once into that common event list.
Projectile positions and event snapshots survive JSON save/load. Old version-2
beam events remain readable: their saved `beamHeadingOffset` is ignored in favor
of the authoritative live lock (or last known world aim when contact is lost).
Resolved events remain resolved after reload and cannot apply damage twice. Runtime
callbacks/artwork objects are caches, not saved gameplay state. System travel
clears transient local combat/effects and preserves owned weapon recharge.
Saved event owner IDs route results through target-adapter `onResolved` handlers,
so restored NPC shots update their active combat reports without callback closures.

`civilianTraffic.timingVersion:1` rebases saved mining, retaliation, dialogue,
encounter, meeting and tactical deadlines from the old civilian clock without
changing their remaining durations. Job timers expressed as remaining seconds
continue unchanged. Player mining uses a saved `miningOperation.version:1`;
restoration and completion run in simulation, including without a render pass.

## Combat intent and verified checkpoints

Civilian intent is sampled independently per crew at up to 30 Hz. Shared motion
and traffic avoidance still integrate every physics substep; weapon eligibility
and owned recharge are not delayed by this intent cache. Damage, changed targets,
changed fitted capabilities and expired threats force reassessment. The transient
cache is keyed by the actual crew/AI identity and simulation time, so loading a
save cannot retain another session's command. Slow active host frames retain all
their elapsed seconds through the existing movement/contact substeps. Hidden-tab,
pause and inventory gates still suspend the clock.

`combat-shots.threats(state, descriptor, options)` reads live shared projectiles,
including strays without a matching target ID. It applies a launch reaction delay,
a relative-motion broad phase and the shared physical interception query over a
short linear forecast. It scans at most 256 saved events and performs at most 16
narrow queries, returning at most eight threats. Larger queues rotate through
deterministic chunks every 0.1 simulation seconds. Forecasts do not advance or
home a projectile, create a hit, or change charge. `activeProjectile` provides an
indexed read-only snapshot for expiring cached perceptions; `hasActiveProjectiles`
lets ordinary traffic skip unnecessary awareness work. Actual flight, homing and
first-object damage remain solely in the existing shot lifecycle.

`firingStatus` reports shared equipped model range, arc, physical launch blockers
and owned `readyAt` deadlines without consuming a charge. A mixed loadout can
reach a target with its longer-range weapon even while a shorter weapon cannot.
The player HUD and firing requests use that same eligibility. Beam weapons retain
their 360-degree targeting and physical interception from the beam correction.

Holding Space latches the current target until release or an input/flight gate
clears it. Each host frame requests at most one shared shot; slow frames do not
replay missed requests. Target changes/loss stop the hold and cannot redirect it.
Gameplay target selection preserves steering/throttle, while overlays, focus loss,
warp, disabling and destruction clear flight input. Threatening ships lead the
selection list; cycling and clicking still admit neutral ships and asteroids.

`save-storage.schedule` coalesces redundant hit checkpoints using a 250 ms trailing
delay and a one-second maximum wait. The host calls `flushDue` after display or
bounded between-display simulation tasks; clean/no-longer-due calls do not write.
Explicit saves, purchases, fitting and travel commits remain immediate verified
writes; menu/focus/page lifecycle boundaries flush a dirty checkpoint. Normal and
Dev queues remain separate. Failed writes remain dirty and return the real error,
with retries limited to once per second. The queue is transient; the saved schema
and existing bounded periodic autosaves remain unchanged. Cost and frame delivery
comparisons use the same saved fleet in `browser-combat-performance.py`.

## Verification of this migration

The pre-migration commit `b3d190d` passed its original 29 Node tests and browser
smoke checks with source served from that exact commit. The migrated game passes
73 Node tests. These include all native definitions across role profiles, job
progression without rendering, old-clock migrations, owned recharge, collateral
damage, moving contact surfaces and restored shots.

Both browser scripts pass against the repository and the installed Games Hub
copy in headless Edge. The contract suite has 20 actual Canvas scenarios covering
moving/rotating actors, camera movement, three shield states, custom emitters and
shield geometry, projectile pause/inventory behavior and JSON restoration. The
smoke suite checks keyboard flight, live collateral/blast behavior, showcase
explosions and a real page reload/Continue preserving an owned recharge deadline.

Browser visual coverage uses representative player/tug/civilian artwork plus a
registered custom definition. It does not constitute a visual review of every
artwork asset or a full campaign balance assessment. The automated GitHub workflow
runs the same commands with Playwright Chromium; its remote result is separate
from the local Edge results.

## Required regression checks

Run `node --test tests/*.test.cjs tests/*.test.js` before and after migration work.
`ship-motion.test.cjs` and `ship-effects.test.cjs` iterate the registered native
definitions and role profiles, so adding a native ship automatically joins the
shared motion/damage tests. Contract tests prevent controllers from reintroducing
private mechanics and exercise a newly registered target category.

Run `python tests/browser-smoke.py` for ordinary gameplay/showcase smoke scenarios
and `python tests/browser-ship-contract.py` for actual canvas beam attachment,
impact alignment, registered custom shield geometry, pause and shared commands.
`tests/beam-targeting.test.cjs` covers current-pose aim, full beam arcs,
off-axis/moving interception, embedded close contacts, shield overflow,
owned upgrades/recharge and exactly-once restoration. Run
`python tests/browser-beam-targeting.py` for real Shift/Space and NPC retaliation,
beam/shield pixels during rotation, physical blockers and pause/save/Continue
midattack. It captures rearward fire and current shield contact on both the
shared Canvas renderer and the actual native gameplay canvas.
These checks start isolated local servers, use Playwright and write ignored
reports/screenshots under `test-results/`. The smoke script also accepts an
existing server URL. `BROWSER_CHANNEL` selects the contract script's browser;
its default is Edge (`msedge`), or use an empty value for bundled Chromium.

Every addition must cover applicable movement/rotation, moving targets, camera
changes, active/collapsing/absent shields, beams/projectiles/collateral, pause and
inventory, recharge during swaps/locker moves, target destruction, system changes
and JSON save/load. Browser evidence is required for emitter and surface alignment;
passing only geometry calculations does not establish that the shader is aligned.
Keep real delivery/mining/trading tests and original faction/ore assertions.

Stabilization checks add full-population funded-delivery/recovery accounting,
same-system tactical boundary transitions, invalid/restored scheduled movement,
and cumulative work budgets. Run `browser-npc-lives.py` for persistent journeys,
`browser-render-paths.py --visual-only` for player lighting/warp comparisons, and
`browser-stability.py` for cold-art visibility, preparation/damage ordering,
pause, deduplication and bounded retention. All are included in the test workflow.
Read [stabilization verification](stabilization-results.md) before interpreting
timing evidence or changing cache/preparation limits.

Directional light changes update the shared cache's existing mask and final
composition. They do not invalidate its separately cached animated-effect layer.
Player, damaged and warp effects retain 60 Hz sampling; shared healthy NPC drawing
explicitly selects 20 Hz. Cache surfaces, raster quality and memory limits remain
bounded. Direct lit previews retain their existing 60 Hz default.

`ship-effects.request(type, category, {stage})` publishes the currently needed
appearance first. Unused plates load one at a time after foreground work, using
the existing cooperative pixel queue. Requests for the same plate share one
promise; a foreground request can promote a deferred plate. `prepare` retains
its explicit full fragment/wreck readiness contract. Stage changes and failures
keep a valid same-hull appearance visible; changing hull clears the old hull and
the visual generation guard rejects late results. Painting never applies damage.

Run `browser-ship-lighting.py`, `browser-cold-ship-loading.py` and
`browser-review-gameplay.py`. Separate source-image loading, `decode()` wall
time, preparation and actual first paint when profiling. Appearance latency is
not a measurement of a whole-game freeze. Reproduce the same fleet, input,
viewport and browser with `browser-render-review-performance.py`; see
[review measurements](render-review-results.md) for limits of the evidence.

## Deliberate boundaries

The showcase retains its own demonstration scene/controller and scene clock; its
artwork, weapon renderer, shield geometry and destruction shaders remain shared.
Interstellar travel relocates entities between systems and chooses arrival jobs;
local movement still uses the shared integrator. Asteroids use the common target
interface but retain asteroid-specific textures, destruction, mining and ore
consequences. Biological/special artwork effects remain the existing profile
renderers behind the shared ship drawing boundary.

## Persistent lives extension

The [NPC life contract](npc-life-contract.md) specifies the saved task/journey
schemas, real inventory and credit transfers, bounded scheduler, calendar policy,
detail transitions, lightweight inspector adapters, and repeatable freighter
demonstration. Ordinary civilian work now belongs to `npc-lives.js`; the civilian
controller retains nearby combat, dialogue and explicitly tagged scripted demos.
Sol freight still uses its original inventories, route policy and rebuild costs.
It now stores life/task metadata and schedules the same shared local movement
commands for nearby and distant ships. Rendering cannot advance any of these jobs.

## Market and docking extension

Cargo quotes and job selection remain policy. All actual player/NPC freight
settlement calls `npc-lives.exchange`, which checks the entire transfer before
mutating stock, cargo or credits. Docking assignments come from `port-docking.js`;
controllers execute the resulting travel through the existing scheduled motion
owner. Per-role parking arithmetic and render-triggered handling are prohibited.
The Earth recovery and market regressions join the required checks; see
[traffic recovery](earth-traffic-recovery.md).
