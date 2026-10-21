# Remaining performance review, 20 October 2026

The subsequent [fleet foundation review](fleet-foundation-results.md) starts
from `d68a0f0` with preserved newer work and fresh measurements. Numbers below
remain the historical `665e553` comparison and are not its current baseline.

Baseline: `665e553ee37cad55a4d0e80461b5fdcb55a02e9e`, the fetched remote
`main` at the start of this review. Work is isolated in
`C:\Users\alphi\Vexed-Mirror-Performance-Fix`, branch
`fix/combat-spatial-performance`. The older `staged-main` checkout and its 63
modified/untracked files were captured by hash; this work makes no source edits
there. Its menu/index and workflow files also changed externally during this
session, and those concurrent edits were preserved. Existing player saves were
not used or overwritten by browser fixtures. Implementation commit:
`0a7b062b4e72170b6c20b4700326103fd0fc7b98`. All after runtime measurements below
use that exact source; the final report commit adds documentation and diagnostic
profiler corrections only.

## Implementation

The registered target owner now separates definition-owned shapes and asteroid
geometry from current poses. Moving or damaging one ship refreshes that ship's
descriptor and spatial membership. ID resolution and shot queries do not assemble
the entire system. Explicit changes to membership, fitting, upgrades, repairs,
depletion and displacement notify the same owner. Old descriptor snapshots remain
stable; scratch state cannot overwrite a contact retained by another owner.

Weapons and physical fragments use conservative bounds for their complete swept
paths before exact collision tests. The existing rock index includes moved rocks
and previous/current/predicted positions. Per-step motion summaries expand its
existing grid; each query no longer scans every moving rock. Summary scans and
broad-phase visits are counted separately from exact tests. Field insertion,
removal, replacement and explicit geometry invalidation reconcile that same index.
Ship bounds cover either orientation of
elongated hulls and shields. Actual first-contact geometry, shield overflow,
recharge ownership and exactly-once damage remain shared. Debris still reflects,
transfers momentum and damages rocks under the existing environmental limits.
Terminal repair missions also invalidate ship membership after their last Dot
stows, preventing a returned owned drone from remaining a physical blocker in the
same simulation step. Drone capacities, condition and recharge are unchanged.

Crew intent has a per-crew 30 Hz cadence, with immediate reassessment for damage,
target/fitting changes and expired threats. Physics, traffic avoidance and firing
eligibility still execute on each required substep. Active frames no longer lose
elapsed time at the former 250 ms cap. Pause, inventory and hidden-tab suspension
still stop the clock. Effective statistics and shapes are cached against their
actual equipment, upgrade and definition dependencies.

Artwork preparation uses resumable pixel loops and bounded stripe transfers in
the existing queue. A bounded worker reads snapshots of filtered GPU artwork;
waiting tasks yield the queue and resume with pixels or a recorded failure and
fallback. Foreground appearances receive priority while optional work continues
progressing. Lamp cache identity describes its storage; pulse and exact blur
radius update reusable contents. The existing lighting masks, composition
surfaces, 20/60 Hz effect cadence, visual scale and current-damage-first loading
remain intact. Explicit full preparation still waits for optional assets.

The save owner and durable transaction boundaries are unchanged. Serialization,
storage writes and read verification are measured separately; save costs do not
justify postponing transactions or caching stale snapshots.

## Measurement conditions and reproduction

Windows 11, Intel Core Ultra 9 285H (16 reported threads), 32 GB reported device
memory; headless Microsoft Edge `155.0.4283.62`, 1280 x 850, DPR 1. Edge reports
hardware-accelerated 2D Canvas, rasterization and compositing through Intel Arc
Graphics / ANGLE D3D11, driver `32.0.101.9150`. The installed NVIDIA GPU is not the
renderer selected for these runs. Preparation/readback surfaces can use a
different raster path from the gameplay canvas. Headless compositor delivery is
not a measurement of physical monitor scanout.

The same isolated 172-ship save (162 civilians, nine Sol tugs and player),
equipment, viewport and input scripts are restored in a fresh browser context
for each window. Save SHA-256:
`2211a641b0d0f8f6cd686b9c956658cfd2cdf9566b5c256c823b56a444718d01`.
Three seconds of frozen-world warm-up plus completion of admitted artwork work
precede each warm measurement. Each scenario requests three sequential 20-second
windows; actual durations are recorded because a blocked main thread can delay
the stop request. Cold loading is measured separately. Other test/timing workers
are idle during measurements; OS scheduling, power and thermal state are not
controlled.

Ordinary flight repeats thrust/turn/coast inputs by simulation time. Crowded
flight places twelve existing ships around the player as a stationary rendering
stress fixture, while other civilian jobs continue. Crowded combat provokes
twelve existing NPCs with normal NPC equipment/statistics; the player has high
health for the stress fixture. Mining/debris uses the existing actual mining demo
and destroys nearby rocks every 1.8 wall seconds. Warp uses the existing repeated
visual fixture; the Dev map retains ordinary simulation and inspection. These
controlled scenarios do not represent every natural fleet arrangement.

Use the same fixture path for both revisions. Its first invocation can create a
new isolated fixture if one does not exist; that new fixture must then be reused
for the comparison. The exact review fixture and raw artifacts remain under
ignored `test-results/` locally, rather than tracked source.

```powershell
git worktree add --detach C:\review-baseline 665e553ee37cad55a4d0e80461b5fdcb55a02e9e
python tests/browser-performance-review.py --source-root C:\review-baseline --label baseline-isolated --revision-label 665e553 --warm-only
python tests/browser-performance-review.py --label after-isolated --warm-only
# Run each revision sequentially for all six scenarios; tracing is diagnostic only.
$modes = 'flight','crowdedFlight','crowdedCombat','miningDebris','warp','devMap'
foreach ($mode in $modes) {
  python tests/browser-performance-trace.py --source-root C:\review-baseline --label baseline-final-v2 --scenario $mode
  python tests/browser-performance-trace.py --label after-final-v2 --scenario $mode
  python tests/analyze-performance-trace.py "test-results/performance-review/baseline-final-v2-$mode-trace.json"
  python tests/analyze-performance-trace.py "test-results/performance-review/after-final-v2-$mode-trace.json"
}
# Separate sustained-player-fire saving workload:
python tests/browser-performance-trace.py --source-root C:\review-baseline --label baseline-save-v2 --scenario crowdedCombat --held-fire
python tests/browser-performance-trace.py --label after-save-v2 --scenario crowdedCombat --held-fire
python tests/browser-art-preparation-profile.py --source-root C:\review-baseline --label baseline-final-v2 --gallery
python tests/browser-art-preparation-profile.py --label after-final-v2 --gallery
python tests/browser-performance-review.py --source-root C:\review-baseline --label baseline-cold --cold-only
python tests/browser-performance-review.py --label after-cold-final-v2 --cold-only
python tests/browser-performance-review.py --source-root C:\review-baseline --label baseline-cold44 --cold-only --cold-types 44
python tests/browser-performance-review.py --label after-cold44-final-v2 --cold-only --cold-types 44
python tests/compare-performance-review.py test-results/performance-review/baseline-isolated.json test-results/performance-review/after-isolated.json
```

