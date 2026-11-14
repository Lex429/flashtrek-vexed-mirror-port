# Badlands region

## Production weather

The normal-game region now includes the effects developed in the Sol preview:
top-down plasma funnels, irregular branch lightning, broad sheet flashes and
plasma heat fronts, alongside the existing turbulent currents and hull wakes.
Funnels retain their 64–98-unit radii and native orange cloud appearance. Their
shared forces pull, spin and eject ships, with exposure routed through the
ordinary shield/hull damage owner. The region remains free of asteroid deposits.

`badlands-weather.js` generates stable local geometry from world cell IDs.
Funnel cells are 700 × 650 units; lightning and heat use 1,000 × 800-unit cells.
Three bounded 128-entry caches retain nearby geometry, queries and event recipes;
crossing the region does not create a region-sized entity registry. Ship queries
use the descriptor's system coordinate frame and do not depend on the camera.

Lightning clusters vary between sparse and rapid activity with quiet gaps.
Lightning and heat read saved simulation seconds, preserving phase across pause,
Continue and tile eviction. At most three nearby lightning events and three heat
fronts are selected. The existing material shader receives at most eight visible
funnels per core, prioritizing nearby ones. Empty retained cores stop receiving
vortex forcing; physical ship encounters remain independent of that visual bound.

Production weather has one shared lightning renderer and one shared heat model.
Every overlapping core receives a local projection of the same world events and
clock. Branch lightning recolours the complete blended optical layer once after
tile batching, preserving alpha and avoiding clipped dark rectangles or doubled
flashes at joins. Sheet illumination and heat fronts reuse the existing native
material effects and cached scalar assets; there is no per-funnel canvas or new
particle pass. The Sol development bank and its controls remain available.

`tests/badlands-weather.test.cjs` checks stable geometry in distant sections,
coordinate conversion, ship forces, irregular events, pause/Continue phase and
bounded caches. `tests/browser-badlands-weather.py` exercises actual normal-mode
flight, shield damage, spin, material projections, clear hull interiors, distant
sections and a durable 1,210-entity Continue. Existing Badlands flight/blending,
Sol storm/heat and lightning-compositing browser checks also pass. Their artifacts
are retained under `test-results/badlands-weather/` and the existing suite folders.

Two isolated foreground 12-second full-game flight windows used frozen source
roots, the same save, all 1,210 entities, and unchanged cloud detail. The previous
weather averaged 119.76 FPS; production storms averaged 111.22 FPS, with a
16.6-ms 95th-percentile frame and a 33.8-ms worst frame. Mean cloud CPU cost was
1.10/1.60 ms before/after; mean GPU material draws were 0.199/0.165 ms. The latter
does not establish a GPU improvement: funnel forces change the physical route,
and these are short diagnostic windows. Maximum sampled visible fluid lag was
49.6/91.5 ms. Both retained full simulation progress, focus, visibility and stable
source hashes. The storm run sampled lightning in 33/120 observations and heat
in all 120. Occasional frame hitches remain; this is not zero-lag qualification.
`test-results/badlands-weather/audit.json` retains all windows, including an entry
fixture startup failure and two windows overlapped by other validation processes.
`performance/isolation.json` identifies the uncontaminated pair and retained
overlaps. No saved crews or fluid detail were removed to obtain these results.

## Turbulent currents

`badlands-currents.js` supplies a deterministic world-space wind field in the
production Badlands and the local Dev Sol storm bank. Broad intersecting flows
change direction across the region and build/ease in irregular-feeling gusts.
They taper at the physical edge and remain independent of camera movement.
The default-enabled **Turbulent currents: drift and shear** Dev control allows
comparisons without rebuilding the nebula.

The shared ship owner combines ambient drag with existing vortex forces, then
uses the ordinary motion integrator. Hull area/mass and rotational inertia set
coupling. Pilots retain thrust, steering and braking; acquired momentum uses the
existing saved `motionFlow` schema. Currents cause no direct damage, fuel charge,
instant velocity reset or separate movement simulation. Vortex exposure retains
its existing shield/hull damage owner. Landing, warp and ships outside the local
physical region are excluded.

