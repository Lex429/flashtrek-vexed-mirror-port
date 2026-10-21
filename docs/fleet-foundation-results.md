# Fleet performance foundation verification

This review starts from `d68a0f0476b188cb0d62c9cc23447787224d3022`, with the
already present planet-lighting patch preserved in both comparison checkouts.
It does not reuse older performance numbers as a new baseline. The final tested
revision and results are recorded below after verification.

## Checkout and device

The implementation worktree is `C:\Users\alphi\Vexed-Mirror-Foundation`, branch
`fix/fleet-performance-foundation`. The immutable comparison worktree is
`C:\Users\alphi\Vexed-Mirror-Foundation-Baseline`. Remote main was `d68a0f0` at
initial inspection. The original `Vexed-Mirror-Port-GitHub` checkout at `ea40ff5`
and its 79 dirty/untracked paths were preserved. The separate
`Vexed-Mirror-Performance-Fix` checkout at `d68a0f0` and its nine dirty paths were
also preserved; the relevant planet-lighting patch was copied into both new
worktrees. Byte snapshots, patches and served-source hashes remain in ignored
`test-results/foundation/`.

The 03:00 UTC preservation recheck found the Performance-Fix nine-path work
unchanged and the original checkout's HEAD unchanged. Five paths in the original
79-path snapshot now contain newer external menu work: `index.html`,
`menu-emblem-orbits.js`, `menu-emblem.js`, `tests/browser-menu-emblem.py` and
`tests/menu-emblem-orbits.test.cjs`. Those concurrent changes remain in place in
the original checkout. The snapshot records their earlier bytes; preservation
does not imply that every original path stayed byte-identical. The latest fetch
still reports remote `main` at `d68a0f0`.

Existing previews were verified against their actual HTTP response bytes:
port 7790 serves the original dirty checkout; 7791 serves Render-Fix at
`665e553`; 7792 serves Performance-Fix at `d68a0f0` plus its dirty patch.
Those servers were not redirected during this work.

Measurements use Windows 11 build 26200, Microsoft Edge **155.0.4283.62**,
headless, **1280 x 850**, DPR **1**, 16 reported hardware threads and 32 GB
reported memory. ANGLE selects **Intel Arc 140T**, D3D11, driver
32.0.101.9150; Canvas/raster/compositing acceleration is enabled. An installed
RTX 5070 Laptop GPU is not the selected device. CDP graphics metadata is retained
with each timing report. These are hardware-accelerated headless measurements,
not monitor scanout or a universal hardware ceiling. Physical 120-Hz delivery has
not been verified.

The isolated initial save contains **172 records**: 162 civilians, nine company
tugs and the player. SHA-256:
`2211a641b0d0f8f6cd686b9c956658cfd2cdf9566b5c256c823b56a444718d01`.
No player browser profile or normal save was overwritten.
The three existing medical Olympics are IDs 159, 160 and 161 in systems 1, 4
and 14 in this fixture. Their locations/jobs were inspected; no replacement
medical fleet was seeded. Larger record sets are isolated benchmark fixtures,
not a migration of the player's population.

## What changed

Local work now uses persistent membership and spatial indexes owned by the
existing fleet/target systems. Changing shields or fitting an upgrade replaces
only that actor's immutable descriptor. Scheduled routes retain reusable geometry
and conservative bounds; already-current samples are reused, and unobserved
descriptions wait until a bounded read needs their authoritative pose. Transit
artwork has a separate view within the same NPC
owner. Distant jobs remain event-driven; the Dev map intentionally lists the
galaxy. Many genuinely interacting neighbors or long crossing routes still cost
work and remain visible in the counters.

