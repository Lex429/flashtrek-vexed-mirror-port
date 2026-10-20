# Rendering and remaining gameplay review

## Checkout and scope

The baseline is `cf47e68f3b6194be9f18770e239a87d9dfdc937c`, the latest
GitHub `main` when this work began. Its CI run passed. Implementation and local
checks used `C:\Users\alphi\Vexed-Mirror-Render-Fix`, branch
`fix/ship-render-loading-gameplay`, based on that commit. The final commit is
identified by this report's containing revision and its GitHub Actions run.
Production JavaScript hashes are recorded in the ignored verification reports.

The separately served checkout at `C:\Users\alphi\Vexed-Mirror-Port-GitHub`
was at `ea40ff5b55c19fbab21d87d03bccdbbcc0f55e9f`, branch `staged-main`, with
60 existing modified/untracked files. Those files and both Git diffs were
snapshotted before work; their hashes were checked again without changing them.
Results below concern the isolated fix checkout, not that older dirty checkout.
An isolated serve-only preview uses the fix checkout at
`http://127.0.0.1:7791/`; port 7790 continues to serve the original checkout.
The two addresses have separate browser storage. The existing saves were not
moved or overwritten.

## Changes and reproduction

Directional lighting now updates a retained mask and final composition. The
animated-effect layer has its own identity and cadence, so rotating the light
does not recreate it or allocate replacement sprite/mask canvases. Healthy NPC
effects explicitly use their intended 20 Hz; players, damage, warp and direct lit
previews retain 60 Hz. Raster sizes, angle quantization and memory limits remain
the same. The isolated frozen-time reproduction went from 360 canvas allocations
and 120 effect refreshes for 120 directions to three retained canvases and one
effect refresh. This is a cache-work result, not an FPS measurement.

Current damage artwork is requested first. Unused plates wait behind foreground
work and prepare one at a time through the existing cooperative queue. A newly
needed stage shares/promotes its existing request. Full `prepare` still provides
fragment/wreck readiness when explicitly requested by damage/showcase callers.
The player retains valid same-hull art while a stage loads; hull changes clear
the old hull, and late requests cannot replace the current hull. Loader metrics
separate image-load, decode, alignment, effect preparation and unlighting time.

Free collision spin still rotates the hull and damps normally. With no thrust,
turn or navigation command, it no longer redirects the existing world velocity.
Pure braking reduces that same course. Actual keyboard/ram browser coverage
checks both this behavior and deliberate steering.

Olympic refinery surplus now settles fractional cargo and its saved fractional
payment through the shared atomic exchange. Numerical refill dust goes into
owned reserves. Funded cash cancellation has a small, explicit tolerance; integer
shortages, meaningful deficits and unrelated escrow still reject. Tests include
payments of 0.4 then 0.3 and 12,000 then 0.3 with reload between payments. No
accepted prices change. The browser demonstration retains 0.375 t for reserves,
sells 3.625 t for 271.875 credits, clears escrow, and does not replay on reload.

Repair-drone capacity after changing hulls was already correct in the baseline.
The regression verifies six-to-one-to-six bays, locker overflow, the same six
owned Dots and their saved condition/recharge, including actual Inventory UI.
Weapon balance, charge/recharge pacing, shared interception, civilian policies,
populations, cargo ownership and saved schemas remain intact.

## Measurement method

Measurements ran sequentially on Windows 11, Edge 155.0.4283.62, 1280 by 850,
DPR 1, with the same 172-ship saved fleet and unchanged settings. The baseline
was an immutable Git archive of `cf47e68`; the after run served the frozen fix
sources. Source hashes, fixture hash, browser/device identity and zero pending
preparation at all 18 warm-window starts were verified. Other test workers were
idle. OS/GPU activity was not controlled.

Each flight/combat scenario has three 20-second windows. Controls repeat against
authoritative simulation time. Crowded flight places 12 existing actors near the
player without provocation; they are held docked as a controlled rendering load,
while the remaining fleet retains its work. Combat uses the existing 12-provoked
NPC/high-player-health stress setup. No production populations or statistics
were reduced. Current appearances are warmed; animation phase caches and future
hit/destruction work can still begin cold. Actual simulation progress, paints
and accepted shots are reported because resulting workloads can differ.

The six cold probes restore the same save in fresh browser contexts and request
one new class/stage near the observer. They record the actual successful paint,
then another 2.5 seconds of frames. Their observation lengths consequently
differ; raw cold slow-frame counts are not treated as equal-duration comparisons.
Image/decode/preparation measurements are wall durations, include queue waits,
and may overlap. They are not independently additive CPU times. These profiles
have no separately exposed `prepareFrame` phase; its absence is shown below,
while alignment/profile preparation and unlighting are measured separately.

