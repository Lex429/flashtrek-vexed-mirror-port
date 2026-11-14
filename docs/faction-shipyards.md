# Faction shipyards

Every government with authored territory has a physical dockable service yard.
There are 17 stations covering 16 governments; the Earth Empire retains both
Mars and its Imperial yard at Epsilon Indi. Placeholder governments without any
territory receive no invented systems. Existing station IDs and offsets stay intact.

| Government | System / station |
| --- | --- |
| Earth Empire | Sol / Mars Orbital Shipyard; Epsilon Indi / Imperial Shipyard |
| Klingon Empire | Hof-Maso Fleet Yard |
| Cardassian Order | Cardassia Prime / Cardassia Fleet Yard |
| Bajoran | Bajor / Bajoran Refit Yard |
| Vulcan Command | Vulcan Orbital Shipyard |
| Romulan Empire | Romulus Naval Yard (also accessible from the Remus coordinate view) |
| Ferengi Alliance | Ferenginar Exchange Yard |
| Andorian | Andoria / Andorian Fleet Yard |
| Delpin | Delpi Shipyard |
| Lysian | Lysia / Lysian Service Yard |
| Tholian Syndicate | Vintaak Tholian Salvage Yard |
| Independent | New Switzerland Civilian Shipyard |
| Dominion | Blender / Dominion Fleet Yard |
| Borg | Vex / Borg Refit Nexus |
| Pirates | Pirates Haven Salvage Yard |
| Orion Syndicate | Orion Syndicate Shipyard |

Find the local station's gold service square on the radar. Click it to contact
the yard, or click the station in space. Fly within 1,400 units of the service
berth and request docking. The existing controller physically approaches the
berth, clamps the ship and opens upgrades, weapons, shields, materials and the
current build. Paid thruster improvements and hull refits use the same verified
atomic transactions. Undocking physically clears the berth. Docked and partly
completed approaches survive Continue.

`faction-shipyards.js` registers static metadata after the world and physical
catalog load, in both the main page and bootstrap worker. It indexes yards by
legacy and physical system IDs. Positions use the current catalog coordinate
view; Romulus and Remus therefore resolve one facility without duplicating it.
The existing `nativeMarsShipyard` renderer delegates these queries to the
registry, retaining its API for older callers. Its visibility test still runs
before artwork requests, and all yards share the two existing lit/unlit Earth
yard 280 textures and work-light canvas. These are faction service locations,
not new faction-specific artwork or equipment balance.

Registration does not alter crew populations, jobs, escrow, asteroid IDs,
planet populations or civilian access. The Borg and Pirate stations do not
create civilian markets or admit civilian residents to prohibited systems.
Station locations remain fixed when players conquer a planet, as existing
facilities did; faction names describe the native station.

New yards sit 850 units east and 500 north of their home body. New Switzerland
uses 1,000 north to clear Helvetia and large hull approach paths. The registry is
not a simulation loop; offscreen stations do not need individual updates.

Validation: `node --test tests/faction-shipyards.test.cjs
tests/shipyard-refits.test.cjs tests/radar-presentation.test.cjs`,
`python tests/browser-faction-shipyards.py`, and
`python tests/browser-shipyard.py`. The faction browser checks all 86 playable
hulls against each of the 12 new approaches, then uses real canvas/radar clicks,
shared movement, UI purchases and departure at every station plus the Remus
view. Orion and Remus include full page reloads while docked. Deterministic
simulation ticks in this functional test are not an FPS benchmark.
