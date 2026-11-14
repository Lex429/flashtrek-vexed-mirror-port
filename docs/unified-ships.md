# Ship hardware, fitting and crew policies

`ship-definitions.js` extends the existing definition API. A hull has one set of
statistics, dimensions, physical geometry, slot capacities and capabilities.
`forEntity` applies the same saved upgrades and installed systems for every
controller. Manual commands, navigation commands and combat decisions use that
effective movement profile. Local player autopilot no longer grants a separate
350–1,500-unit speed bonus. Existing committed NPC route segments finish from
their saved poses/deadlines; subsequent segments use the shared hull profile.

The sizing/lighting package was already installed as `286f87e`, equivalent to
the supplied `0a8eb9b` update on `0cf056b`. It was not applied again. Olympic
dimensions remain 201/512 by 75 world units; the established fleet reference
sizes, aligned damage artwork, shared lighting and charge/recharge combat remain.

## Saved equipment and fitting

Disabled-ship looting uses `nativeShipEquipment.transfer` to move an existing
instance into another holder's locker. Damage, upgrades and recharge deadlines
survive; only a colliding local ID is renamed. Both fitting projections and shared
descriptors update in the same clock. A failed verified save reverses the transfer.
See `ship-looting.md` for live cargo transfers and DOT eligibility.

New Saber and Danube Runabout commissions include their Type X Phaser and one
Photon Torpedo in the first two weapon bays. Runabout-derived Class 9 and Delta
Flyer defaults inherit that same fitting. `federation-ships.js` registers the
shared starting data for players, NPCs and startup/travel workers. The default
Runabout seed reads `startingEquipment`. Existing saved fittings, unequipped bays
and equipment transferred during a hull purchase are preserved without reissue.

The finished Federation collection contains 45 animated entries. Forty-three normal
classes are offered through the existing Mars planet shop, alongside its previous
stock. The two Constitution variants retain their original Dev-only
availability. Other ports, prices and standing requirements retain their rules.
`federation-ships.js` supplies the common finished list to both shop presentation
and the existing verified purchase controller. The eleven intact-only Tug II
variants remain excluded.

The previously missing Armored Freight Tug II-A uses stable ID 416. Its original
four transparent damage plates and measured lamp pixels run through the shared
Earth animation, lighting, damage and physical debris owners. Its 150 hull,
200 shields, 2,000 t cargo and 21,000 latinum price distinguish its armored hull
from the existing Tug II. Flight height matches that tug; preview canvases retain
their independent display scale. `tools/build-federation-profile.py` measures
the existing fixtures without rewriting any image.

The thirteen installed-showcase hulls (433–445) retain their 52 original transparent
PNG frames and measured masked-lamp/breach profiles in `new-ship-profiles.js`.
`showcase-assets/new-ship-art/federation-import.json` records their original hashes.
The active showcase and game share this same artwork and Earth renderer, including
green navigation lamps. Class 9 and Delta Flyer use the Runabout's small-craft
balance/flight height; Intrepid, Defiant, Galaxy and Excelsior artwork uses its
existing class balance and flight height. NX uses Miranda and Sagan uses Sovereign
as the initial balance reference. Preview size never determines flight size.
All thirteen are normal shop/NPC entries; the two existing Constitution variants
remain Dev-only. The complete collection is 45 animated out of 56 entries; the
eleven unfinished Tug II variants remain excluded from gameplay.

`federation-fleet.js` now places all 42 finished non-medical normal Federation
classes in Earth-owned NPC traffic. Large hulls are less common; named Dev-only
Constitutions and unfinished variants stay excluded. Olympic medical coverage
remains 100 of the same 1,200 crews. Patrol hulls receive saved interstellar
repositioning duties through `npc-lives.js`; support hulls retain freight work.
No extra fleet or physics loop is created.

Existing saves queue missing classes for free Earth crews. Roster version 2
extends the saved queue and retains all prior commissioning/equipment accounting.
Surplus crews already in Federation hulls may refit after completing work, while
retaining at least the existing per-class quota. Paid deliveries,
cargo, claims, identities and deadlines finish normally before the crew can
report to a real berth. Shared hull fitting commissions the replacement there,
retaining owned equipment, credits, pose and hull/shield fractions. Faction-issued
hulls and standard gear are recorded once in `life.federationFleet`; Continue
cannot reissue them. The ship moves to parking through the ordinary motion owner
before taking its new duty. Dedicated resident miners and medical crews retain
their jobs. Bootstrap and travel workers load the same duty data. Run the
Federation ship/NPC Node and browser regressions, plus the common equipment,
economy and physical-debris checks.

