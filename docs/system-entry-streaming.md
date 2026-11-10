# Manual system entry and destination preparation

Manual flight activates a system at its catalog map ellipse. The same
`manual-flight.advanceRegion` result supplies the HUD; approaching the planet is
no longer an activation condition. Entering rebases local coordinates while
preserving galaxy position, velocity, spin, launched shots and physical debt.
Outside all envelopes the coordinate frame stays valid and physical membership
becomes null. Romulus and Remus share their existing physical system. Version-1
`manualFlightRegion` saves membership and a transition sequence. Continue computes
the current region quietly, without replaying an announcement.

`system-streaming.js` runs through the existing host display loop, at most once
per 0.15 active display seconds. It looks 12 seconds ahead using actual velocity
and asks the shared owners for the future three-by-three chunk geometry. It may
request destination planet art, a nearby body/rock and up to six resident ship
types, admitting at most one speculative ship request at a time. Shared
`ship-effects.request({prefetch:true})` prepares the current plate without loading
three unused damage plates. Existing asset, composition and lighting owners are
unchanged. Optional admissions check a two-millisecond budget; a single owner
operation can exceed it. This is bounded cooperative preparation, not a hard
execution-time guarantee.

Preparation does not advance time, move NPCs, integrate distant physics or create
jobs. Pause, hidden tabs, maps, inventory and travel suspend speculative work.
Real active chunks still follow the player's actual location. Existing saved
ships and analytical journeys supply all traffic. Version-2 travel corridors add
sparse ambient rocks and lazily saved inhabited routes; see `travel-corridors.md`.

The old manual switch performed a synchronous full-fleet save near the planet.
Ordinary spatial and local-body changes now schedule the existing bounded
checkpoint owner. Body arrival runs in the simulation update, rather than
mutating state from rendering. Purchases, explicit saves, docking, economic
settlement and actual navigation/calendar commits keep their durable owner.

Run `tests/system-entry.test.cjs`, the flight-status/corridor suites and
`tests/browser-system-entry.py`. The latter checks a real boundary crossing and
Continue; its activation fixture moves one existing resident to the boundary.
Its separate `--tour-only` mode flies Orion to Oce Nu with ordinary controls and
does not relocate NPCs. These are functional tests. Use
`tools/validate_gameplay_refresh.py` separately for delivered 120-Hz gameplay,
retaining failures, source hashes, the complete fleet and raw frame intervals.
Local evidence is under `test-results/system-entry/` and is not committed.

The November 3 verification passed 180 scoped long-run checks and 32 overlapping
final focused checks, plus nine browser suites including 72 rendering scenarios.
The ordinary-key Orion–Oce Nu tour took 268.875 seconds and witnessed 409 visible
rocks (61 ambient), seven travelling ships, and boundary activation about 15,293
units from the destination planet. All 1,200 civilians and 100 medical ships
remained present. This tour witnessed no mining crew or battle.

An identical-fixture approach comparison reproduced a 95.8 ms synchronous save
at the old 2,500-unit trigger. The updated source had no synchronous manual
arrival write and activated with its HUD around 15,256 units from the planet.
Both instrumented approaches still had a 125 ms worst frame. Additional tracing
found NPC job updates up to 86.1 ms and queued JSON snapshot capture up to 53.4 ms.
These observations do not establish hitch-free arrival, resolve a minute-long
freeze, or qualify 120 FPS. Clean foreground refresh windows are retained
separately in `test-results/performance-review/system-entry-*-native120*`.

The final clean native-fullscreen 120-Hz windows delivered 114.46 FPS in flight,
114.43 across chunk boundaries, 101.79 in crowded flight, 76.02 in crowded combat
and 115.04 in corridor flight. All five failed strict qualification. Each source
has one retained 20-second window per scenario using the same 1,210-record save;
no stable speedup is claimed. Final physical debt stayed below 0.031 seconds.
Source hashes, raw failures and the full comparison are recorded in
`test-results/system-entry/verification.json` and its accompanying Markdown report.


Warp preparation uses the same system and asset owners. The player turns along
`manual-flight.guidance` before the cinematic departure; saved journey reports
retain that bearing for reload. The native host advances the warp presentation
from its existing display clock, including during physical travel suspension.
Pause and hidden tabs stop it. Opaque tunnel/report phases avoid painting the
covered world.

