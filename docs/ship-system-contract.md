# Ship system contract

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
| Owned weapon identities, fitting, locker transfers, recharge deadlines and legacy equipment migration | `weapon-loadout.js` | Request an equipment operation |
| Model/upgrade weapon specifications, eligibility, ballistic simulation, interception and swept collisions | `weapon-rules.js` | Choose a weapon/target, or request fire |
| Firing lifecycle, emitter attachment, pending attacks, resolution, visual shot instances and cleanup | `combat-shots.js` | Call `fire` for player input or `fireFor` for NPC intent |
| Shield-first damage, hull overflow, nonlethal floors, stage transitions and disabled/destroyed results | `ship-damage.js` | Respond to the result |
| Ship artwork cache, shared ship rendering, shield/hull impacts, stage fragments and wreck simulation | `ship-effects.js`, using existing showcase shaders and destruction assets | Request a hit/visual event and draw the resulting state |
| Explosion/debris contact collection and visual-only ship impact dispatch | `explosion-impacts.js` and shared `debris-impacts.js` | Supply the explosion/debris source |
| Asteroid hit points, asteroid destruction, mining progress and ore entitlement | `asteroid-combat.js`, registered through `ship-systems.js` | Choose mine/fire and collect completed simulation results |
| Tug deliveries, assignments, cargo loss, rebuilding and economic consequences | `sol-economy.js` | Use shared mechanics; retain delivery policy |
| Civilian jobs, trading, mining choices, retaliation, faction consequences and dialogue | `civilian-traffic.js` and `civilian-combat-ai.js` | Decide travel/dock/mine/trade/pursue/flee/fire |
| Persistent civilian tasks, stock reservations, commercial transactions, interstellar journeys and distant scheduling | `npc-lives.js`, extending `civilianTraffic.ships` | Role policies choose useful work using the common task commands |
| Scheduled local movement commands sampled at any detail level | `ship-motion.js` `planLeg` / `sampleLeg` | Choose a goal, definition movement profile and start time |
| Calendar skips and conversion between days and job time | `world-time.js`, using the saved simulation clock | Advance a committed journey once; its presentation animation does not add economic time |
| Lightweight ship inspection across registered categories | `ship-systems.js` `inspectAll`, `dev-galaxy-view.js` | Read authoritative position/task state; relocate the Dev observer only |

`player-combat.js` is a compatibility adapter for shared definitions, damage and
effects. It does not contain a second player damage model. In the active game,
`native-game.js` advances and paints the shared effects collection once per step
and frame. Do not additionally call the adapter's legacy `advance`/`paint` passes.

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
`heading`, velocity, prior world position, `dimensions`, current `radii` and `definition`.
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
164/512 artwork aspect ratio at the established flight height. Delivery tugs have
`armed:false` and `canMine:false`; owning the same tug hull as a player does not
prevent the player from equipping it. Civilian fallback defensive weapon IDs are
definition data, not a private NPC weapon implementation.

The standard damage stages are hull fractions below .75, .5 and .25. The old tug
implementation alone switched its last frame at exactly .25; all ships now use
the canonical flight-art threshold `< .25`. The disabled threshold remains its
separate explicit capability, normally .25 for civilian and delivery roles and
zero for the player. Disabling and a damage-stage frame are separate results.

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
for compatible saves and UI. `weaponLoadout.version:1` stores stable owned weapon
instances, fitted/locker instance IDs and per-instance `readyAt` deadlines. Moving
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
