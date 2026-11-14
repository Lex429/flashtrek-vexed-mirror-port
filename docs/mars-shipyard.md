# Mars Orbital Shipyard

Open the active game at `http://127.0.0.1:7790/html-games/broken-mirror-port/index.html`.
The shipyard is 520 units east and 120 units north of Mars. Click its frame and
choose **Request docking** within 1,400 units. The ship physically reaches its
service berth before the outfitting menu opens. **Undock** reverses that approach.
E reopens services while berthed. Escape closes the menu without releasing clamps.

Mars's initial **Request docking** screen keeps just the station, a short invitation,
berth/range and the main action. Its amber/cyan controls use a sliding hover fill,
light sweep, moving arrow and press compression. The entrance is staggered; slow
rings, station drift and a passing scan light animate the existing station art.
Motion uses CSS transform/opacity layers, stops when the contact screen closes,
and respects reduced motion. It adds no JavaScript frame loop or docking delay.
The panel fits without scrolling; keyboard focus starts on Request docking.
`mars-docking-contact.css` applies only while this Mars contact screen is open.
The existing outfitting pages and other stations keep their own presentation.

Mars opens **Upgrades** as a scrolling shop, matching the Weapons catalog. Each
of its nine ship tiles shows the upgrade name, current-to-next value, installed-tier
boxes, exact NEED/HAVE resource table, and **Buy & install**. Empty boxes are
uninstalled; purchased boxes glow mint green. They use each family's actual cap,
without visible tier wording or a fraction; screen readers retain the count.
Clicking a tile previews its effect on the ship without opening another page.

Only the right catalog scrolls. The ship, Inventory equipment and the Hull,
Shields, Cargo capacity (tonnes) and Speed (maximum normal flight speed) strip
stay visible. The title reserves the strip's natural height, including preview
arrows. Equipment inspection and drag/repair controls retain their shared owner.

Every requirement names its material and shows NEED beside HAVE. Covered stock,
including exact equality, glows mint and says Ready. Missing stock remains dim
and pulses the exact **Need X more** amount; reduced motion makes it steady.
Covered stock of a million or more uses compact notation, such as 1B, with the
exact stock in its title and accessible row description. Required prices and
shortages remain exact. `mars-upgrade-shop.css` owns the responsive list and cost
tables; the previous material-review page and its number-fitting observer are
no longer used.

**Buy & install** settles through the same live quote and verified save owner.
Insufficient resources disable Buy. Purchases update the tile to its next price
and light exactly the newly installed box, retaining the catalog position.
Maximum upgrades keep their space in the list and show **Fully upgraded** with
a disabled Buy button. A quiet Remove action explicitly warns of no refund.

Bay upgrades buy an empty bay at the owner's default position. Optional **Choose
position** highlights mounts on the ship while the same shop remains open;
**Cancel position** spends nothing. The chosen mount is passed to the existing
atomic transaction. Equipment is purchased separately.

`browser-mars-inline-upgrades.py` checks all nine quotes and charges, tier caps,
unchanged card/scroll positions, failed-save rollback, optional placement,
removal and Continue. `browser-mars-material-clarity.py` checks equality, shortage
pulses, exact quantities, large stock and reduced motion. The layout regression
visits every tile across desktop, Classic and phone sizes, verifies contained
text and cost columns, and confirms that the ship stays pinned while browsing.
The common normal-game fixture lives in `tests/mars_shop_support.py`.

There is no shared upgrade-point budget. Every upgrade family can reach its own
tier cap, even when other upgrades, legacy mineral technology or advanced
shields are installed. Prices, resource deductions, individual tier limits,
weapon output limits and atomic save rollback retain their existing owners.

Successful Mars upgrades play a 3.2-second installation sequence: a light sweep
crosses the purchased tile, three energy packets travel into the ship, docking
brackets lock around it, and rings/sparks accompany a hull scan. The new tier box
lights in sequence and the affected stat flips from its old to its new value.
An **UPGRADE INSTALLED** header receipt shows the exact before/after result while
keeping Lights and Close accessible. It uses the existing enabled/disabled
confirmation sound and appears only after verified settlement.

`mars-upgrade-effects.js/css` reads hardware and animates transient UI. It uses a
fixed element count and CSS transform/opacity animations, with no JavaScript
frame loop. Card effects clip to the scrolling catalog; resize and active scroll
events update geometry. Re-renders preserve the sequence's elapsed time. A new
purchase replaces the sequence; closing, changing tabs, hiding the document or
timeout cleans up decorations and old-value labels. Controls remain usable.
Reduced motion keeps a static receipt and the installed box. Its browser test
checks all nine upgrade types, failures, rapid buys, alignment, clipping and cleanup.