Departure first closes live time admission and drains any already accepted
physical steps in bounded tasks. `world-bootstrap-worker` then runs the existing
travel planner and settles Sol freight/production deadlines at the resulting
saved clock. Civilian jobs retain their ordinary bounded scheduling and saved
debt. No additional simulation time is granted during preparation. Explicit
origin, report, arrival and handoff saves await `save-storage.writeAsync` encoding
and exact storage verification. Retry reuses the planned result; a saved report
repeats scene preparation without repeating fuel charges or elapsed days.

`system-streaming.prepareArrival` loads shared body/asteroid art and the current
ship damage plates across the arrival camera sweep. Two covered native frames
paint its initial and final camera positions before readiness is published.
Continue stays disabled, dim and unfocused until that work succeeds; neither
mouse nor keyboard can bypass it. Save or asset failures retain a retry path.
Automatic completion of the post-warp approach uses the existing bounded
checkpoint owner.

Run `tests/warp-transition.test.cjs`, `tests/browser-warp-transition.py` and the
foundation/system-entry browser suites. Warp coverage includes real bearings,
deliberately delayed scene readiness, keyboard activation, failed saves, retry,
report reload, exact calendar time and freight material conservation. Browser
frame traces are diagnostic, not a foreground refresh qualification. Existing
civilian scheduling and periodic checkpoint snapshots can still cause flight
stalls after arrival; the warp changes do not certify hitch-free gameplay.


The warp verification passed 66 focused Node checks, including the existing
30-minute economy/conservation run, plus the warp, foundation, system-entry,
ship-lighting and unified-equipment browser suites. The separate sequential
headless comparison used one identical 1,200-civilian save, a 1,280 by 850
viewport and the same ten-day Sol-to-Quintus trip for each source. It retained
the prior warp controller and a surgical reversal of the host warp changes
without changing the shared hardware or fleet fixture. Accepted navigation
returned in 282.9 ms before and 9.0 ms after; observed arrival-frame maxima
were 283.3 ms and 33.1 ms. This is one diagnostic sample, not a refresh guarantee.
The updated run still recorded a 300.1 ms alignment frame, a 133.7 ms departure
frame and a 250.0 ms post-arrival flight frame. Initial physical catch-up,
main-thread state activation and ordinary NPC/checkpoint work remain costs.
Raw frames, source reconstruction and the fixture hash are retained under
`test-results/warp-transition/` and are not committed.


Player travel now resolves the selected body through
`nativeNavigation.destination`, including its physical system, continuous world
position, hull clearance and distance. Physical membership comes from
`manual-flight.currentRegion`, never the last saved coordinate frame. Inside
the target solar system, every visible star, planet and other body supports
cruise. Outside it, destinations closer than the existing 2,500-unit arrival
range support cruise; farther destinations support warp. Calendar quotes use
actual Euclidean ship-to-body distance, the existing chart scale and the fitted
warp multiplier. Existing fuel, navigation and repair eligibility still apply.

Map actions carry `{system, body}` through the shared navigation bridge. A
journey report retains `destinationBodyId` and `destinationName` so preparation,
save retry, Continue and report reload all approach the selected body. Romulus
and Remus share one physical system while retaining their historical world,
market and population keys. Selecting a remote body never reduces it to the
system's home planet.

`player-cruise.js` owns player course intent; `ship-systems.move` still executes
the single physical movement per step. Saved courses retain their destination
system and body, including across a manual system rebase. Held WASD/arrows and
quick-turn maneuvers take priority; releasing controls resumes autopilot from
the current position and rebuilds the approach endpoint. The temporary override
is not saved. Existing courses without a destination system migrate in their
original coordinate frame. Post-warp approach supports the same override.

The host-updated cruise panel shows the destination, remaining distance and
manual/automatic state. Its Cancel Cruise button and C shortcut remove the
course through the navigation owner, verify the save, and preserve current
velocity. A failed save retains the course. Cancelling the post-warp approach is
supported too. The panel stays clear of health, radar and the footer at narrow
widths and supports reduced motion.

