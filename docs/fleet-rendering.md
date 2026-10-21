# Shared fleet rendering and preparation

Ship controllers submit authoritative descriptors to `ship-effects.paintShip`.
That owner applies the common render interpolation and conservative visibility
test before requesting artwork, composing a repair surface or calling a custom
renderer. Visibility changes drawing only. Jobs, repair, weapons, contact,
recharge and economic consequences continue in their simulation owners.

## Visibility audit

| Active path | Visibility owner and retained extent |
| --- | --- |
| Player, NPC, transit and ship-like structures | `ship-effects.paintShip` rejects before artwork/custom renderer/repair-composition work. Civilian and Sol callers query local membership/spatial bounds first; transit warp poses receive their own conservative bounds. |
| Shields, ship lights and damage animation | The common ship rejection runs before the back surface, hull/light composition and front surface. Selected ships retain their existing depth and ordering barriers. |
| Warp rings and trails | Ship bounds include warp extent; `flight-assets.drawWarpRing` checks its transformed circle before drawing. |
| Planets, moons, Sun and atmospheres | `sol-flight.visibleBodies` narrows the current local bodies before artwork requests. `native-game` checks body bounds before glow/disk/light painting. The Sun corona and configured atmospheres retain their exterior reach. |
| Background stars and lens flare | `vexed-space` tiles the viewport working set and uses local opaque body disks for source occlusion. Ships remain in front of planets. Transparent glows are not blockers. |
| Asteroids | `sol-asteroids.paint` queries the current region, checks rotated conservative screen extents, then requests the matching damage image. |
| Projectiles and beams | `combat-shots.paint` rejects a projectile envelope or a conservative beam range disk before contact work, then checks the actual padded segment. A beam can cross the view with both endpoints outside it. |
| Repair drones and welding | `repair-visuals.paint` checks drone bounds or the welding segment before loading drone artwork; attachment/work poses use the same interpolated target. Legacy repair-hit/destruction particle owners receive the conservative world-circle visibility callback. |
| Mining | `asteroid-mining-effects` uses combined rock/beam-source bounds before image requests, texture sampling and effect preparation. Physical mining and debris remain in their simulation owners. |
| Ore, collection and shield effects | `asteroid-combat.paint` and ore transport test effect/glow radii before ore artwork and shared cached drawing. |
| Explosions and environmental impacts | `explosion-impacts.paint` supplies the shared impact owner's visibility predicate before particle painting. Simulation advancement remains independent. |
| Ship fragments and wrecks | `ship-effects.paint` checks rotated fragment radius plus fire/smoke extent, and checks wreck particles individually. Physical debris advances offscreen. |

Sol ports currently own berths/navigation locations; they do not add a separate
galaxy-wide station-sprite registry. New station artwork must enter the existing
local physical/render membership and conservative shared interfaces.

The flight layer opens `ship-sprite-cache.beginFrame`, paints ships in their
existing order, and closes `endFrame` before weapons and foreground debris.
Canvas remains the selected production backend. Animated effects are shared by
artwork, aligned damage stage, raster size and cadence: healthy NPCs retain 20 Hz;
player, damaged and warp effects retain 60 Hz. Directional masks and final
compositions belong to the instance, so two ships of one class do not overwrite
each other's heading. Turning updates existing surfaces. It does not invalidate
the common effect animation.

Known painted-lamp profiles export pure `effects.rasterBounds(stage, options)`.
Their existing lamp rectangles and the shared glow/flame/spark envelope define
support in the unchanged 2× retained raster. Production retains the full native
composition and presentation. Explicit diagnostic `trimPadding` clips exterior
transparent padding while retaining the original composition/source transform;
`sourceCrop` tests a source subset. `fullSurface` forces the original path.
A four-pixel interpolation guard and support alignment preserve exterior effect
reach; unknown effect families and warp keep full support. Bounds are computed
only when a diagnostic requests them. No pixel reads are added to ordinary painting.