The Dev ship selector includes Kirk's I.S.S. Enterprise NCC-1701 (426) and the
unmarked Constitution Class (427). `constitution-ships.js` registers their shared
flight definitions: 200 hull, 200 shields, 150 t cargo, three weapon bays, two Dot
bays and the normal ability, engine and shield slots. Their starting weapon data
uses a Type X Phaser and Photon Torpedo. Equipping either hull transfers existing
owned equipment through the ordinary hull-change boundary; empty bays stay empty.
Both reuse their four showcase damage frames, lighting, fragments and wreckage.
Flight prepares 384-by-576 copies with proportionally scaled light and breakup
anchors so all four stages stay within the existing shared effects cache; the
1024-by-1536 showcase masters remain unchanged.
They are available in Dev tools; no normal shipyard stock or NPC population is
added. Dev saves retain their stable IDs and fitting through Continue.

`weapon-loadout.js` owns `nativeShipEquipment` and the existing
`nativeWeaponLoadout` compatibility API. There is no second ownership registry.
`shipEquipment.version:2` contains stable instances, a common locker and five
typed banks: `weapon`, `repairDrone`, `ability`, `engineering`, and `shield`.
Engineering and shield capacity each default to exactly one. Native weapon
capacity retains the previous three mounts; definitions can configure other
counts. Repair bays retain the established one/two-slot cargo-class distinction;
the Olympic has six for both player and NPC control. Ability capacity retains
the two bays previously shown by Inventory, now backed by real saved fitting.

Slot capacity and `startingEquipment` are separate. `npcStartingEquipment` explicitly
adds the crew loadout (currently a mining laser for permitted mining policies). Creating a ship installs
only its declared starting equipment. Buying another hull transfers the player's
owned items, moves overflow to the existing locker and creates no replacement
drones or weapons. Empty bays remain empty. Hull purchase checks carried cargo
and deployed drones before charging money or construction materials.

Instances retain IDs, upgrades, drone hull/mission state and absolute `readyAt`
deadlines. Grant, purchase, move, swap, refit and load reconciliation use the
same typed boundary. An invalid slot grant creates no item. Legacy over-capacity
items and unreferenced owned instances move to storage, with no duplication.
Unknown legacy models remain owned in storage and cannot be fitted as another
type. The numeric weapon arrays, `weaponLoadout.version:1` and `repairBay` are
compatibility projections. Tests constructing a legacy fixture must clear
`shipEquipment` as well as its old projection before supplying legacy arrays.

Mining lasers are saved ability equipment at their existing 120-credit price;
legacy installed tools migrate once. Both player and NPC mining check for the
fitted tool. The explicit legacy ability model IDs are 20, 22, 23, 24 and 25. Model 21 belongs to
engineering. Zero weapon damage alone does not classify equipment. This change
provides saved ability ownership and independent fitting; it does not invent new
activation effects for the original utility catalog. There is no reactor/energy
resource. Grade I weapons keep the existing model recharge times. Per-copy
weapon grades use `instance.weaponGrade = {version:1,level:0|1|2}` for I, V and X.
Older instances without that field read as I without losing their current stats.
`weapon-catalog.js` owns the family names and recharge factors (1, .75, .5).
`nativeShipEquipment.forInstance` supplies one cached effective model to firing,
HUD, Inventory, shipyard, looting and separated-section loadouts. Damage, range,
power, model IDs and visuals remain model-owned. Only subsequent cooldowns use
the improved recharge; purchasing a grade retains the current `readyAt` deadline.

`shipyard-refits.weaponQuote` and `upgradeWeapon` quote, charge and verify the
save for one owned copy through the existing atomic transaction. V costs half
the base purchase price and half its materials (rounded up); X costs the full base amounts.
Legacy models without material prices use the shared quote's tritanium/dilithium
requirements. Grades follow the same instance through fitting, storage, hull
changes, transfers and JSON reload. The shop sells I; each shipyard's Upgrades
page lists only equipped/stored copies owned by the player.