The existing gas renderer advects its own cloud samples along the same current
direction, without new particles, bitmap assets, colours or render passes.
The conservative gas worker reuses live tiles, sampling each tile's wind once
and blending bounded velocity targets through contiguous rows. Unoccupied
retained cores stop receiving force, letting their old wakes coast and settle
while optical flow remains visible; this bounds work during long flights.
Force options and counters survive checkpoint/recovery; reduced motion calms visual
advection while physical wind still follows the shared simulation clock.

`tests/badlands-currents.test.cjs` covers eligibility, gust continuity, physical
and visual direction, weather-coordinate coherence, mass/inertia, manual control,
momentum continuation, vortex damage integration and conservative gas recovery.
`tests/browser-badlands-currents.py` covers real drift, keys, pause, save/resume,
animated gas, 1,062 clear hull probes, exact worker parity and GPU/Canvas recovery.
The existing fixed vortex encounter explicitly disables ambient wind so it can
keep checking the original fixed route; combined forces have separate coverage.
Functional and timing artifacts are retained in `test-results/badlands-currents/`.

The frozen release was measured in two sequential foreground 12-second windows
with the same saved 1,210 entities, local Dev traffic policy, two pushed rocks
and repeated sheet lightning. No-input drift delivered 59.33 FPS, and held-W
flight 59.09 FPS. GPU material pairs averaged 0.168/0.231 ms, and sampled fluid
lag averaged 0.054/0.063 seconds. Flight passed the existing 60-Hz gate; the
no-input window retained one 67.2-ms hitch, so the whole run is not lag-free
qualification. Physics time was retained, with approximately 0.009 seconds of
host scheduling debt at the endpoints. Earlier current-off/current-on windows,
including all failed intervals, are also retained; changed trajectories and
machine variation do not establish a general FPS improvement. `audit.json`
records stable release hashes, populations, debt and every measured window.

The Badlands (world ID 73) is an authored plasma region, not a solar system.
Its shared map/flight ellipse is 128,000 × 96,000 world units, centered on the
existing chart marker. These are game geography dimensions, not a canonical
astronomical measurement. The earlier envelope was approximately 8,782 × 7,085.

`badlands-region.js` loads after world/catalog data and before their consumers,
including in the startup/travel worker. It removes the invented star and marks
the remaining region anchor `render:false`. Flight, radar and local map bodies
omit that object. The anchor remains available to saved navigation and relics.
Small stars, bright stars, system suns, flares and stellar illumination fade
through the outer approach and disappear well before its physical border, even
in another reference frame. The physical map/flight ellipse stays unchanged.

Warp planning and the native arrival sequence place the player 180 units inside
the boundary along the incoming bearing. There is no automatic flight to the
center. Saved pending arrivals migrate to the edge without charging again;
ordinary existing saves in the interior keep their position.

Nearby system envelopes are pushed out around an 88 × 68 chart-point clearance
ellipse and relaxed to avoid crowding. Sol stays fixed. Current map positions
drive travel and distance pricing; the preserved geological positions drive
existing local asteroid seeds. `nativeBadlands.moved()` exposes the revision.

There are no Badlands deposits or asteroid belts. Both lane prospects and sparse
interstellar rock sectors exclude its physical interior, with hull clearance.
Old static lane identities and sufficient slot capacity remain available after
the chart revision. Funded journey endpoints and intermediate waypoints migrate
once under `badlandsRegionVersion:1`, retaining IDs, cargo, paid terms, progress
and scheduled deadlines. The bootstrap snapshot carries this version marker.

