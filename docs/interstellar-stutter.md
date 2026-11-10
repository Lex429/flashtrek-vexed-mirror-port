# Interstellar scheduling and cold-appearance stalls

The November 6 investigation reproduced stalls during ordinary manual flight
with the complete saved 1,200-civilian fleet, 100 medical ships and nine company
tugs. The comparison fixture keeps Earth selected while flying Orion–Oce Nu;
navigation selection does not control the jobs. No NPCs are relocated by this
comparison.

The expensive work was civilian route creation, complete checkpoint capture,
and cold running-light atlas preparation. Chunk preparation itself was below
two milliseconds in the initial diagnostic. Reducing the saved fleet or disabling
lights would conceal those causes and is not part of this change.

## Ownership and behavior

- `ship-motion.obstacleSearch` is the resumable form of the existing clearance
  search. `obstaclePoints` exhausts the same search for synchronous callers.
  A conservative spatial grid reduces edge candidates; the original exact
  clearance test and path ordering remain authoritative. Corridor sweeps reject
  off-route sectors before constructing their rocks, then apply the existing
  exact swept-rock filter.
- `npc-lives` shares a two-millisecond event allowance across each host task's
  physics substeps. Expensive interactive routes retain a saved
  `navigationRequest` containing the original task and global goal. The ship
  holds through the motion owner while runtime-only search state progresses.
  Position/hull/frame changes restart the search; current geometry validates the
  completed path. Continue rebuilds the generator. Combat/interruption cancels
  the search through the task owner without inventing cargo or replacing a
  retained paid journey. Calendar/bootstrap callers exhaust the same solver.
  Due jobs and physical time remain pending rather than being discarded.
- `native-game` submits the already interpolated completed pose before routine
  one-step physics debt. The existing MessageChannel service runs that same
  integrator afterward; two owed steps still trigger bounded RAF catch-up.
  Display/gate checkpoints remain the only live time admission. Background
  workers neither admit new wall time nor request held fire/paint. The browser
  foundation test services actual tasks between synthetic display callbacks and
  proves identical 60/120/144-Hz physical outcomes, debt and pause behavior.
- `save-snapshot` copies the complete graph in small tasks and rechecks every
  current key/value in one final uninterrupted validation. Changed rows and new
  children repair the snapshot at that boundary. Subsequent transfer records
  are immutable. Known collection/docking observer proxies are unwrapped only
  for reading; the live graph is never replaced. The worker reconstructs and
  compresses that graph, and `save-storage` still verifies storage. New immediate
  writes, cancellation and world replacement reject partial/late results.
  Unknown custom JSON conversion uses the original direct JSON fallback.
  Immediate purchases, explicit synchronous saves and lifecycle flushes keep
  their durable boundary. The stored codec and old save formats are unchanged.
  Bounded parts transfer as JSON text rather than thousands of structured-clone
  row objects; negative reference tags retain ordinary undefined/array-hole JSON
  semantics. The bounded key-shape cache compares every key before reuse and
  final validation still checks every current key and value.
- `ship-lamps-gpu` never uploads a cold atlas layer in a ship paint call. The
  existing cooperative damage-art queue prepares the identical recipe, uses
  asynchronous worker readback (striped CPU fallback), and then uploads the
  small texture. Ordinary Canvas lighting remains visible and animated until
  the atlas is ready. Light colour, positions, pulse clocks, dimensions,
  shader and player/NPC cadence are unchanged. Arrival lookahead also requests
  lighting preparation after the current ship plate.

## Regressions and diagnostic scope

`navigation-work.test.cjs` compares complete paths with the historical solver
across seeded/moved geometry and verifies identical swept rock IDs.
`cooperative-navigation.test.cjs` checks bounded progress, Continue, funded
contract ownership and parking after commercial completion. Snapshot/checkpoint
tests cover mutations/deletions/replaced subgraphs, aliases, exact final-boundary
capture, immutable transfer, cancellation, replacement, failures and verified
retry. `browser-ship-lamps.py` retains all 144 original pixel gates and also checks
that a cold paint uploads nothing and shows the exact Canvas fallback.

Raw sequential same-save measurements and the frozen pre-change source are under
ignored `test-results/interstellar-stutter/`; implementation logs are under
`test-results/stutter-fix/`. The 1,280×850, DPR-1 headed diagnostic has a 60-Hz
presentation cadence. Its single windows are evidence about stalls, not native
120-FPS qualification:

