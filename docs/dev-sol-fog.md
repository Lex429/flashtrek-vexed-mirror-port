# Sol fog flight test

The real Badlands now uses the same plasma funnels, branch lightning, sheet
flashes, plasma heat fronts and turbulent currents in normal gameplay. Its world
weather is generated locally across the region instead of copying the seven
preview funnels into every cloud tile. See [Badlands](badlands.md).

Dev Sol now starts with ordinary ship traffic and no test fog bank. Starting or
continuing a Dev save does not automatically add the Badlands preview. The saved
fleet, jobs and cargo remain intact; NPC rendering, radar, contacts, weapons and
repair drones use their ordinary owners again.

For an explicit isolated comparison only, append `?devTraffic=off` on the local
loopback port 7790 site. This optional policy suppresses NPC interactions without
removing saved crews; the ordinary URL and `?devTraffic=on` retain traffic.
`dev-traffic.js` owns this policy. Verify with
`node --test tests/dev-traffic.test.cjs` and `python tests/browser-dev-traffic.py`
while the local server is running.

To use the preview again, enable **Dev tools → Sol fog flight test → Enable fog
bank in Sol**. Its selected preset is **Badlands storm test**, with original orange
plasma, lightning and heat fronts. Fly into it, turn through it, and stop to watch
the wake fill. Dev tools contains Harman/Vex/Badlands
presets, **Sol color preview** and **Reset fog ahead of ship**. Reset places a new bank ahead of the
current world pose and clears its visual history. It does not relocate the ship.

## Badlands lightning flight area

**Badlands storm test** remains available as a manually enabled preview. In
**Dev tools → Sol fog flight test → Gas style**, other presets remain available.
Enabling it adds a 2,100 × 1,600-world-unit orange plasma bank 110 units ahead of
the current ship, using the existing material, gas and hull/wake owners. The
original region colour is selected automatically. Harman/Vex and their colour
previews remain available. This transient preset is restricted to physical Dev
Sol membership; it is not a change to the production Badlands weather.

The enlarged bank is five times as wide and tall as the original 420 × 320
test, giving 25 times the flight area. The player starts near its centre.

### Plasma vortices

Seven individual plasma funnels occupy fixed positions inside this Dev Sol
test. Their radii are now 64–98 world units, about half their original width
and a quarter of their original area. The existing nebula curls into them,
retaining its muted orange colour, soft density and irregular edges. The
nearest funnel is ahead of the initial ship, outside its starting position.
Active funnels are seen down their axes, matching the game's top-down camera.
The surrounding nebula forms a broad, irregular whirlpool with overlapping
plasma folds, wispy edges and a dimmer, offset centre receding into depth.
Uneven turbulent strands turn at different speeds. There is gas through the
centre, and no repeated three-arm pattern or side-view hourglass silhouette.
Their contrast reads at normal flight scale while the outer wisps blend into
the surrounding cloud. Optical depth and self shadow suggest the narrowing
funnel below the opening; they do not change the fluid's owned mass.
Lightning whitens the same gas through the existing masked cloud passes.
**Plasma vortices: pull, spin and damage** in the existing Dev fog controls
enables/disables these hazards separately from lightning.

`plasma-vortices.js` owns the deterministic geometry and local gas-flow samples.
Its pressure gradient pulls inward during contraction; tangential flow transfers
momentum, and periodic outward flow can eject a captured ship. Hull area/mass
and rotational inertia determine coupling. Slip speed, heat and exposure time
determine damage. These are game physics for fictional plasma storms, not a
magnetohydrodynamic simulation. The current field is restricted to the Dev Sol
preview; it does not introduce a production Badlands hazard registry.

The existing `ship-systems.move` samples the environment for physically stepped
ships. `ship-motion.step` integrates it through optional saved
`motionFlow:{version:1,vx,vy}`, separate from engine-rated velocity and collision
stabilization. Released flow momentum persists; normal engine thrust and braking
remain available. Braking acts once on the combined engine/flow velocity.
The existing spin owner supplies angular response. `ship-systems.applyDamage`
dispatches plasma exposure through the same shield/hull, device wear, critical
flight and destruction owners. Environmental damage cannot create player crimes,
retaliation or a faction-reputation charge.

There are no separate tornado sprites, ribbon textures or overlay surfaces.
The material owner's existing conservative fluid model drives nearby gas with
the shared vortex flow, retaining mass, bounded velocities, accepted time,
ship wakes and checkpoint/worker recovery. The same material shader locally
curls the existing cloud sample and applies volume optical depth, self shadow
and internal heat; the JavaScript
fallback uses the matching deformation. Curling blends into the original gas
and stops outside the same 1.35-radius support as the physical hazard.
The original hull/pending masks, compositing and lightning still own both fog
passes. Reduced motion disables visual forcing and freezes the cosmetic curl
without changing the physical ship hazard. Painting never advances physics or
causes damage. The cloud's original colour source is retained.
Visual inflow gathers gas between outbursts so repeated releases do not leave
an empty cavity. The appearance uses the same surge phase as the physical
vortex: the active opening softens as the outward flow releases gas.

`tools/build-plasma-volume.py` integrates a turbulent three-dimensional funnel
along its axis offline into `assets/plasma-volume-v1.bin`: 32 periodic 96-square frames in one
768-by-384 RGBA8 data atlas (1,179,648 bytes). Its channels contain optical depth,
lighting, heat and entrainment coverage, without colour artwork. One decoded
buffer and one GPU texture serve every funnel. The renderer uploads it once
per context, interpolates two frames, culls offscreen funnels and reuses uniform
arrays. It does not ray march, generate noise, allocate funnel canvases or run
per-pixel trigonometry in the draw loop. The Canvas fallback samples the same
attributes and context recovery restores the shared texture.
The top-down revision keeps that format and shader unchanged. Its resource URL
uses `?v=top-down-1` to invalidate the previous side-view attributes. Unit
regressions require plasma around all 24 sampled directions of the opening,
angular variation, a dimmer gaseous centre, and visible feature rotation matching
the ship-driving flow in both directions.

The Dev cloud now uses the material context's existing gas-texture renderer
directly, as production weather already did. This removes the repeated transfer
from a second WebGL canvas through a 2D canvas and back into the material texture.
The original Canvas source remains the fallback when that context is unavailable.
The plasma field also prepares its retained movement-mask texture and current
hull mesh on its first frame, before entering the funnel can trigger their first
allocation. A pixel regression verifies that the first subsequent movement still
clears the actual silhouette and that acknowledgement restores the original gas.

Earlier side-view foreground timing on the local 7790 Dev site used the same retained 1,210-entity
save, one physical player, a 1280-by-720 viewport at DPR 1, a 60-Hz display and
two warmed 12-second windows. The final prepared-mask run delivered 60.00 FPS
stationary and 58.84 FPS in real-key flight. Material submission averaged
0.67/0.61 ms CPU and 0.20/0.17 ms GPU respectively. CPU maxima were 2.2/2.0 ms;
GPU maxima were 0.37/0.48 ms. GPU figures sum all material-context draw queries
per cloud render, including direct gas rendering and movement-mask draws.
The complete Dev fog paint calls, including lightning and both layer passes,
averaged 0.87 ms per stationary frame.

Stationary delivery had no intervals above 50 ms. Flight still had two, with an
83.4-ms maximum; it fails the no-stall gate. Physical time kept up and saved
debt stayed below 0.028 seconds. A separate trace found background ship-art
readbacks, damage-art preparation and save work during flight. This is not a
zero-lag or 120-FPS qualification. Earlier comparison windows also included
independent controller changes, so their frame-rate differences cannot be
attributed solely to the funnel redesign. All windows, including failed gates,
raw intervals, source hashes and the trace, remain under
`test-results/plasma-volume/` (`before`, `after`, `final`, `hitch-diagnostic`,
`prepared-mask`). The four tracked game modules remained stable within the final
measured windows and still matched their recorded hashes after verification.