The permanent plasma uses its original 94 × 74 chart-point support, with an
additional outskirts envelope that pulls the thick fog much closer to the map
boundary. Contiguous 2,000 × 1,400-unit material tiles replace scattered cores
there. They share a global gas origin and simulation phase, retain the existing
3-unit fluid cells, query actual shared hulls, and conserve displaced material.
Only nearby tiles are instantiated; the region is not one giant texture/grid.
Continuous weather retains at most 16 tiles; other weather keeps its 3-core cap.
Painting blends tiles across a 128-unit overlap using weights that sum to one,
including at four-way corners. The continuous tiles add their weighted layers
before ordinary clouds blend over them, avoiding bright overlap lines. Nearby fields share one
GPU output for both optical layers, avoiding separate GPU-to-Canvas copies.
Bounded per-field textures retain unchanged density/source uploads and are
released with their material renderer. The standalone path crops presentation
to the visible portion. A fully material-covered viewport skips duplicate parallax
gas. Retained offscreen material continues accepting its normal elapsed time.
Sections are prepared 256 units before entering view. Color, optical opacity and
the plasma boundary are evaluated per world position, rather than at each tile's
center. The outer plasma blends between blue, purple and teal, then becomes
orange inside the Badlands. Parallax cutouts belong to their own cloud, so the
main plasma cannot erase an unrelated colored wisp. These are optical changes;
the original fluid grid, accepted time, displacement and conserved mass remain.

Outward plasma plumes are seeded from saved simulation time every 18 seconds,
live for 216 seconds, and fade while traveling past the border. The outskirts
use smaller, fainter purple, blue, green, amber and red plumes. The permanent
physical fringe remains interactive; plumes beyond it gain ordinary interactive
material cores as well. Interior overlap uses the continuous base as one owner.
Ordinary interstellar storms retain their 900-second cycle. Paused weather does
not advance. No additional image assets or gameplay random calls are required.

Validation:

```powershell
node --test tests/badlands-region.test.cjs tests/system-catalog.test.cjs
python tests/browser-badlands.py
python tests/browser-badlands-approach.py
python tests/browser-badlands-blending.py
python tests/browser-galaxy-nebula-performance.py --region badlands-seam --output test-results/badlands/performance --seconds 20
```

Browser checks use isolated saves and the production 1,200-crew roster, including
100 medical ships. Refresh qualification is separate from correctness; neither
the standalone fluid stress check nor headless screenshots prove monitor FPS.

The approach is sampled in shared chart coordinates by `nativeBadlands.approach`.
Both star counts and brightness (including speed trails) use this visibility.
Its distance outside the physical ellipse varies gently with direction, giving
the outskirts irregular edges. The entire transition is compressed to 24% of
its former outside width, fitting into the gap before neighboring solar systems.
Complete catalog system envelopes always retain normal stars and suns, with a
short fade margin after leaving their boundaries. Vega and Bajor keep their
ordinary skies. In the compressed coordinate, stars fade from full strength
at 2.24 to zero at 1.62. There is a clear starless buffer before colored wisps
begin at 1.48; the main plasma builds over 1.22 through 1.00. General interstellar
weather also fades out around this approach so an unrelated storm cannot fill
the clear buffer. Inside 1.00 the approved orange plasma profile is preserved.
These visual envelopes do not move systems, modify navigation, or migrate saves.
Plume travel and spread use that same compression so the colored approach also
fits into this smaller gap. The approach browser fixture verifies the inward
border of every neighboring solar system, captures four of their normal skies,
and captures eight approach distances and all five plume colors;
its explicit time binding is for visual correctness, not an FPS measurement.

Before the outskirts refinement, measured on the existing 120 Hz, 2560 x 1600
desktop display (1280 x 800 CSS
pixels at DPR 2), two sequential 20-second native fullscreen cases used frozen
source copies and the same saved 1,210 total entities. The battle places 20
existing armed crews nearby; a fixture-only access exception prevents empty
Badlands residency recovery from relocating them during the test. Hull and
weapon statistics, firing rules and simulation clocks stay unchanged.

| Drawing path | Flight FPS | 20-ship combat FPS |
| --- | ---: | ---: |
| Separate patch presentation | 28.46 | 15.71 |
| Combined GPU presentation | 118.36 | 70.35 |

