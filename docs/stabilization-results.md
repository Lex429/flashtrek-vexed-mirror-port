> Subsequent market and Earth docking work is documented in [Earth traffic recovery](earth-traffic-recovery.md). The measurements below describe the earlier stabilization revision.

# Stabilization verification

The repository and `origin/main` both pointed to exact
`c41559c5bf7bff629bbbf88763a84ef08d9eca43` when this work began. A fetch confirmed
there were no subsequent changes to discard. The active entry point remains
`html-games/broken-mirror-port/index.html`; the installed Games Hub uses that
same runtime. Artwork files, faction data, ship statistics and weapon model/upgrade
specifications are unchanged. Combat still uses the shared charge/recharge lifecycle.

## Independently reproduced failures and fixes

| Finding on the initial code | Reproduction | Implementation |
| --- | --- | --- |
| Destination money and demand were not reserved | Full saved population ended with 138 civilians waiting for payment | `npc-lives.js` reserves stock, buyer funds and incoming demand with a fixed quote; idempotent release, reload migration, real rerouting and bounded cargo-held idle |
| Same-system distant combat continued at full rate | A ship a million world units away received 60 steering updates, seven firing attempts and 127 scene collections in one second | `ship-detail.js` gates tactical work before scene collection; contact ends through the task owner, while launched shots finish through `combat-shots.js` |
| Already-arrived scheduled movement divided by zero | `planLeg` duration and sampled velocity became NaN | Shared finite-input validation, `1e-6` world-unit completion tolerance, legacy arrival repair and bounded repeated-waypoint handling for civilian/tug callers |
| Player lighting/warp bypassed the normal sprite path | Initial renderer rebuilt full-art tint/composition surfaces; isolated baseline profiles captured both paths | Shared screen-sized layers with 2x supersampling, phase-aware sprite/lamp reuse, bounded source/processed-art retention and observable byte estimates |
| Image decode was asynchronous but pixel preparation blocked | Cold fragment/wreck processing created main-thread tasks over 50 ms; warmed repeats hid the work | Incremental generators share one 2 ms target queue; base ships publish early, optional assets retry bounded admission and visual events drain only in simulation |
| Slow-frame catch-up could repeat owner work caps in every substep | A 250 ms host frame can contain 15 physics substeps | `simulation-frame.js` shares scheduler caps across those steps; ID/scene collections are reused only within a physics step and invalidated after movement/hits |

The distant-combat reproduction now records **zero** steering updates, firing
attempts, scene collections and artwork preparations in the same scenario.
Zero-distance legs now have duration/velocity zero and finite position/heading.
No hysteresis is needed to prevent boundary oscillation: crossing the boundary ends the
record permanently; returning requires a new actual attack to start another.
Detailed eligibility uses authoritative analytical poses and the saved configured
radius (6,500 by default), including same-system separations and Sol tugs.

Scheduler limits per animation frame are 64 civilian actions, 256 heap pops,
four household cycles, 96 Sol fleet events and 64 Sol production cycles. Saved
overdue deadlines/production debt remain for later frames. Shared tactical
steering, swept collisions and launched-shot simulation retain their small
physics steps. The existing pause/hidden/inventory and incoming-frame policies
are preserved. Collision caches never span a moving-target physics step.

## Full-population economic results

Both fresh runs use the actual simulation modules, Sol coordinates and all 262
asteroid placements, with artwork mocked. Each executes 108,000 steps of `1/60`
second: 30 active simulated minutes, 159 civilians, nine tugs and the player.

| At 30 minutes | Initial `c41559c` | Final implementation |
| --- | ---: | ---: |
| Civilian deliveries completed | 534 | 2,492 |
| Tug deliveries completed | 135 | 147 |
| Civilians actively working | 20 | 56 |
| Civilians idle | 1 | 91 |
| Civilians in bounded payment recovery | 138 (unbounded old retries) | 6 |
| Civilians between completed jobs | 0 | 6 |
| Deliveries during final five minutes | 22 | 374 |
| Unexplained credit change | Not instrumented | 0 |
| Unexplained goods change, all nine commodities | Not instrumented | 0 |
| Scheduler backlog at end | 0 | 0 |