Inventory shows every bay, installed item or Empty label, and cargo use/capacity.
Drag an installed item into any inventory tile to unequip it, or drag stored
equipment into a compatible bay to equip it. DOT bays show the original DOT
artwork; mining lasers occupy removable ability bays. Selecting an occupied tile
or bay inspects it without swapping. The detail panel compares real fitted stats
and offers a destination bay, Equip/Replace, Unequip and Cancel. Dragging and
keyboard placement into empty tiles use the same shared move operation. The
port Shop's Equipment tab sells Basic Dots, mining lasers,
engines and shield systems into inventory for manual fitting.

The preview uses definition-owned hull dimensions and reserves a separate row
for the ship name/class. Fractional quantities remain visible, category filters
show only matching items without reordering saved positions, and extra empty
pages require the explicit `+ Space` control. Unequipping reveals the destination
page. Successful fitting plays the original computer MP3 clips and a short item
transfer/slot animation; mute and reduced-motion settings apply. These effects
never change inventory ownership or save results.

Inventory panes do not scroll. The grid measures the available width and height
and shows fewer items per page to retain readable icons. Extra equipment bays
and delivery contracts use page buttons; saved bay/item positions do not change.
Short or narrow windows show selected-item details in a fitted overlay instead
of squeezing the loadout. Mouse-wheel input cannot scroll the inventory or the
game behind it. The restock button remains removed.

Standard, Upgraded and Advanced shields supply 100%, 110% and 120% base capacity
at 500, 2,500 and 5,000 latinum. Fitting does not refill charge; downgrading clamps
charge to the new capacity. Existing Federation shield tradeoffs remain intact.
Shared effective definitions apply these tiers for every controller.

Dev inventory kit version 2 supplies one stored copy of every catalog model,
including Federation weapons/deflectors, all three engines, shield tiers, Dots
and utility equipment, plus samples of every ore and freight good. Existing Dev
saves receive the kit once without repeatedly duplicating stock. The inventory
does not show a restock button. Dev samples do not prevent trying smaller
hulls; normal cargo limits and deployed-drone restrictions remain enforced.
The six transparent ore images and their built-in image_gen prompts are recorded
in `html-games/broken-mirror-port/assets/inventory-ores/manifest.json`.

`nativeShipEquipment.moveInventory` owns grid swaps and fitting through the same
typed equipment boundary. Saved `inventoryLayout.version:1` cells reference owned
equipment IDs, resource stacks, mineral stacks, freight goods and contract IDs.
Gaps and exact positions survive reload. Reconciliation clears consumed items
and places new purchases in available cells without reordering existing items.
Same-type fitting swaps preserve both identities; unequipping onto other cargo
keeps that cargo in an available tile. Quantities, contracts, upgrades and charge
remain with their authoritative owners. Moves save immediately, and failed
writes are reported by the inventory. No free item appears because a bay exists.
A shieldless hull starts with an empty shield bay. Removing the shield system
removes shielding; removing engineering leaves the hull's permanent thrusters
available for slow thrust, steering, braking and shipyard departure. Reinstallation
does not refill shield charge. A hull's existing mineral upgrades remain saved;
an installed engine retains its owned Tug engine upgrade when moved or stored.

Every hull starts with `standard-engine`: the original Intrepid rating of 95
(427.5 world units per second). `upgraded-engine` costs 2,500 L and adds 10%
(104.5 rating / 470.25 units per second); `advanced-engine` costs 5,000 L and adds
20% (114 rating / 513 units per second). A replacement Standard costs 500 L.
The engine model determines actual speed for every controller through the shared
effective definition. Class turning, hull, shields, cargo and fuel efficiency
retain their existing values. Existing hull mineral/refit tuning multiplies the
fitted engine's rating; owned Tug Mk tuning adds its existing 15 points per level.
Those bonuses do not boost an empty engineering bay. Local cruise keeps its
original Intrepid/Saber benchmarks and scales beyond its former cap for upgraded
engines. Saved equipment IDs, tuning and empty bays survive reload unchanged.
No equipment version migration is needed: existing Standard instances read
the updated model and definitions; new engines use the same version-2 schema.

All three models use original generated PNG artwork in the equipment slot,
inventory tiles and port Equipment shop. See `docs/engine-artwork.md` for assets
and prompts. `tests/engine-equipment.test.cjs` checks all hulls, actual shared
movement, tuning, ownership and reload; `tests/browser-engine-equipment.py`
checks real purchases, I-key opening, mouse dragging, artwork, WASD flight,
empty-bay reload and mobile fitting without inventory overflow.