Run those commands sequentially. Heavy CDP tracing, CPU sampling, native-pixel
instrumentation and save timings are excluded from clean frame-delivery windows.
Trace analysis clips to the measurement marks and unions overlapping events
within each family/thread. GPU-service, compositor, raster, GC and game callback
times can overlap across threads and must not be added into a total frame cost.

## Results and verification

Earlier exploratory runs with reused pages and the flight window overlapping a
test worker are excluded from the final comparison. Counts above 33 ms use the
literal threshold on raw intervals; pooled FPS divides total callbacks by actual
window duration. Artwork paint calls and delivered compositor frames are reported
separately.

### Cold appearance and explicit full preparation

First successful game draw of the correct appearance, milliseconds, with the
same live save and fresh browser context for each hull/stage:

| Hull | Damage stage | Before | After |
|---|---:|---:|---:|
| 35 | 0 | 542.5 | 286.0 |
| 35 | 2 | 617.5 | 461.0 |
| 49 | 0 | 451.8 | 358.8 |
| 49 | 2 | 205.9 | 306.3 |
| 59 | 0 | 143.9 | 81.1 |
| 59 | 2 | 152.6 | 67.3 |
| 44 | 0 | 73.8 | 218.4 |
| 44 | 2 | 84.7 | 261.3 |

These timestamps come from successful canvas artwork draws, rather than asset
availability alone. Per-hull cold compositor delivery was not separately timed;
browser presentation is measured in the separate warm traces. Screenshots verify
the correct artwork after the observation window.

Five of eight appearances improved. The other three regressed; these are single
cold probes per case, not evidence of a universal loading improvement. Live-world
cold P95 intervals were 133.2-183.8 ms before and 66.7-100.4 ms after for the first
six cases. Hull 44 was measured in a separate browser launch: 84.9/72.0 ms before
and 66.7/50.0 ms after. These cold workloads still miss 60 FPS.

Pairs are **before / after**, milliseconds, fresh 172-ship contexts with the same current damage plate requested. Image load and decode are separate observed promise phases. Alignment and unlighting are elapsed phase wall duration, including queue/worker wait and concurrent world work; these are not pure CPU samples and must not be added to per-frame simulation/drawing or interpreted as whole-game freezes. Only the selected hull/current-stage phases are shown.

| Hull | Stage | Image load event latency | Decode promise latency | Alignment phase wall | Unlighting phase wall | First correct artwork paint |
|---|---:|---:|---:|---:|---:|---:|
| 35 | 0 | 92.1 / 57.8 | 27.6 / 13.6 | 343.1 / 159.6 | 12.8 / 19.2 | 542.5 / 286.0 |
| 35 | 2 | 107.3 / 64.5 | 20.7 / 13.5 | 390.3 / 245.6 | 13.2 / 29.3 | 617.5 / 461.0 |
| 49 | 0 | 85.7 / 49.0 | 27.9 / 14.2 | 227.3 / 160.1 | 44.7 / 83.2 | 451.8 / 358.8 |
| 49 | 2 | 54.2 / 50.2 | 19.7 / 9.3 | 95.2 / 145.1 | 18.3 / 53.2 | 205.9 / 306.3 |
| 59 | 0 | 91.8 / 25.5 | 28.4 / 12.0 | 0.1 / 0.1 | 0.4 / 25.0 | 143.9 / 81.1 |
| 59 | 2 | 92.9 / 20.0 | 30.1 / 13.3 | 0.1 / 0.1 | 0.6 / 22.6 | 152.6 / 67.3 |
| 44 | 0 | 21.4 / 27.2 | 10.2 / 10.1 | 0.2 / 0.2 | 30.9 / 167.1 | 73.8 / 218.4 |
| 44 | 2 | 42.5 / 46.1 | 9.6 / 10.3 | 0.0 / 0.5 | 22.1 / 188.7 | 84.7 / 261.3 |


The slower hull 44 appearances coincide with longer unlighting phase latency,
including worker/queue wait. Hull 49 stage 2 also has longer alignment latency.
These small samples show the responsiveness/latency tradeoff; they do not prove
that every cold load improved.

The isolated full-preparation probe has no world simulation or ordinary drawing.
The final matched profiles use instrumentation version2, which forwards resumed
iterator values and exceptions. Both use harness SHA-256
`7b333a5418a9a7e3a2cc24391ff50020bdf46f7029f2e19069fe1f76890a8726`.
Earlier isolated profiles are excluded because their wrapper discarded worker
pixels and forced an unnecessary main-thread fallback.

First asset availability, full optional readiness and native/queue work are separate
measurements. Entries below are **before / after**, in milliseconds:

| Hull | Stage | First asset | Full optional ready wall | Worst queue slice | Worst native call | After worst queue step |
|---|---:|---:|---:|---:|---:|---:|
| 35 | 0 | 30.3 / 38.4 | 1458.0 / 1316.2 | 15.3 / 2.8 | 12.2 / 2.0 | 2.1 |
| 35 | 2 | 39.6 / 58.2 | 1559.2 / 1321.9 | 7.1 / 5.3 | 5.0 / 4.2 | 4.3 |
| 49 | 0 | 20.2 / 50.1 | 1742.4 / 1299.3 | 7.3 / 6.0 | 4.5 / 4.8 | 4.9 |
| 49 | 2 | 30.9 / 28.1 | 1612.0 / 1222.9 | 6.0 / 4.0 | 4.6 / 3.2 | 3.3 |
| 59 | 0 | 21.5 / 19.4 | 31.2 / 44.8 | 0.0 / 0.6 | 0.1 / 0.1 | 0.3 |
| 59 | 2 | 18.4 / 18.1 | 45.4 / 35.5 | 0.0 / 0.7 | 0.1 / 0.1 | 0.3 |
| 44 | 0 | 84.7 / 80.4 | 1767.8 / 1994.3 | 9.1 / 3.2 | 44.1 / 1.9 | 2.1 |
| 44 | 2 | 30.3 / 81.7 | 2062.8 / 1989.1 | 10.5 / 3.0 | 8.9 / 0.7 | 1.2 |
| 55 | 0 | 19.2 / 18.5 | 156.9 / 613.7 | 7.6 / 35.1 | 7.4 / 33.2 | 33.3 |
| 55 | 2 | 20.3 / 22.1 | 160.9 / 570.6 | 10.6 / 5.9 | 9.6 / 4.6 | 4.6 |
| 50 | 0 | 27.4 / 41.6 | 131.2 / 665.3 | 5.3 / 4.5 | 4.6 / 3.8 | 3.8 |
| 50 | 2 | 37.3 / 48.9 | 147.9 / 789.9 | 4.6 / 5.0 | 4.1 / 4.0 | 4.0 |


