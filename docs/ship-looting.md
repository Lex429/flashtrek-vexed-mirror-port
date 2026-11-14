# DOT combat and disabled-ship looting

Click a deployed foreign DOT or acquire it with the normal target cycle, then
fire with Space or the existing controller weapon binding. The selected DOT has
the same target frame and hull readout as other combat targets. Normal weapon
range, recharge, physical interception and damage apply. Player-owned DOTs are
excluded from acquisition and clicking. Destroyed DOTs retain their owned identity
with zero hull and `destroyed` phase; they cannot repair, be looted or regenerate
on Continue. Surviving DOTs continue their own work.

The shared sprite loader publishes `baseReady` separately from its full `ready`
promise. Live repairs can draw the original supplied DOT body while optional
lamp masks and damage materials prepare. The cold-art browser regression holds
that optional queue and still requires real body pixels and ongoing repairs.

Select an intact disabled civilian or Sol freighter with shields down and approach
within 350 world units. **Open inventories [L]** always shows the player's inventory
on the left and their inventory on the right. Each side has page buttons, search
and an equipment/cargo filter; the grids have no scrolling or mouse-wheel action.
The same equipment and mineral artwork
used by ordinary Inventory appears here, with fitted/stored labels, quantities
and item condition. Hover or focus to inspect an item. A single click on their
tile immediately takes that item/available stack. **Take all** takes eligible
belongings across every page, including items hidden by a search/filter, up to
the normal cargo limit. Dragging into the player's grid is also supported.
Controller Cross opens it from that target lock; D-pad navigates items and page
buttons, Cross takes the focused source item, and Circle
closes. Escape closes this panel before the pause menu. Opening it clears flight
commands but keeps world simulation, drift, incoming fire and repairs running.
Repaired/removed targets close the panel. Every transfer independently rechecks
the current target, range, generation, shields, quantity and available cargo space.

After a verified transfer, an item icon flies from their inventory into the
player's receiving tile. The player's page switches to show the received item,
its quantity counts up and a `+quantity` badge marks the gain. Take all uses
bounded grouped effects and item-count feedback. Reduced motion uses a short
fade. These effects only observe completed transfers; they never own items or
delay their saving. Failed transfers produce no receiving animation or gain.

Goods move into the ordinary freight hold; raw minerals remain raw; usable repair
deuranium moves into the player's repair reserve. Transfers are limited by the
existing cargo calculation. Equipment moves into the ordinary locker, preserving
the actual instance's damage, upgrades and recharge deadline. It is not fitted
automatically. An overlapping local instance ID is renamed within the receiving
bank without copying the item. Only operational, stowed DOTs without a mission
can be taken as equipment. Launched/waiting mission DOTs and destroyed DOTs are
excluded. Credits, buyer escrow and planetary inventories are not loot stacks.

`ship-looting.js` owns validation and transaction orchestration.
`weapon-loadout.js` owns the reversible `transfer` operation, fitting projections
and same-clock publication. `npc-lives.seizeCargo` releases the stolen shipment's
old source/destination reservation and cancels its agreement, so its former
buyer cannot pay for the transferred goods. Remaining cargo stays with the
casualty for its ordinary recovery policy. This does not cancel its repair mission.
`sol-economy.seizeCargo` adjusts the company's real onboard tons and assignment.
`seizedByPlayer` records transfers in the existing economic ledgers, separately
from production, destruction losses and consumption.

The live UI supplies the existing verified normal/Dev save writer as the commit
callback. A failed write rolls back both owners, reservation counters, equipment
IDs, fitted projections and the bounded version-1 `shipLoot` journal. This journal
is additive saved data; old saves need no fleet or equipment replacement.
`takeAll` stages transfers through these same owners and performs one verified
commit. A failed bulk save reverses the whole action, including all item ID
renames, reservations and cargo. Receipts report source/destination keys and
before/after quantities for the presentation layer.

`ship-repairs.resolveDrone` exposes the same resolver already registered with
`ship-systems`. Player targeting adds its registered `repair-drone` category,
without another simulation, projectile or damage path. Shots retain the selected
DOT's ID after launch, independent of later changes to the player's lock.

Unit coverage: `ship-looting.test.cjs` and `dot-targeting.test.cjs`, together with
the existing targeting, equipment, repair, combat-save and 30-minute NPC economy
regressions. `browser-dot-looting.py` uses a normal new game and real mouse/Space
fire to destroy two DOTs, measures repair progress while the panel is open and
its cessation after destruction, takes real cargo and a worn fitted engine,
injects a verified-save failure, exercises the controller dispatch, opens the
actual Inventory, and reloads through normal Continue with the same 1,200 crews.
Evidence is under `test-results/dot-looting/`.

Dev mode stages three existing Sol crews near the captain, labelled
`[Loot test 1]` through `[Loot test 3]`. They start disabled with shields down,
real owned equipment and cargo bought from finite unreserved port stock. Their
DOT supplies transfer from the existing Dev captain's reserve; ordinary repair
missions then run normally. The first ship is placed about 280 units away when
clear, with the others scattered farther out. Shared navigation clearance avoids
placing them inside existing obstacles.

Practice ships are unaffiliated civilian test vessels, retain their original
hulls and belongings, and cannot raise a faction alert or retaliate. This
exception requires Dev mode and the exact saved practice crew/generation;
ordinary ships retain their normal faction consequences. An older Dev save is
neutralized without restaging the ships. Its old player aggression alert in Sol
is cleared once and Sol standing recovers to at least 100; other systems and
non-player incidents are retained. The marker records `neutralVersion:1`, so later
Continue does not repeatedly reset standings.

`dev-loot-demo.js` runs on a fresh Dev start and once when an older Dev save is
continued in Sol. Its saved version-1 `devLootDemo` marker preserves the same
crews, cargo and destroyed drones on later Continue, without restaging them.
Normal games, other systems, travel and explicit traffic isolation skip staging.
The saved `devCargoKit` records a once-only weight allowance for the original
Dev kit (up to 10 t per freight good and 25 t per mineral). Added loot and contracts
still use the hull's normal capacity; Continue never expands the allowance.
Normal-game cargo weight is unchanged.
`dev-loot-demo.test.cjs` checks conservation and no repeat grants;
`browser-dev-looting.py` checks actual Dev launch, DOTs, the loot panel and Continue.