The combined run accepted 1,314 combat shots. Its worst frame was 25.2 ms in
flight and 141.6 ms in combat (22 combat frames exceeded 50 ms), so it does not
pass the strict uninterrupted 120 Hz gate. It is not a Chromebook measurement.
Both frozen source sets remained stable. Raw frames, queues, conditions, source
hashes and fixture hashes are in `test-results/badlands/final-batched/` and
`final-separate/`; these are local generated evidence, not committed assets.

The seamless-color refinement is covered by `browser-badlands-blending.py`.
Four overlapping sections match a single continuous reference to within 3/255
in premultiplied display values (8-bit alpha quantization can produce larger
unpremultiplied differences in almost transparent pixels). A real key-driven
flight checks joins across multiple sections and audits conserved fluid mass.
A separate Canvas-material context verifies the same weighted fallback.

Sequential frozen-source desktop runs for this refinement used the same saved
fleet and 20 armed crews: normal flight averaged 119.05 FPS before / 119.25 after;
combat averaged 71.18 before / 69.10 after. Both accepted 1,204 combat shots.
The after run had no normal-flight frames above 50 ms; combat still had 13 such
frames and a 108.5 ms worst frame. These are two 20-second windows per version,
not a locked-refresh guarantee. Sources remained stable; raw frames, fixture
hashes and conditions are in `test-results/badlands-blending/performance-*`.

The weather material path now draws the existing animated gas shader directly
into each field's retained GPU source texture. It keeps the same shader,
resolution, 30 Hz source cadence and optical layers while avoiding the repeated
gas-canvas copy and source-texture upload. Each field also retains its pending
hull-sweep texture instead of reallocating that texture when switching sections.
Acknowledging one field cannot clear another field's unpublished movement.

New sections obtain their exact initial density through one shared worker with
an OffscreenCanvas. Its GPU readback runs off the flight thread. The dispatcher
allows one request in flight and at most 24 live requests, skips canceled queued
sections, and falls back to the original seeding path on unsupported devices or
worker failure. A fluid worker failure before the seed arrives retains and
replays every accepted pose after seeding. Context loss retains the existing
Canvas fallback and recovery path. No fluid steps or elapsed time are discarded.

`browser-nebula-texture.py` compares the direct source with the original Canvas
transfer: the maximum measured premultiplied difference was 1.282/255 with zero
alpha difference. Worker seed alpha matched exactly for continuous and finite
clouds. The test also checks animation, paused reuse, interleaved field sweeps,
acknowledgment isolation and GPU loss/recovery. It runs in CI with the existing
presentation and Badlands seam regressions.

The following sequential 15-second frozen-source comparisons used the same
saved 1,210 entities, 1280 x 800 viewport and normal held-W flight across actual
Badlands sections, with no tornadoes. Only the four cloud modules differed.
CPU diagnostic windows and clean frame-delivery windows were separate.

| Measurement | Before | After |
| --- | ---: | ---: |
| Mean cloud animation/drawing CPU submission per frame | 2.315 ms | 2.200 ms |
| 95th percentile cloud CPU submission | 3.9 ms | 3.6 ms |
| Worst cloud CPU submission in diagnostic window | 17.0 ms | 5.1 ms |
| Clean whole-game headless RAF | 60.02 FPS | 59.88 FPS |
| Oldest sampled visible fluid publication in clean flight | 16.7 ms | 33.4 ms |
| Worst whole-game frame in clean flight | 17.0 ms | 33.4 ms |

These windows show no whole-game FPS increase and do not certify a 10 ms fluid
update or uninterrupted display refresh. CPU submission excludes GPU completion.
An earlier pair showed the opposite fluid latency change (116.7 to 50.0 ms),
so these short windows do not establish a consistent publication-latency gain.
The candidate used the worker seed and direct texture paths. Fixture hashes,
stable source hashes, raw frames,
fluid queues and the paired results are in
`test-results/badlands-cloud-optimization/summary.json`. Earlier diagnostics that
accidentally replaced a live batching getter with a fixed value are explicitly
excluded in `invalid-diagnostics.json`; profiler windows are also excluded from
the paired timing figures. The final control includes the same parallel tornado
shader edits as the candidate; `shared-shader-audit.json` records those exact
hunks. A later concurrent edit prewarms masks only for Dev plasma with vortices;
the summary records its diff separately from the frozen timing sources.