`tests/cruise-navigation.test.cjs` covers distance/membership rules, exact body
selection, pure inspection, fuel/time quotes, manual detours, quick turns,
retargeting, reload and endpoint continuity across rebases.
`tests/browser-cruise-navigation.py` uses the real map, WASD, Cancel Cruise/C,
normal-slot Continue, a selected companion-star warp, denied writes and narrow
layouts with the original full fleet. Run these alongside system-catalog,
foundation, system-entry and warp readiness regressions. These are correctness
checks, with no delivered-FPS claim.


The distance/cruise change passed 74 focused Node checks. Browser validation
passed the full-fleet cruise override/cancellation and selected-star/return-warp
cases, existing report readiness/retry/reload, fixed scheduling, complete
system-catalog/Remus round trips, and real impact/flight controls. The cruise
browser report and desktop/narrow screenshots are retained under
`test-results/navigation-cruise/`. The panel is checked against the radar's
bounds on the narrow fixture. Cancel supports mouse, focused-button Space and
plain C; Ctrl/Cmd+C remains available for copying.


Warp preparation now runs alongside a visible turn and nacelle charge. The ship
eases through the shortest turn toward the real destination bearing, reaching
65% charge during alignment, then builds to full charge over 1.2 seconds. If
preparation takes longer, it holds that bearing with live pulsing engines. There
is no preparation text box. Departure requires both the minimum charge animation
and actual completed planning, owner restoration, artwork and tunnel preparation.
Pause/hidden gates freeze the animation; readiness completing while paused
cannot trigger departure. Reduced motion retains a shorter turn/charge sequence.
The physical gate retains all owed steps while preparation drains accepted debt
and verifies the origin save. Resume/retry use the same readiness latch, and a
resumed report does not replay its already committed departure. Continue still
waits for the two actual arrival render acknowledgments.
The final durable handoff starts during the last 600 ms of arrival, overlapping
snapshot capture and verification with the camera easing. Controls remain gated
until both the animation and verified save finish. A denied save retains the
arrival receipt for retry; replacing the active state cancels the old callback.

Travel transfers now use the existing `save-snapshot` graph capture in bounded
parts in both directions. The main thread rebuilds the worker's result through
`restoreAsync`, yielding between small batches instead of cloning the complete
fleet in one message. Aliases, mutable records and fractional values survive.
Cancellation terminates the worker and rejects an incomplete restore. Native
`world-bootstrap.transportState` transfer and the earlier JSON fallback remain
available when graph capture is unavailable or an extension requires it. This
never reduces the fleet or removes jobs, escrow, equipment or physical debt.
The normal durable save owner still verifies each actual transaction.

The repair and NPC-life owners expose resumable `prepare` iterators for their
existing migrations, indexes, reservations and access audit. Arrival preparation
uses a 2 ms CPU target before yielding a task, restoring repairs before NPC
access auditing. Fast records can use the remaining task budget without waiting
for a new display frame after each 128 steps. An interrupted iterator can resume; ordinary
synchronous activation finishes pending work. Preparation does not advance
simulation, and the final saved graph matches the synchronous owner path.

The shared damage-art scheduler exposes scoped background holds. Warp acquires
one after its origin art is ready and releases it on cleanup. Current appearance
and lighting jobs retain priority; optional damage/wreck jobs stay queued and
resume afterward. The ship-effects owner also defers unused damage-stage loads
during the hold. Painted lights keep their shared 60-Hz player/warp path.

`tests/browser-warp-pacing.py` records raw RAF intervals, CPU samples, expensive
calls, source hashes and save costs without screenshots or slot reads during
the measured interval. Sequential before/after samples used the exact same
1,200-civilian save and 1,280 by 850 Edge viewport; only the seven warp/scheduler
source files differed. In `before-final` and `after-final`, the worst
alignment/departure/arrival intervals changed from 58.3/66.7/33.3 ms to
8.6/8.5/8.5 ms. Cruise/report maxima were 33.3/33.5 ms. That run also exposed a
roughly 290 ms hold at the last arrival frame while the final save completed.

After overlapping that save with arrival, `after-final-2` recorded
alignment/departure/arrival maxima of 25.1/25.1/33.4 ms, with no interval above
50 ms in those phases. Arrival now lasted about 1,100 ms instead of about
1,400 ms. The final run still had a 58.4 ms report interval, a 74.8 ms preparation
maximum and an 83.4 ms ordinary-flight maximum. The earlier updated run's
ordinary-flight maximum was 125.1 ms. All windows remain in the raw reports;
these instrumented headless samples do not establish monitor refresh or
universally hitch-free rendering. Evidence is retained under
`test-results/warp-pacing/` and is not committed.