A long-run correctness pass exposed a CPU regression in those local reads.
The diagnostic replays the identical saved 600-to-660-second world in both
versions. Reusing route geometry and exact previous poses reduced full physical
descriptions from 204,391 to 6,012, motion reclassification from 184,658 to 2,830,
and leg samples from 420,085 to 207,895. Economic/job outcomes were unchanged.
Counter/profiler timings ran during correctness checks and are not clean FPS
measurements; residual pose/index/interpolation work remained above baseline.
A subsequent conservative temporal bound rejects unchanged committed routes
that cannot yet reach the queried area, while retaining their complete route
in the shared spatial index. Unsupported routes, custom actors, kicks, spins
and changed state take the full sampling path. Hardware-signature comparisons
reuse their stored scalar values instead of allocating arrays per candidate.
The identical saved replay retained all outcomes and all 355,498 broad-phase
candidate IDs, while rejecting 84,116 of 183,921 temporal checks before sampling.
Route samples fell from 207,895 to 123,324. These are diagnostic work counts,
not clean frame-delivery measurements.

Physics now runs at a fixed 60 Hz independently of display callbacks. Catch-up
has a main-thread budget and retains all unpaid active time in the saved clock.
Display callbacks alone accept elapsed time; bounded tasks can drain that debt
while the browser waits to present a frame. They use the same authoritative
integrator and yield between tasks. They cannot request held fire or render.
Display frames without a physical step retain the completed scene read models;
physical steps, clock changes and explicit mutation notifications refresh them.
Category/definition registration has its own constant-time revision check.
The HUD exposes sustained debt. Rendering interpolates copies of authoritative
poses, including beam/shield contacts; it never moves or damages the simulation.
The six-millisecond admission budget checks between physical steps. A single
expensive required step or immediate verified save can exceed it; background
tasks do not make those operations preemptible.

The production renderer remains Canvas. Instance lighting/compositions no
longer overwrite another ship of the same class. Animated layers retain their
20/60-Hz rules. Exact recurring lamp blur phases reuse cropped textures within
bounded cache budgets. Conservative visibility tests precede artwork requests,
composition and particle painting. An integrated explicit WebGL2 comparison path
was measured, but its rotated/downsampled edge differences prevent selecting it
as the default. See [rendering budgets and backend evidence](fleet-rendering.md).
The optional twelve-class destruction cache previously also determined base
sprite availability. A real 64-appearance/32-class view reproduced forty missing
plates on `d68a0f0`. Synchronous shared-asset lookup and bounded visible retention
remove those misses without per-actor asset collections. The fixed view paints
all sixty-four appearances and retains valid same-hull art during damage changes.
The same optional-cache dependency affected progressive repair blends across
thirteen active hull classes. The shared asset loader now retains the mission's
actual initial plate and intact plate independently of optional destruction
data. Exact 25% starts keep their stage-2 artwork. Rendering an unassigned
disabled hull does not load unused repair plates. The regression compares real
painted blends and leaves all owned repair state unchanged.

Optional fragment/wreck work uses the existing preparation queue and bounded
readback worker, with original deterministic generators. Current appearances
remain prioritized. Native snapshot/upload costs are measured separately.
Repair craft use definition-owned bay/work attachments and shared physical
following. Navigation preserves turn rates through braking/holds and maintains
passing/yield commitments. Large saves gain lossless versioned packing while
retaining immediate verified transaction commits; see the [save contract](save-contract.md).
The final local-render regression also found missing system metadata in the NPC
inspector. Visiting a freighter after intersystem arrival now moves the observer
to its authoritative system; the ordinary renderer then draws it through the
same local membership query. Inspection still cannot alter its job or cargo.

## Measurement protocol

Clean timing and heavy diagnostics run sequentially, without concurrent test or
profiling workers. Each representative mode uses three fresh 20-second contexts,
the same saved fixture, three-second frozen warm-up, equipment, viewport and
inputs. Random seed **4292026** is reset at fixture start and measurement start.
Mining destruction inputs are scheduled by simulation time and their IDs are
recorded. The population matrix rekeys cloned equipment to independent owners
and retains the original production fleet. Idle distant-record cases isolate
index scaling; they do not claim 5,000 simultaneously active combatants.

