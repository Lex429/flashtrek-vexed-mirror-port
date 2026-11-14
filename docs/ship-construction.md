# Earth Heavy Shipyard and fleet construction

Open **Shipyard** during a game, or click the large gold shipyard marker
on Sol's radar. Earth Heavy Shipyard is artwork **278**, located 2,200 units east
and 1,800 units north of Earth. Fly within 1,400 units to place an order. Mars
Orbital Shipyard remains the existing docking and outfitting service.

All Sol hull sales now lead to Earth Heavy Shipyard. It combines the existing Sol
stock with the finished Federation roster, retaining hull prices, statistics and
standard equipment. Orders purchase additional vessels. Multiple vessels of the
same class are supported, including the class the player already commands.

Each order reserves a place in the single assembly cradle. Build time is
`36 + 9 * massClass` simulation seconds. The listed latinum price includes the
yard's materials and standard equipment. Payment is recorded as shipyard revenue;
there is no new currency or withdrawal from reserved civilian freight. Waiting
orders can be cancelled for their full payment. Twenty unfinished orders fit in
the queue. Normal game pauses and hidden tabs suspend the shared game clock.
Leaving Sol does not suspend construction; Continue retains exact deadlines.

The sequence prepares an internal berth, installs delivered structural beams,
fits machinery, welds individual hull plates, tests power and launches. Each
hull has a blueprint derived from its actual silhouette and component family.
Every beam, module and plate has a storage rack, assigned worker, collection
time, delivery path, installation point and welding interval. Materials remain
solid throughout collection, transport and installation. The exterior closes
only after its actual plates arrive; the power test changes lamp emission.

Six original Basic DOTs use `droneSprites.draw`, its real tool-tip coordinates,
and the existing `nativeRepairWork` thruster, welding and spark renderers. DOTs
collect materials, brake at the work, weld along occupied metal, inspect the
finished hull and return to hatches on opaque station geometry. The game's
repair-art owner supplies the same cached sprites through `ensureBase`, retaining
its full optional effects readiness contract for ordinary repairs.

The station's original alpha is composited over the ship and workers. Main and
small-craft berths occupy the interior of its framework. The vessel backs clear
of the lower rails and turns after release; commissioning uses the exact same
final pose. The shared plan and bounded Canvas painter run in the showcase and
game. Animation and inspection cannot charge the player, advance time or
commission a vessel.

The showcase's **Construction** tab includes all 84 non-Dev playable hulls, replay,
pause, playback speed and a progress scrubber. The canvas fills its available
stage and automatically fits the whole yard, workers, deliveries and departing
vessel. Controls remain beside the stage on desktop and accessible above it on
small screens; short windows use normal page scrolling.
Direct links accept `view=construction`, `build=<hull ID>`, `speed=1|2|4|8` and
legacy `zoom` parameters are ignored so earlier close-up links also show the
complete scene. Its generated catalog comes from
the shared definitions and existing artwork catalog:

```sh
node tools/build-ship-construction.cjs
```

On completion the production owner appends one paid, equipped `playerOwned`
vessel to `civilianTraffic.ships`. It records the order ID and a stable vessel ID,
then verifies the save before accepting the commission. Failed saves restore the
order; repeated completion cannot issue another vessel. Existing NPC crews,
markets, funded jobs and identities are retained. No second fleet simulation or
movement integrator is created.

The life owner handles fleet follow, hold, travel and departure from the assembly
area through existing local routes and saved interstellar journeys. Player fleet
orders do not receive civilian trading/mining jobs or civilian access relocation.
Their actual equipment, movement, collision, damage, repair and rendering owners
remain shared. The normal galaxy map includes the owned fleet's current systems.

Open **Inventory [I] ? Fleet** to see the flagship, owned ships, their systems,
hull/shield condition and orders. The tabs are **Inventory ? Fleet ? Collectables
? Deliveries**. Follow flagship, Hold position, Travel and Take command live here;
ship purchasing and the assembly queue remain at Earth Heavy Shipyard. The yard's
**Open Fleet** shortcut opens this same tab. The destination selection survives
commands and tab changes; long rosters scroll within the Fleet page. Existing
Inventory item arrangement, collectables and delivery pagination are retained.

**Take command** exchanges the flagship and a nearby fleet vessel. Both hulls,
names, fittings, damage and vessel identities remain owned, and the former
flagship becomes a fleet vessel. Command transfer requires an operational vessel
in the same system within 1,400 units, recovered Dots, sufficient cargo capacity
and no outstanding docking/travel operation. Failed verified writes restore both
vessels. Other systems retain their existing hull exchange and fitting behavior.

Verification:

```sh
node --test tests/ship-construction.test.cjs
node --test tests/construction-assembly.test.cjs
python tests/browser-ship-construction.py
python tests/browser-inventory-fleet.py
python tests/browser-construction-visibility.py
python tests/browser-shipyard.py
python tests/browser-unified-equipment.py
python tests/browser-smoke.py
```

The construction browser check prepares every hull, checks actual DOT draws,
traces solid materials between rack and hull, and independently composites the
station artwork over the hull to verify real foreground occlusion. It also
compares five phases, buys two vessels through normal UI controls, reloads
midway, commissions once, issues fleet commands, transfers command and reloads.
These are functional checks, not delivered-frame-rate measurements.
