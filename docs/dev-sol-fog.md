# Sol fog flight test

Start or continue a Dev game in Sol. The local fog bank starts ahead of
the player with purple, red, blue and yellow regions for color comparison. Fly forward into it, turn through it, and stop to watch the wake
fill. Dev tools contains **Sol fog flight test**, an enable checkbox, Harman/Vex
presets, **Sol color preview** and **Reset fog ahead of ship**. Reset places a new bank ahead of the
current world pose and clears its visual history. It does not relocate the ship.

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

The field uses two-unit cells over the cloud's world bounds and retains only
cosmetic flow debt. `nebula-material-worker.js` runs the same conservative
solver outside the drawing thread. Each 30 Hz step visits touched 16-by-16-cell
tiles and their neighboring halo, rather than scanning the rectangle between
every previous position. All submitted poses and display time are retained.
Tiny numerical residues below visible precision are flushed to zero to prevent
expensive Float32 subnormal arithmetic in quiet gas.

The worker publishes changed density rectangles at up to 30 Hz and recovery
checkpoints once per display second. Until a density update arrives, retained
Canvas masks clear the unpublished swept path; the current hull still uses the
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