Frame intervals describe delivered animation callbacks. Simulation and drawing
use separate JavaScript timers. CDP traces measure raster/compositor/presentation
outside those timers and retain per-thread unions rather than adding overlapping
parent/child timings. Submitted image area is a diagnostic estimate, not a GPU
fragment count. Save probes run after clean windows. Cold first appearance,
optional full readiness and worst preparation slices are separate results.
Between-display simulation CPU is reported separately from display callback
simulation/drawing. Window totals subtract pre-window carried work and include
unpresented tail work, so catch-up steps and collision counters are counted once.

## Final six-mode measurements

The completed core comparison is `foundation-before-verified` versus
`foundation-after-final`, using the fixture, selected Intel GPU and headless
protocol above. Each row pools three sequential 20-second windows. FPS is total
recorded callbacks divided by total measured time; percentiles pool the recorded
frame intervals. The final report and pooled calculation remain in ignored
`test-results/performance-review/` and
`test-results/foundation/matched-summary.json`. Runtime source hashes in those
reports identify the measured checkout. External OS activity was uncontrolled.

| Mode | FPS before / after | P95 ms before / after | P99 ms before / after | Worst ms before / after | Frames >50 ms before / after |
| --- | ---: | ---: | ---: | ---: | ---: |
| Ordinary flight | 29.89 / 51.10 | 72.7 / 33.5 | 106.0 / 50.1 | 232.8 / 116.6 | 217 / 43 |
| Crowded flight | 7.21 / 16.16 | 178.4 / 83.6 | 180.9 / 116.6 | 251.1 / 133.4 | 433 / 631 |
| Crowded combat | 9.12 / 16.77 | 194.9 / 100.2 | 393.2 / 166.6 | 568.6 / 316.7 | 537 / 528 |
| Mining/debris | 15.00 / 24.55 | 124.8 / 66.7 | 141.5 / 83.4 | 178.5 / 116.7 | 491 / 324 |
| Warp visuals | 22.44 / 39.16 | 106.7 / 50.0 | 126.0 / 66.7 | 176.6 / 100.1 | 439 / 108 |
| Dev map | 56.04 / 59.86 | 18.5 / 16.9 | 18.9 / 17.1 | 35.8 / 33.9 | 0 / 0 |

The stable 60-FPS gameplay target remains **missed** on this reference setup.
Ordinary flight still has 33.5-ms P95 intervals and a 116.6-ms worst frame;
crowded gameplay remains around 16–17 FPS, with a 316.7-ms combat spike. Crowded
flight delivers more frames but also records more absolute >50-ms frames.
The Dev map's roughly 60 callbacks per second establishes neither a hardware
ceiling nor physical display delivery. There is no verified 120-Hz performance
claim.

All 162 civilian hulls remained alive in every window. Combat accepted
98/96/94 shots before and 95/95/95 after; the end-of-window active combatants were
6/8/6 before and 8/8/8 after. These gameplay workload differences limit
attributing the entire FPS change to algorithm speed. Other core modes accepted
no combat shots. Mining/debris retains its seeded, simulation-time destruction
inputs.

The before windows advanced 19.9346–20.0851 simulation seconds; the after windows
advanced 19.9667–20.0333 seconds. After-window outstanding debt ranged from
15.1 to 32.2 ms, including the ordinary fractional physics remainder. Baseline
debt fields are unavailable, rather than measured zero. These end snapshots do
not establish the largest transient backlog within each window. Submitted
artwork and callback intervals also do not measure browser raster/compositor or
physical presentation cost; the separate final traces remain pending.

The larger paired fleet/visible-count matrix, headed/fullscreen performance windows, larger
Dev-map measurements, cold first-appearance/full-readiness performance results,
browser traces and prolonged-play measurements are **pending**. Existing cold,
rendering and gameplay correctness suites passed, but earlier diagnostic runs
are not substituted for those unfinished final performance comparisons.