`compositionTargetPixels` counts final composition extent on rebuild;
`presentationSourcePixels` counts submitted source extent, `presentationQuadPixels`
counts conservative transformed/clipped screen-space quads, and
`paddingPixelsSkipped` counts clipped exterior area at retained-raster scale.
Composition memory and texture-transfer extent remain unchanged. These are area
diagnostics, not browser raster/compositor timings or measured upload bytes.
Run `python tests/browser-ship-padding.py` for full-versus-trimmed real pixels
across all hulls, damage stages, headings, times, zooms and partial camera edges.
Its quality gates and matching screenshots are separate from clean FPS runs.

The clipping diagnostic passed 1,056 whole-fleet/stage/heading/zoom/camera-edge
comparisons, including the unchanged two-level premultiplied colour, one-level
alpha and zero alpha-64 support-drift gates. Its conservative quad area was
43.31% smaller. That did not improve measured delivery. Three sequential
five-second pairs at 12 ships submitted 102 full-source frames (6.737 FPS,
12.78 ms mean JavaScript draw) versus 89 clipped frames (5.849 FPS, 13.78 ms).
At 25 ships the results were effectively neutral: 4.907 versus 4.924 FPS.
These intermediate renderer-only results used the earlier two-second phase
policy, fixed fleets and the same cache; they do not describe final gameplay.
They justified rejecting default clipping, rather than claiming an area estimate
was an FPS gain. The reproduction command is
`python tests/browser-ship-padding-performance.py --seconds 5 --windows 3 --counts 12,25 --presentation clip`.

The final source-subset experiment used the six-second policy. With alpha-64
threshold shifts recorded separately, it still failed the existing one-level
alpha bound: ship 2 severe at heading 2.4/zoom 1.7 had alpha error 2. No timing
claim was made for that rejected candidate. Cropped composition canvases had
also failed colour/alpha bounds (3.97/3). Full native presentation therefore
remains selected. Reproduce source comparison with
`python tests/browser-ship-padding.py --source-crop`; this intentionally reports
the unresolved native sampling difference rather than relaxing its colour gate.

Mask storage stays within one million pixels and 256 instances. Animated surfaces and instance
compositions share one LRU pixel budget: at least four million pixels, eight
times the physical flight viewport, and at most sixteen million pixels. Each
collection also has a 256-entry cap. Expanding the window can admit a larger
working set; shrinking it releases surplus cache retention. A diagnostic must
report the current budget and eviction counts alongside FPS. A working set that
exceeds the hard cap can still churn.

In `snapshot()`, `sprites.pixels` is the combined animation/composition budget;
`compositions.pixels` describes its subset. Do not add the two. `pixels`/`bytes`
include each retained Canvas once; GPU atlas/framebuffer estimates are reported
separately under `gpu`.

Lamp brightness shares source pixels. Live lamp surfaces retain the original
exact blur phases and reuse surfaces during changing pulses. Recurring phases
can occupy spare cache space as cropped copies. These copies have a 2,048-entry
cap and use only spare pixels inside the existing four-million-pixel lamp budget;
they are evicted before working lamp surfaces. One-off artwork and continuously
changing warp scales do not allocate a phase collection. Native filtering is
not approximated and bloom is not removed.

The former separate one-million-pixel phase subcap caused repeated original blur
work despite unused aggregate lamp capacity. The current admission uses that
spare capacity without enlarging the four-million-pixel total. A paired96-lamp
regression follows three-second pulse cycles, checks fewer native glow rebuilds
than the former subcap, and requires no steady-view allocations/phase evictions.
Its six steady three-second cycles rebuilt 8,844 original glows under the former
subcap versus 7,782 with shared capacity. Phase pixels rose from 998,424 to
2,314,924; total lamp retention was 3,998,380 of the unchanged 4,000,000-pixel
cap. Actual retention can rise into previously unused capacity; the hard cap did
not grow. Those helper counters establish avoided blur work, not a gameplay FPS
claim.

