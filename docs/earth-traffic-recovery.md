# Market integrity and Earth traffic recovery

Started from `118c8102341b78c56c62e9b81f6d8d195488d112`, preserving the six
stabilization fixes already published after `c41559c`. The remaining retail
exploits and overlapping Earth docking layout were independently reproduced.
This change implements their fixes and verifies the inherited stabilization work.

## Status of the eight audited issues

| Issue | Implementation and evidence |
| --- | --- |
| 1. Repeatable same-port profit | Marginal quantity pricing, a sale spread and per-ton rounding. All nine commodities, 10/25/100/500-ton lots, both round-trip directions, price thresholds, split/repeated lots and save/reload are covered. Real non-Dev market buttons show and execute the same total. |
| 2. Player trading bypasses treasury | Player retail and NPC freight call `npc-lives.exchange`. It checks the entire transfer before mutation, protects reserved stock/funds/storage, credits purchases to the port and debits sales from that treasury. Insolvent/overflow trades reject without destroying cargo. Existing treasury balances are retained. |
| 3. Competing payment promises | Existing fixed-price destination escrow and source/incoming reservations are retained. Reload, simultaneous contracts, cancellation and interruption tests pass. A legacy waiting delivery that gains funding now honors its own reserved buyer and physically approaches its berth. |
| 4. Permanent unpaid deliveries | Existing bounded recovery and accounted production/household flows are retained. Recovery considers all Sol ports and parks safely when no buyer exists. The full-population and actual jam-save tests verify sustained work and conservation. |
| 5. Distant tactical processing | The exact c41559c probe performs 60 steering calls, 7 firing attempts and 127 scene searches in one second while distant. The working probe performs zero of each. Shared tactical eligibility, break-contact behavior and launched-shot lifecycle regressions pass. |
| 6. Zero-distance movement | The c41559c probe produces NaN duration and velocity. The current shared boundary returns finite zero duration/velocity; restored civilian/tug legs and repeated waypoints remain covered. |
| 7. Player lighting and warp | The bounded screen-sized sprite/lamp/shade caching already on main is preserved. The 72 actual Canvas comparisons, animation, pause and cache invalidation checks pass. Component timing is recorded separately below; this is not a general FPS guarantee. |
| 8. First-encounter pixel preparation | The existing cooperative, deduplicated fragment/wreck queue remains active, with base ships visible before optional work finishes. Cold/warm, damage ordering, pause, exact pixel and memory-bound checks pass. Cold encounter long tasks still exist on this device; see the limits below. |

The additional mining change selects a CPU-readable piece canvas before its
first draw and reuses immutable collision samples and seam textures for repeated
encounters. Each asteroid still has independent motion/trail surfaces. This
removes repeated full-image piece readbacks; it does not remove every mining or
debris rendering cost.

## Earth docking and saved population

Ordinary job selection and recovery consider actual port demand, uncommitted
money and incoming work. Sol is no longer hardcoded to Earth. `port-docking.js`
provides four exclusive civilian berths per port, a twelve-place FIFO queue and
spaced holding/overflow positions based on hull dimensions. Existing company tugs
retain separate, uniquely assigned terminals. Loading/unloading occurs only after
arrival at the assigned berth. Parking clears the old berth after physical
movement; departure/cancellation/destruction release occupancy. Allocation is
limited to sixteen space searches per host animation frame.

`tests/generate-earth-jam.cjs` runs the original c41559c owners for 108,000 normal
1/60-second steps. It produces the tracked `tests/fixtures/earth-jam-c415.json`:
159 civilians, nine tugs and the player; 36 unpaid civilians at Earth; exactly 12
shared coordinates; maximum overlap six; Earth treasury seven credits. It does
not fabricate a new population or give the stuck ships money.

All population runs use 1/60-second simulation steps and retain all 159 civilians
and nine tugs, plus the player. The recovered save runs for another 30 simulated
minutes after its original 30-minute jam reproduction.

| Scenario | Civilian deliveries during run | Working at end | Idle at end | Waiting for payment at end | Scheduler backlog |
| --- | ---: | ---: | ---: | ---: | ---: |
| Fresh population, 30 minutes | 1,395 | 153 | 0 | 0 | 0 |
| Original jam save, another 30 minutes | 1,226 | 151 | 0 | 1 | 0 |
| Explicit treasury depletion, 10 minutes | 152 | 19 | 125 | 0 | 0 |