All twelve explicit preparation probes reached complete optional readiness with
no failed, queued or waiting tasks. Hull 44 delivered all four worker reads in each
case, with no invalid resumes or subsequent main-thread unlighting reads. Its
worker compute maxima were31.8/9.6ms; Promise wait maxima45.9/21.1ms are elapsed
latency, not main-thread blocking. Staging peaked at9,271,296 bytes under the
16 MiB bound and drained completely.

The worst measured queue slice regressed15.3 to 35.1 ms. The worst individual
native API call improved44.1 to 33.2 ms; the baseline included one 60 ms long task,
while the after preparation probes recorded none above 50 ms. The remaining33.2 ms
read occurs in ordinary fragment preparation on a 313x512 surface: each stripe
contains at most 4,096 pixels (313x13 here). The browser cannot yield within a
native pixel read, so even these bounded transfers can stall. This is not a
worker fallback. The previously reported139 ms slice was not reproduced on this
fresh baseline and is not used as a before measurement. Optional wall duration
can increase substantially for biological hulls. It is not a whole-game freeze;
explicit full-readiness callers still wait for the actual fragments and wrecks.

### Warm gameplay and browser traces

All pairs are **before / after** unless specified. Three sequential 20-second requested windows per scenario, raw intervals pooled. Literal thresholds >33/>50 ms. Fractions divide threshold counts by delivered animation callbacks; game artwork paint calls are separate from CDP compositor presents.

| Scenario | FPS | Median interval | P95 | P99 | Worst | >33ms count (fraction) | >50ms count (fraction) |
|---|---:|---:|---:|---:|---:|---|---|
| flight | 26.44 / 56.33 | 33.3 / 16.7 | 99.9 / 33.3 | 133.3 / 33.5 | 168.3 / 50.1 | 1281 (80.7%) / 191 (5.6%) | 170 (10.7%) / 7 (0.2%) |
| crowdedFlight | 6.26 / 19.72 | 166.5 / 50.0 | 216.8 / 66.8 | 283.3 / 83.3 | 400.1 / 83.5 | 375 (99.7%) / 1147 (96.9%) | 371 (98.7%) / 458 (38.7%) |
| crowdedCombat | 6.27 / 28.63 | 133.2 / 33.3 | 466.6 / 66.7 | 516.8 / 116.7 | 533.3 / 166.7 | 374 (99.2%) / 1049 (61.0%) | 327 (86.7%) / 251 (14.6%) |
| miningDebris | 2.88 / 33.53 | 316.7 / 16.8 | 650.1 / 66.7 | 766.4 / 100.0 | 866.5 / 133.3 | 172 (99.4%) / 873 (43.4%) | 170 (98.3%) / 259 (12.9%) |
| warp | 39.70 / 44.74 | 16.7 / 16.7 | 50.1 / 50.0 | 116.7 / 66.8 | 200.0 / 133.3 | 726 (30.5%) / 611 (22.7%) | 142 (6.0%) / 105 (3.9%) |
| devMap | 60.00 / 60.01 | 16.7 / 16.7 | 16.9 / 16.8 | 16.9 / 17.1 | 24.0 / 21.4 | 0 (0.0%) / 0 (0.0%) | 0 (0.0%) / 0 (0.0%) |

| Scenario | Sim mean / P95 before | Sim mean / P95 after | Drawing mean / P95 before | Drawing mean / P95 after |
|---|---:|---:|---:|---:|
| flight | 4.16 / 11.0 | 1.81 / 4.6 | 7.05 / 20.8 | 2.95 / 4.6 |
| crowdedFlight | 14.61 / 24.6 | 2.85 / 6.9 | 37.22 / 57.8 | 5.86 / 9.3 |
| crowdedCombat | 124.77 / 412.2 | 5.72 / 12.3 | 22.68 / 48.3 | 5.21 / 9.0 |
| miningDebris | 306.07 / 624.6 | 3.39 / 9.5 | 29.17 / 48.0 | 4.66 / 10.0 |
| warp | 2.68 / 7.5 | 2.49 / 6.6 | 5.85 / 16.1 | 4.20 / 8.0 |
| devMap | 2.34 / 6.2 | 2.23 / 6.3 | 1.58 / 2.5 | 1.45 / 2.0 |

Even normalized by integrated physics substeps, simulation CPU falls from 14.85 to 2.24 ms/substep in combat and 23.11 to 1.49 ms/substep in mining. These are total simulation CPU divided by required substeps, including associated controller work. Higher callback frequency alone does not explain this reduction.

Drawing is JavaScript game draw time. It excludes asynchronous GPU/raster/compositor execution and must not be treated as full presentation cost.

| Scenario | Actual wall s | Sim progress s | Substeps | Accepted shots | Artwork paints | End combatants before -> after (runs 1/2/3) |
|---|---:|---:|---:|---:|---:|---|
| flight | 60.056 / 60.038 | 60.030 / 60.030 | 4,278 / 5,550 | 0 / 0 | 2,765 / 7,590 | 0 / 0 / 0 -> 0 / 0 / 0 |
| crowdedFlight | 60.058 / 60.050 | 59.564 / 60.013 | 3,728 / 4,025 | 0 / 0 | 6,039 / 19,047 | 0 / 0 / 0 -> 0 / 0 / 0 |
| crowdedCombat | 60.123 / 60.038 | 50.748 / 60.113 | 3,167 / 4,385 | 243 / 293 | 3,397 / 14,096 | 6 / 8 / 7 -> 6 / 6 / 7 |
| miningDebris | 60.157 / 60.044 | 37.866 / 60.046 | 2,291 / 4,587 | 0 / 0 | 1,337 / 8,740 | 0 / 0 / 0 -> 0 / 0 / 0 |
| warp | 60.051 / 60.029 | 60.013 / 60.013 | 4,807 / 5,018 | 0 / 0 | 5,405 / 6,595 | 0 / 0 / 0 -> 0 / 0 / 0 |
| devMap | 60.048 / 60.057 | 60.047 / 60.063 | 5,589 / 5,648 | 0 / 0 | 0 / 0 | 0 / 0 / 0 -> 0 / 0 / 0 |

