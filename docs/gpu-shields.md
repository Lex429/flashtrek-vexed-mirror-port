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