Completed ships between jobs are separate from working/idle counts. The single
remaining payment wait in the restored population is a bounded recovery state;
all 36 originally stuck ships physically moved, departed and delivered.
The original 138 galaxy-wide payment waits did not persist. Earth released 311
berth reservations during recovery; the queue never exceeded twelve.

Fresh-run Sol closing treasuries were Mercury 5,102; Venus 1; Earth 27,320;
Moon 4,883; Mars 42,296; Jupiter 10,712; Saturn 6,067; Uranus 624; Neptune 2,561.
Some markets can legitimately remain short of purchasing funds. Contract escrow
and buyer selection prevent that condition from becoming unsupported promises.
The depletion scenario deliberately permits safe idling instead of manufacturing
money or cargo to force every ship to work.

Fresh-run money reconciles exactly: 329,925 initial + 1,500,000 one-time
allocations for previously uninitialized markets + 203,052 accounted household
spending = 2,032,977 final. The restored jam starts with initialized markets:
1,829,925 initial + 202,865 accounted household spending = 2,032,790 final.
All nine goods reconcile after recorded production, consumption and mining;
unaccounted money and cargo are zero. Restoration does not seed another treasury.

The real-browser local-flight and Dev-map runs each also restore the same saved
jam and advance thirty minutes. Both retain every identity, move/reroute/deliver
all 36 original ships, finish with zero payment waits and zero backlog, and keep
the queue at or below twelve. They exercise 328 and 295 distinct Earth berth
leases respectively. Inspector selection/visiting does not reset tasks, and map
positions agree with local authoritative positions. Observation changes detail
scheduling, so these runs do not claim identical complete galaxy histories.

The ordinary non-Dev Earth medicine reproduction changes from buy 100 for 3,700
and sell for 4,900 (1,200 profit, unchanged treasury) to buy for 4,890 and sell for
3,961 (929 loss, treasury gains 929). Stock returns to its starting value and
cargo returns to zero. The browser exercises the displayed quotes and actual
Buy/Sell buttons, not only a direct transaction helper.

## Save compatibility

`portDocking.version:1` and per-ship `dockingVersion:1` add saved occupancy and
queue tickets. `dockIntent` records pending loading/unloading; `dockingMove`
records a parking leg and its continuation deadline. Restoration reconciles
owners against the real population and keeps valid tickets/positions. Legacy
ships receive scheduled physical recovery without moving their saved positions,
withdrawing cargo again or modifying their balances during migration.

Paid repairs/idle deadlines survive relocation; parking cannot complete the
saved service early. Funded waiting deliveries use their fixed payment contract,
instead of treating their own reserved demand as unavailable. Existing journeys,
weapon ownership/recharge, health, identities and cargo remain authoritative.
Historic external-retail ledger entries are retained but not credited again.

## Browser performance

Isolated lighting/warp measurements compare the audited `c41559c` renderer to
the final working renderer, using the same Chromium 140 browser, decoded art,
320 × 320 CPU-readable Canvas and 110-pixel ship height. Sixteen type/stage/path
cases each run three batches of 120 draws with changing orientation and time.
Each draw is flushed by a one-pixel readback. Means below are per draw in ms.

| Path | Draw call, before → after | Readback flush | Total clear/draw/flush |
| --- | ---: | ---: | ---: |
| Directional lighting | 0.912 → 5.067 | 5.751 → 0.572 | 6.667 → 5.641 |
| Warp appearance | 13.959 → 1.634 | 0.587 → 0.385 | 14.549 → 2.020 |

Lighting's submission/readback split changes: the lower combined cost does not
mean its draw-call CPU time fell. Warp's combined isolated cost falls strongly.
These microbenchmarks establish component behavior, not player-visible FPS.
The isolated cache reached 28,084,208 bytes, below its 36,000,000-byte limit;
animated lights, paused pixels and damage/appearance invalidation checks pass.