All 36 windows preserve the172-record population and162 surviving civilians. Final active-combatant counts are endpoint snapshots, not total participants. After combat advances60.0 simulation seconds instead of50.7 and accepts more shots; mining advances60.0 instead of37.9. These dynamics differ because the discarded elapsed-time cap was removed. Do not attribute all FPS changes to one algorithm or compare raw exact-test totals without workload normalization.

| Scenario | Canvas allocations | Sprite/effect rebuilds | Compositions | Lighting updates/misses | Shared visual-cache evictions |
|---|---:|---:|---:|---:|---:|
| flight | 5,637 / 183 | 2,364 / 4,671 | 2,731 / 7,066 | 2,149 / 5,340 | 2,766 / 0 |
| crowdedFlight | 22,564 / 132 | 2,178 / 6,484 | 6,037 / 19,031 | 5,954 / 18,769 | 11,396 / 0 |
| crowdedCombat | 11,381 / 2,969 | 1,677 / 5,917 | 3,394 / 13,792 | 3,078 / 11,904 | 5,333 / 0 |
| miningDebris | 5,492 / 341 | 732 / 4,513 | 1,330 / 8,533 | 1,155 / 6,844 | 2,653 / 0 |
| warp | 7,110 / 257 | 3,726 / 4,312 | 5,107 / 6,187 | 2,778 / 3,553 | 3,458 / 0 |
| devMap | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |

All 36 windows record zero OffscreenCanvas constructions in the timed game realm. Worker-side canvas construction is not covered by that main-realm counter. More delivered callbacks produce more animation/light work, so an increased raw rebuild total is not a cache invalidation regression by itself. All after sprite-cache evictions are 0; limits remain bounded, not increased.

| Scenario | Full scenes B/A | Asteroid geometry builds B/A | Effective-stat builds B/A | Tactical update calls B/A | After actual decisions/reuses | After exact beam/projectile/debris/asteroid candidates |
|---|---|---|---|---|---|---|
| flight | N/A / N/A | N/A / N/A | N/A / N/A | N/A / N/A | N/A / N/A | N/A / N/A / N/A / 2,634 |
| crowdedFlight | N/A / N/A | N/A / N/A | N/A / N/A | N/A / N/A | N/A / N/A | N/A / N/A / N/A / 2,069 |
| crowdedCombat | 31,828 / 226 | N/A / 1,914 | N/A / N/A | 28,352 / 37,570 | 12,796 / 24,810 | 5,258 / 10,136 / 6,437 / 2,137 |
| miningDebris | 2,237 / 1,194 | N/A / 1,911 | N/A / N/A | N/A / N/A | N/A / N/A | N/A / N/A / 1,289 / 1,512 |
| warp | N/A / N/A | N/A / N/A | N/A / N/A | N/A / N/A | N/A / N/A | N/A / N/A / N/A / 2,288 |
| devMap | N/A / N/A | N/A / N/A | N/A / 27 | N/A / N/A | N/A / N/A | N/A / N/A / N/A / 2,771 |

N/A means the counter was absent from the saved clean-window aggregate, not that old code did zero work. Baseline has no instrumented geometry/effective-stat/exact-candidate counters. Exact candidate diagnostics for both revisions are in separate matched traces. After scene collections still occur for legitimate full-scene consumers/pressure-wave visuals; unchanged geometry is reused.

| Scenario | After broadphase queries | After broadphase object visits | After once-per-step motion-summary visits |
|---|---:|---:|---:|
| flight | 152,590 | 124,394 | 1,811 |
| crowdedFlight | 132,143 | 170,039 | 306 |
| crowdedCombat | 230,907 | 1,043,819 | 8,248 |
| miningDebris | 180,535 | 188,747 | 4,051 |
| warp | 137,738 | 108,328 | 1,630 |
| devMap | 155,420 | 125,471 | 1,702 |



Per-window FPS, before / after; all windows retain the same population:

| Scenario | Before runs 1/2/3 | After runs 1/2/3 |
|---|---:|---:|
| flight | 26.68 / 27.58 / 25.07 | 57.10 / 56.27 / 55.62 |
| crowdedFlight | 6.39 / 5.79 / 6.59 | 20.23 / 19.33 / 19.59 |
| crowdedCombat | 9.14 / 4.63 / 5.04 | 27.34 / 35.72 / 22.84 |
| miningDebris | 3.60 / 2.64 / 2.39 | 25.33 / 37.12 / 38.13 |
| warp | 28.13 / 43.47 / 47.49 | 47.93 / 48.88 / 37.42 |
| devMap | 59.98 / 60.02 / 60.00 | 60.03 / 60.01 / 59.99 |

These clean runs still miss consistent 60 FPS everywhere except the Dev map.
Crowded flight, combat and debris have large remaining presentation intervals;
ordinary flight is close to 60 FPS but still drops frames. After combat and mining
advance more simulation time while retaining all 162 civilian records. Combat
accepts 293 shots rather than 243, and final combatants differ 6/8/7 to 6/6/7.
Neither a reduced population nor fewer accepted shots explains the improvement.
Raw slow-frame counts can rise when many more frames are delivered; fractions
and the complete distributions above show that distinction.

All after preparation work counters remained unchanged during the timed warm
windows: preparation slices belong to the separate cold/isolated measurements.
One after mining window recorded a >50ms long task. Canvas construction counters
cover main-realm canvases, not browser internals or worker-private surfaces.
They do not measure every JavaScript heap allocation. Shared cache limits remain
4 million sprite pixels,1 million lighting pixels and4 million lamp pixels.

### Browser presentation, rasterization and garbage collection

Completed matched pairs:6/6. Requested 8 seconds, separate heavy CDP+CPU-sampled diagnostics; these are not the clean 20-second FPS windows. Pairs are **before / after**. Legacy v1 results with empty frame recordings are excluded.

| Scenario | Actual trace wall s | Headless presents | Mean present interval ms | Worst interval ms | Max-thread GC union ms | Max-thread callback union ms |
|---|---:|---:|---:|---:|---:|---:|
| flight | 8.021 / 8.026 | 308 / 419 | 26.0 / 19.1 | 124.7 / 89.8 | 136.7 / 76.8 | 2,974.2 / 2,906.8 |
| crowdedFlight | 8.021 / 8.027 | 109 / 148 | 73.7 / 54.6 | 193.5 / 76.6 | 237.9 / 48.6 | 2,691.6 / 2,151.9 |
| crowdedCombat | 8.031 / 8.020 | 143 / 163 | 56.4 / 49.1 | 176.9 / 233.5 | 316.6 / 123.9 | 5,700.3 / 3,014.9 |
| miningDebris | 8.045 / 8.021 | 259 / 325 | 31.1 / 24.7 | 93.4 / 72.1 | 208.1 / 68.5 | 3,169.6 / 2,638.2 |
| warp | 8.041 / 8.017 | 283 / 399 | 28.4 / 20.1 | 132.1 / 72.4 | 186.4 / 78.0 | 3,374.1 / 2,895.9 |
| devMap | 8.025 / 8.024 | 453 / 453 | 17.7 / 17.7 | 27.5 / 26.3 | 77.1 / 68.6 | 1,622.6 / 1,632.4 |

