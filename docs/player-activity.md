# Activity near a manual flight

The existing civilian-life owner now prefers real work that overlaps the
captain's projected journey. It estimates the course and speed from actual
movement, smoothing small steering corrections and immediately accepting a
deliberate turn. Navigation selection does not aim or accelerate this forecast.
The same-world Sol to Orion regression produces identical jobs with Earth,
Orion, an unrelated destination or no selection. Existing geology, markets and
ongoing work still determine available opportunities. Below five world units
per second it stops offering new
route-biased jobs; existing real work continues. Forecasts cover open space
ahead even when the selected planet is behind the ship.
Every two simulation seconds
it counts nearby ships and current mining/combat/distress work, checks a bounded
forecast of existing travellers, and considers opportunities 8–120 seconds ahead.
Map, inventory, pause, landed history and prohibited systems do not dispatch new
activity opportunities.

The planner uses the existing membership/spatial indexes. It examines at most
48 prospective idle crews per pass and wakes at most three through the ordinary
saved event scheduler. Only crews without cargo, paid work, an active journey,
combat or docking movement qualify. Other free crews choosing their next job may
use the same forecast. At most six forecast mining assignments and ten trade
assignments are admitted together; existing forecast traffic reduces trade
admission. Assignments expire from the planner's small bookkeeping list, while
their real saved jobs continue independently.

Markets near the current position and projected course provide the candidate
crews and destinations. Any extra route preference comes from those physical
positions and movement, rather than the navigation selection. Nearby residents
at the departure planet no longer suppress planning for the future corridor.
Two rotating thirds of free expanded-fleet trading crews prefer a viable
interstellar delivery when one exists, rather than the previous one third.
Normal stock, purchasing funds and the original crew activity policies still
decide whether a job can be accepted. The legacy unexpanded fleet retains its
original rotation.

Trade selection favors profitable, funded deliveries predicted to pass near the
projected course. Stock, buyer demand, treasury escrow, equipment and cargo
capacity remain subject to the ordinary transaction owner. Forecast-biased jobs
reserve open-space opportunities outside the shared system envelopes, leaving
planetary work to the ordinary job policy. A new delivery may keep a fixed
departure window so its normal warp speed crosses the captain's slower route
later. Loading still withdraws real stock and pays once. Until departure the
loaded crew uses the ordinary physical parking owner, releasing its loading
berth; its paid cargo, buyer escrow and deadline survive turning and Continue.
Late docking or combat can delay the actual departure; ships retain their
normal movement rather than being moved to satisfy a forecast. Mining selection
reserves an actual, undepleted rock with an actual refinery buyer. A planned
expedition retains its berth until a fixed departure time, then travels with the
ship's existing warp statistics and ordinary local mining approach. Its departure
window includes time for the slower local approach. A fixed work time lets an
early arrival survey its reserved rock before beginning the normal timed cut.
Only actual cutting and collecting consume the existing ore entitlement.
The plan keeps its place and
departure when the captain turns, pauses, leaves or reloads. Distant ordinary
mining retains its existing schedule.

Crews using overlapping fields can hail and dispute claims through their
existing behavior. Up to two forecast crews may receive separate nearby claims
in a field, and their reserved surveys count as mining work for right-of-way
conversations. Aggression, retreat policy, weapon damage and repair supply
rules are unchanged. Battles must cause actual damage; disabled ships attempt
their own repairs and request a medical response if needed. The planner never
creates a casualty or forces an encounter outcome.

Disabled interstellar records remain in the shared global contact index. When
the observer approaches from another coordinate frame, the same world position
is retained. The repair owner rebases active civilian mission partners, launched
Dots and observed motion samples as one group. Medical ships already en route
also resolve the casualty's current frame when beginning their approach. Calls,
missions, supplies, cargo and drone identities are retained.

Run `tests/free-flight-activity.test.cjs`, `tests/player-activity.test.cjs`,
`tests/player-activity-economy.test.cjs`, the
existing 30-minute economy/corridor/repair regressions and
`tests/browser-player-activity.py`. The optional `--tour-only` uses the existing
ordinary-key Orion–Oce Nu flight and records actual painted miners, traders,
fighters, disabled ships and medical service. `--fixture` reuses the same saved
world for comparison; `--navigation-target 1` leaves Earth selected throughout
the Orion to Oce Nu flight, and `--navigation-target 0` clears selection.
The functional browser check departs Earth with ordinary thrust while Earth
remains selected. These are encounter/functional checks, not FPS
qualification. Keep clean foreground timing separate, with unchanged fleets,
lighting, statistics and raw frame intervals. Local evidence is retained under
`test-results/player-activity/`.

The November 3 ordinary-key comparison reused one saved world. The baseline
flight painted 13 distinct ships, including seven travelling traders and no
working miners. The final flight painted 26, including ten travelling traders
and nine working miners. All 1,200 civilians and 100 medical ships remained.
Neither flight witnessed a battle, disabled ship or medical service; those
outcomes are not guaranteed. Separate regressions cover armed survey disputes
and medical approach/service across coordinate-frame changes.

The 30-minute corridor economy check and six-minute active-route conservation
checks passed with midway reloads. Final local browser checks retained prior
claims/escrow and fixed plans through pause, map inspection, course changes and
Continue. Existing browser retreat and repair-work-cell assertions fail on both
the unchanged baseline and modified source; their controls are retained.

Strict 120-FPS qualification remains unmet. The short matched NPC timing windows
averaged about 4.12 ms before and 4.14 ms after for simulation work per display.
Full-game foreground windows varied widely; a reverse-order corridor comparison
delivered 29.13 FPS after and 29.31 before. Keep every original/failed window;
neither configured refresh nor these functional checks establishes 120 FPS or
a stable performance improvement. Complete evidence is in
`test-results/player-activity/verification.json` and `verification.md`.

The November 6 navigation fix leaves Earth selected for the same-save Orion to
Oce Nu comparison. The baseline flight painted four ships, one working miner
and no travelling traders. The updated flight painted 13 ships, four working
miners and three travelling traders; all four miners and three traders were
observed outside the system envelopes. The complete 1,200-civilian fleet and
100 medical ships were retained. No battle or rescue was witnessed. The
baseline completed its flight but failed the older positive-traveller assertion;
its original negative result is retained. The pilot now focuses the canvas
without clicking a planet and opening its encounter panel. Additional evidence
is under `test-results/free-flight-activity/`; these functional observations do
not qualify 120 FPS.