Each quantized phase must return after a different radius before optional
admission; consecutive plateaus do not consume optional storage. A full phase
cache retains actively used entries; replacement requires at least six render
seconds without use, covering two of the painted lamps' approximately three-second
pulse cycles. When all retained phases were used recently, capacity misses stop
allocating phase canvases and use the existing live lamp. Idle appearances
can still yield storage, so allocation/eviction counters remain necessary.
The render clock
does not modify simulation time or deadlines. Matching idle surfaces are reused
when their retention changes. `lampPhaseAdmissionsSkipped`, phase hits, restores,
evictions and canvas allocations make this pressure policy observable.
The regression follows the real `2.1*t` pulse at 20 Hz across 24 large lamps:
after nine seconds of warm-up, another eighteen seconds adds no canvases or
phase evictions while cached restores continue. The original two-second policy
was shorter than a pulse cycle and restarted allocation before phases returned.

Phase snapshots retain neighbouring filtered pixels. A hit restores those pixels
into the lamp's existing full-size surface with an unfiltered 1:1 copy; every
draw presents the same source surface and rectangle. Presenting a cropped copy
directly changed native interpolation by one channel level after cache warm-up,
which broke exact player/NPC parity. The source-preserving restore keeps cropped
retention and avoids another blur. `lampPhaseRestores` counts that copy work.
The focused reproduction is
`python tests/browser-ship-presentation.py --ships 1,2,3,4,5,6,7,8,9,10,11,12,13,14`;
testing ship 14 alone does not reproduce the original cache-history failure.

`?shipRenderer=webgl2` selects the integrated comparison backend; `canvas` selects
the production path explicitly. It uses the same ship/effect interfaces, original
dim artwork and animated effect layers. A bounded two-layer 2048-square texture
atlas stores static art and changed effects. Transforms and light parameters are
per instance. Shield flashes, repair composites, custom renderers, warp rings
and target annotations are ordering barriers. Atlas pressure flushes before
reuse. Unsupported or lost contexts use the Canvas path. This backend still
copies each contiguous group to the main Canvas and uploads changed animated
layers; those costs must be included in presentation measurements. GPU submission
time alone is not a performance result. Backend image differences and frame
delivery limits are reported in the performance review; this option does not
establish a 120-Hz capability.

### Backend selection evidence

An additional diagnostic requested CPU backing (`willReadFrequently`) only for
new dynamic ship-cache surfaces. It left the main canvas, artwork and worker
surfaces unchanged. Across 24 real hull/damage cases it exceeded the existing
quality gates: maximum colour error 47, alpha error 34 and centroid shift
0.290 pixels. The production backend does not use this hint. Its short combat
windows also advanced less simulation time and accepted fewer shots, so their
RAF results cannot establish a speed improvement. The ignored diagnostic
records the injected source hashes and actual context attributes.

