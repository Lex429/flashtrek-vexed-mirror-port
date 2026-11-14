# Regional small stars

The flight background's small parallax stars vary continuously with the ship's
chart position. `regional-starfield.js` owns decorative palettes, density and a
private seeded point pool. `manual-flight.js` remains the owner of coordinate
conversion; changing the saved system frame or its government cannot change the
physical region's colour mix. There is no saved schema or gameplay randomness.

The seven spectral families are white, blue, cyan, green, gold, red and violet.
They tint the actual small points, including their centres. Regional proportions
crossfade and density fades individual points in/out. The continuous background
field covers the whole chart, including the uncharted systems and space between
destinations; compact geographic overrides blend into it.

| Area | Authored treatment | Density relative to the old small-star count |
| --- | --- | --- |
| Sol | Mostly white and blue, occasional gold | 1.0 |
| Andorian neighbourhood | Predominantly blue/cyan | About 3.5 |
| Vega | Dense blue-rich concentration | 3.9 |
| Klingon-side field | Red, amber and gold | 1.9 |
| Selected Romulan-side field | Green/teal mixed with cool stars | About 1.5 |
| Harman | Sparse green/cyan anomaly outskirts | 0.38 |
| Kardon | Red/violet anomaly pocket | 0.65 |
| Vex | Dense green/cyan/violet concentration | 3.6 |
| Badlands | Warm red/pink/amber, obscured background | 0.24 |
| Outer chart gap | Very sparse mixed stars | 0.17 |