| Scenario | Max-thread compositor union ms | RasterTask union ms (captured) | GPU-service union ms (% window) | Native raster-flush union ms (inside GPU service) |
|---|---:|---:|---|---|
| flight | 149.1 / 175.9 | N/A / N/A | 7,480.9 (93.3%) / 7,335.3 (91.4%) | 5,503.4 / 5,614.6 |
| crowdedFlight | 43.6 / 65.3 | N/A / N/A | 7,684.5 (95.8%) / 7,938.6 (98.9%) | 5,902.7 / 6,677.6 |
| crowdedCombat | 49.8 / 59.0 | 0.8 / 1.1 | 7,670.7 (95.5%) / 7,866.9 (98.1%) | 5,649.7 / 6,071.7 |
| miningDebris | 86.1 / 118.9 | N/A / N/A | 7,771.0 (96.6%) / 7,891.5 (98.4%) | 5,874.6 / 6,229.4 |
| warp | 137.8 / 148.9 | N/A / N/A | 7,700.2 (95.8%) / 7,426.4 (92.6%) | 5,725.6 / 5,764.9 |
| devMap | 155.4 / 161.5 | 2.0 / 1.8 | 1,135.8 (14.2%) / 1,155.6 (14.4%) | 734.1 / 752.9 |

These are clipped union durations per family on the most-active single thread. Do not sum categories/threads or parent/child events. RasterTask absence means unavailable attribution, not no rasterization. GPU-service wall includes driver/raster flush/fence waiting and is not a hardware GPU execution timer. Native raster-flush is a subset of service work, not additional cost; N/A means that name was absent from the saved top 40 event summary. Headless Display::DrawAndSwap is compositor delivery, not monitor scanout.

| Scenario | Sim seconds | Recorded frames | Physical substeps | Accepted shots | Fragment owner queries | Shot-owner advances | End combatants |
|---|---:|---:|---:|---:|---:|---:|---|
| flight | 8.2163 / 8.1331 | 310 / 420 | 651 / 722 | 0 / 0 | 0 / 0 | 651 / 722 | 0 / 0 |
| crowdedFlight | 8.0997 / 8.0996 | 110 / 148 | 535 / 545 | 0 / 0 | 0 / 0 | 535 / 545 | 0 / 0 |
| crowdedCombat | 8.0996 / 8.0830 | 144 / 165 | 543 / 556 | 38 / 37 | 6,415 / 7,402 | 543 / 556 | 6 / 7 |
| miningDebris | 8.1327 / 8.1328 | 259 / 326 | 606 / 649 | 0 / 0 | 880 / 836 | 606 / 649 | 0 / 0 |
| warp | 8.1329 / 8.1329 | 284 / 401 | 628 / 701 | 0 / 0 | 0 / 0 | 628 / 701 | 0 / 0 |
| devMap | 8.1523 / 8.0255 | 453 / 453 | 911 / 906 | 0 / 0 | 0 / 0 | 911 / 906 | 0 / 0 |

All 12 trace windows retain 172 records and 162 surviving civilians; endpoint combatants are snapshots, not total participants. Fragment queries and shot advances are owner-call denominators, not distinct impacts or accepted shots.

| Scenario | Exact weapon candidates | Per shot-owner advance | Exact debris candidates | Per fragment owner query | Public scene calls | Actual full scene collections |
|---|---:|---:|---:|---:|---:|---|
| flight | 0 / 0 | 0.000 / 0.000 | 0 / 0 | N/A / N/A | 0 / 0 | N/A / N/A |
| crowdedFlight | 0 / 0 | 0.000 / 0.000 | 0 / 0 | N/A / N/A | 0 / 0 | N/A / N/A |
| crowdedCombat | 402,744 / 1,421 | 741.702 / 2.556 | 4,283,310 / 1,303 | 667.702 / 0.176 | 14,520 / 55 | 6,525 / 55 |
| miningDebris | 0 / 0 | 0.000 / 0.000 | 579,920 / 0 | 659.000 / 0.000 | 368 / 391 | 328 / 357 |
| warp | 0 / 0 | 0.000 / 0.000 | 0 / 0 | N/A / N/A | 0 / 0 | N/A / N/A |
| devMap | 0 / 0 | 0.000 / 0.000 | 0 / 0 | N/A / N/A | 0 / 0 | N/A / N/A |

Baseline diagnostic-only injection counts both instantaneous beam and projectile exact weapon tests. The current comparison combines beamCandidates+projectileCandidates into the same neutral weapon total. The counters do not replace collision or damage logic. Broadphase object visits are distinct from exact candidates. In the short mining trace, after 836 fragment queries admitted 96 spatial rock candidates but no eligible exact blocker; zero exact tests there proves elimination of irrelevant work, not actual contact/damage. Combat and correctness regressions cover actual interceptions/physical fragment consequences.

| Scenario | Game artwork paints | Main canvas allocations | Sprite/effect rebuilds | Cache evictions |
|---|---:|---:|---:|---:|
| flight | 925 / 1,610 | 2,361 / 44 | 613 / 762 | 863 / 0 |
| crowdedFlight | 1,926 / 2,587 | 5,890 / 0 | 710 / 896 | 2,655 / 0 |
| crowdedCombat | 1,773 / 1,974 | 5,139 / 628 | 689 / 787 | 2,042 / 0 |
| miningDebris | 2,262 / 2,811 | 4,408 / 24 | 847 / 910 | 1,865 / 0 |
| warp | 1,509 / 2,186 | 2,771 / 80 | 697 / 875 | 1,050 / 0 |
| devMap | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |

Game paints are successful draw calls, not headless compositor frames. Canvas counts are main-realm document allocations; worker allocations are separate.

