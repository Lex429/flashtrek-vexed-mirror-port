# Retained GPU shields

The active `html-games/broken-mirror-port/index.html` loads `shield-gpu.js` and
`shield-gpu-live.js` by default. A contact produces a bright flash, a cyan outline
and an expanding wave; depletion produces an orange segmented collapse. The
ordinary effect lasts 900 simulation milliseconds and collapse lasts 430. Pause
freezes the same simulation clock, including a flash paused on its birth frame.

`ship-effects.js` owns visual-event lifetime and the beam's current shared
contact. Its front pass submits that event to the GPU adapter. The adapter reads
the interpolated descriptor, definition-owned radii, camera, rotation, zoom and
display scale. It does not damage ships, intercept shots, advance physics,
change statistics, write saves or replace any gameplay owner. Physical hull
contact retains its separate brief glint. Normal ship lighting remains enabled.

The renderer retains quad geometry and shader programs. All compatible fields
are drawn in one instanced additive batch into a transparent DOM canvas above
flight artwork and below the HUD. Overlapping energy fields add light together;
there is no per-ship background copying or distortion. The game keeps its normal
Canvas hull, weapon and background drawing. WebGL output is never copied into
Canvas. No runtime blur, masks, per-ship filters, rebuilt paths or animated
texture uploads are needed. Per-frame instance parameters update retained GPU
buffers.

Storage is bounded at 128 visual slots, one current impact per ship, 21,728 GPU
buffer bytes, 20,480 CPU instance-array bytes and a four-byte placeholder texture
in live flight. The framebuffer scales with the existing display backing size;
these counts exclude browser/driver overhead. Repeated hits refresh a slot.
Visual overflow reuses the oldest slot without suppressing gameplay damage.
Unseen ships, expiry, menus and the galaxy view hide the overlay. State reset
clears slots. Context loss restores the existing Canvas path until a fresh GPU
renderer is available. Unsupported WebGL2 removes the failed overlay and keeps
the existing Canvas effect, including its bounded scratch-surface reuse fix.

## Verification

The release checkout starts from `a8a37a8`, the current GitHub main at integration
time. Existing candidate checkouts, unrelated work and player browser profiles
are untouched. Tests use fresh browser storage.

- All 506 existing Node tests passed before integration. All 517 Node tests pass
  after integration, including six scratch-cache and five adapter regressions.
- `browser-smoke.py`: ordinary movement, interception, environmental effects,
  shielded/unshielded impacts and owned-recharge save/Continue.
- `browser-ship-contract.py`: shared role geometry, beam attachment, custom
  surfaces, pause, Inventory and projectile save/reload.
- `browser-beam-targeting.py`: rearward fire, moving interception and exactly-once
  damage after real save/reload. The actual native gameplay frame compares the
  GPU flash to the beam endpoint within 0.025 backing pixels and reads visible
  GPU contact pixels, rather than requiring the old Canvas drawing call.
- `browser-unified-equipment.py`: actual hull purchases, fitting, six Olympic
  drones, Inventory screenshots, mode-separated reload and save-failure UI.
- `browser-shield-gpu-visuals.py`: 15 design checks, including all 100 ships'
  visible shield pixels, contact placement, overlap, animation, expiry, collapse,
  bounded resources and explicit disposal.
- `browser-shield-gpu-live.py`: default installation, a fractional birth time
  paused immediately, pure GPU rendering, map transitions, expiry, resize/DPR,
  actual WebGL context loss/restoration and a device without WebGL2.

Run the new checks with:

```sh
node --test tests/shield-cache.test.cjs tests/shield-gpu-live.test.cjs
python tests/browser-shield-gpu-visuals.py --output test-results/shield-gpu-design
python tests/browser-shield-gpu-live.py
python tests/browser-beam-targeting.py
```

Screenshots and reports go to ignored `test-results/`. The normal CI workflow
runs the new visual and live tests alongside the existing suites.

## Performance scope

**The original controlled 100-ship measurements used ship lighting OFF.** In
three warmed 20-second windows per condition at 1280 by 850, DPR 1, headless
Edge 155 on Intel Arc, shields OFF averaged 126.84 FPS (P95 8.9 ms, P99 9.4 ms);
the demonstrated GPU design ON averaged 127.59 FPS (P95 8.9 ms, P99 9.5 ms).
All 100 ships were fully visible and all 100 shields stayed active throughout
ON. There were no pauses above 50 ms. The small ON/OFF average difference is
variance, not evidence of a negative shield cost.

