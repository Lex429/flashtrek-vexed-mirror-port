# Animated faction fleets

`faction-fleets.js` maps the finished ship artwork to the existing governments.
It supplies roster and duty data to `civilian-traffic.js` and `npc-lives.js`;
there is no additional population, encounter fleet, physics loop or renderer.
The existing Federation roster and its save ledger remain compatible.

| Government | Finished animated hulls |
| --- | --- |
| Klingon Empire | B'rel, K'Tinga, K'Vort, Neg'Var, Vorcha, Qonos |
| Cardassian Order | Hideki, Galor, Keldon, Behemoth |
| Bajoran | Sailing Ship |
| Vulcan Command | Warpship, Explorer, C'Thia, Lifeform |
| Romulan Empire | Der'idex, Norexan, Scout, Reman Warbird, Warhawk |
| Ferengi Alliance | Marauder, Shuttle, Vagabond |
| Delpin | Cruiser, Warship, Luxury Liner |
| Lysian | Fighter |
| Tholian Syndicate | Isaac, Conquest |
| Independent | Tarellian Cruiser, Tamarian Cruiser |
| Dominion | Jem'Hadar Fighter, Battlecruiser, Battleship |
| Borg | Cube |
| Orion Syndicate | Dart Scout, Corsair Raider, Ravager Cruiser, Caravan Freighter |

The original rollout supplies 35 existing animated hulls across 12 additional
governments. Orion adds four original animated hulls and a thirteenth government;
see `orion-faction.md` for its artwork lineage and independence migration. The
Andorians and other governments without matching finished artwork do not receive
unrelated ships as substitutes. Sentient Lifeform, Alien Bioship, creature
mutations, unfinished Tug II variants and Dev-only ships are not faction recruits.
The original hull artwork, damage plates, statistics and prices are preserved.

## Population and work

Fresh games use the existing 1,200 saved crews, including the existing 100
Olympic medical ships. Ordinary territory retains civilian traffic alongside its
native roster. Roster weighting follows the existing Federation mass-class rule.
Patrols are explicit faction crews; Ferengi Shuttles retain mining duties,
Vagabonds and Delpin Luxury Liners retain freight duties, and independent
Tarellian Cruisers remain civilian freight.

Patrols travel between inhabited systems currently owned by their government.
A faction with one eligible system receives physical local patrol routes instead
of falling through into civilian trading. The shared motion, avoidance,
collision, firing, damage, lighting and active-region owners handle these ships.
Existing bounded response teams, military pursuit, hostile standings and allied
projectile handling apply through the same faction defence owner.

One to three available defenders remain on local station watches, according to
the world's population, while spare patrols travel between systems. Their local
routes use the same physical motion owner. This prevents every Marauder from
leaving Ferenginar simultaneously. Existing journeys finish normally before a
returning crew takes a station watch; no ship is teleported or added.

Attacks on a faction's civilian citizens inside its own territory raise the same
local crime alert and per-shot reputation loss as attacks on its warships.
Civilian roles and escape policies remain civilian. Only the bounded military
team receives pursuit orders. Active player aggression takes priority over later
incidental foreign NPC hits, so those contacts cannot distract the entire team.

Borg Cubes may patrol Vex. This is explicit military residency, not an exception
to civilian market, mining or settlement exclusions. No Vex civilian economy or
medical population is created. Other permanently excluded systems retain their
existing civilian restrictions.

## Existing saves

`life.factionFleets.governments[governmentId]` records pending hulls, assignments,
commissioning and issued equipment. `life.federationFleet` and the original
Federation assignment fields retain their existing format. Additional fleets use
`factionAssignment`, `factionDutyVersion` and explicit government ownership.
The optional `securityVersion: 1` ledger migration extends the old per-class
quotas with enough patrol refits for station watches and travelling reserves.
Repeated initialization cannot duplicate that queue. It uses the same existing
crews and commissioning ledger.

Loading an older save queues missing classes without changing existing ships,
poses, equipment, cargo, wallets, funded agreements or deadlines. Free eligible
crews finish their current work, physically report to a berth, and refit through
the shared hull/equipment owner. Owned equipment is retained and new standard
gear is recorded once. Resident miners, medical ships and demonstration crews
are protected from recruitment. No new crew or credit is created.

An older save has no civilian residents at Vex. An existing eligible crew is
reserved for the missing Borg hull, completes its work, refits at an inhabited
port and physically travels to Vex. Continue preserves assignments and cannot
reissue a commissioned hull.

## Validation

Run `faction-fleets.test.cjs`, the Federation NPC, faction defence, military
pursuit, civilian population/access, equipment, economy, active-region and travel
regressions. `browser-faction-fleets.py` checks the actual worker population,
all 12 additional factions, real targeting, physical separation, fitted weapons,
territorial reputation, travelling patrols and Continue.

`browser-ship-presentation.py --ships 16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,39,40,41,42,43,44,48,51,52,53,54,59,61,62,63,64,65,66`
checks all 35 hulls, four damage stages and player/NPC presentation parity.
Headless functional and pixel checks do not certify physical 120 FPS gameplay.

`ferengi-response.test.cjs` and `browser-ferengi-response.py` additionally cover
armed traders, unarmed mining shuttles and Marauders, physical weapon contacts,
local defender coverage, player-priority alerts and Continue. Live route-search
budgets survive ship-index rebuilds; `cooperative-navigation.test.cjs` checks
that those rebuilds cannot turn a yielding funded route into a synchronous search.
The shared obstacle search prioritizes travelled distance plus straight-line
remaining distance. Clearance tests, saved routes and cooperative work budgets
remain unchanged; `navigation-work.test.cjs` compares exact historical paths
across seeded fields and moved geometry. Smaller live work budgets were rejected
because they increased overdue civilian jobs during the same-save combat check.