Ordinary-flight allocation totals fell from 17,173 to 7,527 over the three
windows; FPS showed no clear gain. In crowded flight, more frames and paints
were delivered, so total allocations rose from 33,649 to 38,578. Allocations per
ship paint fell from 4.35 to 2.62, and animated refreshes fell from 7,728 to 5,279
despite paints rising from 7,729 to 14,743. This controlled scene improved from
7.5-8.4 to 15.0-15.5 FPS, but remains slow. Aggregate combat FPS was essentially
unchanged, with mixed results across repeats; frames over 50 ms increased from 218 to 268 even though some
tail-frame measurements improved. There is no general smoothness claim.

Before → after. Same fixture `2211a641b0d0f8f6cd686b9c956658cfd2cdf9566b5c256c823b56a444718d01`, 172 ships, 155.0.4283.62, 1280×850. All measured source hashes verified against disk; all 18 warm-window preparation gates are zero.

| Scenario/run | FPS | p95 ms | p99 ms | Max ms | Frames >33/>50/>100 ms | Sim seconds |
|---|---:|---:|---:|---:|---|---:|
| flight/1 | 70.6 → 72.6 | 36.3 → 36.4 | 66.7 → 54.6 | 97.0 → 97.0 | 80/44/0 → 82/23/0 | 20.018 → 20.018 |
| flight/2 | 83.8 → 78.0 | 30.3 → 30.3 | 60.5 → 54.5 | 127.3 → 78.8 | 74/23/1 → 75/18/0 | 20.012 → 20.030 |
| flight/3 | 74.0 → 77.8 | 36.4 → 30.3 | 60.7 → 48.5 | 84.9 → 72.6 | 85/42/0 → 75/12/0 | 20.024 → 20.018 |
| crowdedFlight/1 | 8.4 → 15.3 | 163.7 → 90.7 | 193.9 → 103.0 | 242.5 → 115.2 | 168/168/130 → 301/274/5 | 20.055 → 19.982 |
| crowdedFlight/2 | 8.2 → 15.0 | 163.5 → 91.0 | 181.8 → 109.1 | 200.1 → 115.2 | 165/165/139 → 297/267/8 | 19.994 → 20.000 |
| crowdedFlight/3 | 7.5 → 15.5 | 175.9 → 96.9 | 200.0 → 109.1 | 230.2 → 121.2 | 150/150/145 → 304/245/11 | 20.030 → 20.000 |
| crowdedCombat/1 | 20.1 → 23.7 | 133.5 → 97.1 | 212.1 → 163.7 | 309.1 → 272.6 | 310/85/26 → 246/87/24 | 19.909 → 19.996 |
| crowdedCombat/2 | 31.5 → 33.3 | 103.1 → 84.8 | 199.9 → 145.4 | 236.8 → 242.4 | 143/91/36 → 136/95/21 | 20.079 → 20.042 |
| crowdedCombat/3 | 35.2 → 30.0 | 60.6 → 84.8 | 175.7 → 127.3 | 272.6 → 157.6 | 116/42/25 → 177/86/18 | 20.044 → 20.024 |

| Scenario/run | Canvas allocations | Effect rebuilds | Compositions* | Misses/light updates/evictions | Total sprite CPU ms | Paints/shots |
|---|---:|---:|---:|---|---:|---|
| flight/1 | 5801 → 2499 | 1834 → 1408 | — → 2000 | 1069/1017/3363 → 1/1440/1260 | 779.7 → 678.5 | 2229/0 → 2450/0 |
| flight/2 | 5538 → 2485 | 1821 → 1436 | — → 2152 | 1077/1046/3198 → 1/1555/1260 | 722.4 → 710.3 | 2322/0 → 2704/0 |
| flight/3 | 5834 → 2543 | 1913 → 1469 | — → 2183 | 1120/1062/3408 → 1/1593/1288 | 731.9 → 680.3 | 2344/0 → 2755/0 |
| crowdedFlight/1 | 11441 → 12928 | 2680 → 1777 | — → 4935 | 826/505/5959 → 0/4867/6473 | 1190.3 → 1566.4 | 2681/0 → 4938/0 |
| crowdedFlight/2 | 11647 → 12600 | 2647 → 1734 | — → 4834 | 866/497/6081 → 0/4772/6313 | 1357.5 → 1567.7 | 2647/0 → 4838/0 |
| crowdedFlight/3 | 10561 → 13050 | 2401 → 1768 | — → 4965 | 744/443/5491 → 0/4896/6535 | 1178.4 → 1614.2 | 2401/0 → 4967/0 |
| crowdedCombat/1 | 8479 → 6813 | 2429 → 1715 | — → 2936 | 1863/1974/4973 → 1/2794/2851 | 810.1 → 1098.5 | 2430/101 → 2967/102 |
| crowdedCombat/2 | 10002 → 6406 | 2102 → 1604 | — → 3523 | 1708/1669/5725 → 1/3217/2927 | 1056.2 → 1005.4 | 2180/102 → 3639/95 |
| crowdedCombat/3 | 8871 → 5273 | 2661 → 1402 | — → 2298 | 1995/2076/5234 → 0/1991/2335 | 865.6 → 795.0 | 2708/91 → 2468/104 |