Those measurements did **not** pass strict smooth 120-FPS acceptance: percentile
frame times exceeded 8.33 ms and physical display delivery was not verified.
The separate GPU timer samples averaged 0.248 ms for the complete renderer scene,
not shields alone. Idle and shields-OFF cadence showed the same remaining frame
delivery limit. The prior actual-combat replay averaged 123.61 FPS with only
3–20 ships visible and P99 16 ms; it cannot establish 100-ship 120-FPS battles.

These are the demonstrated candidate's earlier measurements, not a new benchmark
of this default game integration. Integration changes the event wiring and
corrects float32 clock visibility; it retains the demonstrated shader artwork.
No new battle-performance claim is made from functional regression results.

## Shield polish comparison

The blue rim is thinner and dimmer, with extra light around the actual impact.
The contact stays white hot for roughly 45 ms and cools smoothly to cyan by
80 ms. A softer wave follows it; the strong illumination fades by 255 ms and
leaves a subtle tail. Time-dependent colour and brightness are computed at the
existing quad vertices and passed as flat values to the fragment shader.
The instanced batch, geometry, bounds, storage and live adapter are unchanged.
Collapse pixels match the previous shader exactly at five sampled ages.

**Ship lighting OFF:** headless Edge 155.0.4283.62 on Intel Arc with ANGLE D3D11,
1280 by 850, DPR 1. All 100 original-size ships remained fully visible with all
100 shields active. Each version received three warmed 20-second windows,
followed by three more with the order reversed to check a small frame-time
difference. All twelve windows are included in the pooled results:

| Version | Average FPS | Mean ms | P95 ms | P99 ms | Worst ms | Pauses above 50 ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Previous GPU shields | 126.47 | 7.907 | 8.60 | 9.40 | 63.90 | 2 |
| Polished GPU shields | 124.78 | 8.014 | 8.80 | 9.70 | 42.60 | 0 |

The polished mean frame time was 1.35% higher, within the observed run spread;
this is not evidence of zero additional cost or exact equivalence. Separate
GPU queries averaged 0.287 ms before and 0.254 ms after for the complete scene,
with lower means in all three pairs. Retained textures, buffers, instance arrays
and framebuffer sizes stayed unchanged, with no additional texture uploads.
The percentile frame times still exceed 8.33 ms, so locked smooth 120 FPS and
physical monitor delivery remain unproven.

All 517 Node tests, the 15 existing GPU visual checks, ten focused polish checks
and the live, beam alignment, ship contract, equipment/save and smoke browser
suites passed. The focused checks cover flash colour, localized brightness,
fading, unchanged collapse pixels and visible contacts throughout a complete
hit cycle for all 100 ships.

Separate native combat checks with normal lighting ON averaged 12.25 FPS before
and 9.96 FPS after, with 3–20 and 5–20 visible ships respectively. Both exercised
AI, movement, beams, projectiles, shield/hull damage and interception, with at
most one damage application per shot. These single battles diverged in activity
and population and cannot isolate shield cost or establish battle performance.

The comparison tools are `tests/browser-shield-polish.py`,
`tests/browser-shield-polish-pixels.py` and
`tests/browser-shield-polish-combat.py`; use `--help` for their arguments.
The saved baseline comes from commit `e0445ac`: its `shield-gpu.js`,
`shield-gpu-live.js`, and the replay's `index.html`, `replay.js` and `ships.js`
are stored together in the baseline directory. Recordings, screenshots, raw
timestamps, query samples and full reports remain in ignored `test-results/`.

## Brighter ripple with an independent fade

The current refinement uses `8987ef3` as its polished comparison baseline and
restores the cyan-blue colour range from `e0445ac`. It keeps the polished soft
wave edges and localized contact light. The ordinary rim remains softer than
the original bright hoop. The white-hot contact still cools between 45 and
80 ms and has its own quick brightness decay.

Ripple travel and field fading now have separate clocks. The wave reaches past
the farthest possible shield point by 380 ms, including its soft edge; the field
holds its brightness until 460 ms, then smoothly fades to the existing 900-ms
expiry. Its conservative reach uses the shared ellipse radii plus the actual
contact offset, so an elongated or small shield completes its journey too.
Repeated hits refresh the existing bounded slot. Collapse is unchanged.