Engine-change verification (October 24, 2026): all 329 Node checks ran; 328
passed. The remaining pre-existing `player-combat.test.cjs` contact assertion
expects only x/y while the actual contact also includes its normal. Engine,
equipment, inventory layout, traffic, repair, refit and conservation checks pass.
Real Edge checks passed for engine equipment, unified equipment, inventory drag,
visible drone launch/recovery, ship traffic and the restored Earth jam.

A 172-ship save was measured before/after with the same Edge version and
1280 x 850 viewport, six-second flight/map windows. The HTTP-served baseline
reverses only this task's propulsion and recovery changes; other working-tree
code and artwork are identical. Mean simulation time was 1.19 -> 1.59 ms in
flight and 1.32 -> 1.57 ms on the Dev map. Frame interval p95 was 6.2 -> 12.2 ms
in flight and 6.2 -> 6.4 ms on the map. These short measurements show additional
cost, not a performance improvement. Raw timings, source hashes, save hash and
screenshots are in ignored `test-results/engine-equipment/performance/`.

Cargo accounting includes freight, sealed contracts, raw minerals and repair
deuranium for both player and NPC storage adapters. Dev mode?s existing
unlimited strategic-resource placeholders are excluded from physical cargo;
actual freight is still counted. Fuel/food and refined
dilithium retain their existing strategic-resource units. Old overloaded saves
are retained without loss; Inventory shows the excess and purchases/loading
cannot add cargo beyond capacity. Sell, consume or deliver it before buying a
smaller hull. Company loading and restocking also reserve room for repair material.

Shield units remain owned and fitted when their protection reaches zero.
Inventory's **Repair shields** action restores the fitted capacity for one
dilithium per ten missing shield points, rounded up. Port Repairs offers the
same shield-only service for one latinum per two missing points, rounded up.
Dev service is free. The shared repair owner records these sinks and verifies
the save before keeping the repair; a failed save rolls back protection,
payment and ledger. Hull condition, equipment identities and existing automatic
deflector recharge remain independent of shield maintenance.

Projectile launch velocity includes the shooter's authoritative velocity.
Leading and torpedo guidance use that same launch frame; the inherited vector
is saved with the shot. A later turn by the launcher cannot steer an unguided
shot or remove a torpedo's inherited drift. Firing eligibility still rejects
targets outside the fitted weapon's actual range. Older saved shots without those
fields retain zero inherited velocity. Player and NPC firing share these rules.

## Crew decisions

The definition's `npcPolicy` selects `cargo`, `civilian`, or `medical` and its
permitted activities. The existing `npc-lives.js` task, stock/funds reservation,
economic exchange, journey, mining and docking owners execute the work. Sol's
company delivery policy remains in `sol-economy.js`.

* Cargo crews choose funded deliveries and travel; regional placement cannot
  silently turn them into miners. Constitution and Constellation tugs use this
  policy. The historical Oberth retains its general civilian/mining role.
* General civilians choose their configured trade, mining and travel activities.
* Medical crews use definition-owned medical capability and supply settings.
  They buy finite supplies or physically mine, collect and refine deuranium,
  claim distress calls, repair through the common drone owner and resume work.
  Low-water/target amounts, purchase/mining permission and activities are data.

Current repair material is deuranium (good 7), using its existing refinery and
five-hull-per-ton rule. A genuinely different repair material recipe would need
that recipe implemented rather than relabeling another ore. The three existing
Olympic crew templates remain the existing fleet's one-time migration; medical
eligibility and jobs no longer compare a ship ID with 58. Buying a medical hull
does not install an NPC controller on the player's ship.