These are visual design choices, not canonical stellar population measurements.
The [Badlands' plasma storms and pink-orange appearance](https://www.startrek.com/news/brief-history-of-the-badlands)
support its warm treatment; fewer visible stars are an artistic interpretation
of obscuration. Harman, Kardon and Vex follow Broken Mirror's own anomaly story.
Green points represent a stylized anomalous/nebular colour treatment. Faction-side
palettes are authored geographic associations, not a canon rule that ownership
determines stellar colour. Existing original map anchors remain unchanged.

The fixed pool holds 1,376 points across the original five small-star parallax
rates. Density is bounded from 0.15 to 4.0 and most additional points are faint.
Offscreen points are culled before painting. One shared 504-by-240 sprite atlas
holds 210 tinted size variants; travel and preparation reuse it. Model travel and
elapsed time are carried across system rebases so normal crossings retain small
star positions and twinkle phase. Pause/reduced motion retain the existing
display clock. System suns, bright-star optics and physical lighting keep their
existing owners.

Fast flight uses the original thin diamond taper and the nearer layers' fading
20/34-unit additive streaks, scaled by the shared model's speed response. Both
parts use each point's regional colour mix, including its smooth crossfades.
Trail opacity follows density fades; reduced motion suppresses the trails.
Viewport culling includes their full reach so an offscreen head can leave a
visible tail. The original acceleration, braking and direction easing still
belong to `vexed-space-model.js`.

Flight now supplies actual world velocity and physical speed independently of
camera displacement. The model retains a separate `trailAngle` for both regional
and legacy streaks, easing toward the opposite travel vector with a 0.12-second
response and at most 5 radians/second. Empty camera frames and true stops retain
the last valid axis; actual braking still fades the original speed effect.
Parallax positions remain immediately tied to the camera, and turning the hull
without changing its drift cannot rotate the streaks. Cinematic callers without
physical velocity retain their existing camera-driven travel with the same
retained streak axis. Original stars, palettes, sizes, depth, density, atlas and
20/34-unit trail artwork remain unchanged.

Run `node --test tests/regional-starfield.test.cjs` and
`python tests/browser-regional-starfield.py`. The browser check measures actual
coloured small-star pixels, density differences, pause/rebase continuity and
warm atlas reuse, and captures representative backgrounds and live gameplay.

## Ordered sprite batching

`starfield-batch.js` optionally paints ordered sprite instances using the same
210-tile atlas in one WebGL2 draw, followed by one copy to the main Canvas.
Positions, density, individual twinkle, spectral crossfades, culling and the
five parallax rates still come from the original starfield owner. No point
population, display scale, simulation state or gameplay random stream changes.

The batch ends before the first original Canvas speed trail. At ordinary
speeds all visible points can share a batch. At high speed the distant layers
share a batch, while nearer stars retain their interleaved diamond and screen
streak draws. This deliberately preserves painter order and original trail
generation; reusable trail artwork and other effects are a separate change.
The two existing full-screen black fills are also unchanged.

The default `auto` backend uses available hardware WebGL2. Unavailable, lost,
software-rendered or oversized contexts retain the original Canvas path.
Different Canvas compositing, filters or image-sampling settings also use the
original path. Context restoration recreates and uploads the atlas once.
`?starRenderer=canvas` selects the original renderer; `?starRenderer=batch`
requests the batch for diagnostics, including software WebGL when available.
Neither option changes saves.

One shared context retains a 504-by-240 RGBA atlas, a fixed 8,192-instance
buffer (160 KiB plus its GPU mirror), and a viewport-sized colour surface
capped at four million pixels. Larger canvases use the original renderer.
The snapshot reports these resource estimates; they do not measure all browser
or driver memory. No per-star canvases or recurring texture uploads are added.

`metrics().draws` continues to count logical star sprites. `canvasDraws` counts
actual star-image Canvas submissions, including the batch copy; `batchDraws`
counts GPU batch submissions, and `batchedStars` counts their instances.
These counters exclude original trail paths and do not represent FPS.

Run `python tests/browser-starfield-batch.py` for frozen-original pixel
comparisons, transparent and nebular backgrounds, multiple scales, fast-flight
ordering, pause/rebase continuity, atlas reuse, context loss/restoration and
fallback/memory limits. `--measure` runs alternating isolated renderer windows;
its submission times are not full-game or Chromebook FPS. Full-game comparisons
use `tests/browser-performance-review.py --star-renderer canvas` and
`--star-renderer batch` with identical fixture, source, viewport and populations.

### Turning streak regression

The read-only real-flight probe originally recorded four roughly 90-degree
streak-direction jumps across 839 draw callbacks. At two moments the physical
ship was travelling at 427.5 units/s but a zero camera delta supplied speed zero
and direction `(0,0)`. The renderer's `atan2(0,0)` then made lingering long
streaks horizontal before they jumped back. The original `courseLocked` input
also bypassed direction easing. The same seven-second key sequence after this
fix recorded zero large direction jumps across 575 callbacks. Different callback
counts are not an FPS comparison or evidence of a performance gain.

`browser-star-comfort.py` now forces the original condition through the actual
game's pure render-pose interface: the camera holds still for several paints
while the real ship keeps moving. Its run recorded five empty-camera frames
within 301 callbacks with physical speed retained and zero direction snaps.
The test also bounds turn steps, retains the direct camera/parallax course,
and checks low-speed, pause, reduced-motion and unchanged gameplay state.
Evidence is under `test-results/star-comfort/turning-trails.json` and the
ignored `test-results/star-trail-inspect/before-report.json` / `report.json`.

The focused Node suites passed 39 checks, including 30/60/120/144-Hz synthetic
updates, empty frames, braking, reversal, camera correction, actual painted
streak axes, rebases, randomness, preparation and background suns. Synthetic
updates are functional coverage only. All 108 frozen-original browser pixel
comparisons passed the unchanged 3/255 limit. Regional-colour/density and
background-sun browser suites passed as well. Source revision remains the
working tree based on `ee12e544`; only this trail correction's source changes
and cache tags are part of the fix, preserving other workspace changes.

### Step 1 validation, 2026-11-11

The frozen-original comparison passed 108 cases across six regions, three
scales, stationary/fast flight and black, nebular and transparent backgrounds.
The maximum premultiplied colour difference was 3/255, with the same original
points and original trail algorithms. Pause and system rebases were pixel-exact
within the batch backend. Resize/travel retained the atlas; context loss,
restoration, unavailable WebGL, alternate sampling and memory limits passed.

Full-game runs used frozen `test-results/starfield-batch/source-20261111`, the
same 1,210-entity save, 1366-by-768 viewport, DPR 1 and six-second windows after
active warm-up. The script, game-source and fixture hashes match across all
three reports. These are headless Edge measurements on the Intel Arc 140T host,
not physical-display or Chromebook qualification.

| Scenario | Canvas, two initial windows | Batch, two windows | Canvas repeat control |
| --- | --- | --- | --- |
| Ordinary flight FPS | 81.4–84.5 | 115.6–118.7 | 117.8 |
| Crowded combat FPS | 35.8–36.1 | 91.8–100.9 | 100.6 |
| Warp fixture FPS | 66.3–71.8 | 47.4–72.2 | 76.1 |

The later Canvas control reached the same flight/combat performance as batching.
The large initial FPS differences therefore cannot be attributed to this change.
Warp also varied substantially. No repeatable overall-game FPS gain or warp
improvement is established by these windows. Keep the actual slow windows.
All three runs completed without browser errors, retained the full population
and advanced authoritative simulation time; no simulation time was discarded.

Reports and raw frames are under `test-results/performance-review/` with labels
`stars-step1-frozen-canvas`, `stars-step1-frozen-batch` and
`stars-step1-frozen-canvas-recheck`. Earlier mutable-workspace diagnostics are
excluded because other nebula source files changed during their measurement.
The matched isolated starfield timing is recorded separately in
`test-results/starfield-batch/timing.json`; it does not establish overall FPS.
The standalone cold first batch paint took 45.9 ms, including initial atlas,
context, shader and upload work. That is separate from steady submission cost;
no cold-loading improvement is claimed. Full-game foreground loading and actual
Chromebook performance remain unqualified.

The final isolated run alternated Canvas/batch order over three two-second
windows per backend and scene, at 1366-by-768 physical pixels and 1.5 display
scale. Mean CPU submission times include the batch copy to Canvas, but do not
measure asynchronous GPU completion. Source hashes and browser version are
recorded in the JSON. No other test or benchmark from this task ran concurrently.

| Starfield scene | Canvas ms/frame | Batch ms/frame | Reduction |
| --- | --- | --- | --- |
| Sol, ordinary flight | 0.790 | 0.340 | 57% |
| Andorian, ordinary flight | 2.023 | 0.538 | 73% |
| Sol, fast flight with original trails | 1.057 | 0.953 | 10% |
| Andorian, fast flight with original trails | 2.896 | 2.122 | 27% |

Ordinary-flight Canvas star submissions fell from 425 to one in Sol and from
1,292 to one in Andorian space, plus one GPU batch submission. Fast-flight
counts fell from 432 to 126 and from 1,319 to 426 respectively; the original
Canvas trail path work remains. These are bounded drawing-work improvements,
not a 57–73% claim for overall game speed. Trail textures, glow/ship effects,
radar, simulation, loading and save optimizations remain outside this step.

### Further starfield cleanup, 2026-11-11

The next pass removes per-star Canvas alpha assignments from the GPU path,
retains only contributing colour bands, and caches the exact density/palette
at an unchanged chart position. Increasing point ranks let each layer stop at
its first absent point. Layer motion/trail constants are computed once per
layer. Original gradient paths and their blend order remain intact.
The private GPU context retains its own bindings and uploads size/transform
uniforms only when those inputs change. Resize and context restoration refresh
the retained state. Cache metadata is runtime-only and does not alter saves,
simulation clocks, point count, twinkle, coordinates or artwork.

The comparison rotates original Canvas, first batch and refined batch over
three two-second windows per version and scene. Regional coordinates advance
each frame; colours/density must therefore update during the timed flight.
All versions use the same 1366-by-768 surface at scale 1.5. These are CPU
submission times including presentation, not asynchronous GPU completion.

| Scene | Original ms/frame | First batch | Refined batch | Further reduction |
| --- | --- | --- | --- | --- |
| Sol, ordinary flight | 0.777 | 0.342 | 0.266 | 22% |
| Andorian, ordinary flight | 2.304 | 0.688 | 0.504 | 27% |
| Sol, fast flight | 1.421 | 1.028 | 0.933 | 9% |
| Andorian, fast flight | 3.984 | 2.806 | 2.651 | 6% |

Within this run the refined ordinary-flight costs are 66% and 78% below the
original Canvas renderer. The existing fast-flight trails remain the larger
remaining cost. These percentages compare versions inside the same new run;
the earlier fixed-coordinate measurements remain recorded above.

The browser check passed 108 exact first-batch/refined comparisons and 15
additional regional crossings. The original Canvas colour/alpha bound remains
3/255. Pause/rebase, changed transforms, resize, atlas reuse, context loss,
restoration, unavailable WebGL and memory/sampling fallbacks passed. All 31
Node checks, the live regional-starfield browser check, the background-suns
browser check and actual Inventory/equipment/reload checks passed.

Full-game tests used `test-results/starfield-refine/source-before` and
`source-after`. Only the two starfield scripts and their HTML version tags
differ. The fixture, harness and all other game source hashes match; both
retain 1,210 entities. Each scene has two eight-second windows after active
warm-up, with raw frames and slow windows retained.

| Full-game scene | Before FPS | After FPS |
| --- | --- | --- |
| Ordinary flight | 119.2–119.3 | 118.3–119.3 |
| Crowded combat | 88.8–89.1 | 33.7–92.0 |
| Warp fixture | 36.8–67.2 | 33.8–57.5 |

Normal flight is effectively unchanged in these headless measurements. Combat
and warp remain variable, including slow after-windows; these results do not
establish an overall FPS improvement or a successful performance qualification.
One slow after-combat window ended with 0.115 seconds of physical debt. The
renderer does not discard simulation time or alter the simulation budget.
No Chromebook or foreground refresh claim is made.

Evidence is in `test-results/starfield-refine/timing.json` and `pixels.json`,
and `test-results/performance-review/stars-refine-before.json` /
`stars-refine-after.json`, with source, fixture and harness hashes. Reproduce
the isolated comparison with `python tests/browser-starfield-batch.py --measure
--before-root test-results/starfield-refine/source-before --source-root
test-results/starfield-refine/source-after --output-dir
test-results/starfield-refine`.