Additional focused checks:

```powershell
node --test tests/nebula-work-reuse.test.cjs tests/nebula-material.test.cjs tests/parallax-nebulae.test.cjs tests/dev-sol-fog.test.cjs tests/badlands-region.test.cjs tests/background-suns.test.cjs tests/plasma-vortices.test.cjs tests/dev-nebula-storm.test.cjs
python tests/browser-nebula-texture.py
python tests/browser-nebula-presentation.py
python tests/browser-galaxy-nebulae.py
python tests/browser-parallax-nebulae.py
```

The material worker also drains accepted fluid time after a slow input, even
when no newer pose arrives. Previously `updateMany` serviced at most four fixed
fluid steps per input, and the worker could acknowledge completion and go idle
with many full steps still pending. Repeated slow inputs could therefore leave
a growing wake/refill backlog while the worker had no continuation scheduled.

`continueFlow` retains the existing 30 Hz solver and accepted hull pose. The
worker services remaining steps in cooperative tasks with a 4 ms scheduling
budget, then acknowledges completion once less than one fixed step remains.
It publishes changed density at the same pose sequence, and `flush` waits for
that pose's fluid work as well as its displacement. Checkpoints retain the last
flow options; recovery finishes a partial pose before replaying later movement.
No elapsed time or movement is discarded, and continuation adds neither a new
pose nor a new simulation clock tick.

`browser-nebula-flow-debt.py` is a correctness reproduction using a real worker,
20 hulls and the production-size 720 x 520 fluid grid at three world units per
cell. Five slow inputs accept 2.5 seconds. The frozen baseline acknowledged
completion with 1.8333 seconds still pending, unchanged after 250 ms idle. The
corrected worker finished all accepted time in about 202 ms in the initial
browser run, with a floating-point remainder near zero and exactly the same
published density as the reference calculation. That is total processing time
for the five-input reproduction, not per-frame cost or a gameplay FPS result.
This test runs in CI; unit checks cover timer/MessageChannel scheduling,
unchanged-pose publication, reduced motion, exact fixed-step results and partial
worker recovery.

The diagnosis and frozen source comparisons are under
`test-results/badlands-pipeline-profile/`. Crowded-game cases retain the same
saved 1,210 entities and move 64 existing crews onto crossing routes through
their normal movement controller. They do not add crews or change their hull,
weapon, movement or simulation-clock statistics. These cases remain separate
from the stalled-input regression. Both experimental coverage-canvas caches
were discarded because their comparisons did not establish a consistent wake
latency improvement; their unsuccessful results remain available.

In the final 64-crew diagnostic comparison, the control acknowledged completion
with full fluid steps still pending four times; the corrected worker did so zero
times. Both windows still failed the normal whole-game simulation-progress gate,
and other authorized browser workloads were active. These runs therefore do not
establish an FPS gain or lag-free crowded gameplay. The raw windows and this
qualification are preserved in `catchup-summary.json`. Final validation passed
120 unit checks and six browser regressions: flow debt, gas pixels/context
recovery, presentation, Badlands seams, Intrepid flight and background suns.

```powershell
python tests/browser-nebula-flow-debt.py
```

The subsequent overall-cost investigation uses one frozen source tree and the
same saved fleet, with 64 existing crews on crossing routes. These routes stress
controlled movement and contact handling; they do not represent all analytically
scheduled civilian jobs. Temporary component omissions are diagnostic ceilings,
not candidates for release or reductions in visual quality.

