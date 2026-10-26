> The civilian combat verification is [below](#civilian-combat-and-held-controls-2026-10-20). Market/docking verification and its Linux browser comparison remain in [Earth traffic recovery](earth-traffic-recovery.md). Historical measurements retain their original revisions and device.

October 20 startup recovery adds `browser-startup-recovery.py` for actual
New/Launch and Continue in cold and cached isolated profiles. It records first
5/15/60-second frame windows, real W-input response, population/task phases,
long tasks, requests and artwork/scheduler diagnostics. New worlds use 45
seconds of real, conserved economic history prepared in a worker; Continue
retains its saved history. Normal ship visibility requests one current damage
plate. Optional destruction/fragments can use the same pixel algorithms in an
OffscreenCanvas worker, with the cooperative implementation as fallback.

`browser-startup-trace.py` separately captures decoding, raster, GPU and JS
diagnostics. Traced windows are excluded from the timing comparisons. The
existing repeated `browser-stability.py --measure` and same-save NPC benchmark
remain required to separate initial-world changes from CPU/frame-delivery
changes. No population reduction or reduced artwork quality is a performance
substitute. October 20 reports use `startup-ai-before`, `startup-ai-final` and
`startup-ai-brave` labels in `test-results`; the before source is the immutable
local archive described in the Desktop improvement notes.

`startup-ai-edge-final` repeats the final buffered-input build. A 200 ms flight
tap released during a stalled render is retained for one physics step; ordinary
held input keeps its existing behavior, and pause/menu/blur resets clear pending
edges. The real-key regression lives in `browser-impact-controls.py`. Base-plate
readiness and optional-damage readiness are distinct; explicit diagnostic
`effectsReady()` warm-up waits for the latter.

The full 172-ship comparisons retain the same save hash, browser and viewport.
Other checkout benchmarks overlapped some Windows frame measurements. Those raw
frame intervals do not establish an all-scenario FPS improvement. The Desktop
report separates repeated startup measurements, CPU sampling, cold first-frame
limits and contended frame delivery.

# Persistent life scheduling: measured verification

The stabilization pass starts from exact `c41559c`, reproduces the economy and
tactical-distance failures, and adds longer repeated flight/combat/mining/warp/map
measurements plus cold artwork probes. Its current results are recorded in
[stabilization verification](stabilization-results.md). The measurements below
remain the historical persistent-life comparison against `90998f0`; they are not
the stabilization baseline and do not establish an FPS improvement.

Measured on Windows, headless Microsoft Edge 155.0.4283.45, a 1280 × 850 viewport,
device pixel ratio 1, 16 reported hardware threads and 32 GB reported device memory.
Both revisions used the same saved population: 159 civilians, nine Sol freighters
and the player (169 total). The baseline is exact commit `90998f0`; the comparison
uses the persistent-life implementation. The serialized starting save SHA-256 is
`2878ea104bafcc6a9b05b4840dc776d750c5b8b701c78e005aad82bd1e9d36bb`.

The browser records six seconds of ordinary flight followed by six seconds of Dev
galaxy-map use. It warms artwork for two seconds after restoring the identical
starting save with simulation frozen, then releases it for measurement. The map
also receives two seconds of warmup. Both measurements run sequentially using the
same harness, browser and viewport. Timing instrumentation wraps actual owner
advance calls and the actual main animation callback; it does not replace game
simulation or disable distant lives.

| Measured mean per animation callback | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| Flight simulation | 1.807 ms | 0.526 ms | 70.9% |
| Flight rendering | 5.912 ms | 5.172 ms | 12.5% |
| Flight total callback | 7.719 ms | 5.699 ms | 26.2% |
| Dev-map simulation | 1.115 ms | 0.201 ms | 82.0% |
| Dev-map rendering | 1.268 ms | 1.094 ms | 13.7% |
| Dev-map total callback | 2.383 ms | 1.294 ms | 45.7% |

Mean distinct entities passed through frame-rate shared `step` steering fell from
78.75 to 3.14 in flight and 62.30 to 1.01 on the map. Economic local flight now
samples saved shared movement commands; its motion is still simulated, and this
count alone is not a count of all living ships. The new scheduler reported a peak
of 14 detailed ships during flight and 13 on the map. During the map's six-second
window it executed 183 distant updates and 164 scheduled events. Opening the map
produced zero ship-artwork preparation calls, zero unready artwork requests and
zero detailed ship-artwork draws. Nearby lives continued to progress normally.

## Spikes and remaining bottlenecks

| Frame/callback diagnostic | Before | After |
| --- | ---: | ---: |
| Flight P95 animation-frame interval | 65.7 ms | 72.7 ms |
| Flight intervals over 50 ms in the window | 35 | 38 |
| Flight maximum main callback | 166.2 ms | 10.6 ms |
| Map P95 animation-frame interval | 6.5 ms | 6.2 ms |
| Map intervals over 50 ms | 0 | 0 |
| Map maximum main callback | 14.6 ms | 16.4 ms |

The CPU scheduling improvement does **not** establish a corresponding FPS or
presentation-spike improvement. Ordinary flight still spends most callback time
on nearby Canvas artwork, scene drawing and effects; browser/GPU presentation
also contributes variance outside the JavaScript callback. Its measured P95 frame
interval and spike count worsened slightly in this pair. The map still enumerates
the population and rebuilds its individual list periodically; large future fleets
may need list virtualization and persistent marker indexes. Those costs are
bounded separately from detailed simulation and do not prepare remote artwork.

These short windows on one headless device are diagnostic evidence, not a long
campaign benchmark or a portable frame-rate guarantee. Nearby shaders, artwork
and collision/effect rendering retain the existing shared implementations; the
20 real-Canvas regression scenarios passed after the change.

## Reproduction and regression results

```sh
python tests/browser-npc-performance.py --revision 90998f0 --label before --seconds 6
python tests/browser-npc-performance.py --label after --seconds 6
node --test tests/*.test.cjs tests/*.test.js
python tests/browser-smoke.py
python tests/browser-ship-contract.py
python tests/browser-npc-lives.py
```

`--revision` serves tracked text from that exact Git revision while retaining the
unchanged binary artwork. The initial serialized fixture is reused under
`test-results/npc-performance-initial-save.json`. Use the same fixture and browser
for both runs. An optional `--base-url` measures an installed copy, and
`--regressions` also invokes the existing smoke and Canvas suites. Set
`BROWSER_CHANNEL` to an empty string for bundled Chromium in CI.

The final Node suite passed **100/100** tests (baseline **73/73**). The existing
browser smoke and 20-Canvas suite passed before and after migration. The new life
browser demonstration passed with zero JavaScript errors or failed requests:

* Named existing freighter loads real stock, travels, approaches, docks and pays
  for/receives payment on a delivery exactly once.
* Actual page reload and Continue preserve cargo, task, journey and owned recharge.
* Real host Canvas drawing and Dev-map positions agree during loading, transit
  and arrival; local inspection moves only the observer.
* The equivalent delivery completes while watched only through the map from
  elsewhere, with identical transaction and credit changes and no artwork draws.
* Interruption cleans reservations, disabling strands cargo, destruction records
  its loss, paid repair happens once, and common mining plus transport preserves
  resource entitlement and timing across pause/save restoration.

Raw before/after JSON, frame samples, comparison JSON, screenshots and browser
reports remain under the ignored `test-results` directory. CI uploads browser
reports as artifacts. The [life contract](npc-life-contract.md) records limits,
ownership, detail tolerances, calendar policy and future-role extension rules.

## Civilian combat and held controls (2026-10-20)

This pass starts from exact `01d5ea2`, which already contains the rearward beam,
current-position aiming and shield-contact correction. Browser reproduction on
that revision confirmed the separate civilian/control failures: a shared live
projectile left the defender in `hold-range`, while copying it into obsolete
`dispute.pending` caused a dodge; maneuvers reversed repeatedly; holding Space
produced one shot; clicking a target cleared held movement input.

The final fix passed **320/320 Node tests**, **8/8 local-site tests**, and all
**21 gameplay browser suites** (the 19 existing suites plus civilian tactics and
combat controls). The exact baseline passed its 290 Node, eight local-site and
19 existing browser suites before the change. Runtime source hashes remained
unchanged during the final full Node/local-site pass. The browser evidence covers
live stray-shot reactions, fitted-weapon distances, physical cargo/medical escape,
retained funded jobs and escrow through reload/disable/repair, held-fire stop
gates, steering-preserving selection, target ordering and weapon feedback. Existing
beam, interception, exactly-once damage, equipment, economy and rendering checks
remain green. The old beam fixture now advances a zero-duration native input
frame between independent frozen-animation scenes, matching the new rule of at
most one player fire request per host frame.

A browser pursuit used two ordinary matching hulls and shared physics for 30
simulation seconds: the civilian traveled 7,262 units across five extended escape
legs, maintained a 300-unit pursuer gap and never reversed. A separate regression
restored the committed escape midway through JSON reload. Held firing accepted
six shots over 3.2 seconds with the installed weapon's 0.615-second recharge.

### Comparable sustained-hit measurements

The primary before/after comparison uses headless Microsoft Edge
**155.0.4283.62**, Windows, a **1280 × 850** viewport, and the identical serialized
save SHA-256
`b4479e04c15e74b503a6f7db977066b6d02ffa2ba68f59d81a614f5b9aceff16`.
Its fleet has **162 civilians, nine tugs and the player (172 total)**. Each revision
runs three 20-second windows sequentially, with no other regression or benchmark
workers active. Three distinct owned beam mounts fire through actual
Space taps every 100 ms. They use ordinary damage, shields and recharge against
a legitimate disabled hull; the full fleet continues to advance. This isolates
sustained-hit checkpoint costs and does not measure a pursuing AI opponent.

The original isolated write measurement did not establish a stutter bug. The
comparison records actual animation-frame delivery separately from callback,
simulation, rendering, serialization and verified storage-write costs. Earlier
diagnostic runs with another checkout's browser work active are retained in raw
artifacts but excluded from the primary comparison.

| Primary workload, three 20-second windows | Before `01d5ea2` | After |
| --- | ---: | ---: |
| Actual player hits | 460 | 458 |
| Verified saves | 468 | 55 |
| Total time in verified writes | 2,547 ms | 349 ms |
| Mean verified-write cost | 5.44 ms | 6.35 ms |
| Frame-interval P95, each window | 18.3 / 18.4 / 24.2 ms | 18.3 / 18.3 / 18.3 ms |
| Intervals above 50 ms, each window | 2 / 1 / 2 | 3 / 0 / 0 |

Verified writes decreased **88.2%**, and their total measured cost decreased **86.3%**.
Individual writes became more expensive; this establishes useful coalescing,
not faster serialization. The median window's frame P95 changed only from 18.4
to 18.3 ms. Three short windows on this headless device do **not** establish a
reliable frame-rate improvement or prove that saving caused a visible stutter.
Periodic and explicit saves remain active, and all measured writes verified.

The single-mount current control recorded 52 / 52 / 54 hits and 52 / 53 / 53 saves
per 20-second window. Its mean write costs were 6.01 / 6.30 / 5.83 ms, totaling
313 / 334 / 309 ms per window. Earlier baseline control runs had 52–53 hits and
55 saves: slower firing appropriately remains approximately one write per hit.
Those earlier control runs had background browser work, so their frame delivery
is not compared with the quiet current runs.

The ordinary scheduling comparison also uses the same 172-ship fleet, browser
and viewport within its pair. Its separate starting save SHA-256 is
`2211a641b0d0f8f6cd686b9c956658cfd2cdf9566b5c256c823b56a444718d01`.
Each phase is a six-second sample after the harness's existing warmup.

| Ordinary scheduling diagnostic | Before | After |
| --- | ---: | ---: |
| Flight mean simulation / render CPU | 2.15 / 6.15 ms | 2.71 / 6.16 ms |
| Flight frame-interval P95 | 84.9 ms | 84.9 ms |
| Flight intervals above 50 ms | 42 | 41 |
| Dev-map mean simulation / render CPU | 0.872 / 0.929 ms | 0.828 / 0.961 ms |
| Dev-map frame-interval P95 | 6.2 ms | 6.2 ms |
| Dev-map intervals above 50 ms | 0 | 0 |

The ordinary flight stalls remain. Its simulation CPU increased in this short
sample while rendering CPU and frame delivery were essentially unchanged.
These results do not support a general smoothness or scheduling speedup claim.

### Crowded combat and remaining limits

The existing stability harness reuses the ordinary fixture for a separate stress
scene: 12 NPCs are provoked and the player's test-only health pool is enlarged
to keep the encounter alive. Production hull statistics are unchanged. It runs
three 20-second windows per revision, plus cold/warm artwork probes. Current
reference pixel checks also passed.

| Crowded stress diagnostic | Before | After |
| --- | ---: | ---: |
| Median window's mean simulation cost | 67.28 ms | 19.49 ms |
| Median window's mean render cost | 22.35 ms | 10.74 ms |
| Frame-interval P95, each window | 260.5 / 248.8 / 260.6 ms | 133.3 / 115.2 / 157.5 ms |
| Intervals above 50 ms, each window | 138 / 137 / 146 | 119 / 103 / 130 |
| Median steering calls in separate diagnostics | 748 | 460 |
| Median firing attempts in separate diagnostics | 110 | 54 |
| Median scene calls in separate diagnostics | 1,887 | 1,239 |

The call counts come from separate one-second diagnostics after each measured
window; they are not shot totals for the timed windows. Distant steering/firing
remained zero. Survival policies change how many ships keep fighting, so the
lower cost and frame P95 are confounded by a smaller tactical workload. They do
not establish an equivalent-load algorithmic speedup. Major crowded-combat frame
stalls remain, alongside the ordinary flight stalls reported above.

These results are limited to one headless Windows device reporting 16 hardware
threads, 32 GB device memory and DPR 1. The browser/fixture/viewport/population
guards passed within each comparison pair; uncontrolled OS activity and short
measurement windows still limit inference. Save coalescing reduces measured
redundant work, while broader rendering and dense-combat costs remain unresolved.

### Commands and evidence

```sh
node --test tests/*.test.cjs tests/*.test.js
python -m unittest discover -s tests -p test_local_site.py -v
python tests/browser-combat-performance.py --revision 01d5ea2 --label quiet-before-volley --seconds 20 --runs 3
python tests/browser-combat-performance.py --label quiet-after-volley --seconds 20 --runs 3
python tests/browser-combat-performance.py --label after-single --mounts 1 --fixture test-results/combat-performance/initial-save.json --seconds 20 --runs 3
python tests/browser-npc-performance.py --revision 01d5ea2 --label combat-before
python tests/browser-npc-performance.py --label combat-after
python tests/browser-stability.py --measure --revision 01d5ea2 --label combat-before --scenarios crowdedCombat --seconds 20 --repetitions 3
python tests/browser-stability.py --measure --label combat-after --scenarios crowdedCombat --seconds 20 --repetitions 3
```

The 21 gameplay browser commands are recorded in the repository test workflow.
Ignored `test-results/combat-final/summary.json` records their actual outcomes and
the full Node/local-site run. `test-results/combat-performance/comparison.json`
contains validated paired timings; `required-comparison-summary.json` retains
exact command arguments, exit codes and durations. Raw frame/write samples remain
beside those reports. Gameplay screenshots are in `test-results/combat-controls/`
and `test-results/civilian-tactics/`, including rearward beam shield contact,
movement while selecting, live projectile evasion, continued pursuit and cargo/
medical escape. Generated evidence is intentionally excluded from Git.