The final economy is still doing useful work; idling with satisfied demand or
without a funded buyer is legitimate. Six current payment recoveries have saved
finite deadlines rather than indefinite retry loops.

Final credits reconcile exactly:
`329,925 initial + 1,500,000 one-time market allocations + 224,801 household spending = 2,054,726`.
The lazy initial allocations belong to the existing population's markets (51
offworld markets and nine Sol commercial treasuries); they are saved once and
never reset on task cancellation or reload. Sol stocks alias existing inventories.
The goods proof counts every port/market once, every cargo hold, actual mined
entitlements, recipe inputs/outputs, consumption and explicitly lost cargo.

A separate restored stress population starts all **159 civilians** in legacy
unpaid deliveries with depleted treasuries. At 240 seconds it has 78 completed
deliveries and **zero waiting-payment** ships. At 600 seconds it has 229
deliveries, 28 working, 100 idle and 31 between jobs, again **zero waiting-payment**.
Of the idle ships, 51 retain owned cargo because no funded buyer currently needs
it. Their task reason and next economic-cycle recheck remain visible. Nothing
counts a held cargo load as a delivery.

The [life contract](npc-life-contract.md) documents fixed-price escrow versions,
funded-contract priority on restore, exactly-once transactions, 120-second/five
attempt recovery, actual reroute/dock requirements, production, household spending,
legacy player retail budgets and other explicit sources/sinks. A recovered ship
retains its identity, health, equipment, owned recharge and already-purchased cargo.

## Renderer component measurements

Quiet paired microprofiles use headless Edge 155.0.4283.45 at 1280 x 850 on the
same Windows device. Four preserved ship artworks, healthy/damaged stages and
both paths receive 120 draws per sample, three samples each. Every sample also
forces pixel readback; that cost is reported separately from JavaScript draw
submission. It is a diagnostic flush, not the game's normal presentation loop.

| Mean per draw | Initial | Final |
| --- | ---: | ---: |
| Directional lighting, JS submission | 0.574 ms | 0.540 ms |
| Directional lighting, draw plus forced readback | 12.314 ms | 8.299 ms |
| Warp, JS submission | 0.633 ms | 0.485 ms |
| Warp, draw plus forced readback | 8.418 ms | 8.202 ms |

This does not establish an FPS gain. Damaged-warp draw-plus-readback aggregate
worsened 1.2%; individual C'Thia warp readbacks remain variable and costly.
The 72 visual cases pass mean occupied-pixel channel difference below 8/255 and
under 10% significantly changed pixels against the frozen initial renderer.
Occupied pixels have alpha greater than 3 in either image; a significant pixel
has summed RGBA difference above 80 (mean channel difference above 20/255).
Worst observed mean is 5.65/255, with 4.69% significant pixels. The comparison
includes stage, lighting, rotation, warp, pause and animated lights; the complete
comparison sheet was visually inspected.

The component fixture retains 28,084,208 bytes in the sprite/shade/lamp cache,
under its 36,000,000-byte bound, and 15,314,944 bytes of decoder-owned art.
Source art retention is limited to 32 MiB/48 entries and processed art to
24 MiB/24 entries, with pending deduplication and bounded weak live references.
Optional prepared damage art is limited to 12 classes/64 MiB, eight in-flight
classes and a 64-generator cooperative queue. These are owned RGBA estimates,
not total browser/GPU memory; live effects, profile masks, planets and other
owners are reported separately where observable.

## Repeated browser frame measurements