The side-view revision's verification passed 96 targeted Node checks and the plasma, material
presentation, direct gas-texture and lightning browser suites. The plasma suite
checks 1,062 actual hull samples with zero gas leaks, worker recovery with zero
density error, Canvas fallback and GPU context recovery. The movement-preparation
fixture clears 23,298 pixels without another allocation and restores its original
gas pixels exactly after acknowledgement.

The top-down correction passed 97 targeted Node checks and the full plasma
browser suite, including flight, damage, pause, Continue, hull clearance and
graphics recovery. The normal-scale preview at `test-results/plasma-topdown/after.png`
uses the actual local 7790 cloud with one physical player; `before.png` retains
the earlier side view. The browser regression also passed with the ordinary
1,210-entity scene and found zero leaks in 1,062 hull samples.

Its two warmed 12-second foreground windows delivered 59.83 FPS stationary and
59.67 FPS in flight. Material submission averaged 0.49/0.79 ms CPU and
0.235/0.188 ms GPU, with GPU p99 values of 0.316/0.299 ms. One flight interval
reached 66.8 ms, so the whole-game no-stall gate still fails. Both windows had
no main-thread long tasks, retained the full fleet and kept saved physical debt
below 0.030 seconds. The tracked source hashes were stable during measurement.
Raw frames, GPU queries and failed qualification are retained in
`test-results/plasma-topdown/performance/report.json`.

Run `node --test tests/plasma-vortices.test.cjs` and
`python tests/browser-plasma-vortices.py`. The latter uses real flight keys to
enter a funnel, verifies heat/spin/continued steering and pause, and exercises
the actual save owner and Continue path with carried momentum. It also checks
local gas deformation, conserved material, worker/fallback parity and read-only
painting. It rejects separate tornado artwork and changes outside the funnel.
It also checks actual-game source pixels at normal flight scale for visible
hot crests, internal contrast and a softer release phase, and saves the preview
as `test-results/plasma-vortices/live-funnel.png`. The test is a functional check,
not a delivered-frame-rate qualification.

**Lightning storms** enables irregular automatic flashes: isolated strikes and
clusters of two to seven attempts, 0.16–0.84 active seconds apart, followed by
quiet gaps of 3.2–15 seconds. At most three flashes are active at once; there is
no replay burst after a stall. The private weather schedule is independent of
manual triggers. **Trigger lightning**
queues a flash while Dev tools are open; close the tools to watch it. Pause,
hidden flight and reduced motion stop its visual clock. Storm toggling retains
the same material field, displaced gas and wakes. **Reset fog ahead of ship**
clears the transient storm history along with the existing fog test history.

### Plasma heat fronts and sheet lightning

The Dev Sol Badlands preview enables plasma heat fronts by default.
They are broad volumes of energized nebula viewed from above. Uneven hot
pockets glow through darker folds of gas, retaining the original cloud's
orange, red and pink character. Heating follows the owned gas density and
colour. Billows build for about 1.8 seconds, drift through the surrounding
cloud and fade over their last four seconds. Each lasts 13–18 seconds; births
are 6–10 seconds apart, with at most three fronts including queued commands.
They change the existing gas's optical depth and temperature through its owned
material passes. Empty gas, hull clearances and wakes remain empty.

`nebula-fire-fronts.js` owns this transient visual weather. Its private clock
and deterministic choices are independent of lightning, gameplay randomness,
physics and saves. Pause, hidden flight and reduced motion freeze it. Turning
**Plasma heat fronts** off preserves the fluid and its wake. **Trigger plasma
surge** queues a front near the current view; close Dev tools to watch it build.
**Trigger sheet lightning** queues a broad flash near the current view. Both
events keep their world positions after birth as the camera moves.

Automatic lightning now mixes local branches with broad sheet flashes. A sheet
can illuminate a cloud region up to 840 by 500 world units. Its diffuse light
is applied in the shared material shader, retaining exactly the gas alpha;
smaller branches use the existing bounded lightning artwork. Sheet strength
rises smoothly, peaks and fades within the existing 0.92-second event lifetime.
The three-event cap and irregular clusters/quiet gaps remain in force. The
**Lightning storms** checkbox controls both lightning forms independently of
fire fronts.

`tools/build-nebula-fire.py` integrates overlapping turbulent gas billows in
three dimensions and bakes their top-down attributes offline into
`assets/nebula-fire-v1.bin`: sixteen 96-square frames in a 384-square RGBA8 atlas
(589,824 bytes). Channels hold optical depth, temperature, illumination and
coverage, without colour artwork. One buffer and GPU texture serve every
front. Each affected pixel interpolates two frames; offscreen fronts are
culled, uniform buffers are reused, and the atlas uploads once per context.
Sheets use uniforms and add no large overlay canvases. The Canvas fallback
uses the same attributes and sheet-light formula.

The plasma revision broadens the cells to as much as 380 by 248 world units
and slows the cached animation cycle to eight seconds. Optical column depth
stays between 0.65 and 2.35 times the fluid's value. Signed illumination gives
the volume both dark folds and bright faces. The shader heats the existing
RGB values, with a stronger response in denser gas; it does not replace them
with the previous yellow flame palette. The attribute format and 589,824-byte
texture stay the same, with `?v=plasma-cells-3` invalidating the old contents.

This revision passed 108 targeted Node checks and three browser suites:
plasma/sheets, material presentation and the existing plasma vortices. The
browser fixture found 15,921 changed pixels beyond the old narrow-front width,
9,570 darker fold pixels, and 55,039 heated blue-gas samples retaining their
underlying blue colour. It retained zero alpha errors, zero empty-gas leaks
and zero leaks in 1,062 interior hull samples. GPU recovery matched exactly;
Canvas fallback averaged 1.46 channel levels of difference across 666 samples.
The pause fixture drains the admitted active tail before comparing frozen
weather geometry and clocks; diagnostic paint counters may continue while
the frozen scene is redrawn. Current screenshots and reports are in
`test-results/plasma-cells/`.

The current heat-front timing uses a frozen copy of all 341 game script, style
and data files at the real 7790 Dev origin, with the retained 1,210-entity save
and one physical player. It retains two warmed 12-second foreground windows
at 1280 by 720, DPR 1, and issues the real sheet command every 1.3 seconds.
Material GPU work averaged 0.188/0.158 ms without input/in forward flight;
CPU material submission averaged 0.91/1.11 ms. The windows included 705/103
heat-front draws and 466/109 sheet draws. Sources matched the live workspace
after the run, and saved physical debt stayed below 0.001 seconds.

Whole-game delivery was 58.34/49.65 FPS, with 1/12 intervals above 50 ms and
maxima of 66.5/233.4 ms, so both windows fail the no-stall gate. These figures
do not establish that the wider game is free of hitches or isolate their
cause. Raw frame intervals, GPU queries and the frozen-source manifest are
retained in `test-results/plasma-cells/performance/` and `frozen/`.

The new Node and browser regressions cover eligibility, deterministic bounded
events, build/fade, independent clocks, menu queues, camera movement, actual
Dev controls, empty gas, hull masks, unchanged physical state, texture reuse,
Canvas fallback and GPU recovery. Run
`node --test tests/nebula-fire-fronts.test.cjs tests/dev-nebula-storm.test.cjs`
and `python tests/browser-nebula-fire-storm.py`.
The browser test uses the live local 7790 site, or serves this checkout there
with `--serve` in CI. The initial front implementation passed 107 checks. Four
browser suites passed: fire/sheets, existing lightning, plasma funnels and
material presentation. Fire/sheet pixels had zero alpha errors, zero empty-gas
leaks and zero leaks in 1,062 interior hull samples. The recovered GPU image
matched exactly; Canvas fallback averaged 1.61 channel levels of difference
across 666 opaque samples. Screenshots and raw reports are under
`test-results/plasma-fire-storm/`.