Warp regression coverage holds artwork while the ship turns and charges, proving
that it cannot depart early. It releases loading while paused and verifies that
departure still waits for resume, then holds render acknowledgment to prove
Continue cannot bypass readiness. It checks completed preparation before takeoff,
release of the optional-work hold, and exactly-once travel through save denial,
retry and reload. It also holds the final save response, verifies that
capture begins before arrival ends and proves physics cannot resume before
verification. Node coverage also verifies complete native transfer,
legacy proxy fallback/cancellation and optional/foreground scheduler ordering.

Warp tunnel rendering now passes its cinematic kind to the shared ship renderer
and supplies a fixed `rasterWidth`/`rasterHeight` at the largest camera size.
The bounded sprite cache retains that hull/effects pair throughout the zoom;
display size changes no longer allocate another pair on every frame. The shared
effects still update at 60 Hz. `imageSmoothingQuality: 'low'` selects the measured
faster final presentation sampler for the tunnel. Artwork processing and the
shared effect shaders retain their existing pipeline. Resize/DPR changes create
a correctly sized raster through the same cache and memory budget.

The zero-gain WebAudio graph is initialized at game entry, keeping first-use
audio setup out of the animated turn. Destination sky preparation builds its
seeded star textures in batches of sixteen while the ship turns and charges,
retaining one future system. Entry adopts those exact textures; aborted or
superseded preparation cannot activate a system. This does not advance either
the decorative sky clock or physical time. The report's contents and emblem
decode/layout are also prepared early; its entry transition starts when the
report phase becomes visible. Two actual native scene acknowledgments and the
existing verified save boundaries still gate Continue and flight handoff.

`ship-sprite-cache.test.cjs` covers live 60-Hz effects during camera zoom, bounded
surface reuse and viewport invalidation. `space-preparation.test.cjs` covers
unchanged displayed state, exact seeded texture adoption and cancelled/overlapping
preparation. The warp browser regression observes sound readiness at entry and
sky/ship preparation before departure, retaining readiness/denial/retry/reload.
`browser-warp-rendering.py` uses real artwork for 24 previous/updated comparisons,
strict paused readback, live light changes and one pair of zoom surfaces. Its
pixel-readback context follows the existing CPU-backed rendering fixtures;
visible-browser timing is measured separately. Existing render-path, lighting
and cold-art checks retain their original gates.

The shared effects receive a cinematic `nacelleCharge` value. Engine cores and
explicit `warpCharge` emitters gain brightness and a local glow. Constitution
collectors opt in through that flag while retaining their ordinary running-light
pulse outside warp; unrelated navigation lamps remain independent. A charging
collector keeps a bright minimum even during its normal off blink.
Earth profiles fade a near-white copy of their original painted lamp alpha masks
over the coils and add local coloured bloom. Simply multiplying the blue channels
was barely visible on already saturated Aries nacelles. The aura scales with the
hull so small ships retain a visible silhouette.
The bounded sprite cache quantizes charge to 32 levels without creating new
surfaces per level, and reserves fixed padding throughout a charging sequence.
Ordinary lighting and tunnel rendering retain their previous paths. The charge
gallery checks both light-profile families at four levels; paused pixels remain
exact, and live effects continue at their existing 60-Hz cadence.

`browser-warp-charge-ships.py` selects Aries through the actual Dev tools, observes
the selected hull at intermediate/full charge, holds loading, and verifies full
charge through takeoff and the same hull after arrival. Its pixel check measures
both nacelles at actual flight size, requiring a visible shift toward white;
whole-hull energy alone previously missed the weak contrast. It also checks
increasing charge on all 65 powered ship profiles, including both Constitution
variants. The solar sail and two biological bodies keep their existing visual
profiles. `warp-charge-profiles.test.cjs` covers opt-in collectors, their off-blink
charge and unchanged zero-charge/running-light behavior through both shared
rendering interfaces. The existing strict artwork and lighting gates still apply.

