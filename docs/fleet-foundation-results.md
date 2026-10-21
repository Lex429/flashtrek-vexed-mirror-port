# Fleet performance foundation verification

This review starts from `d68a0f0476b188cb0d62c9cc23447787224d3022`, with the
already present planet-lighting patch preserved in both comparison checkouts.
It does not reuse older performance numbers as a new baseline. The current
implementation passed all required local correctness checks; fresh matched
performance results are pending. The numeric performance tables below are
explicitly historical results from the intermediate `57c873f` revision.

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

The earlier tested implementation revision was
`57c873f2dd76efbb013eedf6bf39f567b381d41c`, pushed to
`fix/fleet-performance-foundation`. Its
[Linux CI run 39536720133](https://github.com/Lex429/flashtrek-vexed-mirror-port/actions/runs/39536720133)
passed every step. That CI result remains valid for that historical commit.
The predecessor implementation, including the host active-gate fix, is
[`03703a4b3b4849b3d7cb83e2da27d1ea38e7093e`](https://github.com/Lex429/flashtrek-vexed-mirror-port/commit/03703a4b3b4849b3d7cb83e2da27d1ea38e7093e),
pushed to the same feature branch. Its
[Linux CI run 39544683919](https://github.com/Lex429/flashtrek-vexed-mirror-port/actions/runs/39544683919)
failed in the Linux warp browser fixture during simulation catch-up. Its fixture
protocol was corrected without removing or relaxing the production debt guard.
That predecessor passed its local 493 Node, eight site and 31 browser checks,
but its remote CI must not be reported as successful.
The current frozen source adds the fixes below and has completed a new full
local pass. Its new source commit, push and CI run are pending; all fresh matched
performance stages will follow. The historical `57c873f` tables remain separate.

The 03:00 UTC preservation recheck found the Performance-Fix nine-path work
unchanged and the original checkout's HEAD unchanged. Five paths in the original
79-path snapshot now contain newer external menu work: `index.html`,
`menu-emblem-orbits.js`, `menu-emblem.js`, `tests/browser-menu-emblem.py` and
`tests/menu-emblem-orbits.test.cjs`. Those concurrent changes remain unchanged by
this work and in place in the original checkout. The snapshot records their earlier bytes; preservation
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

A pre-`57c873f` long-run correctness pass exposed a CPU regression in those local reads.
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
One host time owner checkpoints display callbacks and explicit active-gate
transitions. The current correction retains elapsed active time immediately
before pause, inventory or tab hiding, including the tail after the last display
callback. On resumption it excludes the suspended tail before the next callback;
paused or hidden wall time cannot become new simulation debt. These intervals
are classified using the preceding gate state, rather than whichever state
happens to be visible when the next frame arrives. Pause/inventory checkpoints
admit that debt without running physics in the UI event.

Physical debt and display animation elapsed time have separate accumulators
within that host owner. Warp preparation/start/finish/cancel checkpoint the same
boundary, so warp display animations can progress without admitting ordinary
physical flight time. State replacement resets the runtime host boundary without
clearing already saved physical debt.
Only unpaid physical time is saved; display animation accumulation remains
runtime-only. Bounded tasks can drain physical debt while the browser waits to
present a frame. Display and background drains supply zero additional elapsed
time to the same authoritative integrator and yield between tasks; the host
owner has already admitted the elapsed interval. Background tasks cannot request
held fire or render.
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
Physical debris now uses immutable topology available at the damage event,
independently of camera visibility or pixel readiness. The generated 948,439-byte
metadata asset covers all 66 original hulls, 668 stage fragments and 3,432 wreck
pieces. It records signatures for 287 original source files, with text line
endings normalized. The existing original-artwork preparation algorithms produce
these normalized measurements; no bitmap artwork was regenerated. Shared
collision owners immediately integrate the physical pieces. Visible painting
requests and binds surfaces only, preserving piece identities, trajectories and
expiry without replaying damage or explosions. Asteroid physical shards likewise
use catalog dimensions before their pixels load. Save schemas are unchanged.

Decorative mining motion, hull sparks, wreck trails and menu/warp stars now use
private visual random streams. Culling, async preparation, camera movement and
different paint frequencies cannot consume the gameplay random stream through
those paths or shift a later theft/population choice. Explicit injected warp
random streams retain their original sampling and distributions.

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
recorded. A fresh per-window WeakSet counts unique physical debris objects passed
to the shared environmental-debris entry; a second counter counts its calls,
including any early returns. These lightweight counters do not sample stacks,
copy piece snapshots or alter random streams. Read them beside exact collision
tests and seeded inputs: the baseline can omit physical pieces when their pixels
are cold, while the corrected owner emits the original topology immediately.
More actual debris must not be reported as an equal workload.
The population matrix rekeys cloned equipment to independent owners
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

The historical `57c873f` core pair used the same earlier harness on both revisions.
Historical headed and fullscreen pairs also completed with matching harnesses
within each pair. A later fleet-matrix attempt stopped after the measured window when
the baseline 5,000-record same-system screenshot exceeded its 30-second timeout.
Its 22 partial artifacts remain under ignored
`test-results/foundation/matrix-before-capture-checkpoint-fix/` and are superseded;
they are not a completed paired scalability result.

The profiling harness atomically stops recording and blocks only its isolated
fixture's simulation after each window, persists result rows before capture,
and checks that post-window probes preserve the saved clock and physics debt.
Capture failures become explicit warnings. A focused two-second 5,000-record
check produced its PNG and report, preserved clock 2.6364 through capture/probes,
and reported the expected baseline storage-quota failure honestly. This validates
the checkpoint path, not performance. A historical two-second headed trace-wrapper
check also completed with 71 frames, 129
physics steps and 2.15 simulation seconds. It establishes functional capture,
not an FPS result or a physical display-rate claim.

A subsequent active-gate cutoff regression superseded those timings. The
`57c873f`-era reports, completed baseline fleet cases and checks are archived under
ignored `test-results/foundation/pre-active-gate-fix/`. The profiling harness now
explicitly notifies the host checkpoint owner whenever a fixture replaces its
raw blocked gate, and source provenance includes the served HTML as well as
JavaScript. Because that harness contract changed, every baseline/after core,
headed, fullscreen and fleet pair will be measured again with the same new
harness. Old completed cases cannot be resumed across that hash change. The
archive is diagnostic history, not the current final performance report.

## Historical intermediate six-mode measurements (`57c873f`)

**These are archived intermediate measurements, not current final numbers.**
The historical core comparison was `foundation-before-verified` versus
`foundation-after-final`, using the fixture, selected Intel GPU and headless
protocol above. Each row pools three sequential 20-second windows. FPS is total
recorded callbacks divided by total measured time; percentiles pool the recorded
frame intervals. Those reports and the pooled calculation are archived in ignored
`test-results/foundation/pre-active-gate-fix/performance-review/` and
`test-results/foundation/pre-active-gate-fix/matched-summary.json`. Runtime source hashes in those
reports identify the measured checkout. External OS activity was uncontrolled.

| Mode | FPS before / after | P95 ms before / after | P99 ms before / after | Worst ms before / after | Frames >50 ms before / after |
| --- | ---: | ---: | ---: | ---: | ---: |
| Ordinary flight | 29.89 / 51.10 | 72.7 / 33.5 | 106.0 / 50.1 | 232.8 / 116.6 | 217 / 43 |
| Crowded flight | 7.21 / 16.16 | 178.4 / 83.6 | 180.9 / 116.6 | 251.1 / 133.4 | 433 / 631 |
| Crowded combat | 9.12 / 16.77 | 194.9 / 100.2 | 393.2 / 166.6 | 568.6 / 316.7 | 537 / 528 |
| Mining/debris | 15.00 / 24.55 | 124.8 / 66.7 | 141.5 / 83.4 | 178.5 / 116.7 | 491 / 324 |
| Warp visuals | 22.44 / 39.16 | 106.7 / 50.0 | 126.0 / 66.7 | 176.6 / 100.1 | 439 / 108 |
| Dev map | 56.04 / 59.86 | 18.5 / 16.9 | 18.9 / 17.1 | 35.8 / 33.9 | 0 / 0 |

The intermediate implementation **missed** the stable 60-FPS gameplay target
on this reference setup. It recorded 33.5-ms ordinary-flight P95 intervals and
a 116.6-ms worst frame; crowded gameplay was around 16–17 FPS, with a 316.7-ms combat spike. Crowded
flight delivers more frames but also records more absolute >50-ms frames.
The Dev map's roughly 60 callbacks per second establishes neither a hardware
ceiling nor physical display delivery. There is no verified 120-Hz performance
claim. Current post-gate performance remains unmeasured pending the fresh pairs.

In these historical windows, all 162 civilian hulls remained alive. Combat accepted
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

The following historical `57c873f` work totals pool the same three windows, approximately sixty
active simulation seconds per mode. Display simulation, between-display
simulation and drawing CPU use disjoint JavaScript timers. Drawing totals are
reconstructed from the reported per-window mean and frame count; they exclude
browser rasterization/compositing. Nested sprite/lighting timings must not be
added to these totals.

| Mode | Physics steps before / after | Display simulation CPU ms before / after | Background simulation CPU ms before / after | Drawing CPU ms before / after |
| --- | ---: | ---: | ---: | ---: |
| Ordinary flight | 5,165 / 3,601 | 8,881.7 / 6,457.5 | 0 / 14.3 | 12,025.7 / 10,998.7 |
| Crowded flight | 3,794 / 3,599 | 5,921.4 / 4,836.9 | 0 / 396.7 | 7,496.9 / 6,118.0 |
| Crowded combat | 3,933 / 3,599 | 18,883.7 / 7,252.7 | 0 / 3,428.1 | 9,376.0 / 8,202.9 |
| Mining/debris | 4,271 / 3,597 | 9,527.5 / 5,520.8 | 0 / 333.9 | 9,250.4 / 6,808.8 |
| Warp visuals | 4,713 / 3,601 | 8,094.6 / 5,903.5 | 0 / 79.2 | 10,731.5 / 9,498.3 |
| Dev map | 6,722 / 3,600 | 12,332.4 / 9,923.9 | 0 / 3.7 | 7,266.2 / 6,466.7 |

| Mode | Instrumented canvas allocations before / after | Lamp glow rebuilds before / after |
| --- | ---: | ---: |
| Ordinary flight | 34 / 138 | 4,966 / 3,104 |
| Crowded flight | 0 / 256 | 17,048 / 16,489 |
| Crowded combat | 1,067 / 2,633 | 13,726 / 12,431 |
| Mining/debris | 195 / 588 | 13,092 / 9,848 |
| Warp visuals | 142 / 615 | 6,954 / 4,265 |
| Dev map | 0 / 0 | 0 / 0 |

Canvas allocations increased in every flight mode. These absolute counts include
lazy cache bootstrap and the extra rendering callbacks delivered after the
change; they do not establish lower allocation per second or zero churn.
Instrumented main-document canvas constructors do not cover every worker,
browser or native allocation. Named cache evictions were zero in these core
windows, which does not establish behavior for larger working sets.
The available combat `sceneCollections` count increased from 159 to 312: there
is no universal scene-rebuild reduction claim. Baseline clean counters do not
cover every actual scene/index builder. Complete builder coverage remains
unavailable pending the separate heavy traces; absent counters are not zero.

Historical `57c873f` untimed post-window probes of the ordinary 172-record save measured median
serialization/storage/verification costs of 6.8/2.7/0.3 ms before and
4.6/1.4/0.3 ms after, with median inclusive totals of 10.3 and 6.5 ms.
The corresponding combat medians were 6.8/3.5/0.3 ms before and 2.8/1.2/0.2 ms
after; inclusive totals were 11.7 and 4.4 ms. Component medians must not be
added to infer an inclusive total. Saving remains synchronous. The retained
5,000-record functional reload diagnostic recorded 237.8 ms serialization,
10.9 ms storage and 0.6 ms verification, with a 249.9-ms inclusive total.
That diagnostic preserved both mode slots and retained state, but is neither a
clean FPS measurement nor a matched large-save comparison. Large durable
transactions remain a demonstrated source of main-thread stalls.

Exact counter coverage and per-window values are in the local
[work-count JSON](../test-results/foundation/pre-active-gate-fix/core-work-counts.json) and
[work-count summary](../test-results/foundation/pre-active-gate-fix/core-work-counts.md); the historical large
reload diagnostic is retained with the local
[archived checks](../test-results/foundation/pre-active-gate-fix/checks/).
These generated artifacts are ignored and untracked, so these paths are not
files delivered in the source repository.

All fresh matched performance outputs are **pending**: six core modes,
headed/fullscreen pairs, the fleet/visible-count matrix, larger Dev maps, cold
first-appearance/full-readiness results, full browser traces and prolonged play.
Historical correctness and diagnostic runs are not substituted for current
verification or those unfinished final performance comparisons.

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

The current frozen source passed **506 Node tests with no skips**, all
**eight local-site Python tests** and all **32 required browser suites** on
Edge 155.0.4283.62. This includes all 66 hulls' debris coverage and the prior
lighting, loading, coasting, fractional settlement and drone-capacity regressions
from `665e553`. These are completed correctness checks; the new source commit,
remote CI and every fresh matched performance stage remain pending.

The predecessor `03703a4b3b4849b3d7cb83e2da27d1ea38e7093e` passed its local
493 Node/eight site/31 browser checks, but CI run 39544683919 failed as described
above. The new full pass uses the corrected fixture protocol and the current
source, rather than substituting that predecessor's results.

The earlier `57c873f` runtime passed 490 Node tests, eight local-site Python
tests and all 31 required browser suites on Edge 155.0.4283.62. Those historical
checks remain in the archive and do not complete current post-gate verification.
The Node run includes the full thirty-minute economic and physical production-policy
regressions. Browser coverage includes the existing lighting, cold-loading,
coasting, fractional settlement and hull-change drone-capacity checks, plus
fixed scheduling/debt recovery, large verified reload and visible working-set
coverage. Node/browser runtime source hashes are retained for comparison with
the tested commit and fresh performance reports.

| Current final deliverable | Status |
| --- | --- |
| Current source commit and push | Pending after completed local verification/build check |
| CI for that commit | Pending new commit/run; predecessor 39544683919 failed |
| Node/local-site checks | 506 with no skips / 8 passed |
| Required browser checks | All 32 passed |
| Fresh matched performance tables | Pending new baseline and after measurements |

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
Physical 120-Hz delivery has not been verified. Comparable performance on the
installed RTX 5070 or other browser/device combinations has not been measured.
Synthetic 120/144-Hz host checks establish
schedule correctness only. Dedicated expansion-performance workloads for dense
large stations and systems with five or more planets have not been completed;
the synthetic large-station geometry regression is not a substitute. Fresh
core/capacity, cold-loading, trace and prolonged-play measurements are still
running sequentially and cannot yet be reported as completed comparisons.

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