These are measurements of this Linux headless Chromium 140.0.7339.16 environment,
not the user's Games Hub device and not the earlier Windows Edge measurements.
Both sides use 169 ships, 1280 × 850, DPR 1, nine reported hardware threads and
8 GB reported device memory. Each scenario has three twenty-second windows.
The same initial save SHA-256 is
`1534fcb8454bda32ac428e20bed890b1faeb31a3debff40c091536aa2cbbdde6`.
Before is exact `118c810`; after is the implemented market/docking/mining change.
The final legacy-only funding/deadline guards were added after these timing runs;
the benchmark starts with no NPC tasks and does not exercise those migration
branches. Their separate release regressions run against the final source.

All values below are milliseconds, before → after. Simulation/render are mean
cost per callback; frame interval is actual animation-frame delivery.

| Scenario | Simulation | Rendering | Frame median | Frame P95 | Frame P99 | Frame maximum |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| flight | 0.338 → 0.358 | 4.758 → 4.403 | 16.7 → 16.7 | 16.8 → 16.8 | 133.3 → 116.7 | 150.0 → 133.4 |
| crowdedCombat | 20.632 → 22.124 | 167.879 → 197.803 | 199.9 → 200.0 | 716.7 → 800.0 | 983.3 → 1033.3 | 1299.9 → 1333.2 |
| miningDebris | 2.714 → 2.554 | 5.818 → 6.041 | 66.6 → 66.6 | 166.6 → 166.6 | 433.3 → 466.6 | 983.3 → 1133.3 |
| warp | 0.322 → 0.384 | 2.496 → 2.601 | 16.7 → 16.7 | 16.8 → 16.8 | 116.7 → 116.7 | 150.0 → 133.4 |
| devMap | 0.349 → 0.379 | 0.843 → 0.849 | 16.7 → 16.7 | 16.8 → 16.7 | 16.8 → 16.8 | 33.4 → 66.7 |

| Scenario | Frames >33 ms | Frames >50 ms | Long tasks | Long-task maximum ms | Scheduler backlog maximum |
| --- | ---: | ---: | ---: | ---: | ---: |
| flight | 119 → 121 | 115 → 120 | 115 → 120 | 162.0 → 124.0 | 0 → 0 |
| crowdedCombat | 199 → 183 | 172 → 163 | 174 → 167 | 1298.0 → 1336.0 | 0 → 0 |
| miningDebris | 771 → 753 | 454 → 441 | 484 → 472 | 987.0 → 1133.0 | 0 → 0 |
| warp | 126 → 123 | 123 → 120 | 123 → 120 | 139.0 → 128.0 | 0 → 0 |
| devMap | 2 → 2 | 0 → 1 | 0 → 0 | 0.0 → 0.0 | 0 → 0 |

Ordinary flight's mean rendering cost decreased, but the results do **not** show
an overall smoothness improvement. Crowded combat remains severely slow here
and its pooled P95 worsened. Mining/debris retains large presentation spikes.
Fewer >50-ms frames during a run with fewer total frames is not evidence of higher
FPS. The Dev map remains inexpensive and does not activate galaxy-wide artwork.
Distant tactical calls remain zero. Nearby tactical/scene work and Canvas/effects
rendering remain material bottlenecks; they need a separate focused performance
pass. No claim of a glitch-free or consistently 60-FPS game is made.

Owned RGBA cache estimates peaked at 36,203,756 bytes for damage art,
3,689,464 bytes for sprites and 35,814,688 bytes for decoded/processed assets in
these timed scenarios. Owners share references; these are not additive estimates
of total GPU/browser memory. The configured owner limits and retention tests pass.

| Cold ship type | First visible ms, before → after | Optional preparation elapsed ms | Warm request ms | Worst queue slice ms | Encounter long tasks |
| --- | ---: | ---: | ---: | ---: | ---: |
| 35 | 147.9 → 238.1 | 914.9 → 1272.0 | 0.0 → 0.1 | 3.7 → 5.0 | 0 → 0 |
| 36 | 56.3 → 129.7 | 468.2 → 517.1 | 0.0 → 0.0 | 2.2 → 2.4 | 0 → 0 |
| 64 | 91.1 → 92.8 | 765.0 → 883.1 | 0.0 → 0.0 | 5.8 → 3.5 | 8 → 8 |

