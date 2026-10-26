# Disabled hulls and Olympic rescue

The live port loads `ship-repairs.js` after the existing civilian life owner. All utility equipment, supplies, calls and missions are saved in the ordinary game save. Existing civilian IDs, Sol freight slots, cargo and treasuries are retained.

A disabled hull is alive with its engines offline. Shared damage disables player, civilian and tug hulls at 25% health; zero hull remains destruction. Every hull receives one basic Dot bay slot below 100 t cargo capacity, otherwise two. Three Olympic Class medical crews join the existing `civilianTraffic.ships` population once, with six Dot slots each. The player-owned Olympic also has six; capacities
and declared starting equipment now come from the shared definition. Hull
changes resize capacity and retain owned Dots without granting replacements. Their initial 15,000 credits apiece are recorded explicitly as medical capital. Reloading never creates another crew or revives a destroyed ship or Dot.

Drones restore hull only, at 1.5 hull per drone per simulation second. Each five hull restored consumes one deuranium; fractional remaining supplies are saved. The player uses the existing deuranium balance. NPC reserves consume hold capacity and are purchased through the existing atomic market exchange, at 55 credits/t, using only unreserved stock and owned funds. Accepted freight purchase funds are protected; ordinary crews spend at most a quarter of their current credits per restock. Sol company tugs transfer up to 12 t from their own port stock. Small civilian hulls target 4 t and larger hulls 12 t. Olympics aim for 200 t, with paid restocking visits when below 60 t. Owned delivery cargo and escrow remain separate from reserve material.

Inventory's **Deploy Repair Drones** button manually launches the player's fitted,
operational DOTs when the hull is damaged and repair deuranium is available.
`nativeShipRepairs.deploymentStatus` owns eligibility and its visible disabled
reason; `deployPlayer` creates a normal saved mission with `manual:true`. Manual
self-repair can service an operational player hull without disabling it. Launch,
approach, welding, material consumption, recovery and rendering remain shared
with automatic repairs. Launch saves immediately and closes Inventory to resume
simulation. Reopening Inventory pauses the same mission. Duplicate deployment is
rejected, and warp/local cruise wait for the player's drones to return. Exhausted
manual repairs recover their drones without launching another mission or issuing
a disabled-hull distress call.

The **Manual / Auto** control beside the DOT bays saves the player's
`repairDroneMode` immediately. Missing preferences default to Manual, including
older saves. `repairMode` and `setRepairMode` own this preference. Manual mode
requires the deploy button at any damage level, including a disabled hull, and
does not create automatic player distress calls. Auto checks ordinary hull damage
on the existing simulation poll, launching the fitted operational DOTs only when
supplies, mission capacity and travel state permit. Its saved missions carry
`automatic:true` and use the same movement, welding and material accounting.
Changing mode does not advance physics while Inventory is open or cancel an
active repair; existing jobs finish and return their drones. The preference
survives normal/Dev save reloads and hull changes. NPC automatic repairs and
existing Olympic rescue jobs retain their own policies.

Each hull's `repairBayGeometry` declares a normalized hatch position and outward
direction. DOTs now start at that hatch, fly through an exterior clearance point,
then approach their assigned work station using the shared version-3 route
sampler. Launches remain staggered; waiting DOTs stay out of the visible fleet
until their own departure time. They cannot weld or consume repair supplies
before arriving at their work station. Recovery flies to the bay's exterior
point and then into the hull before changing the owned DOT back to `stowed`.

Saved `bayTransit` exit/entry stages survive mid-flight reloads. A brief, bounded
bay corridor permits only that DOT to cross its own carrier's hull during launch
or docking. Shared traffic and physical contact remain active for other hulls
and outside the corridor. Legacy active routes continue without relocation.
Player equipment/disabled-hull presentation prepares the existing repair artwork
ahead of departure; image readiness never advances or gates simulation time.
`tests/repair-drone-launch.test.cjs` checks physical bay origins, staggered
departures, reloads, docking and carrier-only passage. The live browser check in
`tests/browser-drone-launch.py` verifies painted launch pixels near the hatch,
outbound and inbound flight, no early welding, final recovery and exact costs.