*Composition counts were unavailable before the layer split. spriteBuildMs is the total; effectBuildMs and compositionBuildMs are subsets and are not added again.

| Cold hull/stage | First visible ms | Correct stage ms | p95/max frame ms | Observation seconds |
|---|---:|---:|---|---:|
| 35/0 | 1770.1 → 120.9 | 1770.1 → 120.9 | 97.0/121.0 → 66.7/109.0 | 4.307 → 2.629 |
| 35/2 | 1966.0 → 114.6 | 1966.0 → 114.6 | 97.0/133.3 → 66.6/115.1 | 4.495 → 2.631 |
| 49/0 | 522.3 → 112.1 | 522.3 → 112.1 | 66.8/115.1 → 60.6/66.7 | 3.072 → 2.624 |
| 49/2 | 542.0 → 128.2 | 542.0 → 128.2 | 66.7/84.8 → 54.7/66.7 | 3.061 → 2.645 |
| 59/0 | 80.3 → 28.2 | 80.3 → 28.2 | 72.7/85.0 → 54.4/72.7 | 2.593 → 2.548 |
| 59/2 | 119.9 → 42.6 | 119.9 → 42.6 | 66.8/97.2 → 54.6/60.6 | 2.697 → 2.550 |

Cold windows last until appearance plus approximately 2.5 seconds, so raw slow-frame counts are not compared as fixed periods.

| Target hull/stage | Image load ms | Decode promise ms | Alignment ms | Effect preparation ms | Unlighting ms |
|---|---:|---:|---:|---:|---:|
| 35/0 | 31.5 → 18.4 | 28.3 → 4.8 | 1505.8 → 65.0 | — → — | 181.0 → 5.4 |
| 35/2 | 39.9 → 26.2 | 23.2 → 7.8 | 1560.1 → 56.1 | — → — | 231.8 → 4.9 |
| 49/0 | 35.8 → 28.2 | 24.9 → 8.9 | 340.9 → 28.9 | — → — | 110.6 → 36.3 |
| 49/2 | 52.0 → 33.0 | 37.4 → 8.7 | 345.6 → 46.5 | — → — | 89.7 → 23.4 |
| 59/0 | 26.3 → 13.5 | 26.6 → 2.9 | 0.0 → 0.0 | — → — | 0.3 → 0.2 |
| 59/2 | 63.9 → 24.9 | 35.7 → 7.0 | 0.0 → 0.1 | — → — | 0.2 → 0.5 |

Preparation rows match the requested catalog image and profile type/stage. Missing instrumented phases are shown as —. Wall phases can overlap; decode promise time is not total decoder CPU.

Limitations: Artwork is warmed and pending preparation is zero at each measured flight/combat start; animation phase caches start cold. Crowded flight holds 12 existing ships docked near the player as a controlled rendering load; the remaining fleet retains its jobs. Combat uses 12 provoked NPCs and high player health as a controlled stress load. Frame delivery is measured separately from callback/render/simulation CPU; GPU timing and GPU queue stalls are unknown. Sprite rebuilds cover all animated cache refreshes. Profile effect-draw instrumentation can omit the player asset prepared before instrumentation. Total spriteBuildMs includes effect/composition subsets and is never summed with those subsets. Main-document canvas and OffscreenCanvas construction is counted; browser internals and worker-private surfaces are not. Twenty-second windows use identical intended inputs on simulation time. Actual wall lengths, simulation advance, paints and accepted shots are recorded because resulting workloads can differ. Cold measurements have variable observation lengths and one sample per hull/stage. Image load and decode are wall timings, preparation phases can overlap, and appearance latency does not establish a whole-game freeze. These are three local runs per scenario on one browser/device; OS activity is uncontrolled. No broad FPS or lag improvement follows automatically from lower CPU or fewer allocations.


