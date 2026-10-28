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
resource. Fitted weapons keep the existing model recharge times.

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
removes shielding; removing engineering retains basic propulsion at the original
Saber flight speed (20 rating / 90 world units per second), including thrust,
steering, braking and shipyard departure. Reinstallation
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
No equipment/save version migration is needed: existing Standard instances read
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