`tests/manual-repair-deployment.test.cjs` covers launch eligibility, owned drone
identity, duplicate rejection, pause, midway reload, exact fractional costs,
Manual suppression while disabled, Auto deployment on ordinary damage and mode
changes during an active job.
`tests/browser-manual-repair.py` clicks the actual Inventory button in a normal
game, checks each disabled reason and the compact layout, then watches the saved
mission complete after reloading midway through repairs. It also clicks both
mode controls, reloads a saved Auto setting and checks that switching to Manual
finishes the current job while preventing a subsequent disabled-hull launch.

A disabled NPC hull, or a disabled player hull in Auto mode, launches its surviving equipment. Exhausted material or missing drones produces one saved distress call. A loaded Olympic claims the nearest available call; another responder cannot claim it concurrently. The existing NPC scheduler releases its commercial reservations, retains owned cargo, plans warp and local approach, then stops alongside the casualty and deploys up to six drones. Afterwards it resumes cargo recovery, supply procurement and ordinary trade. Interrupted or destroyed responders release their claims. Repairs never resurrect zero-hull ships. A disabled ship waits for a full hull and its drones to return before resuming. Shields still require the established service rules.

Olympics have a saved `medicalSupplyVersion:1` policy and `repairProvisioning` flag. Below 60 t they begin a refill that continues toward 200 t, rather than stopping after crossing 60 t. They buy unreserved deuranium when affordable stock exists. Otherwise they reserve a deuranium asteroid through the ordinary mining task owner, physically travel, cut and collect four ore entitlements, then dock at an inhabited refinery. Mined ore travels as owned `good:7`, `oreType:'deuranium'`, `raw:true` cargo; raw material becomes usable repair reserve only at the berth. The Olympic retains up to its reserve target and can sell excess. It needs no buyer escrow or payment to process its own ore. Normal traders and miners can also sell deuranium ore into the existing deuranium market stock. A supplied responder can interrupt its mining task for distress, releasing the rock reservation without creating a second crew or replaying an ore claim.

`economicLedger.produced[7]` and `minedDeuranium` record NPC collection exactly once; raw cargo and usable reserves share that conserved deuranium-equivalent total. Refining transfers those units rather than producing them again. The player collects raw `minerals.deuranium`, then uses **Refine 1 for repairs** at an inhabited port to transfer it one-for-one into the existing `deuranium` balance, or sells the raw ore for funded payment into the port's good 7 inventory. This does not change existing repair material costs.

Medical calls deliberately permit a claimed Olympic to enter an empty or excluded system only for that casualty, then return physically to an inhabited port. This grants no civilian residency, fabricated market or mining access. The saved return journey is also allowed through access audits. Ordinary traffic keeps the existing exclusions.

`npc-lives.js` owns rescue selection handoff, trade interruption, journeys, local route deadlines and return tasks. `sol-economy.js` resumes disabled freight through its own route/handling policy. Shared `ship-motion.js` plans and samples Dot flight; `ship-traffic.js` handles avoidance and contact; common definitions/damage/weapons recognize launched Dots. Active mission count is capped at 16, with waiting hulls retried on the saved one-second poll. Simultaneous welders are integrated over their actual arrival intervals, including calendar catch-up. No simulation clock or material consequence belongs to rendering.

`repair-visuals.js` uses the existing Dot lamps, damage plates, nozzle, fragments and destruction helpers through the lazily loaded `live-repair-assets.html` artwork document. That document gives the shared artwork its original relative URL base and loads no showcase inventory, fake credits or fleet simulation. It is requested only for a visible repair. Hull restoration composites the ship's actual damaged and intact plates from authoritative progress. Camera conversion stays in painting. Cached surfaces are bounded; pause and offscreen inspection cannot advance repairs or prepare distant artwork.