| Scenario/revision | Top leaf self samples (ms), excluding idle/program |
|---|---|
| flight/before | drawImage 1128.9; (garbage collector) 144.7; getContext 75.7; native-radar.js paint 73.6; native-game.js draw 71.3; getBoundingClientRect 56.2 |
| flight/after | drawImage 956.7; native-game.js draw 121.2; (garbage collector) 78.9; native-radar.js paint 71.2; save 57.6; getBoundingClientRect 55.2 |
| crowdedFlight/before | drawImage 1572.6; (garbage collector) 249.1; getContext 128.6; ship-sprite-cache.js drawLamp 96.4; ship-traffic.js collide 35.3; ship-traffic.js descriptor 29.1 |
| crowdedFlight/after | drawImage 1027.8; native-game.js draw 52.9; ship-sprite-cache.js drawLamp 49.2; (garbage collector) 45.2; ship-traffic.js collide 37.1; ship-traffic.js descriptor 32.8 |
| crowdedCombat/before | drawImage 1194.9; ship-systems.js scene 588.3; (garbage collector) 340.5; ship-systems.js  234.0; asteroid-motion.js physical 231.3; ship-systems.js collect 152.2 |
| crowdedCombat/after | drawImage 786.4; ship-systems.js query 316.8; (garbage collector) 134.3; civilian-traffic.js steeringScene 82.7; sol-asteroids.js queryBounds 51.7; ship-traffic.js descriptor 48.8 |
| miningDebris/before | drawImage 1584.1; (garbage collector) 198.1; getContext 71.1; native-game.js draw 65.0; ship-sprite-cache.js drawLamp 64.8; native-radar.js paint 55.5 |
| miningDebris/after | drawImage 1120.1; (garbage collector) 64.9; native-game.js draw 64.7; native-radar.js paint 60.7; fillRect 46.5; ship-systems.js  35.1 |
| warp/before | drawImage 1663.4; (garbage collector) 184.2; native-game.js draw 87.4; getContext 86.8; native-radar.js paint 75.6; ship-sprite-cache.js drawLamp 63.4 |
| warp/after | drawImage 1178.8; native-radar.js paint 83.0; native-game.js draw 79.8; (garbage collector) 76.8; getBoundingClientRect 49.3; fill 43.3 |
| devMap/before | dev-galaxy-view.js paint 129.2; (garbage collector) 76.1; getBoundingClientRect 74.2; measureText 67.0; fillText 55.6; strokeText 48.4 |
| devMap/after | dev-galaxy-view.js paint 130.4; getBoundingClientRect 85.7; (garbage collector) 74.3; measureText 55.6; fillText 54.7; ship-traffic.js collide 52.3 |

Leaf samples are clipped CPU self time; no parent/child sums. Sampling/native blocking and idle labels need trace context. Saving uses the separately held-fire 8-second pair; those windows additionally hold Space and are not interchangeable with the six ordinary scenarios.

## Diagnostic integrity

- All 12scenario windows use harness `81124d81a7fa3a397a2c04d4039b9eeb9887b0a09930528f6b8a0e757df7bef0` and fixture `2211a641b0d0f8f6cd686b9c956658cfd2cdf9566b5c256c823b56a444718d01`; same Edge 155.0.4283.62/1280x850; no JS errors.
- Nonempty recorded frames and positive substeps asserted in every window. After exact owner counters are populated; baseline in-memory diagnostic injection only adds counts.
- Each diagnostic source-hash set agrees with its corresponding clean warm runtime snapshot. Before source is `665e553`; after source is `0a7b062`. The Python diagnostic edits changed no runtime source.


### Separate sustained-fire saving probe

Each revision receives eight seconds of held Space in the same combat fixture,
with heavy diagnostics enabled. The save implementation is unchanged. These
figures are separate from unheld combat traces and clean 20-second windows.

| Revision | Actual player hits | Accepted shots | Verified saves | Failed saves | Total mean/P95/worst ms | Serialization mean/worst ms | Storage mean/worst ms | Verification read mean/worst ms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| baseline-save-v2 | 13 | 37 | 11 | 0 | 3.745 / 5.800 / 6.200 | 2.200 / 4.500 | 1.182 / 2.100 | 0.136 / 0.300 |
| after-save-v2 | 13 | 36 | 10 | 0 | 4.810 / 5.400 / 6.000 | 2.900 / 3.800 | 1.360 / 1.700 | 0.170 / 0.300 |


Both runs record 13 actual player hits, all 172 population records,162 surviving
civilians and seven final active combatants. Baseline/current recorded 144/168
animation callbacks,547/552 substeps and8.1498/8.1496 simulation seconds. Total
verified-save CPU was 41.2/48.1 ms.11 versus 10 writes reflects observed checkpoint
phasing, not a new save policy. The mean after cost is higher: no save speedup is
claimed. Serialization, storage and verification are nested in save total and
must not be added again to frame or trace timers. Existing combat coalescing,
immediate durable transactions, mode separation, verified writes, honest
failures and bounded retries remain intact.

### Additional required NPC timing check

The older `browser-npc-performance.py` also passed its before/after population,
viewport, browser and initial-save checks. It uses shorter six-second windows,
a two-second warm-up and a single evolving page for flight followed by the map,
so it is not interchangeable with the fresh-context three-window comparison.
Its results are mixed and are retained here:

| Mode | Simulation mean ms | Drawing mean ms | Callback mean ms | P95 interval ms | >50ms count |
|---|---:|---:|---:|---:|---:|
| flight | 1.158 / 1.201 | 5.772 / 4.264 | 6.930 / 5.465 | 35.5 / 18.6 | 4 / 0 |
| devMap | 1.685 / 2.247 | 1.223 / 1.518 | 2.908 / 3.766 | 18.2 / 18.1 | 0 / 1 |

The short map CPU sample regresses, although P95 frame delivery remains close;
these checks do not demonstrate a universal simulation-speed improvement. The
longer repeated table remains the primary comparison.

```powershell
Copy-Item test-results/performance-review/initial-save.json test-results/npc-performance-initial-save.json
python tests/browser-npc-performance.py --revision 665e553ee37cad55a4d0e80461b5fdcb55a02e9e --label before
python tests/browser-npc-performance.py --label after
```

## Correctness verification

The fresh baseline passed 338 Node tests and all 24 existing browser suites. The
implementation passed 388 Node tests (zero skips, 112.8 seconds) and all 26 browser
suites, including every regression introduced in `665e553`. The eight local-site
and sync unit tests passed again after the implementation commit. The Node/browser runs
preceded the implementation commit; their saved runtime hashes match all 168
JavaScript files in the measured `0a7b062` tree. Passing these checks proves their
assertions, not smooth gameplay.