## Local-owner workloads and remaining limits

The 1,000/5,000 **idle record** fixtures retain the original fleet and add
independent saved owners at distant coordinates. Added equipment IDs are rekeyed;
their action deadlines are held at `1e9`. Regional cases retain their existing
systems; `one-system` cases place the distant additions in the current system.
Nearby ship counts and inputs stay fixed. These cases isolate membership,
lookup and bounded-query cost; they do not measure 5,000 working AI crews.
The capacity driver opts into `--capacity-matrix --stationary-observer` on both
revisions. It lays out original-size artwork using the actual logical flight
view, verifies all requested hull bounds initially fit, and records a matching
pose/equipment hash. It never resets positions after admission: contacts,
drift and jobs remain authoritative. Per-frame configured versus actually
painted actors and visible hull bounds disclose any scattering. The six primary
gameplay modes retain their separate repeated flight/combat inputs.

The separate `1000-active-regional` and `5000-active-regional` cases pass
`--active-distant`. Added crews start without cloned cargo, contracts or escrow
aliases and receive seed-staggered saved action deadlines between 1 and 30.75
seconds. Existing NPC policies select jobs and obtain their real reservations
and funding. The before/after life snapshots record active jobs, mobile ships,
transits, overdue saved actions, scheduled events and event backlog. Scarce jobs,
port congestion and routes that later enter the observed region are workload
outcomes, not proof of constant nearby work. Results for these cases must be
reported separately from the idle-record comparison.

Useful owner counters are:

| Counter | What it measures |
| --- | --- |
| `shipSpatialBuilds`, `shipMembershipBuilds`, `sceneCollections` | Actual shared index/scene construction, distinct from individual pose reads |
| `shipDescriptorBuilds`, `shipPoseChecks` | Full physical descriptions versus candidate freshness checks |
| `shipPoseNotifications`, `shipPoseAcknowledgements`, `shipPoseDeferrals` | Committed-route notifications, already-current reuse and lazy descriptions |
| `spatialShipEntryBounds`, `spatialShipEntryQueries` | Stored conservative bounds examined when fewer entries exist than empty grid cells |
| `spatialShipGridCells`, `spatialShipCandidates` | Grid cells visited and admitted candidates; these are different quantities |
| `spatialShipTemporalChecks`, `spatialShipTemporalRejects` | Supported unchanged routes tested/rejected by their conservative time-domain reach before pose sampling; broad-phase candidate counts remain unchanged |
| `transitIndexAdds`, `transitSpatialQueries`, `transitSpatialCandidates` | Journey/legacy-warp visibility membership and query work |
| `shipContactNeighborhoods`, `shipContactCandidates` | Offscreen physical neighborhood discovery, including stationary blockers |

Read candidate counts alongside exact collision counts and actual simulation
progress. Large mostly empty windows may check existing conservative bounds
instead of thousands of empty cells. Small local windows in a 5,000-record
system retain grid lookup. Neither path builds a description for a rejected
stored bound. Complete-route bounds are intentionally conservative: many long
routes sharing a future endpoint can still produce many candidates. Transit
bounds covering more than 4,096 cells use an overflow set; large physical hulls
or route bounds also remain in conservative physical overflow. Nothing is
discarded to keep a benchmark small.