| Workload | Before average FPS | After average FPS | Before worst frame | After worst frame | Before/after frames >100 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Interstellar, 25 seconds | 48.44 | 57.05 | 450.5 ms | 249.6 ms | 14 / 2 |
| Orion approach, 15 seconds | 58.47 | 59.20 | 83.2 ms | 50.0 ms | 0 / 0 |
| Cold approach, 15 seconds | 52.68 | 56.68 | 266.7 ms | 66.6 ms | 3 / 0 |

The interstellar heavy diagnostic (separate from clean frame timing) reduced
NPC advance's maximum from 249.2 to 18.5 ms and checkpoint initiation from 99.1
to 0.3 ms. Complete snapshot CPU is now distributed across tasks; its final
validation still reached 38.3 ms. These windows retain remaining stalls and do
not establish hitch-free gameplay. Native refresh qualification uses
`tools/validate_gameplay_refresh.py`, never the synthetic clock regressions.

The final calendar/route run passed all 24 checks, including the 30-minute legacy
economy, regional mining and full 1,200-ship corridor/conservation runs. The
additional offline-clock regression proves expensive measured CPU time cannot
throttle calendar jobs. Snapshot/checkpoint tests passed all nine checks, and
the real-browser active-region, foundation, delivery, lamp-pixel, cold-loading
and system-entry suites passed. Foundation also verified an exact 5,000-record
reload. These functional checks do not certify frame delivery.

The active local site at port 7790 serves this working tree; its game, life,
snapshot, storage and streaming files were checked against local source hashes.
Port 7788 serves the older portable Games Hub copy and does not have the new
population/snapshot modules.

## Foreground refresh checks

Two sequential native fullscreen reviews used the same complete fleet, 1,280×800
CSS viewport, actual DPR 2, 120-Hz Windows mode, five-second active warm-up and
one twenty-second window per case. The first has the route/save/lighting fixes;
the second also prioritizes presentation over routine physical debt. Neither
review lost focus, visibility or fullscreen. Both retained full physical progress.
The original display mode (60 Hz) was restored afterward.

| Brave workload | Before presentation priority | After presentation priority |
| --- | ---: | ---: |
| Ordinary flight | 57.27 FPS | 59.24 FPS |
| Chunk boundary flight | 56.44 FPS | 58.37 FPS |
| Crowded flight | 43.60 FPS | 54.05 FPS |
| Crowded combat | 36.50 FPS | 49.12 FPS |
| Corridor flight | 58.10 FPS | 59.09 FPS |

Both **failed** strict 120-Hz qualification; remaining spikes are retained in
`stutter-fix-native120` and `stutter-fix-presentation120` under ignored
`test-results/performance-review/`. This is evidence of improvement, not a claim
that all stalls or the 120-FPS target are resolved. The later browser smoke,
ship-contract, system-entry, active-region/checkpoint and combat-control checks
also passed with the presentation change.

A separate five-second, almost-empty fullscreen animation control at the same
120-Hz mode delivered 61.30 FPS in Brave and 119.58 FPS in Edge. It held focus,
visibility, viewport and DPR constant and restored the display afterward. This
control identifies a browser-specific limit in this session; it does not qualify
the game or override either failed gameplay result. A full Edge gameplay run is
recorded separately as `stutter-fix-edge120`.

The final text-transfer/shape-cache implementation passed all 29 focused
save/codec/checkpoint checks, including exact omission/hole semantics and shape
signature collisions. The real browser again verified exact full-fleet storage
and Continue; its atomic validation took 14.1 ms in that paused-state check.
That functional timing is not a gameplay FPS result.

Final refresh verification is **pending AC power**. During the later run Windows
reported AC disconnected, 17% battery and Energy Saver enabled; gameplay delivery
had fallen to about 30 FPS. The source of the earlier Edge run's changing frame
rates was not isolated, and power was not sampled for each earlier window.
The final battery-limited run was stopped, its partial frames/failure retained
as `stutter-fix-final-edge120`, and the original 60-Hz mode restored. No 120-FPS
completion claim is supported. Record AC/Energy Saver state before comparing
subsequent long performance runs. Current source hashes match the active site.