The opaque tunnel also supplies its own full background. Its overlay no longer
clears that background twice, and the covered native canvas retains its last
frame until real destination warmup or transparent arrival needs another paint.
Simulation, input gating, scene acknowledgment and display clocks keep their
existing execution order.

The preceding tunnel-rendering comparison used the same frozen 1,200-ship save and
1,272 by 668 viewport at DPR 2, with no video, screenshots or heavy tracing in
the measured windows. The first/repeated steady-tunnel mean intervals were
22.7/22.4 ms before and 12.8/12.5 ms in the final `after-3` sample. Their
95th percentiles changed from 33.3/33.3 to 16.8/24.9 ms. The first arrival's
maximum changed from 41.6 to 25.0 ms; repeated arrival from 41.7 to 25.0 ms.
Sound initialization moved from a 29 ms cruise operation to preparation.

The final sample still contained occasional longer frames: the first report
reached 49.9 ms and the first cruise 42.3 ms. Preparation and post-handoff
ordinary flight are also retained in the raw frame arrays. Earlier candidate
windows remain available, including `after-1`'s 58.3 ms report interval and
`after-2`'s 14.2 ms repeated steady-tunnel mean. These diagnostics establish
improvement on this device, not universally hitch-free animation or physical
monitor refresh qualification. Frozen sources, hashes, conditions and every
window are under ignored `test-results/warp-render-fix/`. The final comparison
differs in the six relevant JavaScript modules, warp stylesheet and entry-page
asset versions; unrelated runtime sources remain pinned to the same snapshot.

The charge-loading change passed the focused snapshot/cache/sky/warp Node suite,
cooperative fleet restoration and interrupted-preparation checks, repair/access
regressions and the full 30-minute NPC and repair economy conservation runs.
Browser checks passed charge/held loading, pause/resume, denied saves, retry,
saved reports, exact fuel/calendar accounting, live lighting, cruise controls,
system entry, NPC jobs and the 5,000-record foundation reload. The existing
72 render-path artwork scenarios also passed without relaxing their pixel gates.
Timing is measured separately from these instrumented correctness checks.

The new sequential visible comparison used Edge 157, the identical 1,200-ship
fixture, 1,272 by 668 viewport and DPR 2. The final pair restores the fixture
behind the physical gate, waits for player artwork and two native frames, then
starts travel on RAF. Unrelated index/native-host changes are pinned to the
frozen baseline. Neither measured window includes screenshots, video or profiling;
both retained focus/visibility and reported no JavaScript errors.

In `before-ready-boundary` / `after-ready-boundary-2`, first/repeat alignment
means changed from 23.1/23.4 ms to 13.6/11.5 ms. Charging while loading averaged
12.2/11.2 ms. Arrival means changed from 24.3/23.9 ms to 11.7/13.2 ms, with
maxima of 33.3/41.7 ms in the updated sample. The first/repeat steady-tunnel
means were 25.0/24.5 ms before and 14.9/15.7 ms after. These observations are
diagnostic samples, not monitor-refresh qualification or a claim of hitch-free
animation: updated alignment/charging still reached 66.6/66.9 ms, and repeated
cruise reached 58.4 ms.

All earlier windows remain under ignored `test-results/warp-charge/`, including
the initial comparison with fixture restore inside the first frame interval,
its 358.3 ms cold first-turn interval, and a separate CPU-profile diagnostic.
The final pair describes travel after the player ship is visible; it does not
certify cold startup. One repeat measurement failed because its test completion
flag was not cleared before scheduling the next trip; that harness failure is
recorded separately and corrected in the final run. Sources, hashes, fixture
identity and raw frame arrays remain available alongside each valid window.

Warp latency preparation now uses bounded event-loop tasks for the travel graph
capture, cooperative graph restoration and fleet-owner preparation. The former
128/256-record limits and one-RAF-per-batch policy imposed long waits even when
each batch used very little CPU, especially on slower display cadences. Every
record still passes through its existing owner; no fleet, escrow, cargo, physical
debt or elapsed simulation time is removed. Snapshot validation and verified
storage remain mandatory. Body artwork and the two actual scene acknowledgments
retain their frame boundaries. Turn, nacelle charge and takeoff timings are
unchanged; the fully charged ship spends less time waiting for the data work.