Both revisions use the same 169-ship saved fixture, SHA-256
`2878ea104bafcc6a9b05b4840dc776d750c5b8b701c78e005aad82bd1e9d36bb`,
the same headless Edge 155.0.4283.45, Windows device (16 reported hardware threads,
32 GB reported device memory), 1280 x 850 viewport and DPR 1. Each scenario runs
three separate 20-second windows after setup/warmup. Tables pool all frames over
the resulting 60 seconds per scenario, rather than averaging percentiles.
Measurements run without other population tests or browser benchmarks competing
for CPU. These local measurements are not portable performance promises.

The crowded fixture starts 12 nearby retaliating civilians. Mining/debris uses a
real scripted mining command and timed nearby asteroid destruction; the initial
debris-only setup was rejected and its samples excluded. Warp appearance exercises
the real player warp/lighting/starfield rendering with repeatable simulation-clock
departure/arrival appearances while the same population keeps running. It does
not commit a calendar-skip journey; actual journey/save timing is covered by the
separate gameplay suites. Dev-map use preserves the living population.

| Mean CPU per animation callback | Simulation before | Simulation after | Rendering before | Rendering after |
| --- | ---: | ---: | ---: | ---: |
| Ordinary flight | 0.510 ms | 0.508 ms | 3.644 ms | 3.201 ms |
| Crowded combat | 21.473 ms | 11.662 ms | 8.918 ms | 9.010 ms |
| Mining/debris | 2.132 ms | 1.910 ms | 3.654 ms | 3.680 ms |
| Warp appearance | 0.534 ms | 0.505 ms | 4.180 ms | 3.251 ms |
| Dev map | 0.341 ms | 0.426 ms | 1.141 ms | 1.097 ms |

Each cell below is **before -> after**. Counts refer to the same 60-second
measurement duration; a faster scenario can produce more total frames.

| Frame intervals | Median ms | P95 ms | P99 ms | Maximum ms | Count >33 ms | Count >50 ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Ordinary flight | 18.4 -> 18.0 | 54.6 -> 42.6 | 74.0 -> 54.8 | 587.9 -> 91.0 | 661 -> 528 | 164 -> 58 |
| Crowded combat | 66.6 -> 54.5 | 103.1 -> 96.7 | 133.3 -> 114.7 | 200.0 -> 181.8 | 857 -> 923 | 688 -> 601 |
| Mining/debris | 30.3 -> 24.1 | 54.8 -> 50.8 | 78.8 -> 66.3 | 187.9 -> 127.0 | 864 -> 664 | 172 -> 120 |
| Warp appearance | 18.2 -> 17.9 | 60.5 -> 43.2 | 74.8 -> 60.6 | 97.0 -> 757.6 | 690 -> 486 | 257 -> 67 |
| Dev map | 6.1 -> 6.1 | 6.5 -> 6.4 | 14.0 -> 12.2 | 26.6 -> 24.1 | 0 -> 0 | 0 -> 0 |

| Main-thread tasks over 50 ms | Count before -> after | Total duration ms | Maximum duration ms |
| --- | ---: | ---: | ---: |
| Ordinary flight | 0 -> 0 | 0 -> 0 | 0 -> 0 |
| Crowded combat | 86 -> 6 | 5,006 -> 328 | 106 -> 63 |
| Mining/debris | 3 -> 3 | 230 -> 262 | 91 -> 153 |
| Warp appearance | 0 -> 0 | 0 -> 0 | 0 -> 0 |
| Dev map | 0 -> 0 | 0 -> 0 | 0 -> 0 |

Repeat P95 ranges were flight **54.3-56.1 -> 42.5-48.3 ms**, combat
**97.0-109.0 -> 90.6-102.5 ms**, mining **54.5-60.6 -> 48.5-54.7 ms**,
warp **54.6-65.7 -> 42.6-48.4 ms**, and map **6.4-6.5 -> 6.3-6.5 ms**.
The middle mining repeat had nine more >50 ms intervals despite the pooled
reduction. Crowded >33 ms counts rose. Map simulation CPU rose rather than fell.