Foreground timing used the same 1,210-entity save, one physical player and
1280-by-720 viewport at DPR 1. A frozen set of 341 script, style and data files
prevented independent edits from changing the measured program; the manifest
and tracked hashes matched the live workspace after measurement. Each run
retains two warmed 12-second windows, without input and with actual forward
flight. The default-weather run averaged 0.13/0.12 ms GPU material work and
0.71/0.69 ms CPU submission. Delivery was 59.92/59.34 FPS; one flight interval
reached 66.6 ms.

The separate active-sheet run invokes the real sheet-lightning command every
1.3 seconds. Its final clean windows included 481/168 sheet draws and 721/165
fire draws. GPU material work averaged 0.13/0.11 ms (maxima 0.25/0.20 ms), and
CPU submission averaged 0.61/0.66 ms. Delivery was 60.00/59.34 FPS, with one
83.4-ms flight interval and no main-thread long tasks. Saved physical debt
stayed below 0.012 seconds. This still fails the whole-game no-stall gate.
An earlier active-sheet diagnostic overlapped a CPU regression suite and
averaged 0.27/0.19 ms GPU; it is retained separately.

All raw frames and GPU queries remain in `before`, `after`, `final`,
`active-sheets` and `active-sheets-clean` under the same result directory.
`after` is invalid as a final measurement because the shared material source
changed during it. Baseline trajectories also differed, so these records do
not establish a causal whole-game FPS gain. GPU figures cover the material
context's draws; they exclude the separate source-gas context and panel scanout.

`dev-nebula-storm.js` owns a bounded, private deterministic visual clock and
at most three queued/active lightning events. Each event has a fixed world
location, two brief pulses and a diffuse afterglow. Six prepared cloud-light
and branching-lightning recipes are reused. Each fog pass briefly recolours the
actual orange material white while retaining its alpha, including where flashes
overlap. The original cloud is painted exactly once per pixel. Clear hull gaps
and wakes remain empty. Integer-sized local copies prevent mask-edge
resampling from spilling light into cleared openings. Lightning adds no fluid
worker, gameplay random reads, damage, resources or saved-state fields.

The prepared recipes and two bounded 512² work surfaces total a tracked
5 MiB RGBA surface estimate. They allocate only when the test preset prepares;
ordinary presets do not prepare the lightning artwork. Repeated flashes reuse
those surfaces. This estimate is not total browser/native GPU memory.

The default/white-lightning revision passed 89 related Node checks, the actual
Dev controls/flight/lightning browser test, original Sol colour previews and
Intrepid hull/gap/worker/context recovery. The lightning pixel check found
36,931 white material pixels across both passes, zero leaks in the transparent
opening, zero changed pixels outside event bounds and zero alpha errors,
including three overlapping events. The native flight check retained all 1,210
entities and ten nearby masked ships, with no missing masks. Earlier validation
also covered actual Inventory/equipment/reload. Screenshots and results are ignored under
`test-results/dev-nebula-storm/`. CI runs `browser-dev-nebula-storm.py`.

The white-material revision also passed a sequential, same-save off/on/on/off
review with the full 1,210-entity fleet. Four-second headless windows delivered
64.21/54.99/57.22/58.40 FPS; lit-layer painting averaged 0.64–0.69 ms. Every
window retained simulation progress, source hashes stayed stable, and there
were no browser errors. These are short rendering-cost samples, not foreground
refresh qualification. Raw windows and source/fixture hashes remain in
`test-results/dev-nebula-storm/white-bursts-performance/`.

The sequential on/off review used one saved 1,210-entity fleet, stationary in the
compact cloud, 1366 × 768 at DPR 1, and four eight-second headless Edge windows
in off/on/on/off order. Frozen source hashes remained unchanged. Every window
advanced approximately eight simulation seconds, retaining its physical debt.
Those immutable measurements precede the white-material and clustered-lightning
revision, and workspace changes to continuous Badlands feathering and territorial
shipyards. They describe the earlier overlay renderer, not the current renderer.

| Storm | FPS | P95 frame | Worst frame | Frames over 50 ms |
| --- | ---: | ---: | ---: | ---: |
| Off, first | 87.46 | 16.9 ms | 49.9 ms | 0 |
| On, first | 94.93 | 16.8 ms | 50.0 ms | 0 |
| On, second | 88.17 | 16.8 ms | 41.7 ms | 0 |
| Off, second | 88.38 | 24.9 ms | 83.4 ms | 5 |

The added lightning CPU submission averaged about 0.56 ms per lit cloud layer
in the two on-windows. Automatic flashes are intermittent; full-window average
lightning submission was about 0.19–0.20 ms per delivered callback. Lightning
adds rendering work; the variable FPS results do not establish an improvement
or foreground/Chromebook qualification. Raw frames, slow windows, fixture,
source hashes and queues remain in `test-results/dev-nebula-storm/performance`.
Reproduce sequentially with `python tests/browser-dev-nebula-storm-performance.py
--source-root <frozen-source> --seconds 8`. Functional tests use explicit host
timestamps for screenshot timing and must not be interpreted as FPS measurements.

## Colour previews and shared material

The four colors blend softly in world space inside the same moving cloud.
The color selector and swatch buttons can preview an individual color or restore
the original region palette. Switching colors preserves density, animation time,
ship displacement and existing wakes, including while reduced motion is enabled.
The comparison uses the existing renderer and one shared material field; it adds
no cloud workers, image assets or extra gas rendering passes. This color preview
is restricted to Dev Sol pending the player's choice for the wider galaxy.
The color browser regression checks all four visible hues, unchanged gas alpha,
preserved material density/wakes through every selector mode, and the frozen
animation phase during reduced motion. Run `python tests/browser-sol-fog-colors.py`.
Screenshots, checks and sequential same-save timing samples are retained in
`test-results/sol-fog-colors/`. Those headless timing runs vary substantially and
establish no physical 120 FPS qualification or general speedup claim.

Every registered ship now uses the persistent material simulation: player hulls,
civilian ships, tugs and repair Dots. The current catalog contains 83 hull types
with four damage stages each. All ships inside the finite cloud, including ships
outside the camera view, displace the same gas. Their wakes can cross and merge.
Each ship retains its own displacement, speed envelope and distance phase;
the shared cloud advances once per display interval.

## Galactic weather

The active `procedural-nebulae.js` catalog removes the former Harman, Kardon and
Vex cloud complex. Their old lower-right footprints also exclude transient
storms, so the removal does not get reversed by future weather. The legacy
world records retain their historical anomaly classifications; they no longer
select these decorative clouds. The Harman/Vex names in the Sol test selector
remain gas recipes, not restored geographic placements.

Four persistent regions remain at fixed chart centers:

| Region | Chart center | Palette |
| --- | --- | --- |
| Badlands | (-139.8, -30.7) | Burnt orange, salmon and gold |
| Azure Nebula | (13, 11) | Navy, cobalt and cyan |
| Tibor Nebula | (-121, 104) | Slate and pale sage |
| Bassen Rift | (-85, 210) | Black-green, moss and pale green |