Graph restoration creates ordinary mutable fields through direct assignment;
inherited names retain explicit own data properties, including `__proto__` and
any inherited setter. The synchronous and asynchronous paths keep the same graph
aliases and property descriptors. New regression coverage exercises fast-budget
throughput, inherited names, task yielding, cancellation and complete arrival
owner processing alongside the existing snapshot/travel/save checks.

The latency comparison selected Aries with the same saved 1,200-ship fixture in
sequential visible Edge 157 windows at 1,272 by 668, DPR 2. Sources outside the
affected preparation/save modules and entry-page versions stayed frozen. The
first/repeat time from accepted course to departure changed from 16.69/16.23 s
to 3.76/3.76 s. Graph restoration changed from 8.39/8.31 s to 0.10/0.07 s;
destination preparation from 3.49/3.37 s to 0.55/0.51 s. Actual loading completed
during the existing turn/charge sequence in the updated windows.

The baseline delivered roughly 33 ms frame intervals while the updated windows
mostly delivered 8–17 ms intervals. Every raw interval and stage span is retained
under ignored `test-results/warp-latency/`; these are device-specific diagnostic
latency samples, not refresh qualification or a universal timing guarantee. Both
windows retained focus/visibility, with no screenshots, video or heavy profiler
in the timed interval. Validation passed 42 focused Node checks plus the actual
warp pause/readiness/failed-save/retry/reload and foundation browser suites,
including exact retained state in both 5,000-record mode slots.

The cinematic departure now accelerates the ship to a visible disappearance
point on its actual bearing. Its travel distance fits the current viewport,
leaving room for the light at the endpoint. At 58% of the existing 1,100 ms
departure it vanishes; a local blue-white starburst replaces it at that exact
position and fades over the remaining 462 ms. There is no departing hull behind
the light and no separate full-screen departure flash. Reduced motion keeps a
gentler flash at the ship's position. The existing loading and departure timings
do not gain another wait.

`flight-assets` prepares one 256-square glow/star texture before takeoff and
reuses it for every flash frame. Its auxiliary-byte accounting includes that
texture. The effect uses the shared phase clock, so pause freezes the light as
well as the ship. Rendering only reads the effect; physical poses and travel
costs retain their existing owners.

Regression coverage checks fixed endpoint/ship position agreement, full hull
disappearance, flash decay, multiple bearings, wide/narrow bounds and reduced
motion. `browser-warp-departure.py` equips Aries through Dev tools and verifies
the actual on-screen flash, a white center pixel, paused timing, texture reuse
and completed arrival. Its stills/sequence are under ignored
`test-results/warp-departure/`; these instrumented visuals make no FPS claim.

NPCs now use that same default 1,100 ms departure curve and star texture. Legacy
`warpVisual` departures advance through the shared duration, while scheduled
journeys derive the presentation from their saved `departedAt`, `galaxyFrom`
and initial route segment. Backdated journeys do not replay a departure after
the effect has finished. Medical, trading, mining and freight roles all pass
through this shared presentation, independent of hull lighting or type.

The civilian renderer projects each flash from world coordinates through the
observer's coordinate frame, camera and zoom, including legacy effects across
system frames. A vanished hull no longer suppresses its remaining light. After
the flash, the ship stays absent from the launch view; an observer elsewhere
on its route can still see the existing traveller. A corridor encounter that
drops a ship to local flight continues through the ordinary task/motion owners.

`npc-lives.queryTransits` accepts `{presentation:true}` for this renderer only.
It samples a current departure/flash point so fast analytical travel cannot
prematurely cull the light. Default queries used by encounters, corridor promotion
and forecasts retain the true journey pose; map inspection keeps its ordinary
authoritative descriptors. This adds no saved
fleet, jobs, travel time, payments or private simulation clock.

Validation covers shared player/observer trajectories, several bearings, fixed
world flash positions, late observation, camera/zoom, cross-frame legacy effects,
pure rendering and unchanged physical transit queries. The full 1,200-ship
browser fixture displays four simultaneous departures across medical, mining,
trading and freight hulls, retaining paid cargo and every saved crew. Paused
flashes freeze, and completed departures do not reappear in the launch scene.
The NPC-life reload browser and 30-minute population/economy/legacy-payment
regressions pass alongside corridor promotion/resume and active-region tests.