Only the normal-effect shader parameters and wave radius changed at runtime.
The geometry, instance storage, bounds, live adapter, drawing passes, pause and
gameplay owners are unchanged. The radius reuses an existing shader varying;
there is still one instanced shield batch.

**Controlled renderer comparison: ship lighting OFF.** Edge 155.0.4283.62,
headless, Intel Arc / ANGLE D3D11 (driver 32.0.101.9150), 1280 by 850, DPR 1.
Both versions used the same 100 fully visible mixed-fleet ships at the existing
replay's pinned artwork dimensions,
movement, recorded hits, background and camera. All 100 shields remained active
on every measured frame. Each version received three sequential warmed
20-second windows, followed by three more in reversed order after a slow final
revised window. All twelve windows are retained:

| Block | Version | Average FPS | Mean ms | P95 ms | P99 ms | Worst ms | Pauses above 50 ms |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| First three | Polished baseline | 123.56 | 8.093 | 8.90 | 15.80 | 48.40 | 0 |
| First three | Revised ripple | 123.10 | 8.124 | 8.70 | 16.70 | 72.20 | 5 |
| Reversed confirmation | Polished baseline | 128.06 | 7.809 | 8.60 | 9.00 | 13.70 | 0 |
| Reversed confirmation | Revised ripple | 128.79 | 7.765 | 8.40 | 8.70 | 21.10 | 0 |
| All six | Polished baseline | 125.81 | 7.949 | 8.60 | 10.20 | 48.40 | 0 |
| All six | Revised ripple | 125.94 | 7.940 | 8.60 | 9.60 | 72.20 | 5 |

The revised mean is 0.009 ms lower overall; the first block was 0.030 ms higher.
These small differences change direction between blocks and are within the
observed run variation. The slow revised window averaged 117.37 FPS and contained
all five long pauses; it is not discarded or attributed to a specific cause.
The confirmation did not reproduce those pauses. Separate GPU queries for the
complete scene averaged 0.251 ms before and 0.242 ms after, with lower revised
means in all three pairs. No meaningful shader performance regression was
detected. This does not prove zero cost or locked smooth 120 FPS: percentile
times exceed 8.33 ms and headless RAF does not verify physical monitor delivery.

Retained replay resources stayed at 8,388,600 texture bytes, 21,728 GPU buffer
bytes, 20,480 CPU instance bytes and a nominal 4,352,000-byte framebuffer.
There were six initial artwork uploads and no further texture uploads in any
window. The live overlay still uses its four-byte placeholder texture.
Boundary V8 heap changes ranged from -4.27 to +2.21 MB before and -3.10 to
+1.98 MB after; these samples are not GC-normalized. Browser/driver overhead,
compiled shaders and actual driver VRAM are outside the nominal resource counts.
The short runs cannot establish absence of a long-session memory leak.

The focused pixel regression now checks clear travel across five small/large
ship types, sustained brightness before completion, fading afterward, the brief
white contact and exact unchanged collapse pixels at five ages. CI installs
Pillow explicitly for the existing GPU pixel tests, then fetches the pinned
polished baseline for this regression.

`tests/browser-shield-ripple-capture.py` captures matched ordinary ships at the
actual native-game scale. Its side-by-side video labels the first 4.8 seconds
as normal speed (1x) and the last 2.4 as slow motion (0.5x). Offline labels and
an unused-space crop do not resize artwork. Captures and encoding are outside
timing measurements. Raw results and the comparison recording are retained in
`test-results/shield-ripple-20261023/` and are not committed. Actual combat is
verified separately; this renderer replay does not establish battle performance.
The capture reads dimensions and shield radii from the live shared definitions,
independently of replay metadata. In particular, the pinned replay's Sail width
is 90 logical pixels, whereas native gameplay uses approximately 21.27. The
benchmark remains unchanged between versions; the ordinary-ship video uses the
actual native width.

All 517 Node tests passed before and after this refinement, as did eight local
site tests, 15 existing GPU visual checks, 13 focused ripple checks in Edge and
Chromium, and the live GPU, beam alignment, ship contract, equipment/Inventory
and smoke browser suites. The separate native combat check used normal lighting
ON and 20 initial AI combatants: baseline 11.61 FPS with 1–20 visible ships,
revised 9.93 FPS with 6–20. It recorded 466/437 shots and 363/366 shield impacts,
including physical interception and at most one damage application per shot.
Pure GPU rendering preserved serialized gameplay state. These battles diverged
in population and activity and cannot isolate shield cost; normal combat remains
far below 120 FPS under these conditions.
