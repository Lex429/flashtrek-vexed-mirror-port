# Activity between systems

Ordinary manual flight now encounters persistent prospect fields along inhabited
trade corridors. `travel-corridors.js` supplies deterministic galaxy positions;
it does not create ships, apply damage, move anything or grant resources.

The lane network connects each eligible inhabited system to its three nearest
neighbors, deduplicates edges, and includes Sol–Orion explicitly. Its version-1
layout puts twelve rocks in each prospect, approximately every 4,000 world units,
with an end clearance and alternating lateral offsets. Sol–Orion has eight
prospects. The rocks reuse the existing ore catalogue and damage artwork.

Stable numeric IDs occupy the reserved range starting at 1,000,000,000. Existing
Sol/regional/deuranium IDs are unchanged. The existing mined/destroyed arrays,
damage, ore-drop bits and asteroid-motion save own all resource consequences.
An exhausted field stays exhausted after leaving, crossing a system boundary or
reloading. A later layout version must preserve this namespace and existing IDs.

`sol-asteroids.js` lazily projects nearby corridor geometry into the caller's
system coordinate frame. Its existing `queryBounds`, `nearby`, `sweptNearby`,
`find`, `relocate`, targeting, painting and collision interfaces all see the same
rocks. Displacement updates one global pose and its retained local views; motion
is still integrated by `asteroid-motion.js`. The site grid is lightweight data;
reading the map does not load field artwork or activate distant physics.
Repeated impacts through different system views normalize into the retained
motion owner's frame. Swept starts and contact queues project back into the
observer's frame, including after an actual save/reload.

A rotating third of idle trading crews prefer profitable, fully funded lane
offers when stock, demand and purchasing funds permit; other jobs retain the
existing selection policy. This spreads new work beyond local port shuttles
without replacing an already funded task or inventing cargo or money.

New funded journeys between lane neighbors retain their actual departure and
arrival points and follow the intervening prospect beacons. Saved waypoint
distances and the original warp speed determine their real arrival deadline.
Existing direct journeys remain compatible. Promotion/demotion trims only the
remaining route, preserving the current position and avoiding a return to the
original departure point.

Existing miners can reserve a corridor rock through `npc-lives.js` and return
the collected ore to a legitimate refinery. A small subset of idle trading
crews also inspect prospects, hold briefly and return to a real berth. These
tasks reuse existing identities and navigation. No second fleet is seeded and
no existing funded delivery is replaced to manufacture an encounter.

The existing global transit index also tracks corridor workers. Near the
player's active buffer, a traveller can leave its analytical journey and use
ordinary hull motion, avoidance, targeting and combat. Saved `travelResume`
retains its journey, task identity and original task phase. The world position
is continuous through promotion and coordinate-frame changes. If a safe local
route cannot be planned, the original journey remains intact. Overdue arrival
events are left to their scheduler. Leaving the active area resumes travel from
the actual current position, with cargo, escrow and deadlines still owned by the
same life scheduler. Tactical interruptions resume this retained travel too.

At most four travellers are admitted per quarter simulation second and twelve
ordinary local travellers can be promoted together. Distant work remains
scheduled. Map inspection never calls the activation path.

Persistent-life social exchanges run every two simulation seconds, examine at
most twelve nearby speakers, and admit at most two conversations per pass.
Saved cooldowns and a separate deterministic random stream prevent repeated
exchanges after pause/reload and avoid consuming gameplay weapon randomness.
Traffic reports, market-price negotiations and mining warnings use the existing
hail/log interface. Native flight keeps these in conversation history without
transmission popups, footer chatter or floating speech captions. The flight
canvas also has no cursor-hover control-instructions tooltip. Target selection,
range and recharge do not create floating text panels. Action results use the
existing bottom status line, without transient popups or repeated flight-key hints.
Exchanges cannot spend contracted
cargo or treasury escrow. Occasionally, suitable armed crews can dispute mining
right of way through the existing dispute, shared weapon and combat-interruption
owners. Medical crews retain their medical policy.

Version 2 retains every original lane and rock ID. It adds sparse deterministic
rocks across 2,048-unit interstellar cells, excluding physical system envelopes.
Each cell has three candidate rocks. Only queried geometry is materialized, with
a 512-cell metadata cache. The reserved ambient namespace starts at
1,000,000,000,000; the same asteroid owners retain damage, drift and exhaustion.
Map inspection does not create or paint these fields.

Any eligible inhabited pair can acquire a lane when a real funded journey or
tracked manual course needs it, including Orion–Oce Nu. Saved
`travelCorridors.version=2` retains selected lane keys; restoring another save
does not inherit those lanes from the runtime cache. Existing journeys preserve
their original routes and escrow. Idle crews consider a rotating selection of
distant buyers. A short-lived saved course interest makes real profitable offers
on that route eligible for the existing rotating trading policy. It never
replaces paid work, invents cargo or guarantees an encounter on every trip.
Ordinary mining selection also includes some nearby interstellar cells.

Run `node --test tests/travel-corridors.test.cjs` with the economy, regional mining,
access, chunk, collision, repair, equipment and save regressions. The browser
command `python tests/browser-travel-corridors.py` checks full-fleet geometry,
ordinary targets, real mining state, existing artwork and Continue reload.
`--tour-only` runs an actual Sol-to-Orion flight using ordinary keys and the host
loop; its screenshots and encounter census are functional evidence. It does not
qualify 120 FPS. Use `tools/validate_gameplay_refresh.py` separately, retaining all
raw intervals, source hashes, full population and failures.

The November 2, 2026 verification passed 257 broad Node checks, then 51 overlapping
focused checks after the final coordinate-view contact correction. Browser checks
passed for corridor targeting, partial mining and Continue, physical contacts,
civilian lives/tactics/access, host time gates, equipment, rescue, traffic and 72
lighting/render scenarios. The final ordinary-key Sol-to-Orion flight took 94.77
seconds and encountered 89 visible corridor rocks, three ordinary travelling
traders/freighters and one working corridor miner. This pass witnessed no corridor
hails or battles; conversation and shared-weapon disputes have separate regression
coverage. All 1,200 civilians, including 100 medical ships, remained present.

**120 FPS remains unmet.** The final sequential, foreground, native-fullscreen
120-Hz test delivered 57.96 FPS in flight, 56.02 across a chunk boundary, 40.68 in
crowded flight, 26.74 in crowded combat and 58.32 in corridor flight. Crowded
combat also ended with 2.86 seconds of retained physical debt. Each scenario has
one retained 20-second window; these failures are not a 120-FPS certification or
a stable speedup claim. The same 1,210-record fixture and existing lighting were
retained, runtime hashes matched the final tested build, and the original display
mode was restored. The local evidence is
`test-results/travel-corridors/verification.json`; raw windows and startup recovery
remain under `test-results/performance-review/corridor-final-native120*`.

## Player asteroid targeting

Shift targeting uses the bounded `ship-systems.query` at the existing selection
range, whose asteroid provider includes `sol-asteroids.queryBounds` and all
interstellar fields. See `docs/player-targeting.md` for nose intent and cycling. The static `forSystem` belt list
excludes lane prospects and sparse free-flight fields, so it cannot supply all
local targets. Keep original rock IDs, observer-frame coordinates, threat ranking,
mining exclusions and weapon range/recharge rules. The real-key cases in
`browser-combat-controls.py` cover a Sol star-relative origin, a corridor viewed
from two system frames, and a sparse interstellar field, including Space firing.
