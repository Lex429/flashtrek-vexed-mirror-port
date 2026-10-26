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