The largest warp interval regressed to **757.6 ms**. That frame's callback was
about 4.4 ms (0.9 ms simulation, 3.2 ms rendering), and no corresponding >50 ms
main-thread task was recorded. The cause remains unresolved; the measurement
does not establish a GPU, browser-presentation or operating-system cause.
Mining's longest observed main-thread task also regressed to 153 ms. These
outliers and the dense combat intervals prevent a claim of uniformly smooth
playback or an overall FPS improvement.

The catch-up investigation found economic work caps previously restarted in
each small physics substep. Shared host-frame caps now retain due work and the
regression checks 15 substeps without multiplying those budgets. Actual dense
combat still performs roughly 56 fresh scene collections per callback because
moving combatants invalidate geometry. Civilian tactical work remains its largest
simulation owner (about 10.47 ms per callback); rendering remains about 9 ms.
Reducing those nearby tactical queries further needs additional spatial indexing
or a carefully validated decision cadence, while preserving swept collisions.

The final timed windows have zero observed scheduler backlog at the snapshots.
Separate one-second diagnostics after each final window recorded zero distant
tactical steering and firing attempts. These counters are distinct from
authoritative scheduled economic actions: ordinary flight processed 1,272 civilian
actions and 45 Sol events across its three windows; crowded combat processed
1,164 civilian actions and 45 Sol events while still simulating nearby attacks.
The Dev-map windows recorded zero ship-art preparation calls and zero detailed
ship-art draws; opening the map did not activate galaxy-wide artwork.

Observed final per-owner RGBA retention peaks across the scenarios include
36,203,756 bytes of optional damage art, 4,217,384 bytes of sprite layers, and
35,814,688 bytes of decoder/auxiliary artwork. These owners can share canvases,
so their estimates must not be added as a total. Snapshot JS heap observations
are also not retained-art or GPU-memory measurements; cache limits and churn
regressions provide the bounded-retention evidence.

| Scenario | Recorded frames before -> after | Economic detailed-NPC snapshots, peak before -> after | JS heap snapshot maximum, decimal MB before -> after |
| --- | ---: | ---: | ---: |
| Ordinary flight | 2,260 -> 3,017 | 6 -> 8 | 20.7 -> 47.0 |
| Crowded combat | 900 -> 1,102 | 4 -> 6 | 29.9 -> 40.0 |
| Mining/debris | 1,913 -> 2,375 | 6 -> 8 | 21.8 -> 30.7 |
| Warp appearance | 2,298 -> 3,009 | 6 -> 8 | 20.5 -> 26.4 |
| Dev map | 9,598 -> 9,667 | 14 -> 15 | 32.4 -> 43.0 |

The economic detail counters omit scripted/fighting roles and the player; they
are not a total tactical population count. The controlled crowded fixture starts
12 nearby tactical actors, and actual steering/firing/scene counters are recorded
separately. Heap snapshots are higher after the change; no forced-GC retained-heap
or total-process/GPU-memory benchmark was performed. Bounded caches trade some
retention for reuse, and these measurements do not establish a memory reduction.

Separate untimed representative eligibility snapshots include all registered
ship categories and the player. Before and after counts match: ordinary flight,
warp and map each have **16** eligible ships (one player, five tugs, ten civilians);
mining has **15** (one/five/nine); crowded combat has **24** (one/five/eighteen),
including 13 fighting civilians at that snapshot. These are representative
snapshots, not whole-window population peaks.

An untimed readback diagnostic traced mining's remaining cold work to
`asteroid-mining-effects.js` `partSamples`, called through `create`/`draw` and
`civilian-traffic.paintMining`. Its first 318 x 318 read took 138.4 ms before and
202.5 ms after in those diagnostic runs; subsequent reads were 1.4-5.4 ms.
This existing asteroid-visual construction path remains synchronous and is a
specific remaining bottleneck, separate from the migrated ship damage-art queue.
The ordinary timed mining windows each also recorded one 30-47 ms pixel read.

## Actual cold and warm ship encounters

