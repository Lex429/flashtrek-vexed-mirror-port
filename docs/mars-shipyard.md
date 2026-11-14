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

Mars opens **Upgrades** with nine simple cards: the system name, its current and
next value, and an installed-tier meter. Each available tier has one segment:
empty outlined bars are uninstalled, while installed tiers glow mint green.
Bars use each family's real one-, two- or three-tier cap, with no visible tier
wording or fraction. The installed count remains accessible to screen readers.
The same meter appears in the
requirements header and updates after verified purchases or tier removal.
Selecting one animates a requirements view into
the same right-hand panel. The ship, installed equipment and hull/shield strengths
stay visible beside it, with exact current-to-upgraded stat arrows.

Hull, Shields, Cargo capacity (tonnes) and Speed (maximum normal flight speed)
always appear together in one full-width strip below the ship's name on every
Mars tab. Larger numbers, quiet labels and thin dividers replace the individual
boxes beside the name. The strip belongs to the title's normal grid flow,
reserving its actual height before equipment paging, including wrapped arrows. Cargo and
engine upgrades preview the same current-to-upgraded values as hull and shields.
Values and bars read the shared definitions/quotes and create no owned hardware.

The requirements view shows every material in a fixed grid, without scrolling.
Each tile puts **HAVE / NEED** together with the stock and exact total price.
Covered requirements (including exact equality) glow mint green and say **YOU
HAVE IT**. Uncovered requirements stay dim, with the exact **Need X more** amount
pulsing in opacity. Reduced motion keeps that shortage text steady. A capped
progress strip supplements the numbers, never replacing them.

`mars-materials.css` keeps each material inside a bounded card with an icon/name
header, separate HAVE and NEED amount panels, and an internal status/progress strip.
Cards stop growing at 190px; their actual allocated height selects regular,
compact or tight spacing before numbers are measured. This prevents the header,
amounts and status from overlapping in short rows, even when the catalog itself
is tall. All amounts share one measured font size and equal column positions.
Covered stock of a million or more uses compact notation (1B for a billion);
its full stock remains in the hover title and accessible description. Required
prices and shortages remain exact. A bounded ResizeObserver updates fitting on
layout changes and disconnects on Back, close or tab changes.

An opening light sweep is staggered across the cards; ready borders breathe
gently and only shortages pulse. These use CSS transform/opacity animation,
remain clipped to their own cards, and stop for reduced motion. There is no
JavaScript animation loop or extra saved UI state.

**Buy & install** uses the shared live quote; **Back** returns to the overview
without spending and restores the original position. Insufficient resources
disable Buy. Successful purchases return to the cards and play the installation
sequence. Maximum tiers remain inspectable, with a disabled Buy button; the
quiet **Remove tier** control explicitly warns that it provides no refund.

Opening/back animations use short CSS transforms and opacity; layout renders
retain their elapsed time. On phones, a compact ship panel and two-column
material grid keep the gear, counts and actions visible together. The clarity
browser regression checks overflow, clipping ancestors, long stock numbers,
readiness glow, shortage-only pulses, exact equality and wheel input across
widescreen, Classic and phone layouts.
`browser-mars-material-layout.py` also checks short windows, all one/three/four
resource arrangements, trillion-unit stock, shared baselines, child containment
and overlapping rows/number columns. It also replays the reported cargo example
(one billion Latinum and 25 each of tritanium/deuranium), plus normal and reduced
motion animations, with screenshots of each case.

There is no shared upgrade-point budget. Every upgrade family can reach its own
tier cap, even when other upgrades, legacy mineral technology or advanced
shields are installed. Prices, resource deductions, individual tier limits,
weapon output limits and atomic save rollback retain their existing owners.

Successful Mars upgrades play a 2.9-second installation sequence: an energy surge
from the purchased card, expanding rings and sparks around the ship, a scan sweep,
and an **UPGRADE INSTALLED** header receipt with the actual before/after value and
installed tier. It uses the existing enabled/disabled confirmation sound. The
receipt appears only after verified settlement; failure shows no success effect.
`mars-upgrade-effects.js/css` only read shared hardware and animate transient UI.
The effect has a fixed number of elements, CSS transform/opacity animations and no
JavaScript frame loop. One active sequence survives layout renders; another buy
replaces it. Closing, leaving Upgrades, hiding the document or timeout removes it.
It never intercepts controls or adds saved state. Reduced motion uses a static
receipt/card highlight. `browser-mars-upgrade-effects.py` checks every upgrade
type, failed saves, repeated buying, responsive alignment and cleanup.

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
Removal is available in **Installed upgrade options** in the requirements view,
with an explicit **Remove one tier (no refund)** control.

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
the change before purchasing at other yards; Mars opens its material review through the simple
stat cards. Other yards require choosing a highlighted mount before **Buy &
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

The nine Federation weapons use the shared firing, recharge, collision and
existing effect artwork. Their damage, range, reload, power and material costs
are shown before buying. Heavy batteries compete for the hull's weapon power.

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