The two headless controls averaged 8.51 and 8.58 FPS. Omitting all fog reached
9.91 FPS, omitting NPC drawing reached 13.01 FPS, omitting radar reached 8.64 FPS,
and pausing artwork preparation reached 13.35 FPS. The preparation test also
withholds newly prepared appearances and changes fallback composition, so its
roughly 56% frame-rate difference is not the expected gain from moving one
function to a worker. Most of these windows advanced only 6.5-8.8 simulation
seconds during 15 wall seconds; they are not successful real-time gameplay.

The first control recorded 110,575 ship descriptions, 81,565 descriptor builds
and 268,082 pose checks, with only 77 effective-stat cache rebuilds. The CPU
profile locates substantial work in ship-system refresh/query, equipment-cache
validation, movement/contact handling, temporary allocations and hull/wake-mask
presentation. Lighting paint dominates the still-pending artwork queue. Earlier
asynchronous timers put fog GPU drawing near 1 ms on average in a crowded case;
they exclude CPU preparation, transfer and publication costs.

The highest-leverage implementation work is therefore shared, revision-aware
ship/pose data and collision bookkeeping, plus preparation and reuse of immutable
lighting/appearance assets outside the interactive main thread. Fog improvements
should target shared hull coverage, changed-tile publication and texture transfer
before gas-shader arithmetic. These require ordinary hardware/damage invalidation,
all contacts and elapsed physics steps, and the existing pixel gates.

An existing WebGL2 sprite-backend trial was slower and is not recommended as a
simple switch. Visible fixed-viewport controls varied from 8.11 to 13.07 FPS;
the preparation-paused variant reached 16.25 FPS and real-time simulation in
that one window. That variation prevents a precise foreground multiplier claim.
No doubled frame rate or native-fullscreen refresh result is established.
Raw windows, component timings, counters, profile, source and fixture hashes,
ranked targets and qualifications are in `test-results/overall-speedup/summary.json`.
This investigation changes the diagnostic harness, not production rendering.

The following implementation retains the production Canvas renderer and all
saved crews, contacts and fixed physics steps. Effective ship statistics compare
unchanged hardware directly, avoiding a new validation string on every read.
Built-in target owners retain unchanged ship snapshots; public `describe()`
and `forEntity()` results remain independently annotatable. Nested equipment,
refit, shield-response and upgrade edits still invalidate their read models.
Broad-phase contact pairs use temporary numeric ordinals; actual contact history
and cooldowns retain the original stable ship keys and visit order.

Lamp-atlas preparation now paints the original core, bloom, primitive and sun
recipes in one optional worker. At most eight jobs are in flight, with bounded
source/intermediate surfaces, transferable pixels, closed bitmaps and a timeout.
Concurrent requests for the same atlas recipe share one preparation. Uploads
still use the existing cooperative queue, and the original Canvas lamps remain
visible while preparation is pending or if the worker fails. The normal visual
test also runs with the worker deliberately unavailable in CI.

Overlapping fog sections reuse the immediately preceding screen-space hull
coverage within one batch, including the same ordered masks, pose, dimensions,
view and nacelle openings. An exact match skips rasterization and the associated
texture upload. A different mask or pose invalidates that surface immediately;
no mutable coverage survives a frame boundary. The browser presentation gate
compares this against ordinary separate drawing and checks damage, rotation,
translated cloud origins and frame boundaries.

The implementation and all unsuccessful timing windows are retained under
`test-results/all-performance/summary.json`. The selected frozen candidate is
`after-deduplicated`. Its two 64-crew windows reached 29.35 and 54.27 FPS and
passed the real-time simulation-progress gate; later unchanged controls reached
33.57 and 27.17 FPS. Earlier controls were only 8.04-8.22 FPS, so comparing the
earliest baseline with the fastest later candidate would overstate the gain.
The 20-crew baseline and selected candidate were effectively unchanged at
75.34 and 75.42 FPS. These are focused, visible 1280x800 DPR1 windows with the
same saved 1,210 entities and input sequence, not fullscreen refresh qualification.
The spread does not establish a dependable overall multiplier. Selected crowded
fluid-lag peaks were 355.63 and 95.30 ms; zero lag is not established.

