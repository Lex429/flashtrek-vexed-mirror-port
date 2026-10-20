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
Select an item and its compatible destination, or drag it. Stow selected moves
it to owned storage. At a port, Basic Dots and standard systems can be purchased
into the locker and fitted. No free item appears merely because a slot exists.
A shieldless hull starts with an empty shield bay. Removing the shield system
removes shielding; removing engineering removes powered thrust. Reinstallation
does not refill shield charge. A hull's existing mineral upgrades remain saved;
an installed engine retains its owned Tug engine upgrade when moved or stored.

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