| Area | Evidence and actual assertions |
|---|---|
| Shared geometry/current poses | `shared-spatial-scene.test.cjs` (8cases): repeated moving actors preserve unchanged asteroid geometry; ID/local queries avoid full-scene collection; custom repair-style resolvers update movement/damage; offscreen rocks stay lazy; swept/forecast/crossing/rotating bounds retain candidates; completed-step state invalidates on actual mutations; shield damage and fitting/upgrades update surfaces/statistics. |
| Conservative collision narrowing | `swept-collision-search.test.cjs` (19cases): distant objects avoid exact tests; beams retain tiny launch blockers, fast crossing ships/current rotating hulls, moved/forecast rocks and >1000-unit sweeps; asteroid insert/remove/same-length replacement and explicit invalidation reconcile the same index; save switches reset old motion; retained angle snapshots stay immutable. A1000-distant-mover fixture proves queries do not rescan all movers. |
| Physical debris | The same swept suite checks actual reflection, knockback, exactly-once quarter-health damage and a fragment returning to its parent after birth immunity ends; existing environmental-impact/asteroid-physics/30-minute production fixtures check the environmental floor, offscreen motion/chains and material consequences. No rendering-based damage is accepted. |
| Required catch-up and crew intent | `tactical-cadence.test.cjs` (3cases): every physics substep integrates; cached intent is bounded and reacts immediately to damage/fitting; prepared actors remain current for awareness/avoidance; active elapsed time is retained while pause/hidden gates freeze it. `browser-spatial-performance.py` drives the real host-frame advance/draw path:735ms produces45physical substeps, not capped time; thirty actor refreshes retain one scene/unchanged rocks. |
| Durable restored state | `browser-spatial-performance.py` writes through the verified save owner, resumes and compares civilian identities/jobs/cargo/credits/equipment, reservations, player equipment/cargo/contracts, simulation clock, weapon events and transactions. Existing `combat-save.test.cjs`, unified-equipment, NPC-life/economy and browser suites cover mode separation, legacy schema, owned cooldowns, immediate durable transactions, failed/silent writes and bounded retries. |
| Incremental pixels/readback owner | `damage-art-preparation.test.cjs` checks one bounded queue,4096-pixel transfers reconstructing exact channels, foreground priority without starvation,64suspended tasks resuming values/errors once, explicit fragment/wreck readiness and failed-worker fallback. `ship-art-readback.test.cjs` (9cases) checks lazy single worker, pixel/request/byte admission, authoritative RGBA, timeout/dispose, late bitmap closure, unsupported capabilities, malformed responses and observable errors. |
| Lamp/lighting quality and bounded caches | `ship-sprite-cache.test.cjs` retains independent20Hz healthy-NPC/60Hz player-damaged-warp sampling, heading-sensitive relighting without animation rebuild, bounded cache churn and surface reuse, all17lamp phases, exact blur changes at equal dimensions. `browser-incremental-art.py` compares612painted lamp cases against frozen 665 kernels over integer/fractional scales, biological mask canvases, fallback unlighting and the final rendered gallery; it also exercises real worker admission/failure/disposal and explicit optional readiness. `browser-ship-lighting.py` checks120paused heading changes, returned-heading pixel equality, changed light,20/60cadence and visible damage plates at four headings. |
| Current-damage-first loading remains intact | Existing `ship-effects.test.cjs`, `flight-assets-cache.test.cjs` and `browser-cold-ship-loading.py` check deduplicated appearance/optional requests, current plate admitted first, promotion ahead of unused plates, valid same-hull art while a request is held/fails, cleared wrong-hull artwork and ignored late completion after switching back. Rendering cannot apply health changes, replay explosions or grant resources. |
| Collision coasting, fractional settlement, owned drones | Existing665 `review-gameplay.test.cjs` and `browser-review-gameplay.py` check world momentum under collision spin, pure braking, fractional Olympic reserve/unload conservation, saved fixed funded price, rejected deficient treasury, floating subtraction residues, exactly-once reload, six-to-one-to-six fitting with the same drone IDs/hull17/readyAt123. The new `ship-repairs.test.cjs` terminal-Dot case additionally proves the last stowed drone disappears from same-clock physical cached views while its owned condition, deadline, supplies, cargo and money remain correct. |
| Existing beam correctness/parity | All26 `beam-targeting.test.cjs` cases and actual browser beam/contact suites remain required and passed: ahead/side/rear, current delayed aim, near rotating shield surface, shield collapse/hull, physical ship/rock blockers crossing before resolution, preview/render consistency, save/pause and one damage application, shared upgraded player/NPC recharge. |


Required checks actually run, from the recorded command lists:

```powershell
$nodeCases = @(rg --files tests -g '*.test.cjs' -g '*.test.js')
node --test $nodeCases
python -m unittest discover -s tests -p test_local_site.py -v
python tests/browser-smoke.py
python tests/browser-ship-contract.py
python tests/browser-beam-targeting.py
python tests/browser-civilian-tactics.py
python tests/browser-combat-controls.py
python tests/browser-ship-lighting.py
python tests/browser-incremental-art.py
python tests/browser-spatial-performance.py
python tests/browser-cold-ship-loading.py
python tests/browser-review-gameplay.py
python tests/browser-ship-presentation.py
python tests/browser-setup-preview.py
python tests/browser-unified-equipment.py
python tests/browser-asteroid-physics.py
python tests/browser-ship-traffic.py
python tests/browser-impact-controls.py
python tests/browser-npc-lives.py
python tests/browser-ship-repairs.py
python tests/browser-earth-jam.py
python tests/browser-galaxy-controls.py
python tests/browser-regional-mining.py
python tests/browser-deuranium-mining.py
python tests/browser-ore-performance.py --label ci
python tests/browser-civilian-access.py
python tests/browser-render-paths.py --visual-only --label ci
python tests/browser-stability.py --label ci
```

## Checkout preservation and local preview

The isolated implementation checkout is
`C:\Users\alphi\Vexed-Mirror-Performance-Fix`. The baseline checkout
`C:\Users\alphi\Vexed-Mirror-Render-Fix` remains at `665e553`. The original
`C:\Users\alphi\Vexed-Mirror-Port-GitHub` remains on its existing
`staged-main` branch at `ea40ff5b55c19fbab21d87d03bccdbbcc0f55e9f`; its dirty
work was preserved, including concurrent menu edits made during the review.
No stash, reset or source overwrite was used there. Existing saves are untouched.

The fixed serve-only preview is
`http://127.0.0.1:7792/html-games/broken-mirror-port/`.
It serves the implementation worktree directly and has no automatic Git sync.
Port 7790 continues serving the original dirty checkout; 7791 serves the `665e553`
baseline. Those older servers were not redirected. A final actual browser smoke test against
7792 passed. HTTP bytes for the active entry point and seven shared/runtime files
match this worktree, as recorded in the local
`test-results/performance-review/final-source-and-preview-proof.json`.

The final preservation check found no missing captured files:61 of 63 original
files remain byte-identical. The original workflow and active index changed
concurrently outside this task; those edits and newly added untracked work remain
in place. The baseline worktree remains clean. Remote main was fetched again and
still pointed at `665e553` immediately before publication.

## Matching visual evidence

Actual-source galleries are available locally at:

- `test-results/art-preparation/baseline-final-v2-actual-checkout-gallery.png`
- `test-results/art-preparation/after-final-v2-actual-checkout-gallery.png`

They render each complete served checkout, including its own preparation and
lighting code, with the same eighteen hull/stage/pose/light samples. Galaxy (35), Galaxy Dreadnaught (49),
Olympic (58), Sentient Lifeform (50), C'Thia (59) and Alien Bioship (55) appear
at damage stages 0, 2 and 3. Image comparison finds
one blue-channel value at one pixel differing by 1; alpha matches exactly.
Lighting direction, ship proportions and damage alignment remain visually
consistent. This actual-checkout comparison is separate from the 612 lamp cases
against frozen 665 kernels and 51 exact biological-canvas comparisons.

The preserved rearward beam/shield gameplay checks also produced:

- `test-results/beam-targeting/native-rearward-gameplay.png`
- `test-results/beam-targeting/rotated-shield-contact.png`

Gameplay screenshots for each warm scenario and actual cold-loading cases
are beside their JSON artifacts under `test-results/performance-review/`.
Screenshots, traces, profiles and fixture saves remain ignored generated files;
they are deliberately excluded from tracked source. They are not ZIP deliveries.

## Remaining limits and unrun experiments

- Consistent 60 FPS is not achieved in flight/combat/debris/warp on this machine.
  After warm worst intervals remain 50.1 ms ordinary, 83.5 ms crowded flight,
  166.7ms combat and 133.3 ms mining/warp. Heavy traced combat has a 233.5 ms
  presentation interval; its mean improves while its worst regresses. These are
  separate workloads and cannot be substituted for one another.
- Three of eight cold appearance probes regress; optional biological preparation
  can take longer. A 35.1 ms queue slice remains, including a 33.2 ms native bounded
  pixel read. Neither all preparation steps nor all native drawing calls fit
  within a 16.7 ms frame budget. First correct cold artwork draw is measured;
  per-hull cold compositor-delivery timestamps were not captured.
- Inference from the after traces: native raster/flush/GPU-service work remains
  a major limit outside the JavaScript drawing timer. The trace does not directly
  measure hardware GPU execution or physical display latency. No software-GPU, discrete-NVIDIA, other-browser, other-hardware or
  physical-monitor performance comparison was run. The additional correctness
  checks below do compare Chromium software rasterization with Edge hardware
  rasterization; they are not frame-time benchmarks. OS scheduling and thermal/power conditions remain uncontrolled.
- Source/stat description calls and spatial queries still cost CPU. Large
  calendar/exceptionally fast swept queries can conservatively visit the full
  field, and pressure-wave visuals still legitimately request the cached scene.
  Exact projectile geometry retains the existing linear-motion/current-angle
  substep approximation; this change does not introduce a new continuous rotating
  polygon solver. Regression coverage verifies the supported moving/rotating
  blockers and unchanged damage mechanics.
- Canvas allocations, cache counters, owner-call counts and GC are recorded;
  complete JavaScript allocation bytes and browser-private graphics allocations
  were not sampled. New counters absent from the frozen baseline are reported
  as unavailable, never as invented zeros.
- The superseded `browser-render-review-performance.py` timing driver and
  `browser-stability.py --measure` mode were not duplicated. Their functional
  rendering/stability suites passed; the extended six-scenario driver provides
  the requested repeated timing comparison, as documented in AGENTS.md.

All required local correctness suites and the additional NPC timing comparison
were executed. The final containing commit also runs the repository CI workflow;
its publication hash and CI result are reported with delivery. Generated raw
profiles, screenshots, saves and diagnostics remain outside tracked source.

## CI raster-backend regression follow-up

The first remote run of `52efc0b` passed 388Node tests, 8 site tests and six browser
suites, then failed the new incremental-art pixel assertion; 19 later browser
suites were not run in that attempt. On Ubuntu Chromium the mean premultiplied
lamp error was 0.015025 against an area-dependent 0.01 gate, although the maximum
pointwise error was only 1.505882/255. This was investigated rather than retried
as a presumed transient failure.

The exact failure was reproduced locally in Playwright Chromium 153.0.8010.12.
All 612 cases were then collected in four configurations: Chromium default,
explicit SwiftShader, GPU-disabled CPU 2D, and Edge 155 hardware. Across all 2,448 cases:

- Maximum premultiplied channel error stays at or below 1.992157/255.
- Alpha error is at most 1/255, and alpha>=64 support bounds match exactly.
- Maximum alpha-centroid drift is 0.026932 device pixels.
- Software maximum padded mean error is 0.016533/255; Edge's is 0.004715/255.
  The padded mean changes with canvas area and native interpolation, so it is
  retained as diagnostic data instead of serving as the acceptance gate.

The corrected test keeps the original maximum premultiplied error bound of 2,
adds explicit alpha<=1, identical visible-support bounds and a 0.05 device-pixel
centroid bound. Actual fixture mutations must fail for a one-device-pixel shift,
wrong colour, wrong blur phase and missing glow. The full-gallery, biological
pixel, unlighting, worker-failure and readiness checks retain their existing
bounds. No rendering or gameplay code changes for this correction, so all
performance measurements still describe the same `0a7b062` runtime. The revised
test passed its complete suite in all four configurations: 612 lamps and four
mutation rejections per configuration, 51 biological canvases, unlighting,
worker/fallback/readiness and specialized egg/creature checks. Every full-gallery
comparison had a maximum channel difference of 1, under the unchanged bound of 2.
All four use test harness SHA-256
`bcc4828bef26bb92e072fe9c5fd120894c95209fc188da5b2a215320c399df37`.
The final containing commit receives a fresh full CI run before delivery.

Reproduce from PowerShell; Python sets the empty Chromium channel because an
empty PowerShell environment assignment removes the variable:

```powershell
$env:BROWSER_CHANNEL = 'msedge'
python tests/browser-incremental-art.py --label final-edge-hardware
python -c "import os,runpy; os.environ['BROWSER_CHANNEL']=''; runpy.run_path('tests/browser-incremental-art.py',run_name='__main__')" --label final-chromium-default
python -c "import os,runpy; os.environ['BROWSER_CHANNEL']=''; runpy.run_path('tests/browser-incremental-art.py',run_name='__main__')" --label final-chromium-swiftshader --swiftshader
python -c "import os,runpy; os.environ['BROWSER_CHANNEL']=''; runpy.run_path('tests/browser-incremental-art.py',run_name='__main__')" --label final-chromium-cpu --cpu
```

Per-backend metadata, all 612 rows, mutation results and matching images are under
`test-results/incremental-art/final-*/`. These are correctness checks, kept
separate from the Edge 155 hardware performance measurements.