In the selected crowded windows, identical coverage avoided 904 of 1,952 and
1,432 of 3,600 mask rasterizations/uploads (46% and 40%). The batch pixel gate
remained exact. Each selected case prepared 309 lamp recipes in the worker with
zero main-thread lamp paints and no worker failures. The visual suite passed
144 cases with the worker and again with a forced worker failure; the saved
worker/fallback reference screenshots were identical. A subsequent movement-copy
experiment was discarded after both crowded runs failed the simulation-progress
gate; its source and results remain available.

Validation also covers shared ship data, fleet/equipment/engine behavior,
contacts, flow debt, gas fallback/recovery, Intrepid openings, optional/cold art,
lighting, seams and background suns. The keyboard/ram fixture now holds its
independent physical service and host clock with synthetic RAF, pays accepted
startup debt through the ordinary integrator, and isolates Dev plasma forces.
It warms artwork before releasing moving ships and observes a recorded contact;
these changes correct failures reproduced against the unchanged baseline without
changing production physics. Parallel asteroid-mask work in the live checkout
was preserved and is excluded from the isolated timing comparison; live
presentation and keyboard/ram integration were checked separately.

The next lag-removal pass retains the same fleet and fixed-step debt. Ship
registry refreshes visit their actual owning records, with membership stamps
instead of repeated signature strings. Moving free actors already admitted by
the contact query are not resolved a second time. Movement-only policy reads
use the shared effective definition without constructing geometry. Physical
hull support projections are retained lazily by exact heading/radii, and 600
randomized cases match the frozen original pair solver exactly.

A regression also exposed genuine duplicate integration: a legacy controller
could move an NPC, then contact dispatch would integrate its collision drift
again at the same simulation clock. Shared motion now records the movement
owner for that step. Contact dispatch still integrates actors without an owner;
disabled actors, distant contact chains, saved impulse/spin and contact ordering
remain covered. This corrects motion ownership rather than dropping elapsed
physics time. Startup/travel workers load the same updated shared owners.

Fog presentation rejects pending stamps that the existing drawing loop would
skip, clips hull/density work to the actual cloud section with interpolation
padding, and retains GPU mask capacity instead of reallocating textures as
crops change. Canvas backing surfaces for recurring hull sets have a six-surface,
16 MiB budget; their pixels are cleared and repainted, never retained as old
coverage. Sparse density/rate publications pack changed tile runs only when
that saves at least 25% of a rectangular transfer. Dense frames and coherent
periodic recovery checkpoints retain their existing format. Both compiled and
JavaScript flow paths match every published density/rate cell, including funnel
forces, with no fluid steps omitted.

Frozen sources, failed/invalid windows and diagnostic profiles are retained in
`test-results/lag-removal/summary.json`. Sequential matched warm headless Edge
controls reached 15.61 and 16.20 FPS; the selected `after-sparse-pooled` candidate
reached 25.24 and 27.17 FPS. Both controls accumulated physics debt (17.20 to
28.78 seconds and 13.81 to 24.97 seconds). The selected runs paid it down from
3.99 to .023 seconds and 2.00 to .062 seconds and passed simulation-progress
checks. The save, 1,210 entities, 64 existing crossing crews, viewport and input
are unchanged. Correcting duplicate motion changes subsequent trajectories and
the number of hulls crossing each visible fog core.

These results are not lag-free qualification: selected 95th-percentile display
intervals remain about 66.8 ms, worst stalls 200-234 ms and peak fluid latency
317-333 ms. The machine was on battery; headless timing does not establish
foreground/fullscreen delivery. The user's existing visible play session was
left running. A direct GPU silhouette prototype was rejected for edge-pixel
differences and is absent from production. Validation passes shared motion,
equipment/engine, route/spatial/fleet scheduling, conservative material and
recovery suites, exact presentation comparisons, Intrepid openings, gas fallback
and context restoration, Badlands seams, real keyboard/ram behavior, shared
traffic/delivery conservation and real engine-failure/Inventory repair checks.