## Checks and remaining limits

The baseline passed 320 Node tests and eight local-site tests freshly; its
existing 21-browser CI run was also green. The fix passed 338 Node tests, eight
local-site tests and all 24 browser commands now present in the workflow. Eight
gameplay browser checks were repeated after the final numeric guard. The new
serve-only preview also passed `browser-smoke.py http://127.0.0.1:7791`.

The Node command was `node --test tests/*.test.cjs tests/*.test.js`; the local
service command was `python -m unittest discover -s tests -p test_local_site.py
-v`. Browser commands are listed individually in `.github/workflows/test.yml`.
They include rearward beams/interception, controls/tactics, all 66 hulls (396
presentation cases), 72 render-path pixel cases, cold loading/pause, physical
collisions, repairs, equipment, mining, civilian access, saved jobs, and the
audited Earth traffic jam. A direct 72-case baseline/current image comparison
had maximum mean channel error 0.241/255 and zero significant pixels under its
existing threshold; paired screenshots were also reviewed.

The new focused suites are `ship-sprite-cache.test.cjs`, the added cases in
`flight-assets-cache.test.cjs`/`ship-effects.test.cjs`, and
`review-gameplay.test.cjs`. New browser checks are `browser-ship-lighting.py`,
`browser-cold-ship-loading.py` and `browser-review-gameplay.py`; the existing
impact-controls browser check now verifies six seconds of post-ram world course.
Independent source comparisons reproduce the former strict-cash failure,
large-payment cancellation and unsafe uncapped-integer admission.

Required existing diagnostics also ran before/after:

```sh
python tests/browser-stability.py --measure --revision cf47e68 --label render-review-before --seconds 20 --repetitions 1 --scenarios flight,crowdedCombat
python tests/browser-stability.py --measure --label render-review-after --seconds 20 --repetitions 1 --scenarios flight,crowdedCombat
python tests/browser-npc-performance.py --revision cf47e68 --label render-review-before --seconds 6
python tests/browser-npc-performance.py --label render-review-after --seconds 6
```

These supplement the repeated-input benchmark, rather than replace its nine
paired windows. The NPC fixture hash is the same as the main comparison.

| Supplementary scenario | p95 frame ms before / after | Max frame ms before / after | Frames over 50 ms before / after |
| --- | ---: | ---: | ---: |
| Stability flight, one 20 s window | 18.3 / 18.3 | 121.2 / 97.0 | 20 / 15 |
| Stability combat, one 20 s window | 151.2 / 66.7 | 351.6 / 139.5 | 119 / 91 |
| NPC flight, one 6 s window | 96.9 / 72.7 | See raw report | 44 / 35 |
| NPC map, one 6 s window | 6.2 / 6.2 | See raw report | 0 / 0 |

The existing explicit full-preparation Galaxy probe took 9,281.9 / 7,344.9 ms
to complete all optional work, while the ship appeared after 1,399.5 / 51.8 ms.
Its maximum preparation slice was 163.1 / 138.9 ms. These are separate milestones;
neither elapsed readiness time is a measurement of a whole-game freeze.

Long frames remain: the repeated after combat windows still reached 272.6 ms,
and cold probes reached 115.1 ms. Explicit full fragment/wreck preparation still
contains indivisible pixel/GPU operations; the cooperative queue does not promise
a hard frame-time ceiling. Preparation-queue work was zero during the repeated
warm combat windows, so their spikes are not attributed to that preparation.
Animated lamp texture changes still allocate surfaces,
and different headings sharing one class can require fresh mask contents. GPU
timings were not captured, so GPU stalls are not attributed to a particular call.
No visual quality, fleet size or gameplay complexity was reduced to hide these
costs. No unresolved gameplay failure was found in the verified scope.

Raw frames, phase records, exact commands, source hashes and screenshots are
ignored local artifacts under `test-results/render-review/` and
`test-results/render-fix/`. Comparable runs use:

```sh
python tests/browser-render-review-performance.py --source-root test-results/render-fix/baseline-cf47e68 --revision-label cf47e68 --label final-before --seconds 20 --runs 3
python tests/browser-render-review-performance.py --label final-after --seconds 20 --runs 3
```

The implementation commit's CI result must be checked separately from these
local results. The workflow includes every existing check plus the three new
browser suites, with a 30-minute budget for the expanded run.