Three fresh browser runs per revision reuse existing civilian identity 2, park it
near the observer, and give it each preserved artwork type 35, 36 and 64 in turn.
The population stays 169. Each encounter records five seconds, including real
nearby painting, first visibility, optional asset completion and a warm repeat.
This gives nine cold encounters per revision and 15 seconds per type/revision.
Earlier preparation-only probes are retained as supplements rather than being
represented as actual encounter measurements.

| Artwork type | First visible, median ms before -> after | All optional art ready, median ms | First-visible range before / after ms | Warm repeat ms |
| --- | ---: | ---: | ---: | ---: |
| 35 | 492.8 -> 289.3 | 466.3 -> 742.7 | 477.7-540.3 / 175.3-388.0 | 0-0.1 |
| 36 | 412.2 -> 107.5 | 399.7 -> 513.2 | 391.7-420.7 / 107.3-130.9 | 0-0.1 |
| 64 | 487.2 -> 289.1 | 473.4 -> 972.8 | 426.0-555.7 / 242.5-431.1 | 0 |

The old path rendered no base ship before all optional preparation finished. The
new path recorded 8-21 actual base-ship draws while optional art was still pending.
Cold >50 ms main-thread tasks fell from **21** (largest 310 ms) to **zero** across
these nine encounters. The cooperative queue's worst measured slices were
6.9/4.7/8.4 ms for types 35/36/64. Its 2 ms budget is a target, not a hard limit:
individual canvas operations and GC can overshoot it. Optional completion is
later; the improvement is early visibility and distributed main-thread work.

| Cold frame intervals, pooled per type | Median ms | P95 ms | P99 ms | Maximum ms | Count >33 ms | Count >50 ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 35 | 60.6 -> 48.4 | 97.5 -> 90.9 | 133.7 -> 109.0 | 454.1 -> 158.2 | 209 -> 225 | 161 -> 136 |
| 36 | 54.4 -> 37.1 | 90.8 -> 66.7 | 152.2 -> 97.0 | 302.3 -> 109.7 | 238 -> 244 | 153 -> 88 |
| 64 | 36.2 -> 29.9 | 66.8 -> 60.5 | 103.1 -> 78.5 | 309.2 -> 97.1 | 213 -> 202 | 76 -> 65 |

Cold frame delivery still contains slow intervals. Removing long synchronous ship
preparation does not establish hitch-free first encounters. Pixel comparisons of
12 alignment/unlighting stage cases against the frozen initial implementation
remain within one 8-bit channel level (CPU/GPU premultiplication rounding).
Queue/deduplication, early visibility, pending damage/destruction, pause and
saturated admission retry all pass their functional regressions.

## Regression and reproduction commands

The initial code passed **100/100 Node tests and all three existing browser
suites** before changes. The final implementation passes **139/139 Node tests**,
including the full 30-minute and restored depleted-treasury scenarios. All three
existing browser suites also pass, including ordinary flight, tug/civilian jobs,
mining, combat, the showcase, beam/contact alignment and the real reload/map-only
freighter demonstration. The new 72-case renderer and cold-art functional browser
checks pass with zero script errors or failed resources. CI runs all five browser
suites and the full Node glob; timing values are diagnostic, not portable gates.

```sh
node tests/reproduce-stabilization.cjs c41559c
node tests/reproduce-stabilization.cjs --working
node --test tests/*.test.cjs tests/*.test.js
python tests/browser-smoke.py
python tests/browser-ship-contract.py
python tests/browser-npc-lives.py
python tests/browser-render-paths.py --visual-only
python tests/browser-stability.py
python tests/browser-stability.py --revision c41559c --label before --measure
python tests/browser-stability.py --label after --measure
```

Reuse `test-results/npc-performance-initial-save.json` for both measurements.
Raw economic time series, saves, frame samples, cold/warm probes, screenshots and
reports are retained under ignored `test-results/`; CI uploads its checks as
artifacts. No artwork binaries or generated profiles are committed.