Each cold case observes an actual nearby ship for at least five seconds. All
three become visible before optional preparation finishes and deduplicate warm
requests. Synchronous fragment/wreck preparation measured zero on both sides.
The 2-ms queue slice is a target, not a hard deadline around indivisible Canvas
operations. Eight long tasks remain in the type-64 encounter; the present
instrumentation does not isolate their cause. These observations do not establish
that every cold presentation stall has gone away.

## Reproduction and remaining boundaries

Baseline: 139 Node tests and all three originally requested browser suites
passed against `118c810`. The patch author's pre-integration source passed
**151/151 Node tests and all six browser suites**: smoke, shared ship contract, persistent NPC lives, render-path
pixels, stability/cold preparation and the new Earth jam. The render suite covers
72 Canvas comparisons; the ship-contract suite covers twenty visual scenarios.
Additional regressions include migration with an already funded legacy buyer,
preserved repair deadlines and save/load while ships are actively queued.

```sh
node tests/reproduce-stabilization.cjs c41559c
node tests/reproduce-stabilization.cjs --working
node --test tests/*.test.cjs tests/*.test.js
python tests/browser-smoke.py
python tests/browser-ship-contract.py
python tests/browser-npc-lives.py
python tests/browser-render-paths.py --visual-only
python tests/browser-stability.py
python tests/browser-earth-jam.py
python tests/browser-render-paths.py --revision c41559c --label component-before
python tests/browser-render-paths.py --label component-after
python tests/browser-stability.py --revision 118c810 --label before --measure
python tests/browser-stability.py --label after --measure
```

Set `BROWSER_CHANNEL` to an empty string for bundled Chromium. The environment's
Playwright 1.63 browser download failed, so local checks used an isolated
Playwright 1.55/Chromium 140 installation; the repository CI dependency remains
unchanged. The new Earth browser suite is included in CI. Raw reports, frame
samples, screenshots, conservation ledgers and regenerated final saves are
ignored `test-results/` outputs; CI uploads its browser evidence.

Offscreen combat still breaks contact by the established policy. Non-Sol
four-resource player retail remains separate from nine-good NPC freight markets.
Sealed player freight-service rewards retain their explicit external service
budget. Campaign balance and population sizes beyond the tested 169 ships are
not established by these regressions.

## Local integration verification, 2026-10-17

Applied `Downloads/vexed-mirror-fixes.patch` to the authenticated GitHub checkout
at `118c810`, preserving the installed galaxy map's dragging, readable ship
icons, group zoom, separate search and selected-ship activity panel. Docking
queues and berth-clearing movement now also have plain-language activity text.

The integrated source passed **152 Node tests and seven browser suites** on
Microsoft Edge 155.0.4283.45: smoke, shared ship contract, persistent NPC lives,
render-path pixels, cold preparation/stability, audited Earth recovery and galaxy
controls. Both browser jam scenarios moved, rerouted and delivered all 36
original jammed ships, ending with no payment waits or scheduling backlog. The
map scenario also paints the actual overview and checks that painting preserves
the selected NPC. The normal market UI retained the expected conserved result.

The nine affected runtime files were installed into the running Games Hub and
the actual `games.html?game=broken-mirror-port` entry passed the desktop and
compact galaxy-control checks. Original installation files remain in
`Games-Hub-Portable/backups/vexed-mirror-fixes-20261017` outside the repository.

A separate short timing diagnostic reused the identical serialized 169-ship
save, Edge version, 1280×850 viewport and six-second windows before and after:

| Mode | Mean simulation ms, before → after | Mean render ms, before → after | Frame interval p95 ms, before → after |
| --- | ---: | ---: | ---: |
| Flight | 0.397 → 0.644 | 3.522 → 5.816 | 42.5 → 66.5 |
| Dev galaxy | 0.330 → 0.281 | 1.226 → 1.346 | 6.7 → 7.0 |

These short local diagnostics do not establish a flight smoothness gain. Flight
frame stalls remain; the longer measurements earlier in this report came from
the patch author's different environment. Raw local logs, reports and images are
in ignored `test-results/` outputs. CI includes both new browser regressions.