A narrower working-glow/phase-only CPU-hint candidate also failed the unchanged
colour, alpha and alignment gates; brightness and other contexts stayed native.
It stopped before phase-history or player/NPC checks. A separate complete-lit-hull
candidate retained the existing lighting budget and was bit-exact across eight
mixed comparison grids and 42 role cases, but its fixed12 renderer pair was
neutral (11.51 versus 11.59 callbacks per second, with a higher mean drawing
timer). It was not adopted. These results and their scope are documented in
[the foundation results](fleet-foundation-results.md#renderer-experiments-and-quality-limits);
they establish no gameplay refresh-rate or hardware ceiling claim.

A final 24-case control presented unchanged native composites directly from a
WebGL DOM canvas, removing the GPU-to-2D presentation copy. Both transparent
compositor captures used 1800-by-1400 pixels at DPR 1. The native capture control
passed (maximum premultiplied colour difference 0.9882, identical alpha and
support). Direct WebGL still failed the unchanged colour/alpha limits: maximum
differences were 3/3, with matching support bounds and a 0.001984-pixel centroid
shift. No browser or GL errors occurred. Its 24 textures and mip levels occupied
11,563,072 bytes within the 32 MiB cap and were disposed after the check. This
rejects the sampler as a production replacement; it is not timing evidence.
One DOM ship layer would also require shared ordering integration for interleaved
back shields, hulls and front shields. No direct-DOM backend was shipped.

An early isolated stress prototype compared 12/25/50/100 mixed intact/damaged
ships at 1.7 display scale, before the final per-instance/phase-cache changes.
The command was
`python test-results/foundation-renderer/compare-prototype.py --seconds 5 --counts 12,25,50,100`
in Edge 155.0.4283.62, headless, 1280 by 850 CSS pixels, DPR 1. That ignored
prototype directly submitted GPU layers; it was not the final shared-cache
implementation or a gameplay benchmark. Its retained report is
`test-results/foundation-renderer/batched-prototype-v2-report.json`.

| Visible mixed ships | Early Canvas FPS | Early WebGL2 FPS | Canvas P95 ms | WebGL2 P95 ms |
| --- | ---: | ---: | ---: | ---: |
| 12 | 5.79 | 7.11 | 233.1 | 178.6 |
| 25 | 3.26 | 6.74 | 379.4 | 195.7 |
| 50 | 1.60 | 7.02 | 753.0 | 215.7 |
| 100 | 0.82 | 6.60 | 1330.6 | 195.8 |

Neither path met the gameplay target in that stress test. Changed animated-layer
uploads and Canvas presentation remained expensive; improving submission time
alone did not solve frame delivery. That shader also failed the production
appearance bound (maximum channel difference 43). Later shader changes reduced
the sampled maximum to 26–36, which still does not pass the unchanged Canvas
gate. Canvas therefore remains the production selection. GPU mode is explicitly
a comparison option, with those edge/lighting differences unresolved.

Reproduce the current integrated image comparison with
`python tests/browser-ship-renderer-comparison.py`. It uses the actual shared
cache, reports opaque and edge errors, records the browser/GPU conditions and
writes matching screenshots under ignored `test-results/ship-renderer-comparison`.
It makes no FPS claim and does not replace the production visual regressions.
The current shared-cache comparison was worse than the manually prepared
prototype: maximum premultiplied opaque-channel error 63, mean opaque error 4.56,
maximum alpha error 52, unchanged alpha-64 bounds and 0.10-pixel aggregate
centroid movement. It submitted all twelve ships in one batch, but that does not
establish acceptable appearance. A diagnostic-only 2-by-2 box-mipmap override
(`--box-mip-probe`) worsened opaque error to 75/4.85 and was rejected. Neither
result changes production Canvas rendering. The integrated image check records
an Intel Arc D3D11 ANGLE backend; it is not evidence of a software GPU ceiling.
Run `python tests/browser-ship-lighting.py` and
`python tests/browser-incremental-art.py --label foundation-current` for the
unchanged production gates. The latter passed 612 lamp cases and 51 biological
canvases; the complete mixed-hull gallery differed by one channel level in one
pixel, with unchanged alpha support, dimensions and centroid.

## Preparing damage, fragments and wrecks

Use `ship-effects.request` for a currently visible appearance. It admits that
damage plate first and preserves valid same-hull artwork while loading.
`ship-effects.prepare` is the explicit full-readiness operation. It resolves only
after all four appearances, fragments and wreck materials are ready.

Physical topology is ready independently of those materials. Native definitions
read immutable normalized fragment/wreck metadata from `ship-debris-geometry.js`,
generated through the original preparation algorithms. Damage events create the
physical pieces immediately; the shared physics/contact owners advance them
before any images are ready. Visible painting requests original materials and
binds only their surfaces to stable piece indices. It cannot change a physical
piece, replay an explosion or recover expired pieces. Offscreen physical pieces
do not request optional textures. Asteroid physical polygons likewise use catalog
dimensions independently of image readiness.

After changing a ship image, alignment or fracture profile, run
`python tools/build-debris-geometry.py` and its `--check` mode. Commit the metadata
with the source change. The cheap Node regression verifies coverage, normalized
source hashes and material conservation; `browser-debris-geometry.py` checks the
original prepared geometry, cold physical contacts and late material binding.
Custom artwork must supply matching definition-owned topology. Legacy unsupported
custom profiles retain their deferred fallback; they have no cold camera-parity
guarantee. The asset adds no per-ship registry or bitmap copy.

Decorative mining motion, menu/warp stars, hull sparks and wreck trails use
private visual random streams. Culling or preparing their pixels must not consume
the random stream used for theft, population or other gameplay choices.

Base appearances and optional destruction data have different lifetimes. The
optional class LRU remains twelve entries/64 MiB. Its eviction must not blank a
visible ship. `flight-assets.peekShip` synchronously selects an already processed
appearance by hull and damage stage; a missing plate retains a valid same-hull
plate while its replacement loads. It never borrows another hull's art. Player
hull changes retain the existing generation-token guard against late results.

Ordinary processed-art retention remains 24 entries/24 MiB. Appearances painted
in the current or previous render frame can share an expanded working set, hard
capped at 256 entries/128 MiB. The existing `ship-sprite-cache.beginFrame` advances
that visibility epoch. Only actual visible/current requests protect entries;
unused damage stages and optional preparation cannot evict protected appearances
below the hard cap. Leaving the view releases the extra strong retention after
two ship-render frames. A map/menu that submits no ship frame retains the last
bounded working set until ship frames resume; this is not a wall-clock expiry.
There is no per-actor asset collection. A visible set larger than the
hard cap can still stream/evict and is not promised hitch-free rendering.

`python tests/browser-ship-working-set.py` paints 64 distinct appearances from
32 hull classes through the actual shared Canvas interface, without retaining
assets in its descriptors. On historical `d68a0f0`, 40 appearances missed their
plate after class eviction; the fixed run had zero misses, checked actual pixels,
then changed all damage stages with same-hull fallback. The initial visible
processed art occupied 43,074,560 bytes. After leaving the view, the loader
returned to 24 entries/15,565,824 bytes. This is correctness/memory evidence,
not a frame-delivery comparison. Reproduce the failure with
`python tests/browser-ship-working-set.py --revision d68a0f0476b188cb0d62c9cc23447787224d3022 --expect-missing`.

The same regression also covers thirteen simultaneous paused midway repairs,
which exceed the optional class LRU while staying below the shared sixteen-mission
and repair-surface limit. `repair-visuals.requiredStages` owns the required intact,
severe and actual mission-start plate. A repair starting exactly at the ordinary
25% disabling floor starts at damage stage 2; it must not substitute stage 3.
The common painter hydrates those plates synchronously from the existing loader
and requests only genuinely missing appearances. An unassigned disabled hull
needs its current appearance only; an assigned mission can prepare its plates
before the first healing interval. Missing initial art keeps the same hull
visible while loading. This does not start optional destruction preparation,
create a new asset cache, heal the ship or alter material accounting. The browser
check compares the actual repair grid with ordinary shared-surface reference
pixels, asserts the correct start stages and verifies byte-for-byte unchanged
authoritative state. Repair actual/reference screenshots are separate from the
mixed-fleet lighting/damage screenshot.
Both readback comparison canvases use the same CPU-backed context attributes;
otherwise thirteen support reads on one canvas versus a single reference read
can introduce one-channel native backing-history differences. This diagnostic
choice does not alter the game's canvas, reference pixels or existing tolerances.
The paused fixture memoizes immutable plate hashes and immediately releases its
temporary readback canvases, avoiding diagnostic-only native context pressure.
Saved native frame callbacks provide paint barriers before the visible captures.

Ownership reports are estimates of different owners, not a native memory total.
The loader deduplicates shared source/processed artwork in its reported unique
bytes. Its weak asset references do not pin artwork. Profile alignment and unlit
memoization use WeakMaps: values can remain reachable while their source keys
are retained by another owner, and are not bounded by the named sprite LRU.
Earth-family profiles strongly own at most four sets of original lit/dim lamp
masks per registered profile; `ship-effects.metrics().profileLamps` reports these
separately (7,792,096 bytes initially and 15,584,192 after the fixture's remaining
damage transitions). The initial sprite-cache allocation was 46,421,920 bytes,
including independent compositions, masks and reusable lamp surfaces; do not add
its composition subset twice. The twelve-entry optional cache's asset bytes can
overlap the loader's processed art. Active wrecks can retain evicted material
data legitimately. Worker reservations and GPU atlas/framebuffer estimates are
separate again. These estimates do not establish process RSS or native VRAM.

The existing `nativeDamageArtPreparation` queue and `createShipArtReadback`
owner also admit optional fragment/wreck preparation. They do not create another
worker or simulation registry. The same deterministic generators run in the
worker with cooperative yields, allowing foreground read messages between work
slices. Four aligned frames are snapshotted sequentially with a task yield
between snapshots. Worker output is transferred as bounded ImageBitmaps and
adopted by the existing material cache. It cannot emit a fragment, apply damage,
replay an explosion or grant resources.

Optional staging admits at most 1,048,576 input pixels, 96 MiB of reserved
working/staging bytes and 1,024 output surfaces. Output has a separate 64 MiB
ceiling within that reservation. Foreground readback keeps its independent
16 MiB reservation; aggregate reservations can therefore reach 112 MiB. These
are temporary admission estimates, not a claim that all bytes are resident.
Retained material/fragment/wreck ImageBitmaps are counted by `ship-effects`
after the staging reservation ends. Do not add those retained bytes twice.

Capacity contention yields through the existing bounded queue. Unsupported
workers, timeouts, malformed responses and non-transferable custom partition
functions retain the cooperative main-thread fallback and report failures.
Cancellation closes late native snapshots; rejected output surfaces are closed.
Native snapshot/read/upload operations must still be profiled separately: a
small JavaScript queue slice does not prove a native operation cannot stall.
Accepted ImageBitmaps belong to the shared material/active-effect owners; LRU
eviction must not close a texture still referenced by a live wreck. Once all
owners release it, native disposal depends on browser garbage collection. Worker
input bitmaps close in `finally`; malformed, late and rejected response bitmaps
close before fallback/termination. Preparation and drawing remain read-only with
respect to damage, economic transactions and effect emission.

`python tests/browser-optional-art-worker.py` checks real native worker output
against the cooperative reference for Galaxy, Dreadnought and Olympic fragments
and wrecks. The focused Edge run produced exact compared texture pixels, kept
explicit full readiness, and delivered 98 foreground frame callbacks during the
last preparation. Its worker queue maximum slice was 5.8 ms; the main queue
maximum slice was 9.4 ms including cold alignment. Optional worker elapsed time
is labelled `prepareWallMs`, which includes cooperative waits and is not CPU
time or a whole-game freeze. Evidence is ignored under
`test-results/optional-art-worker`.

## Extension rules

New hulls declare dimensions, equipment, emitters, repair attachments and aligned
artwork through shared definitions/profiles. Preserve the aligned frame canvas;
cropping transparent rendering work must not change hull scale or damage-frame
position. Pass the ship entity as the render owner. Do not call ship loaders for
distant inspection or add lighting state to the animated-effect identity.

A custom renderer must use conservative bounds that include glows, trails,
shields and attachment animation. Flush a ship batch before painting an ordered
Canvas annotation. Beams use segment bounds because both endpoints can be
offscreen while the beam crosses the view. Transparent glows are not occluders.
Stations and planets use their existing depth order and shared world membership;
adding one must not introduce galaxy-wide scans for local rendering.

For a Sol body, coordinate the stable ID, position, port and population in
`system-hub.sol` with `sol-flight`'s size/art lookup. Configure the normalized
opaque limb and its artwork offsets in `vexed-space`; an atmosphere is explicit
body data, while stellar emission/corona is separate. Keep system illumination
in the fixed `systemStars` source/direction configuration, independent of
decorative parallax stars. A new trading port also needs matching navigation,
docking clearance and Sol economy coordinates/lanes. The current Sol tables are
not one generic runtime planet registry: adding a body record alone does not
install valid freight routes or economic commitments. Do not move existing
bodies merely to make a multi-planet fixture fit the camera. Record both the
system's body count and the number actually painted in a benchmark. Ships retain
their established foreground depth relative to planets.

Run Node cache/preparation/owner tests and actual browser lighting,
incremental-art, cold-loading, presentation and rendering suites. Preserve the
existing colour, alpha, alignment and damage gates. Compare fresh contexts and
identical fixtures sequentially; keep heavy traces separate from clean timing.
Record source revision, viewport/DPR, GPU/backend, active population, accepted
shots, simulation progress/debt, delivered paints and cache/preparation costs.