Combat policy is also definition data under `npcPolicy.combat`: caution,
aggression, retreat hull/shield fractions, cargo protection, medical survival
priority and preferred distance factor. Registering another hull with an existing
policy inherits these decisions. Installed weapons and the ordinary shared hull
profile govern range and movement; crews receive no hidden statistical bonuses.
Saved `crewTraits.version:1` provides stable individual caution/aggression.
See the [combat suspension contract](npc-life-contract.md#combat-detours-and-crew-survival)
for retained jobs, physical escape and repair/resumption.

Ordinary ships disable at 25% hull, retain cargo and collision momentum, turn
off powered operation/lights, and wait for shared repairs and drone recovery.
Zero hull is destruction. Any exception is definition capability data. A service
craft may route around its assigned hull to a physically clear recovery point;
it cannot bypass physical collisions or docking clearance.

## Adding another hull

Supply four aligned raster frames and an artwork/effect profile using the
existing profile format. Then register the ship at startup through the existing API, for
example (numbers here are an example request, not new native balance values):

```js
nativeShipDefinitions.register(101, {
  name: 'Hospital transport', price: 20000, massClass: 2,
  hull: 200, shields: 150, cargo: 450,
  speedOrOtherStationValue: 45, turn: 10,
  artworkProfile: hospitalArtworkProfile,
  artwork: {frames: ['hospital-0.png', 'hospital-1.png',
                    'hospital-2.png', 'hospital-3.png']},
  dimensions: {width: 30, height: 75},
  slots: {weapon: 4, repairDrone: 6, ability: 2},
  startingEquipment: {weapon: [1], repairDrone: ['basic-dot'], ability: []},
  npcPolicy: {
    name: 'medical', activities: ['trade', 'travel'],
    supplies: {low: 60, target: 200, buy: true, mine: true}
  }
});
```

Engineering and shield capacities default to one. A hull with a nonzero native
shield specification declares a standard starting shield system by default;
set `startingEquipment.shield: []` for an initially unequipped hull. This example
starts with one owned drone and five empty drone bays. Add the hull ID to a port's
offer data if it should be purchasable, or create an entity in the existing NPC
collection using the definition's starting loadout. Do not add a fleet/frame
loop, hull-specific job branch, firing implementation or movement integrator.

Registration validates names, artwork/dimensions, capacities, starting equipment
and known policies; full-fleet validation runs in the real browser. Reduced Node
physics fixtures may omit artwork metadata, but still validate capacities and
equipment. Four-frame presentation comparisons cover every native ship.

Startup and travel workers receive dimension-only artwork profiles. Ship
registration must fill missing frame paths and emitter metadata from the shared
typed artwork data, while retaining complete foreground profiles. Prometheus
and its three sections follow this rule without importing drawing modules into
the worker. A truthy profile alone does not guarantee four damage frames exist.
`prometheus.test.cjs` covers worker/foreground parity; `browser-warp-departure.py`
requires a successful startup worker and a complete arrival with the full fleet.

## Save slots and verification

`save-storage.js` stores normal and Dev saves under separate keys ending
`-normal` and `-dev`. Continue and Continue Dev select them explicitly. The old
shared key migrates according to its recorded `devMode`; it remains untouched as
a recovery copy. Reads still return that usable copy if migration cannot write.
Quota errors, denied storage access and writes that do not persist return failure.
The pause UI reports Save failed, and a failed transit commit restores its prior
live state instead of reporting successful saving.

Run the full existing Node/browser workflow plus `unified-equipment.test.cjs`
and `browser-unified-equipment.py`. The latter purchases actual hulls through
the UI, buys/fits six Dots, launches all six, fits an independent ability, reloads
the normal slot, tests the real failure message and captures the three Inventory
screenshots in ignored `test-results/unified-equipment/`.
Generated screenshots, timings, profiles and logs are not committed.

Performance uses the same initial save, fleet, browser and 1280×850 viewport.
Compare `browser-npc-performance.py` and `browser-stability.py --measure`
before/after with that saved fixture. CPU costs and delivered-frame spikes are
reported separately; correctness checks alone do not establish smoothness.


## Permanent hull thrusters

Every ship has built-in thrusters, separate from the five equipment banks. They
cannot be removed, stored, sold or transferred with an engine. The hull definition
owns emergency speed, acceleration, braking and turning; default emergency speed
depends on physical mass (27 to 97.5 world units per second). A shared 50% boost
applies to speed, acceleration and braking after hull-specific baseline values
and overrides, before upgrades. Existing saves receive the same boost with their
installed level retained; turning and normal main-engine speed stay unchanged.
Custom definitions can supply `thrusters` values. Player and NPC controllers use
the same effective definition and shared motion integration.

`ship-definitions.js` exposes `nativeShipThrusters` for migration, profiles and
quotes. Each holder saves `shipThrusters: {version:1, hullType, generation, level}`.
Equipment reconciliation supplies level zero to legacy ships without altering
equipment, hull condition, cargo or money. Levels belong to the individual hull;
equipment swaps retain them, while explicit hull replacement (including the same
class) and a new NPC life generation reset them. Effective-stat cache signatures
include the level. No thruster equipment model, locker item or extra bay exists.

Three upgrades take Mk 1 to Mk 4. Each level adds 20% of the base emergency speed,
thrust and braking, and 10% of base turning and powered handling. A healthy main
engine's top speed stays unchanged. Upgrade prices are 1,000 / 3,000 / 6,000
latinum, multiplied by two for hull mass at least 8, or three for mass at least
32. Thrusters use no equipment slot or ore. Buy them in the port
Shop's Services tab or a docked shipyard's Ship Upgrades tab. Inventory's ship
panel has a fixed Thrusters tile beside the equipment bays, displaying the
installed Mk and emergency speed across bay pages and other item selections.
Selecting it opens read-only acceleration, braking, turning and upgrade-location
details, including the existing compact-screen overlay. The tile has no equipment
identity, drag target or fitting/removal controls. The shipyard schematic also
displays the installed Mk and emergency speed.

`shipyard-refits.js` owns purchases through its existing atomic verified-save
transaction, including the latinum ledger. The native port bridge validates
proximity before requesting a port purchase; ordinary shipyard purchases require
actual docking. Insufficient funds, maximum level and failed saves preserve the
prior credits and hull upgrade. Saving and Continue retain the installed level.

An offline or absent main engine hands control to these weaker thrusters. Current
momentum slows smoothly to the emergency limit; thrust, reverse, braking and
steering remain available. Explicit cruise and approach profiles retain their
approach limits and cannot bypass the emergency capabilities. A surviving player
keeps manual thrust, reverse, braking and steering even in the critical-hull
`disabled` phase. A repaired engine supplies its ordinary movement limits;
an offline engine uses the hull's thrusters. This does not clear hull damage or
the critical phase, which still suspends autopilot, warp and weapon operation.
Destroyed hulls and disabled NPC propulsion remain unavailable.

`thrusters.test.cjs` covers every hull, independent ownership, legacy migration,
replacement, failed-save rollback, upgrades, reload and shared player/NPC motion.
`browser-thrusters.py` exercises real port and docking-station purchases,
Inventory display, engine removal, Continue, maximum level and rejected writes.
November 7, 2026 verification: 91 relevant Node checks passed, together with the
thruster, engine-failure, unified-equipment and device-maintenance browser checks.
These are functional checks, not 120 FPS qualification.

## Device condition and ore repairs

Engine and shield equipment instances store `condition` from 0 to 100. Legacy
instances migrate to 100 without changing hull health, shield energy, IDs or
upgrades. Condition follows the item through fitting, storage and save/reload.
Normal movement never wears equipment.

`ship-damage.js` wears the fitted shield by absorbed damage / fully rated shield
capacity, and the engine by hull damage / maximum hull, each times 100 condition
points. `ship-definitions.js` includes condition in its effective-stat cache and
scales shield capacity and engine speed/thrust proportionally. Zero condition
retains the item but takes it offline; permanent hull thrusters provide weaker
control while the shared movement owner preserves momentum through the handoff.
Hull disablement remains a separate state.

While a fitted engine is partially damaged, the shared motion integrator brings
existing excess speed down at the available engine/thruster braking rate instead
of clipping velocity to the new speed limit in one step. This also applies to
reverse flight and cruise/approach commands. The lower rated speed and thrust
take effect immediately; current momentum settles over subsequent physical
steps. At zero condition, built-in thrusters support slow thrust, steering and
braking. Ore repairs restore main-engine power without resetting velocity, and
Continue resumes the same slowdown
from saved velocity/condition with no extra transient save fields.
`engine-failure-motion.test.cjs` covers real damage, all flight commands, NPCs,
complete failure, repairs and midway reload alongside the existing motion and
device-condition checks. `browser-engine-failure.py` verifies the same transition
with actual flight keys, reserve controls at zero condition, and a paid Inventory
repair that retains velocity and the same saved equipment instance.

Repairing an engine does not clear combat hull damage, but manual player flight
works immediately at the repaired engine's actual limits, including at 10% hull
with no active DOT mission. Inventory's repair result states that manual control
remains available. The normal Repair button explicitly
requests hull recovery through `ship-repairs.recoverPlayer`, launching the owned
DOTs even in Manual mode or queuing one existing medical distress call when
repair material or operational DOTs are unavailable. Repeated requests retain
the current mission/call. Full hull repair and recovered drones clear the critical
phase without resetting the player's velocity; an already repaired stale
disabled state can also recover.
This action does not change the saved Manual/Auto preference or repair devices
as a side effect. The engine-failure browser check verifies actual turning and
thrust before hull repair, after Continue, and after full recovery. Critical
damage cancels autopilot without erasing the player's held manual input or
converting commanded momentum into collision drift.

Distress Call is available beside the flight Repair button and in Inventory's
repair controls when the damaged hull needs more deuranium than is aboard, or
no operational DOT is fitted. This includes partial shortages and damaged ships
that remain flyable. `playerDistressStatus` reads eligibility; the verified
`requestPlayerDistress` action saves one `playerRequested:true` call through the
existing medical queue, rolling back a failed save. Queued, responding and
on-scene calls disable repeat requests and survive Continue. Existing medical
crews travel and repair with their owned DOTs and finite material; the request
does not spawn crews, grant supplies or change Manual/Auto preference. The shared
repair owner permits these explicit player assistance targets without changing
automatic NPC distress eligibility. Footer status refresh is bounded to four
reads per second, with immediate updates after actions. Browser coverage includes
both buttons, a real six-DOT medical response, saved calls and mobile layout in
`browser-distress-call.py`.

Select an engine or shield card in Inventory to see its condition and repair
quote. `ship-repairs.js` consumes actual Gallicite ore for engines and Trellium
ore for shields, including port shield service. Each ton restores up to ten
condition points; fitted shield repairs also restore energy, charging the larger
of condition / 10 and missing energy / 10, rounded up. Stored shield repairs
restore only that item. Hull repairs and automatic shield energy regeneration
do not repair device condition. A failed verified save restores condition, ore,
energy and accounting. Dev toolbar Repair restores hull, shield energy and
fitted engine/shield condition for free, retaining stored device condition.

Checks: `shield-maintenance.test.cjs` and `browser-shield-maintenance.py`, plus
the unified equipment and Inventory layout regressions. Browser evidence stays
in ignored `test-results/shield-maintenance/`.

Prometheus Inventory offers Combined ship, Alpha, Beta and Gamma views. Browsing
a view changes only the inspected hull; Pilot transfers command to a living
separated section at its existing pose, velocity, hull and shield energy. The
previous pilot becomes an ordinary MVAM escort. Lost sections remain inspectable
but cannot be piloted until reconstructed.

`prometheus-loadouts.js` saves version-1 `prometheusLoadouts` plans and separate
tile arrangements. Plans contain references to canonical `shipEquipment.instances`,
never copies. Combined and one section may reference the same weapon because
those modes are exclusive; equipping that weapon on another section moves its
reference. The shared combat owner consumes its one existing recharge state.
Each section keeps its firing cursor, and rejoining restores the combined
configuration and cursor. Cargo, money, supplies, engineering, shield fittings
and command DOT ownership remain shared; fit shared systems from Combined ship.
Opening an older save assigns already-owned weapons to the section plans without
granting equipment. The UI labels weapons assigned to another section.

Checks: `prometheus-loadouts.test.cjs`, `prometheus-reconstruction.test.cjs` and
`browser-prometheus-inventory.py`, alongside the existing Prometheus, survival
and unified-equipment checks. Browser evidence is in ignored
`test-results/prometheus-inventory/`.


Prometheus combat intent lives in `prometheus-tactics.js`. The pilot's current
ship lock selects one shared target; clearing it returns the escorts to formation.
Section-specific fitted weapon ranges set their distances, opposing flanks spread
the attack, and moving target prediction and bounded strafing keep those lanes
active. Damaged sections withdraw while healthy sections maintain pressure.
Shared movement, collision, firing arcs, recharge and damage remain authoritative.
Blue MVAM exhaust is painted only while separating or recalling.

Release reanchoring preserves the ongoing separation when command changes. Recall
uses separate close approach lanes, including when Alpha or Gamma pilots both
other sections. Closing speed reserves acceleration for the moving, rotating dock;
shared vector avoidance releases obsolete detours and follows rotating obstacles.
Each section latches independently; remaining sections route around both the pilot
and already captured sections. Version-1 recalls migrate to the saved per-section
capture stages without changing hull, inventory or pose.
Tests include early recall, repeated requests, release-time command changes,
normal/cruise turns for every pilot, parked hulls, missing sections and reloads.
`prometheus-tactics.test.cjs` and `browser-prometheus-tactics.py` cover focus fire,
retargeting, flanks, damaged-section recovery and exhaust gating. Evidence is in
ignored `test-results/prometheus-tactics/`.