The complete equipment layout stays visible on every services tab. It uses the
same slots, empty-bay labels, condition badges, built-in thruster tile and bay
paging as Inventory; there is no visibility toggle. Selecting gear opens the
shared inspector with the same stats, repair quotes and Equip/Unequip controls.
Mars measures every fitted card at the available bank width before choosing its
page size, including wrapped names and condition badges. Card-edge padding and
compact layouts for short viewports or Classic stages keep the full slots visible.
Mouse or touch dragging fits, swaps or stores the same owned instances through
Inventory's existing move bridge. Repairs use its existing repair callback too.
Choosing an extra bay highlights available positions alongside existing gear.
**Buy** installs an empty bay at the shared layout's default position, or at the
highlighted position explicitly chosen by the player. Preview/cancel never spends.
Each upgrade tile offers a quiet Remove control with an explicit no-refund warning.

The other Mars pages are **Weapons**, **Shields**, **Materials** and **Equipment**.
Purchased items go to the locker; fit them to a compatible bay in Equipment.
Animated choices, tabs and purchase controls follow the Mars contact style;
reduced motion disables those transitions. `mars-upgrades.js` and its stylesheet
only supply Mars presentation, reading the shared quotes, stats and costs.
Replaced equipment, identities and weapon cooldowns remain owned.

`equipment-panel.js` supplies the shared inspector, hull tile, paging calculations,
slot selection and mouse drag bindings to Inventory and Mars. Its Mars controller
holds transient selection/page state only. Equipment and inventory positions,
recharge, repair costs and persistence remain in their original owners. The
existing Inventory equipment and Mars purchase browser suites cover the migration;
`browser-shipyard-equipment.py` also compares all five inspectors, verifies live
repairs, drag moves/swaps, invalid fits and saved continuation. It also checks
card contents, clipping ancestors and access to every bay across three hulls,
six viewport/view combinations, long names and offline devices.

The ship schematic uses the same component and preview as Inventory. Every mineral
has a consistent icon in costs, Materials and Inventory. Upgrade cards show the
current and next values, level cap and refit cost. Choose **Preview** to inspect
the change before purchasing at other yards; Mars purchases directly from its scrolling upgrade tiles. Other yards require choosing a highlighted mount before **Buy &
place bay**; Mars also permits the default position. The chosen typed bay position
is saved in `shipEquipment.bayLayout`, separate
from the item fitted there. Both screens use the same positions and a six-column
Dot grid. A hull trade resets the positions without deleting owned equipment.

Weapon output remains hull-dependent: light hulls supply 7 power, cruisers 11,
and capital/large cargo hulls 16. Classification uses original hull/cargo ratings.
Each engine tuning tier adds one weapon power. This is independent of upgrade
purchases; it limits the weapons that can be powered together.

| Refit | Maximum added tiers |
| --- | ---: |
| Cargo (+20% original cargo) | 3 |
| Hull (+15%) | 3 |
| Shield grid (+15%) | 3 |
| Weapon hardpoint | 2 |
| Dot bay | 2 |
| Impulse engines (+8%) | 2 |
| Auxiliary ability bay | 1 |
| Warp drive (+12%) | 2 |

Existing mineral technology keeps its own recipe tier caps and resource costs.
Saved levels and equipment remain intact; removing the shared cap requires no
save migration. Refits belong to the current hull; trading that hull replaces
them. Removal returns no money or materials. Cargo cannot be downsized below its
load. Removed bay equipment returns to the locker; deployed Dots must be recovered.

The Weapons catalog keeps its existing layout and sells the first stage, I, of
each weapon family. Light Phaser Array, Phaser Array and Heavy Phaser Array have
different hit strengths; each family has the same I → V → X recharge path. The
original damage, range, power and effect artwork remain attached to its model.
I uses the original recharge, V uses 75%, and X uses 50%. Heavy batteries still
compete for the hull's existing weapon power.

**Your weapons** follows the ship upgrades, with a direct jump control at the top.
Every equipped or stored weapon copy has its own tile: current name, bay/Inventory
location, next grade, recharge before/after, damage/range/power, three stage boxes,
full NEED/HAVE quote and **Upgrade weapon**. An owned I lights one box; V lights
two; X lights all three and disables the button. Only the selected copy changes.
The same owned section and atomic transaction are available at territorial yards.

Upgrades retain item identity, fitting, Inventory position and the current recharge
deadline. New recharge applies to future shots through the shared firing owner.
The installation receipt names the weapon and reports seconds faster, and its
newly installed box lights in sequence. Fitted gear is highlighted when visible.
Stored weapons stay stored. Empty collections show an explanation instead of
advertising unowned models. `browser-weapon-progression.py` covers actual buying,
independent copies, fitting/Inventory inspection, failed saves, Continue,
responsive long names, reduced motion and the owned-only list. The unit regression
also fires a graded and ungraded copy and checks transfers and legacy saves.

Standard, regenerative, high-capacity and adaptive deflectors fit through the same
shield bay owner without a shared points requirement. Recharge and damage
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
`python tests/browser-shipyard.py`, `python tests/browser-mars-inline-upgrades.py`,
plus the existing unified equipment, mining,
market, navigation and berth suites. Browser evidence is written under the
ignored `test-results/mars-outfitting/` directory. This does not certify a
200-station full-game 120 FPS result.

The existing `player-combat.test.cjs` contact assertion at line 75 also fails
without the new refit damage hook: its expected point omits the contact's existing
`normal` property. This unrelated baseline assertion has been left unchanged.
