# Ship system contract

The current hardware/equipment migration is specified in [unified ships](unified-ships.md).
It supersedes the old ownership-specific capacity and movement exceptions below.

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
| Saved simulation time and pause gate | `simulation-clock.js` | Supply frame elapsed seconds through `native-game.js` |
| Work budgets spanning animation-frame catch-up substeps | `simulation-frame.js` | Begin/end the host frame; retain unpaid scheduling debt |
| Tactical detail eligibility | `ship-detail.js` | Ask the common predicate before steering, firing or collecting combat scenes |
| Owned weapon identities, fitting, locker transfers, recharge deadlines and legacy equipment migration | `weapon-loadout.js` | Request an equipment operation |
| Model/upgrade weapon specifications, eligibility, ballistic simulation, interception and swept collisions | `weapon-rules.js` | Choose a weapon/target, or request fire |
| Firing lifecycle, emitter attachment, pending attacks, resolution, visual shot instances and cleanup | `combat-shots.js` | Call `fire` for player input or `fireFor` for NPC intent |
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
| Bounded player lighting, warp layers and lamp surfaces | `ship-sprite-cache.js`, called by `flight-assets.js` | Supply artwork, stage, lighting, scale, heading, simulation time and warp appearance |
| Cooperative optional damage-pixel preparation | `showcase-stage-fragments.js` queue; `cthia-destruction.js` and artwork profiles supply generators | Request preparation through `ship-effects.js`; keep base artwork visible |

`player-combat.js` is a compatibility adapter for shared definitions, damage and
effects. It does not contain a second player damage model. In the active game,
`native-game.js` advances and paints the shared effects collection once per step
and frame. Do not additionally call the adapter's legacy `advance`/`paint` passes.

## Ship traffic and contact

`ship-traffic.js` uses the existing player, civilians and company tugs. It predicts
relative closest approach from one simultaneous snapshot, queries local spatial
buckets, and chooses starboard detours or yielding. Larger/slower-turning ships
get more clearance; mass and stable category/identity resolve crossing priority.
The player remains manually controlled. Combat intent passes through the same
`ship-motion.avoidShips` advice; overlapping spawns steer outward rather than
remaining stopped inside another ship.

Traffic planning and distant contacts run at 5 Hz on simulation time; active-system
contacts run each physics step. Distant poses are sampled without preparing art.
Registered ship descriptions are shared only within the physics step and
invalidated after movement/contact; a traffic snapshot reuses geometry while
resampling current poses. Swept bounding circles reject distant pairs first.
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
Free collision drift now settles at 2.6/s with released controls, 3/s under
steering/thrust, 4/s under holding/goal control and 6/s under braking. A 0.05-unit/s
cutoff gives finite travel and an exact rest state. Intended manual coasting
retains its engine velocity. Spin retains 4/s input and 5/s braking recovery.
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
  Browser wall time measures incoming frame duration only.
* Hidden tabs, pause and inventory opening stop the shared simulation clock.
  A fixed simulation timestamp also freezes shield flashes, hull particles,
  weapon animation and destruction. Rendering does not age or prune attacks.
* Camera conversion occurs at drawing: `screen = center + (world - camera) * zoom`.
  `ship-effects` and `combat-shots` accept world-space descriptors. Optional
  `paintShip` `x`/`y` overrides are already screen coordinates for warp visuals.
  Its optional `dimensions` override is in world units.

Active beams transform the same emitter-local offset with the shooter's current
world pose. A resolved target contact remains attached through its recorded
local surface point. A projectile owns its simulated world `x`/`y`; camera changes
cannot move it in the world or recompute its flight from screen endpoints.

## Collision, damage and effects

`nativeShipSystems.scene(state, {system})` supplies every registered target type.
Stable IDs are `player`, `tug:N`, numeric civilian IDs and `rock:N`; new categories
must use distinct IDs. Collection excludes entities that cannot currently be hit.
Collision dispatch refreshes the target before applying a hit so an earlier shot
destroying it does not cause a second destruction/reward.

During a host animation frame, a target ID index and scene collection may be reused
within one physics substep. `nativeSimulationFrame.step` clears that cache before
the next substep. Shared movement, tactical steering and hit dispatch invalidate
it immediately; an extension that directly changes target membership or geometry
must call `nativeShipSystems.invalidate(state, system)`. Built-in target resolution
also refreshes health, shield geometry and poses from the live entity. Never reuse
a whole-frame collision scene across moving-target substeps.

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
visual-only ship policy while they can destroy asteroids.

Artwork preparation may happen asynchronously. Wreck emission happens in hit or
simulation advance, including when artwork finishes loading later. Drawing a
wreck never emits its debris. Mining completion and ore awards likewise happen
in simulation, never in a paint function.

The live path publishes base artwork before optional fragment/wreck preparation
finishes. Those pixel loops share one cooperative queue (2 ms target slice, 64
queued generators); image readback and canvas upload remain indivisible calls.
The synchronous preparation entry points remain for the showcase and exact pixel
regressions. Preparation completion cannot mutate health or replay explosion
consequences. Deferred visual emission drains only during unpaused simulation.
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
Projectile positions and event snapshots survive JSON save/load. Runtime
callbacks/artwork objects are caches, not saved gameplay state. System travel
clears transient local combat/effects and preserves owned weapon recharge.
Saved event owner IDs route results through target-adapter `onResolved` handlers,
so restored NPC shots update their active combat reports without callback closures.

`civilianTraffic.timingVersion:1` rebases saved mining, retaliation, dialogue,
encounter, meeting and tactical deadlines from the old civilian clock without
changing their remaining durations. Job timers expressed as remaining seconds
continue unchanged. Player mining uses a saved `miningOperation.version:1`;
restoration and completion run in simulation, including without a render pass.

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

Flight key-down edges belong to the host input layer. If a tap is released
before rendering resumes, the next simulation advance consumes its pending edge
once, in its first physics step. Held WASD/arrows continue through ordinary
shared movement. All existing input resets discard pending edges too; drawing
cannot replay input or advance movement. Verify real between-frame taps, their
single consumption and blur clearing in `browser-impact-controls.py`.