Every hull shares the Steamrunner's repair tools through
`flashtrek-broken-mirror/repair-hull-work.js`: green nozzle-aligned welding beams,
blue-white tool flashes, masked hull reflections, thrusters and ballistic sparks.
The showcase enables the existing approach/work/return sequence on all 78 ship
entries, including basic, upgraded and advanced repair fleets. Entries with only
intact artwork use a maintenance pass rather than invented damage frames.

In flight, `ship-repair-sites.js` supplies 54,866 work cells for all 66 hulls.
`python tools/build-repair-sites.py` regenerates these bounded coordinates and
surface normals from the existing aligned damaged/intact artwork using the same
analyzer as the showcase. The simulation assigns distinct work lanes, moves tool
contacts across them, and saves spark birth times and world velocities. Painting
restores completed cells rather than sweeping a horizontal strip across a ship.
It never samples distant artwork or changes health, supplies or simulation time.
Legacy active missions acquire work lanes when their next work step runs.

Validation: `tests/ship-repairs.test.cjs` covers equipment migration, atomic purchases, partial repairs, duplicate claims, real rescue journeys, commercial escrow, player and tug recovery, interruptions, midway reload, pause, catch-up and a full 30-minute production population with material/credit accounting. `tests/browser-ship-repairs.py` exercises actual painted lamps and welding pixels at rotated/scaled nozzle positions, hull plate progress, pause/read-only painting, offscreen preparation and real Dot wreckage. Existing economy, access, physics, traffic and browser suites remain required.

`tests/fleet-repair-work.test.cjs` checks every hull's work-cell bounds, unique
assignments, monotonic restoration and read-only ballistic effects.
`tests/browser-fleet-repairs.py` exercises each showcase ship's real repair control,
painted welding tools, exact intact finish and return to hangar, then repairs each
live hull with actual equipment, artwork, beam contacts and conserved material.
Pass a showcase base URL to audit the separately served installation as well.

Recovery traffic keeps a bay passage's expiry attached to the real rerouted
flight deadline. Maintenance craft in the same mission use swept physical hull
clearance when queuing close to the hatch; they still avoid actual intersecting
paths and retain physical contact. This prevents a six-DOT recovery from waiting
forever inside the larger buffer used by ordinary passing traffic. The staggered
medical rescue regression runs at the common Standard engine speed, and
`tests/repair-drone-launch.test.cjs` checks both delayed recovery passage windows
and real-versus-clear peer approaches.

`tests/deuranium-mining.test.cjs` additionally covers every historical regional rock, depleted extension IDs, raw/player refining, mining damage, an unfunded Olympic's midway mining and loaded-cargo reloads, conserved material/money, real refinery docking, refill hysteresis and rescue interruption. `tests/browser-deuranium-mining.py` checks the production alpha/damage surfaces, actual mining/refining/prospecting controls, pause and midway player reload, and a real Olympic mining-to-rescue life with six working Dots.

## Attachment points and fleet cost

The shared Basic Dot is 3.5 world units across, smaller than the 11.7-unit
Runabout. Its original raster artwork, lights, nozzle and destruction frames use
the same size conversion. This changes neither repair rate nor material cost.
`ship-definitions.repair` supplies `bay`, a nonzero direction in the aligned
artwork frame, `work`, an array of work directions, and `standOff`, the armor
clearance in world units. Defaults provide an aft bay and six distributed work
sites. Custom definitions can override these fields without controller or ID
checks. Shared hull radii project the directions onto the actual physical hull;
the repair owner rotates those attachments with the authoritative current pose.

Launched craft begin at that bay surface and work just outside the armor. They
follow drifting and rotating casualties through shared movement, and cannot
repair from beyond their work range. Returning craft use the same bay; a saved
mission's existing drone order forms a physical approach queue so several craft
cannot mutually block its entrance. Stowing requires reaching the bay, rather
than disappearing twenty units away. Shared traffic and physical contacts still
apply. Rendering interpolates nozzle and hull contacts together and only reads
repair progress; it cannot consume supplies or advance a mission.