Correctness coverage includes a synthetic 50,000-by-50,000 station, overflow
queries, fast intervening hulls, rotation/shield collapse and offscreen
ship/asteroid and ship/ship momentum chains. This is geometry coverage, not a
claim that a fully populated station scene meets the rendering target. Actual
mobile crews still enter the five-Hz traffic pass. Berth allocation checks
same-system physical neighbors and indexed reservation points. Queue/berth/
clearing membership avoids scanning distant parked/overflow records. In the
5,000-record regression, forty local request/inspection calls examined 640
relevant entries, and a new holding point read no distant occupancy fields.
Sol dispatch now aggregates eligible commitments once before its unchanged
local/global scoring loops. At 5,000 company tugs that reduces assignment reads
from 4,547,162 to 4,999 with identical saved selection outcomes. Handling stops
after three busy crews because its existing delay is capped there. These are
correctness/work-count results, not FPS measurements. Actual load revalidation
still checks inbound commitments; overdue-heap diagnostics also retain nonlocal
work. Initial indexing/migration and deliberate
Dev-map listings require a census. Active large-fleet and large-station results
must disclose these limits rather than extrapolating idle-record timings.

To reproduce the two population classes independently, run the same commands
against each immutable `--source-root`, using different labels and one unchanged
isolated fixture. These commands define workloads, not a statement that each has
already been run:

```powershell
python tests/browser-fleet-scalability.py --label fleet-idle --fixture test-results/performance-review/initial-save.json --cases current,1000-regional,5000-regional,1000-one-system,5000-one-system --seconds 20 --runs 3
python tests/browser-fleet-scalability.py --label fleet-active --fixture test-results/performance-review/initial-save.json --cases 1000-active-regional,5000-active-regional --seconds 20 --runs 3
node --test tests/fleet-scalability.test.cjs tests/scheduled-pose-cache.test.cjs tests/shared-spatial-scene.test.cjs tests/swept-collision-search.test.cjs
```

## Correctness verification

The frozen runtime passed **490 Node tests**, all **eight local-site Python
tests** and all **31 required browser suites** on Edge 155.0.4283.62. The Node
run includes the full thirty-minute economic and physical production-policy
regressions. The browser run includes the existing lighting, cold-loading,
coasting, fractional settlement and hull-change drone-capacity checks, plus
fixed scheduling/debt recovery, large verified reload and visible working-set
coverage. Node/browser runtime source hashes are retained for comparison with
the final commit and performance reports.

Browser fixtures needed corrections without changing production behavior.
The initial flight smoke check waits for actual keyboard-driven movement and
turning instead of assuming a cold native paint completes during a 180-ms tap.
Held-controls setup now waits for its actual host callback instead of assuming
a cold paint finishes within 100 ms. The planet eclipse pilot uses real braking
and steering after an Olympic collision, retaining the original twenty-second
travel budget and all optical, parallax and population assertions. The complete
browser report retains previous attempts and successful reruns. The debris
alignment assertion uses the actual shared interpolated pose with its existing
0.01-pixel tolerance. Rendering tolerance was not weakened.

These results establish correctness, not smooth gameplay or a physical display
refresh rate. Measured performance and remaining targets are reported separately.

## Reproduction

Use separate immutable source roots and the same isolated fixture for both labels.
Do not run these timing commands concurrently:

```powershell
python tests/browser-performance-review.py --source-root C:/Users/alphi/Vexed-Mirror-Foundation-Baseline --label foundation-before-verified --warm-only --seconds 20 --runs 3 --seed 4292026 --save-probe
python tests/browser-performance-review.py --label foundation-after-final --warm-only --seconds 20 --runs 3 --seed 4292026 --save-probe
python tests/browser-fleet-scalability.py --label fleet-after --fixture test-results/performance-review/initial-save.json --seconds 20 --runs 3
python tests/browser-art-preparation-profile.py --label foundation-after-art-final --gallery
python tests/browser-performance-trace.py --label foundation-after-final --scenario crowdedCombat --seconds 8
python tests/analyze-performance-trace.py test-results/performance-review/foundation-after-final-crowdedCombat-trace.json
node --test tests/*.test.cjs tests/*.test.js
python -m unittest discover -s tests -p test_local_site.py -v
```

The workflow lists the required browser regression commands. Generated fixtures,
raw frame records, traces, profiles, screenshots and recordings stay under
ignored `test-results/`; they are not source assets.