The additional centers are the player's adapted game-map placements, not
canonical astronomical coordinates. Tibor's palette is an authored choice.
The Badlands plasma treatment follows the official
[Badlands history](https://www.startrek.com/news/brief-history-of-the-badlands);
the Bassen association is consistent with the
[Nemesis screenplay](https://imsdb.com/scripts/Star-Trek-Nemesis.html).

Transient blue, green, purple, yellow and red storms have a seeded 900-second
formation, drift and dispersal cycle. Each region has its own phase and lifetime;
the shader never randomly changes an existing storm's color. New storms fade in
and old storms fade out. Positions derive from chart cells and the existing
saved simulation clock, including calendar skips. Reloads and system rebases
therefore do not reseed weather. Queries inspect the neighboring nine weather
cells and the four permanent landmarks, rather than simulating the galaxy.

Most weather fades outside the catalog's exact system envelopes, with a soft
outer transition. A small seeded minority of fronts may enter one nearby system.
The three removed lower-right regions remain excluded in every case. Ordinary
space retains clear stretches between finite cloud patches. Pause freezes
weather; reduced motion freezes the displayed storm layout and gas animation.

`galaxy-nebula-fog.js` reuses `nativeDevFog.createRenderer` for nearby fly-through
cores, including the shared swept ship query, all artwork hull masks, nacelle
openings, persistent displacement and worker/GPU fallback. Bodies and the camera
are transformed into the moving cloud's coordinate frame, so a wake travels
with its storm and does not cling to the viewport. Finite local cores are
separated by clear gaps; their distant surrounding gas retains parallax.
The background gas is feathered out under a ready local core, preventing a
second uncut background layer from filling its wake. Optical formation scales
the resolved material without reseeding density or deleting its displacement.

At most three local cores retain fluid workers. Recently viewed cores continue
their accepted flow and shared hull queries offscreen, for up to 30 simulation
seconds, subject to that three-core cache budget. Distant weather has no fluid
worker. The Sol preview requires actual physical Sol membership, not merely a
Sol coordinate frame in an interstellar save. Its visible test bank takes
priority over local galactic cores.

Run `node --test tests/parallax-nebulae.test.cjs tests/dev-sol-fog.test.cjs
tests/nebula-material.test.cjs`, `python tests/browser-galaxy-nebulae.py` and the
existing parallax, Intrepid, all-hull and material-presentation checks. Use
`tests/browser-galaxy-nebula-performance.py` for separately recorded native
flight and a 20-existing-crew battle inside Azure, retaining the complete saved
fleet and normal ship/weapon statistics. Full-game 120 Hz qualification remains
separate; a functional or isolated fluid pass is not a claim of 120 FPS.

The live cloud uses a three-world-unit fluid grid, with the original artwork
masks retained independently for exact visible hull edges and openings. Compared
with the former two-unit fluid grid, this uses about 56% fewer fluid cells and
slightly softens small wake/bank details. The Intrepid opening, sideways drift,
refill and worker recovery checks cover the live grid size. The base material API
still accepts explicit finer grids for reference checks. Conservative
fluxes, pressure, impulse and speed response remain. Quiet tiles stop scheduling fluid
work below one world unit/second and 0.0005 density change per fluid step only
after residual pressure curvature also falls below 1/128. This extra check keeps
conservative mixing alive for alternating cell patterns that a centered pressure
gradient cannot detect. Stored density and momentum remain intact. Adjacent active flow and new hull
passage wake them. The regression compares this with a fully active solver after
12 seconds of refill, bounding both mean and maximum optical error.
Zero-flow cells skip redundant arithmetic/stores. Numerical momentum below
0.0001 world units/second is suppressed; the reference check retains the former
1e-12 floor as well as fully active tiles. This floor moves gas less than 0.002
world units over 15 seconds and never removes density.

`nebula-flow-kernel.js` optionally runs the numeric loops in WebAssembly inside
the same worker, using shared views of that field's private memory. It neither
introduces another simulation nor transfers ship physics. Its double-precision
operations and Float32 stores match the JavaScript fallback exactly in the
drift/overlap/recovery regression, including odd grid widths and tile boundaries.
SIMD pairs independent momentum and both flux directions; horizontal accumulators keep
their original rounding order. Exactly dry outgoing faces skip flux arithmetic.
A completely empty five-cell stencil carries no gas velocity; newly arriving gas
wakes it through its neighbors. Solid faces use the adjacent fluid pressure,
avoiding artificial acceleration into a stationary hull. These rules apply to
both the compiled and JavaScript solver. The loader fails back to JavaScript if the
kernel is unavailable. The page CSP permits WebAssembly compilation specifically;
it does not enable JavaScript eval. Rebuild using pinned AssemblyScript 0.28.9:
`python tools/build-nebula-flow.py --compiler path/to/assemblyscript/bin/asc.js`.
Use `--check` to verify the generated source/binary. Compiler dependencies belong
outside the game tree; the shipped game requires no package installation.

Worker catch-up yields through MessageChannel between short command slices,
avoiding the nested-timer delay during a backlog. Newly changed gas publishes
after each completed batch or four-millisecond catch-up slice, independently of
the fixed 30 Hz bulk-fluid step. A separate completion acknowledgment
prevents replaying an in-flight batch. Every accepted path and elapsed interval
remains represented. Above 2,000 world units/second, matching straight,
constant-velocity interpolants can combine over at most one fluid interval. The
runtime sends fresh movement immediately and combines only inputs already queued
while the worker was busy. Turns, reversals, membership/mask changes and rebases
stay separate. The stored recovery log uses
the same combined commands, so failure replays the actual submitted calculation.
Main-thread recovery copies run in bounded tasks; failure first
finishes a partial checkpoint before replaying later inputs. Wide updates use
contiguous row spans for packing and publication, avoiding temporary views for
each row; narrow updates retain their crop. Recovery still copies in bounded
bands and commits each snapshot atomically. Pending-silhouette
construction visits recent history backwards rather than allocating and then
discarding every older sample in a long backlog.
Consumed publication buffers return to a bounded 32 MiB worker pool, after
visible copying or completion of a coherent recovery checkpoint. They are never
recycled while a partial recovery copy still needs them.

Presentation uses the most recent resolved fluid flux for a bounded prediction
of at most one 30 Hz step. This smooths fluid motion without buffering another
frame, changing conserved density or predicting ship motion. The render cache
includes this phase while gas is active, including with a stationary ship/camera;
reduced motion disables the presentation prediction. Current artwork coverage
and pending swept silhouettes apply afterward, retaining real hull edges and
nacelle openings. Both 80/20 optical layers cross from WebGL to Canvas
in one retained atlas; source color uploads occur only when the procedural
source changes. The existing retained surfaces and CPU renderer remain available.
With float-linear texture support, four bilinear reads reconstruct the same
cubic density filter; the original 16-read path remains the fallback. GPU
density/rate uploads cover changed regions within the viewport plus newly exposed
strips when panning. Full uploads remain available as a reference path. Unchanged
texture sampling settings are retained. The front layer reuses the back layer's
build within a frame while still invalidating on gas, pose, color or prediction
changes; numeric pose comparisons avoid formatting a large per-frame text key.
Current hull and
pending Canvas masks use cropped, pixel-aligned surfaces, including a separate
channel protecting actual nacelle openings. Same-sized textures update in place.
Shader preparation and a bounded transparent surface warm-up run during idle
loading/menu time without advancing gas; real cloud drawing keeps its full size.
When the finite field is wholly outside the viewport, painting and procedural
color refresh are culled with padding for the reconstruction filter; the shared
material, offscreen hulls, queued poses and world clock continue to advance.
Radar and weapon painting reuse the existing resize-aware display measurements.

Run `tests/browser-nebula-presentation.py` for layer/pending-mask equivalence and
bounded smoothing, and `tests/browser-frame-reuse.py` for display/weapon geometry.
`tests/browser-nebula-catchup.py` recreates the full-speed, four-color battle with
12 existing crews from the same 1,210-ship save. It records actual frame intervals,
visible publication latency, queue age, cloud occupancy, real velocity, weapon
acceptances, focus/fullscreen conditions and source hashes. Its `--diagnostic`
video/profiles are separate from clean delivery measurements. Supply an immutable
`--source-root` and a distinct `--output` for each clean comparison. A configured
refresh rate, headless recording or functional pixel pass cannot certify 120 FPS.
Use `--fixture path/to/save.json` to supply the existing full-fleet save. Reports
distinguish its raw-file hash from the newline-normalized text hash used by the
native harness; this does not change the parsed save.

`nebula-material.js` retains a world-space density and velocity field in the
finite test cloud. The seed comes from the same procedural gas renderer. Each
move sweeps the resident, aligned artwork alpha through the grid, including
rotation and the actual gaps between hull and nacelles. Removed material is
deposited outside the actual hull into surrounding banks and openings. It is not
deleted or put back by a trail timer. Conservative neighbor transport, return
pressure and mixing bring surrounding gas back into the open wake. Velocity
advects with the material, so the return flow can bend and roll after passage.

The bow splits the flow while each flank uses its actual surface normal,
including the inward-facing nacelle edges. Previously cleared cells are open
to incoming material. The mask also measures transparent runs between pieces
of hull throughout its length. Up to 22% of displaced bow material follows short
surface streams into these measured openings; the remainder goes to the outer
banks. This approximates flow around the saucer below the grid's time/space
resolution, preventing the saucer from starving the nacelle gaps at flight
speed. It transfers existing material and momentum rather than adding gas or
painting a ship-attached fog shape. Stationary hulls receive no new bow stream;
neighboring material and existing velocity continue to evolve normally.

Fast passage eases into a stronger response using actual world displacement:
the speed envelope rises over 0.22 seconds and eases down over 0.45 seconds.
The extra response grows smoothly between 140 and 430 world units per second;
ordinary slower flight retains the gentle profile. The leading bow deposits
material into a narrower compression band, flank impulses carry more momentum,
and streams through the nacelle openings move faster. The opening-stream mass
fraction remains unchanged. Actual sideways travel drives the same response.

Alternating flank shear is deposited into the existing world-space velocity
field. Its phase follows distance travelled relative to the beam, so curls
remain behind after turning or braking. Reduced motion disables this alternating
shear. Faster travel naturally leaves more distance behind the ship before gas
has time to return; the refill solver and its timing stay the same. No extra
particle system, global update pass or faster simulation rate is added. A
cell-size-dependent velocity limit keeps diagonal advection stable at 30 Hz.
Speed-envelope and shedding-distance state are included in worker recovery.

The sweep uses actual world displacement and angular motion. Sideways drift
therefore cuts with the moving side of the hull; an existing cut does not turn
with the ship. The renderer uses the exact artwork, position, rotation and
dimensions from the shared ship drawing path as its final boundary, not the
legacy symmetric row profile or shield radii. Density reconstruction smooths
grid cells without drawing an outline, ripple rings or a heading-attached V.

Long translations raster the swept union of the real binary artwork once,
instead of stamping the complete hull at every small distance increment.
The compiled path decomposes sufficiently long sweeps into a projected middle
and two detailed, clipped end caps. Disconnected projected runs stay separate;
this is not a convex replacement for the hull. Rotation alone adds angular
subdivisions. Each covered cell transfers its existing gas into exposed banks,
with conservative momentum mixing and the same subsequent 30 Hz fluid flow.
Ordinary short moves retain their established detailed bow/opening response.
Swept rectangles use direct boundary construction away from parallel edges;
near-parallel cases retain the general hull/clip calculation to resolve tied
corners correctly. Scan intersections reuse slopes with reference arithmetic
at integer boundaries. Scratch clearing visits the previous union's bounds.
Distance and an old engine speed hint no longer classify movement as teleporting:
discontinuities use explicit rebases. Shared swept queries retain actors whose
current endpoint is outside the cloud, including a complete crossing between
frames, and supply the canonical previous pose when an actor first appears.
That pose uses physical coordinates, independent of drawing interpolation.
A complete crossing can finish its last visual segment once after leaving the
shared query; it cannot create an extra segment after an explicit rebase.

The live field uses three-unit cells over the cloud's world bounds and retains only
cosmetic flow debt. `nebula-material-worker.js` runs the same conservative
solver outside the drawing thread. Each 30 Hz step visits touched 16-by-16-cell
tiles and their neighboring halo, rather than scanning the rectangle between
every previous position. All submitted poses and display time are retained.
Tiny numerical residues below visible precision are flushed to zero to prevent
expensive Float32 subnormal arithmetic in quiet gas.

The worker publishes changed density rectangles after completed work slices and recovery
checkpoints once per display second. Until a density update arrives, retained
Canvas masks clear short unpublished paths. Long crossings use a retained integer
GPU mask: each cell records the latest accepted sequence covering it. A publication
acknowledges older stamps, and new movement adds only new geometry. Binary artwork
boundaries extrude along the entire segment, so distance does not multiply the
number of hull draws. The current hull still uses the
original full-resolution artwork in the GPU pass. Current openings are protected
from those past silhouettes, so a delayed update cannot erase fog between the
nacelles. A worker failure restores the
last checkpoint and replays subsequent poses into the synchronous solver.
Resetting the cloud or replacing game state terminates the old worker.

Pause and hidden views exclude display time. GPU upload uses the changed density
rectangle; context loss retains the material field and a fallback renderer.
The disturbance remains in world space through turns, braking and same-session
visits, while the empty channel gradually floods from neighboring fog. Reloading
or starting a different game creates a new test cloud; this experimental field
adds no save data or forces to ships.

Run `node --test tests/nebula-material.test.cjs` and
`python tests/browser-intrepid-fog.py`. The browser drives the real Intrepid
with W, tap-S drift, D steering and X braking. It samples wake refill over 15
seconds at rest, conserved material, no legacy V calls and pause/context recovery. It
also compares worker results and checkpoint recovery against synchronous replay.
Artwork alignment covers four headings at two scales for each of the three
reference variants, including the nacelle gaps. Additional flow checks use
independent alpha samples inside both nacelle openings at three flight speeds
and two headings, then observe the wake flood with the hull stopped. Artifacts are in
`test-results/intrepid-fog/`. These are functional checks, not display-refresh
qualification or a claim of a full physical fluid solver.

Speed regressions compare flow momentum and opening streams at 120, 270 and
427.5 units per second, observe the longer clear wake and smooth braking, and
verify that stale speed hints cannot override actual drift. The real-artwork
browser cases retain the same hull/pixel and mass-conservation gates.

`tests/browser-fog-performance.py` measures actual full-game frames separately
from instrumented diagnostics. Use the same saved fixture, fleet and viewport,
run timing windows sequentially, and retain raw intervals and failed trials.
The November 9 comparison used the saved 1,210-ship fixture at 1280 by 850:
the previous synchronous implementation delivered 15.08 and 14.00 FPS, while
the worker implementation delivered 58.22 and 58.36 FPS in repeat headless Edge
runs. Frame-callback p95 fell from 144.7/147.4 ms to 8.9/8.6 ms. No fleet,
physical simulation or save rules were reduced. These are local measurements,
not a guarantee for a physical monitor; earlier session trials had different
frame cadence and are retained separately. The matched native-RNG reports are
`test-results/intrepid-performance/final-original-native.json` and
`final-worker-native.json`.

The subsequent nacelle-inflow change was compared against the immediately
preceding worker version with that same save and viewport. Final runs delivered
29.38/31.50 FPS against 28.49/30.11 FPS before the change, with p95 callbacks of
29.3/32.0 ms versus 31.3/24.7 ms. These remain comparable local results, not a
speedup or zero-stall claim. Raw runs, the intermediate candidate and source hash
are retained in `test-results/intrepid-performance/inflow-comparison.json`.
An additional 30-second flight delivered 34.27 FPS and ended with 0.067 seconds
of queued worker time, with the complete fleet still active. The generic
rendering review did not reach a measured window within four minutes of initial
preparation and was cancelled; its incomplete report is retained. The
dedicated full-game fog flight comparison completed separately.

The speed-response revision has a separate frozen-site comparison in
`test-results/intrepid-speed/comparison.json`. Both sites share identical game
code except the material module and its cache URLs, with the same saved 1,210
ships and 1280-by-850 viewport. One headless flight window delivered 115.96 FPS
before and 110.15 FPS after; callback p95 was 5.4 and 5.7 ms. This shows a small
local cost rather than zero overhead. A separate 30-second flight ended with
0.0084 seconds queued in the worker. Earlier live-tree trials include unrelated
concurrent game changes and are retained separately, without attributing their
FPS changes to fog. Functional coverage passed 59 related Node checks, 18
real-artwork speed/heading cases, 24 alignment cases, pause and worker/GPU
recovery, plus the background-suns browser regression.

The earlier `nebula-flow.js` preview remains available to its isolated regression
fixtures; the Dev Sol bank uses the shared material path for every hull.

`nebula-hull-masks.js` contains numeric alpha runs sampled from the original
aligned artwork, including damaged stages and the Dot sprite pivot. It allows
an offscreen ship to push fog without loading its images. Regenerate with
`python tools/build-nebula-hulls.py`, and verify with its `--check` option after
artwork or alignment changes. Resident artwork supplies the final visible hull
boundary. Nearest-surface preparation happens in the worker; removing a ship
releases its worker mask when no queued command still needs it.

The existing registered spatial query supplies actors. No parallel fleet registry,
ship spawning or changes to gameplay motion, contacts, resources, random streams
or save schemas are introduced. Damage/repair artwork and custom Dot pivots use
the same visual owners as ordinary drawing. All current hulls form a union before
gas is deposited, preventing one ship from pushing gas inside another hull.

The procedural tint is retained over the cloud's world bounds and refreshed at
30 Hz. One GPU pass reconstructs density and writes the deeper and foreground
layers to two attachments, preserving their 80/20 optical split. Only visible hull
masks are drawn; offscreen actors continue evolving the shared world field. Worker
failure replays all retained actor batches and elapsed time into the same solver.
GPU restoration and the CPU fallback retain the same field. The CPU path
rasterizes the visible hull union and reads published density directly, avoiding
ship/pending-pose membership scans for every pixel. The interactive point sampler
still protects current hulls and queued poses. This prevents a large recovery stall
when several ships are present. Pause, hidden views, travel and system changes
preserve the existing flight gates.

Dev tools also contains **Show flight frame timing** and **Clear frame timing**.
The optional HUD shows rolling FPS, lifetime frames over the 120 FPS budget and
the worst observed frame. Recording includes active foreground Dev flight only;
opening tools or pausing does not count inactive time. This is continuous observed
frame delivery, not a promise that future frames or other machines will stay at
120 FPS. The nominal frame budget is 8.33 ms; the over-budget counter allows 8%
timestamp tolerance, and missed refresh intervals are counted separately.

Run the material/Dev Node tests, `python tools/build-nebula-hulls.py --check`,
`python tests/browser-fleet-fog.py --catalog-stages 0,1,2,3`,
`python tests/browser-intrepid-fog.py` and the background-suns browser regression.
The fleet test compares all original hull/damage-stage pixels and offscreen masks,
checks shared worker recovery, and flies through a dense bank with existing ships.
It retains raw errors and images in `test-results/fleet-fog/`.

For actual foreground measurements use
`python tests/browser-fleet-fog.py --performance --headed --label fleet-foreground`.
It checks native fullscreen size, the active 120 Hz display, focus/visibility,
simulation progress, retained debt and actual frame intervals. It reports a strict
120 FPS window separately from functional success; any over-budget frame fails
that strict window. Use `tools/validate_gameplay_refresh.py` for the existing whole
game qualification and `tests/browser-performance-review.py` for sequential,
matched-save before/after measurements. Keep all failed windows and source hashes.

## Response and mixing verification: November 11, 2026

The response pass fixes a reproduced quiet-tile failure: an alternating density
pattern slept after one step and retained 0.19929 contrast after 60 seconds.
The corrected model continues conservative mixing and reaches 0.00133 in the
same controlled test. These are density values, not screenshot contrast. The
actual stationary-in-fog screenshots do not conclusively identify the exact grid
reported by the player. Solid-face pressure and completely empty stencils also
have explicit regressions in both compiled and JavaScript paths.

A calibrated compression-bank pixel probe holds final hull coverage fixed, so
exposing a hull edge cannot count as moving gas. Twelve headings/drift trials
improved from 28.8 ms median / 37.1 ms p95 to 11.0 ms median / 12.1 ms p95.
All twelve updated trials resolve visible bank gas on the next observed frame;
none of the twelve original trials do. This includes GPU readback and is not a
physical scanout or full-game frame-rate measurement. Run
`python tests/browser-nebula-response.py --trials 12`.

Both final 60-second isolated 20-ship, 100x-speed capacity cases pass: mixed
hulls across all four damage stages while turning, and the largest hulls in
straight flight. Maximum queued time stays below 59 ms, draining in under 18 ms
after input stops. All accepted time is retained, with no growing backlog or
missing actors. The turning window still contains an isolated 50 ms frame
interval. Capacity success does not establish zero lag or 120 FPS gameplay.

All 112 related Node checks, 332 hull/damage-stage artwork-mask comparisons,
exact worker/recovery parity, Intrepid openings/drift/refill, color continuity,
GPU fallback/restoration, presentation, background suns, parallax gas, display
reuse, HUD behavior and generated hull/kernel checks pass. The incremental
upload probe transfers zero cells for a hidden change and 1,804 density/rate
cells for its local visible change; its image matches the full-upload reference
exactly. HUD formatting retains one formatter and unchanged meter output;
canceling animations invalidates the retained meter state. Radar keeps the same
nearest five rocks without sorting the entire local set.

The **full-game 120 FPS target remains unmet**. A matched native-fullscreen
battle pair has 97.92 versus 100.15 FPS, 119 accepted shots, the same 1,210-ship
save and only six changed fluid/render modules. Typical visible publication lag
falls from 41.8 to 33.4 ms, while its peak does not improve. This single pair does
not establish a general FPS gain. The later final 25-second battle delivers
100.27 FPS and the 65-second stationary-inside-fog window 115.57 FPS; both remain
below target. These later snapshots also contain concurrent fleet changes and
are reported separately from the matched pair.

The final foreground whole-game qualification, failed intervals, source hashes,
AC/120 Hz display conditions, raw samples and excluded diagnostic trials remain
in `test-results/nebula-response-20261111-044937/`. Open `report.html` or
`comparison.json`; `delivery-source/site/` is the measured fog/native snapshot
and `qualified-source/site/` adds the final HUD cancellation invalidation and
cache tag for whole-game qualification. Display settings are restored after
measurement. A Chromebook has not been tested. These changes do not justify an
always-120-FPS or universal-no-stall claim.

The final HUD-corrected qualification records 78.91 FPS in flight, 70.20 in
crowded flight and 73.16 in crowded combat, with 230 accepted attacks. All three
fail the 120 Hz criteria despite keeping simulation time current. The earlier
final-source qualification is also retained (115.62 / 72.64 / 57.80 FPS); this
variation is not evidence that a HUD cancellation reset caused a speed change.
Neither run qualifies the game. See
`test-results/performance-review/nebula-response-qualified-qualification.json`.

The subsequent normal-flight source comparison repeats 113.44 FPS on the earlier
frozen source and 115.35 FPS on the HUD-corrected source, with identical save,
harness, viewport, GPU and 120 Hz fullscreen conditions. Thus the 78.91 FPS run
has not reproduced as a consistent slowdown from that change. Its extra render
and simulation CPU time is recorded, but the initiating cause remains unknown.
A third repeat exits fullscreen and advances only 12.08 simulation seconds;
retain it as excluded, not as a valid 116.15 FPS comparison. See
`test-results/nebula-response-20261111-044937/flight-recheck.json`. None of these
windows qualifies 120 FPS. The low original window remains in all reports.

## Fast-passage verification: November 10, 2026

The final three-unit cloud passes the isolated 20-ship, 100x-speed capacity
checks. Each window measures 60 seconds after two seconds of startup, with
repeated complete cloud crossings. Maneuvers include turns, braking, stopping
and acceleration. Original catalog dimensions and silhouettes remain in use.

| Isolated fog window | Peak measured queue | Final catch-up | Crossings per ship |
| --- | ---: | ---: | ---: |
| Mixed hulls, turns | 32.7 ms | 11.4 ms | 855 |
| Largest hulls, straight travel | 48.8 ms | 20.4 ms | 1,205 |
| Mixed hulls/damage stages, turns | 39.5 ms | 22.3 ms | 855 |

All three pass the explicit capacity gate: at most 100 ms queued, at most
100 ms to drain, retained accepted time and relative material error below
0.0001%. They retain elapsed time within numerical rounding and material error
below 0.00004%. These are headless component checks, not 120 FPS game results.
The prior two-unit turning window reached 370.8 ms queued and took 245.7 ms to
drain, and remains a failed trial. The grid change is an explicit fluid-detail
tradeoff; it does not establish identical density values across resolutions.

104 Node checks pass, including the new short/long near-axis sweep regression
and repair-bundle readiness/failure checks. Compiled results retain the reference
arithmetic at integer boundaries. A separate deterministic three-second,
fixed-120-step comparison with identical current masks and the two-unit reference
grid took 2693.5 ms with the preceding compiled kernel and 2254.7 ms with the
final kernel. Density, momentum, rate and swept-cell hashes match exactly; this
single throughput sample does not measure rendered FPS. The Intrepid browser check passes opening
inflow at three speeds for all three Intrepid/Voyager hulls, sideways drift,
world-space persistence, 15-second refill, pause, worker recovery and GPU restore
with the live three-unit grid. Repair artwork now publishes only after readiness;
the intact Dot's offscreen outline was regenerated from its complete original
artwork. Other catalog outlines are unchanged.

All 332 original-artwork hull/damage-stage browser cases pass with zero leaks
or enlarged clear edges. Final AC/120 Hz native battle windows delivered 90.15
FPS with fog and 95.15 with fog disabled, with 119 accepted attacks in each
25-second window. Peak visible fluid delay in that fog window was 74.8 ms.
The existing whole-game qualification delivered 101.28 FPS in flight, 68.91 in
crowded flight and 62.50 in crowded combat, with 234 accepted combat shots.
Simulation time kept up, but frame delivery failed every 120 Hz window. The
display returned to its original 120 Hz setting afterward.

The **whole-game 120 FPS target remains unmet**. Keep the full-game refresh
qualification separate from fog capacity. Source, raw failures, display/power
conditions and the readable comparison remain in
`test-results/nebula-extreme-20261110-135053/`, including `report.html`,
`comparison.json` and the frozen `release-source-6/site/` game.
The foreground qualification is
`test-results/performance-review/nebula-sweep-release-qualification.json`.
Empty native-fullscreen controls in Edge/Brave delivered about 101-102 FPS in
this session; this observation does not diagnose the pacing cause or account
for the additional crowded-game CPU/rendering costs. No Chromebook was tested.

Run `tests/browser-nebula-stress.py --motion maneuvers --fleet mixed
--stages 0,1,2,3 --multipliers 100 --count 20 --seconds 60` for the damage-stage
capacity check. The default is headless and reads the served game's
`nativeDevFog.fluidCell`; `--cell` records an explicit override. `--headed` is an
optional component view, not the actual game or a whole-game FPS qualification.

## Earlier optimization verification: November 10, 2026

The optimization pass passed 90 Node checks, the Intrepid flight/opening/refill,
worker/GPU recovery checks, the presentation/color tests and display reuse checks.
All 332 original-artwork hull/stage pixel cases passed with zero fog leaks or
enlarged clear edges. SIMD results match the JavaScript solver exactly, including
odd grid widths, overlapping hulls, drift and checkpoints. The numeric kernel's
isolated comparison reduced its measured work by about 16%; that is not an FPS
qualification.

The performance target remains unmet. Final sequential native-fullscreen
measurements used the same 1,210-ship save, the same 12 existing crews, ordinary
movement/weapon statistics and the same four-color fog scene. Five crews actually
retaliated, with 119 accepted native attacks in each 25-second window. The display
was 60 Hz at 2560 by 1600 (1280 by 800 CSS, DPR 2), on battery power.

| Native window | FPS | p95 frame | Worst frame | Maximum visible fog delay |
| --- | ---: | ---: | ---: | ---: |
| Original, 25-second battle | 21.45 | 83.3 ms | 216.7 ms | 17.233 s |
| Updated, 25-second battle | 22.66 | 83.0 ms | 133.3 ms | 0.933 s |
| Updated, 90-second flight after battle setup | 26.96 | 66.9 ms | 183.4 ms | 1.817 s |

The long run ends with 0.517 seconds queued. Its opening battle ends naturally;
it does not establish 90 seconds of continuous firing. Residual fog lag remains.
An earlier fog-disabled control delivered 27.69 FPS in the same saved battle,
showing broader frame-budget costs. Physics time/debt and every accepted fog
input remain retained; neither fleet size nor normal speeds were reduced.

Separate same-save headless review windows were mixed: flight 47.03 to 43.70 FPS,
crowded flight 37.32 to 37.72, and crowded combat 24.89 to 22.90. Crowded combat
retained physical debt and advanced 10.00/9.23 simulation seconds in the respective
12-second windows. These samples establish no general FPS improvement.

The final source, all raw windows, conditions, CSV samples and a readable report
remain in `test-results/nebula-catchup-20261110-025125/`. See `report.html` and
`comparison.json`; `delivery-source-v7/site/` is the immutable final game source.
The before/after headless reports are
`test-results/performance-review/nebula-catchup-{before,after}-final.json`.
The measured native harness is archived separately. That earlier stage lacked
a plugged-in 120 Hz qualification. The later pass above includes AC/120 Hz
measurements; it still does not qualify the whole game at 120 FPS.

## Earlier all-hull release measurements

The all-hull release passed 65 related Node checks, all 332 original-artwork
hull/damage-stage cases with zero leaks or enlarged clear edges, exact two-actor
worker/recovery parity, and the Intrepid flight/pause/GPU-recovery regression.
The offscreen mask build check and background-suns browser regression also passed.

The 120 FPS target is **not met**. Final foreground flight delivered 114.16 FPS,
crowded flight 73.60 FPS, and the clean crowded-combat rerun 72.23 FPS on the active
120 Hz, 2560-by-1600 display (1280-by-800 CSS viewport at DPR 2). These accepted
windows retained simulation progress; combat p95 was 24.9 ms. The earlier final
combat window left fullscreen and is retained as an invalid trial. The clean
combat recheck remained focused, visible and fullscreen, and failed qualification
on delivered frame rate and frame intervals. Display mode was restored afterward.

Two valid native fullscreen dense-fog windows on the preceding GPU path delivered
78.70 and 83.08 FPS, against 63.65 and 63.35 FPS for the previous single-hull field
plus legacy fleet preview. The later recovery fix changes the CPU fallback only.
These dense-fog results do not establish a general speedup: separate same-save
headless before/after review windows delivered 118.60/48.27 FPS in flight,
115.32/43.71 in crowded flight and 109.84/23.85 in crowded combat. Headless cadence
and foreground delivery are separate protocols; all raw intervals and failed
windows remain available. The feature adds substantial work in crowded scenes.

The full comparison, source hashes, conditions and limitations are recorded in
`test-results/fleet-fog/comparison.json`; final release review and qualification
reports are in `test-results/performance-review/fleet-fog-release*.json` and
`fleet-fog-combat-recheck*.json`. The optional Dev timing HUD reports observed
misses continuously; it does not certify future frames or other hardware.


## Reusing unchanged fog work

The material worker prepares a funnel's fixed radial geometry once per field.
Each fluid step still evaluates its current surge and turbulence, applies the
same inward transport and runs the same conservative solver. Geometry, strength
or phase changes invalidate preparation. Cells are grouped by existing tiles
so activation is recorded once per touched tile. The direct ship-force sampler
and the funnel shader retain their existing calculations.

An unchanged stationary hull reuses its cleared cells while remaining in the
shared solid union. Mask changes, dimensions, rebases, reseeding and checkpoint
restoration retain the ordinary sweep path. Nearest-surface preparation skips
already-empty mask pixels and is deferred until a hull actually displaces gas.
Off-field or empty-gas actors still retain their real pose history. The gas
renderer also reuses fixed uniform arrays and omits unused wake/hole uploads.
Neither fluid resolution, update cadence, elapsed time nor the saved fleet is
reduced.

`tests/nebula-work-reuse.test.cjs` compares every density, velocity, flux-rate and
swept value against the uncached transport through geometry changes and recovery.
The isolated four-second, one-funnel comparison took 492.6 ms with reuse and
2015.0 ms without it (4.09 times faster), with zero differences in those arrays.
This is a solver measurement, not a full-game frame-rate claim. The generated
script and raw result are in `test-results/nebula-optimization/`.

The full-game catch-up harness accepts `--preset badlands` and `--module-root`
for sequential comparisons against frozen renderer modules with identical
remaining game code and the same 1,210-entity save. Four initial ten-second runs
varied from 17.07 to 51.37 FPS; the two slow windows failed simulation-progress
qualification. The later valid pair delivered 48.32 FPS with reuse and 51.37 FPS
without it, with maximum visible fog delays of 116.6 and 149.8 ms respectively.
Those windows establish neither a general FPS improvement nor a lag-free gate.
All raw intervals, failed windows, source hashes and overrides are retained under
`test-results/nebula-optimization/`; no timing threshold is weakened.

Final checks passed 96 targeted Node cases and six browser suites: presentation,
colours, plasma funnels, background suns, parallax gas and Intrepid flight. The
Intrepid coast/refill fixture now excludes attached gamepad input and starts in
clear flight space inside Sol, preserving the complete fleet and all existing
pixel, conservation, drift and recovery gates.

Final headless timing retained the same 1,210 entities and full simulation time:
flight delivered 49.73 FPS with 116.7 ms maximum visible fog lag, and combat
40.91 FPS with 100.2 ms maximum lag and 38 accepted shots. Neither window passed
the strict frame gate. A slow earlier final-flight trial is retained separately;
the clean flight rerun follows the functional diagnostics. The compact audit is
`test-results/nebula-optimization/summary.json`. Reload the game to load the new
cache versions.

The final combat measurement overlapped independent edits to other game modules,
so its figures are diagnostic only. The subsequent flight window retained stable
sources during measurement. All four modified nebula modules remained unchanged
through both windows; the audit records these conditions separately.

### Asteroids in the shared gas field

`nebula-asteroids.js` adapts the existing shared spatial query's swept `rocks`
results to the same conservative field as ships, in both Dev Sol and production
weather cells. Rocks retain their original world size, rotation, saved motion,
identity and mining owner. Canvas rotation maps to the fluid heading with a
quarter-turn offset; weather origins are subtracted once. Stationary rocks have
no invented travel speed. Drift, spin and complete between-frame crossings push
gas through the existing transport solver, leaving a wake that can refill.

`tools/build-nebula-asteroids.py` bakes 81 original intact/damaged silhouettes to
`nebula-asteroid-masks.js` (110,348 bytes). The shared decoder caches each plate.
Cold and offscreen rocks use that metadata immediately; loaded artwork supplies
the exact display edge without per-frame pixel readbacks. The deuranium owner
still intersects successive damaged plates, and loading fallback silhouettes
follow the actual returned artwork.

Player and civilian mining expose their existing visual operation. Its cut-piece
poses, gathering scale and fade are shared by the mining renderer and gas adapter.
The adapter derives four cached slice masks from the mining owner's existing CPU
alpha and cut paths, without rereading pixels. Finished/faded or destroyed rocks
release their obstruction while the existing displaced gas remains free to heal.
The plasma heat, volume and sheet-lightning passes respect these same masks.

Validation: `nebula-asteroids.test.cjs`, the existing material/Dev/work-reuse,
asteroid-physics, artwork independence, deuranium and effect-culling Node suites;
`tools/build-nebula-asteroids.py --check`; and
`tests/browser-nebula-asteroids.py` cover live registration, poses, damage,
destruction, mining pieces, cached sampling and 13,048 opaque pixel probes under
heat/lightning (zero leaks). Browser presentation, asteroid physics, fire/storm
and funnel suites also pass. The ordinary deuranium browser test also passes
real mining controls, pause, midway save/resume, exactly-once collection,
refining, medical supply/rescue and camera-independent authoritative outcomes.
Its production fixture now starts with an empty ordinary cargo hold/full normal
vitals, rather than Dev's over-capacity resource grants, and uses CSP-compatible
function predicates. Functional pixel readback tests do not establish
display refresh performance. Timing artifacts are kept separately under
`test-results/asteroid-nebula/`.

The frozen final foreground timing retained all 1,210 saved entities, local Dev's
single physical player ship, 16 asteroid bodies, two real pushed rocks and
repeated sheet flashes. In two sequential 12-second windows, all asteroid adapter
preparation together averaged about 0.10 ms per display frame, and the GPU
material pair averaged 0.147/0.137 ms. The stationary window delivered 99.96 FPS
with no frames over 50 ms; flight delivered 93.17 FPS with four frames over
50 ms (worst 100.1 ms). The whole-game strict frame gate still fails in flight;
this is not a zero-lag claim. Raw frames, queries, source hashes, the failed
window and frozen modules are retained with `audit.json` and the performance
report. Run the timing harness separately from functional validation workloads.

### Lightning rectangle seams

The local lightning renderer now recolours one continuous optical layer with
`source-atop`, preserving its alpha and existing hull/wake gaps. Its former
clipped rectangle replacements antialiased their shared edges at fractional
game scales, producing visible dark boxes, especially where flashes overlapped.
One reused canvas replaces the two patch workspaces; sprite art remains cached,
and offscreen/inactive flashes use the ordinary cloud painter directly.

`tests/browser-lightning-composite.py` reproduces the old failure at 1.25,
1.7778 and 2.2222 scales (up to 7,063 darkened pixels and 44 colour levels of
darkening in one opaque comparison). All 16 fixed back/front, transparent/opaque
and display-scale cases have zero darkened pixels and zero alpha mismatches.
Before/after pixel reports and images are retained in
`test-results/lightning-composite/`.
