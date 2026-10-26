# Mars Orbital Shipyard

Open the active game at `http://127.0.0.1:7790/html-games/broken-mirror-port/index.html`.
The shipyard is 520 units east and 120 units north of Mars. Click its frame and
choose **Request docking** within 1,400 units. The ship physically reaches its
service berth before the outfitting menu opens. **Undock** reverses that approach.
E reopens services while berthed. Escape closes the menu without releasing clamps.

The menu has Ship Upgrades, Weapons, Shields, Materials and Current Build pages.
Purchases go into the equipment locker; choose a compatible bay in Current Build
to fit them. Replaced equipment, identities and weapon cooldowns remain owned.

The ship schematic uses the same component and preview as Inventory. Every mineral
has a consistent icon in costs, Materials and Inventory. Upgrade cards show the
current and next values, level cap and refit cost. Choose **Preview** to inspect
the change before purchasing. For a new weapon, Dot or ability bay, select a
highlighted mount on the schematic and then **Buy & place bay**. Cancelling is
free. The chosen typed bay position is saved in `shipEquipment.bayLayout`, separate
from the item fitted there. Both screens use the same positions and a six-column
Dot grid. A hull trade resets the positions without deleting owned equipment.

Light hulls have 8 shared refit points and 7 weapon power; cruisers have 12 and 11;
capital/large cargo hulls have 16 and 16. Classification uses the original hull
and cargo ratings, so buying armour cannot increase the allowance. Each engine
tuning level adds one weapon power. These allowances apply to every owner.

| Refit | Points per level | Maximum added levels |
| --- | ---: | ---: |
| Cargo (+20% original cargo) | 1 | 3 |
| Hull (+15%) | 2 | 3 |
| Shield grid (+15%) | 2 | 3 |
| Weapon hardpoint | 3 | 2 |
| Dot bay | 2 | 2 |
| Impulse engines (+8%) | 2 | 2 |
| Auxiliary ability bay | 2 | 1 |
| Warp drive (+12%) | 2 | 2 |

Existing mineral technology uses two points per level. Over-budget legacy ships
keep their investment, with their allowance raised only enough to preserve it.
Further mineral upgrades at ordinary ports respect the same budget. Refits belong
to the current hull; trading that hull replaces them. Removing a refit returns no
money or materials. Cargo cannot be downsized below the loaded amount. Removed
bay equipment returns to the locker; deployed Dots must first be recovered.

The nine Federation weapons use the shared firing, recharge, collision and
existing effect artwork. Their damage, range, reload, power and material costs
are shown before buying. Heavy batteries compete for the hull's weapon power.

Standard deflectors cost zero refit points. Regenerative deflectors use two,
high-capacity deflectors three and adaptive deflectors four. Recharge and damage
adaptation use simulation time and stop while paused. Repeated beam, cannon or
torpedo damage can trigger adaptive resistance; unshielded hull damage cannot.

All purchases consume latinum and their named mineable minerals, including
strategic dilithium for major systems. The saved shipyard ledger records this
material/currency sink once. Failed verified saves roll back the purchase.

Docking plans reuse the 78 showcase profiles. Live oversized hulls approach an
outside collar facing the station. Other hulls enter beneath its foreground
frame. Ship lamps dim on entry, turn off under clamps and return on departure;
station work lights use one cached glow surface and respect the game's lighting
setting. The header's Lights button toggles that existing flight lighting setting.
No station pixel processing happens in the steady paint path.

Validation: `node --test tests/shipyard-refits.test.cjs`,
`python tests/browser-shipyard.py`, plus the existing unified equipment, mining,
market, navigation and berth suites. Browser evidence is written under the
ignored `test-results/mars-outfitting/` directory. This does not certify a
200-station full-game 120 FPS result.

The existing `player-combat.test.cjs` contact assertion at line 75 also fails
without the new refit damage hook: its expected point omits the contact's existing
`normal` property. This unrelated baseline assertion has been left unchanged.