A launch inherits the carrier's actual physical velocity in the existing saved
`motionKick` record (`inherited:true`). Relative maneuvering preserves that
inertial frame while a shared braking command can counter it. The drone keeps
its ordinary 85-unit/s relative engine limit, acceleration, contact impulses and
material costs. This is retained through reload and does not alter ordinary
collision-kick damping. Clear attachment approaches route physically around the
target's hull; they do not exempt the drone from collision or move it while
painting.

The repair owner indexes disabled hulls and medical responders during its initial
population reconciliation. Shared mutation hooks update those runtime sets;
the one-second poll examines that working set plus a bounded 64-record safety
audit. Membership reconciliation does not replace owned equipment or create
medical crews. Moving Dots and changing casualty health refresh individual shared
targets, including removal of the last stowed craft, rather than invalidating
the whole system on every repair step. None of these runtime indexes is saved.

`navigation-repair-foundation.test.cjs` covers moving armor, bay recovery, owned
IDs/condition/recharge/cargo through reload, repair accounting and a 5,000-record
polling fixture. The browser repair suite records actual flight-loop drift and
spin with visible Dots and welding contacts in ignored `test-results/`.

## Adding a repairable hull or a station

Put attachment data in the hull's ordinary shared definition registration. For
example, a six-slot utility hull can include this data alongside its original
artwork, dimensions, equipment and movement fields:

```js
slots: {repairDrone: 6},
repair: {
  bay: {x: 0.5, y: -1},
  work: [
    {x: -1, y: 0}, {x: 1, y: 0},
    {x: -0.7, y: -0.7}, {x: 0.7, y: -0.7},
    {x: -0.7, y: 0.7}, {x: 0.7, y: 0.7}
  ],
  standOff: 2
}
```

These are nonzero directions, not pixel coordinates. The shared owner projects
each direction onto the aligned physical hull. Check the bay against intact and
damaged artwork so that launches emerge from visible hardware. Keep one distinct
work direction for each simultaneously deployed craft: slots reuse work points
modulo the array length, and several physical Dots cannot occupy one site.
`standOff` is validated between zero and twenty world units. It does not increase
repair range, repair rate, engine speed or material efficiency. Use the equipment
owner's hull change/reconciliation operations to alter capacity; do not replace
owned drone instances or reset their condition and recharge deadlines.

A station extension should use the same definition, target and rendering owners.
Retain its original artwork proportions and aligned damage frames; define actual
physical dimensions and mass separately from camera scale. Register a stable
category adapter through `nativeShipSystems.register`, with saved identities,
`collect`/`resolve` and common damage consequences. Feed committed pose, shield,
equipment and membership changes to the existing refresh/invalidation APIs.
Query shared spatial bounds and paint through `nativeShipEffects.paintShip` with
the real viewport. Do not add a second collision list, private damage model,
per-frame station census or render-driven repair loop. Very large bounds use the
existing conservative overflow path; they must remain physical blockers even
when their center is far outside the viewport.

This is an extension recipe, not a completed station gameplay owner. The current
repair owner resolves saved player, civilian and tug references only. Custom
categories are excluded from its observation sets; a disabled custom station
cannot silently become a repair mission. Shared target registration alone also
does not install station traffic, docking, jobs or transaction policy. Those
systems need an explicit owner integration and save migration where saved data
changes. Medical approach currently uses center-distance launch/mission limits
of 500/1,000 world units. A future station whose hull clearance exceeds those
limits needs attachment-aware approach eligibility in the shared repair owner
before external rescue can work. Enlarging ranges or hiding collisions in a
benchmark is not a substitute.

For a station integration, verify edge-of-screen rendering, large rotating
shields, first-blocker weapon interception, ship/debris contact chains, berth
queues, physical drone return and midway reload with funded jobs. Record actual
nearby actors, shots, transactions and simulation debt alongside frame timings.
The existing 50,000-by-50,000 synthetic station regression verifies conservative
geometry/index behavior; it does not establish full station gameplay or a
rendering performance target.
