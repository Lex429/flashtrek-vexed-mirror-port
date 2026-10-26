> The current market/docking verification and Linux browser comparison are in [Earth traffic recovery](earth-traffic-recovery.md). Historical measurements below remain tied to their original revisions and device.

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
