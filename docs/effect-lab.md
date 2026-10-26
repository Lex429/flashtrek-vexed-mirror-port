# Effect lab

Open `http://127.0.0.1:7788/html-games/flashtrek-broken-mirror/damage-showcase.html`
and choose **Stress**. The installed showcase connects to the dedicated lab
service on port 7791, which serves the active game's exact source files and leaves
the existing game service on port 7790 running. Start the lab service with:

```powershell
python tools/effect_lab_server.py
```

The normal damage/repair showcase remains available in its existing tabs. Its
animation loop suspends while Stress is selected, so it does not compete with
the measured scene. Stress controls use six compact pages without document
scrolling. Short phone measurements expand the scene into fullscreen; exiting
fullscreen during a recording invalidates that recording.

Regular **Weapons** tests use the same `shield-gpu.js` and `shield-gpu-live.js`
presentation used by the game and Stress scene. The installed showcase loads
those actual files from the lab service, along with the release/catalog profiles
and shared weapon/contact modules. The cinematic candidate is the showcase's
default preview. It does not carry a separate copy of the latest shader. The
header identifies the active shield renderer and profile.
On **Weapons → Fire**, **Impact location** can vary hits across the bubble,
retain the firing ship's approach, or use a point selected by clicking the bubble.
The selected point is marked on the ship and stays attached while rotating or
zooming. Beam, torpedo and bolt endpoints use that same point. This control is
a showcase test input; gameplay contacts still come from the combat owner.
**Weapons → Settings → Shield renderer** exposes the old Canvas shields only as
an explicit **Legacy baseline** comparison. There is no silent fallback from a
failed GPU initialization to an old effect labelled as the new shader.

Stress records the selected shield renderer in each fixture and uses it in
**Check in game** too. Renderer choice may differ in a matched legacy/GPU
comparison; fleet, event load, viewport, hardware and source still must match.
Leaving Stress applies its selected profile and renderer to regular weapon
tests. Candidate modules, shield settings and weapon size therefore remain the
same in both views. Legacy runs are comparison-only and cannot be staged for
promotion as a GPU candidate. Use `tests/browser-showcase-shields.py` for the
actual beam/torpedo/bolt, contact, collapse, legacy and profile parity regression.

Default CThia startup loads its hull independently of optional generic debris
materials. The installed site must include `damage-art-worker.js` and matching
`cthia-destruction.js`, `earth-fractures.js`, `wreckage-effects.js` and
`showcase-stage-fragments.js`. Structural partitions travel as data to the
worker, preserving their exact owner function. Parent preparation suspends
while Stress is selected. `tests/browser-showcase-startup.py` exercises a cold
default load even when optional debris preparation never completes.
Ship display and weapon controls also remain available while repair drone
artwork prepares; drone launch waits for its actual textures and shows a warming
message. Cooperative preparation uses bounded background tasks where available
to avoid repeated timer clamping, with the existing timer fallback retained.

## Use the lab

1. Select the game hull in the pinned ship selector. In **Fleet**, choose
   10, 25, 50, 100 or 200 ships, mixed hulls, maximum displayed hull size and lights.
2. In **Load**, choose idle, shield hits, hull impacts, weapons, combined battle effects or
   destruction/debris. Choose staggered impacts or synchronized volleys and the
   number of events per ship per simulation second. Weapon artwork comes from
   the regular **Weapons → Fire** selection.
3. **Version** holds the candidate's name, shield duration/intensity and weapon
   size. Describe further visual changes to Codex; it can add a separately loaded
   candidate implementation while retaining the released effects as the baseline.
4. **Measure** records the selected version, compares baseline/candidate, or
   runs both versions at all five counts. Artwork preparation and warmup precede
   the recorded interval. Every completed result is saved and can be exported.
5. **Check in game** runs the same scripted visual load and chosen profile through
   the real game entry point in an isolated headless browser. It uses the existing
   civilian fleet owner, ordinary simulation, shared effects and normal rendering.
   It never reads or overwrites the player's browser saves. This is a scripted
   effect load, not an autonomous combat AI or economic throughput benchmark.
6. **Runs** and **Details** show history, matched comparisons, frame percentiles,
   worst frames, CPU submission time and optional asynchronous shield GPU timing.
   The result export contains raw RAF intervals, hardware/browser information,
   actual fleet coverage, settings and source hashes.

The renderer fixture calls `nativeShipEffects.paintShip`, `visualImpact`,
`nativeCombatShots.create/contact/paint`, `nativeShipDamage` and the live
`vexedShieldGPU` adapter. `effect-lab-fixture.js` supplies only deterministic event
scheduling; effect algorithms are not copied into the lab. Live shield capacity
is 256 slots, allowing a fully visible 200-ship test with headroom. Capacity
overflow and clipped shield surfaces invalidate renderer measurements.
Scripted shield hits rotate their incoming directions in each hull's local
space. Exports include eight impact-sector counts, so a 100-ship pass can be
checked for coverage around the entire shield rather than one repeated point.

## Interpret results

120 FPS gives **8.33 ms per frame**. Average FPS alone hides stalls. Inspect
1% low FPS, P95/P99, worst frames and over-budget counts. The target indicator
requires at least 30 samples, average FPS at least 117.6, P99 within 15% of the
frame budget and 1% low FPS at least 108. A fast average with large stalls fails.

RAF cadence measures delivered callbacks, not physical display presentation.
Display refresh, browser limits, headless mode, viewport, hull size, DPR and GPU
all affect the outcome. A 60 Hz capped browser cannot establish 120 FPS. CPU
submission time excludes asynchronous GPU/compositor work. The optional GPU
query covers the shared effects overlay and never blocks on `gl.finish` or readback.
The actual-game observer uses the same bounded query owner and reports
**Effects GPU** separately from CPU work and delivered frame intervals. It excludes
Canvas artwork, compositing and other applications, so a fast effects pass alone
does not prove the game meets the frame target.

Only identical fixture, viewport, environment and code hashes qualify for an A/B
comparison. Hidden tabs, resizing, context loss, cancellation and resource/sample
overflow invalidate a recording. The last 20 completed renderer runs are kept;
frame/GPU/event resources are bounded. A renderer pass does not imply a full-game
pass. Game results report their own context and whether the profile is released
or a preview. Check foreground gameplay on the target hardware before claiming
sustained in-game 120 FPS.

**Open game with FPS overlay** opens the regular game with
`?effectLabCheck=1`. Enter flight, use **Record 10 seconds**, then **Export** for
a manual foreground check. The observer does not spawn ships or change clocks.

## “Put it in game”

After a candidate measurement, choose **Version → Stage candidate for game**.
This records a specific profile, run ID, fixture and source hashes. It does not
change the released profile. “Put it in game” means promoting this exact staged
version, then checking it in actual gameplay:

```powershell
python tools/effect_lab.py status
python tools/effect_lab.py promote
python tools/effect_lab.py promote --apply
python tools/validate_effect_game.py --seconds 10
```

The first promotion command reviews the concrete selection. `--apply` is used
only when the user requests promotion. It atomically updates the shared
`effect-release.json`, saves `previous-release.json` and marks game verification
pending. A changed source or changed candidate requires remeasurement and
restaging. The post-promotion game check uses the staged fixture by default.
Use `--headed` for a foreground measurement. Passing renderer tests cannot clear
game verification by themselves. Report below-target or invalid game results
without describing the version as performance approved.

Match the browser as well as the viewport when verifying the target device.
`--browser-path "C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe"`
selects Brave for the isolated game check; `VEXED_BROWSER_EXECUTABLE` also applies
to game checks started by a lab server launched with that environment variable.
Reports retain `browserLaunch`, the browser user agent and the actual WebGL GPU.
Different browsers can select different GPUs on the same laptop. A pass on one
browser/GPU does not approve another browser/GPU combination. The executable
option still uses a fresh temporary browser profile and never the player's save.

Local state is `%LOCALAPPDATA%/VexedMirror/effect-lab/`: `session.json`,
`runs.json`, `selected.json`, `previous-release.json`, `game-validation.json`.
Generated evidence is under `test-results/effect-lab/`; do not commit it.
Normal game settings remain the baseline until an explicit promotion.

## Cinematic shield candidate

The showcase opens with **Cinematic beams, plasma and torpedoes - candidate** selected in
**Weapons > Settings > Shield renderer**. The same selector offers the isolated
**Hybrid bubble shields** and **Hybrid cinematic combat** candidates, released GPU design and legacy Canvas comparison. The header includes the profile
name and marks previews as candidates. Only the showcase defaults to this
preview; `effect-release.json` still controls ordinary gameplay.

**Stress > Version > Shield design** selects **Cinematic weapons + released shields**, **Hybrid cinematic combat**, **Hybrid bubble shields** or the
released design. Use **Fleet > Preview / single run > Candidate settings** to
preview or measure the new design. Compare A/B always uses the released profile
for its baseline. Leaving Stress carries the selected candidate into ordinary
weapon tests.

`effect-candidates/cinematic-shields.js` registers `cinematic-shields-v1`.
`effect-candidates.json` records its full profile and the showcase default.
The hybrid material restores a visible rounded bubble and OG-style scene
refraction, with a translucent body, brighter grazing edge and fine flowing
interference on a curved surface. The `cinematic-impact-v4` appearance adds a
white-hot contact, a broader blue flare and a spreading pressure patch. Uneven
crests follow the bubble's curved surface, with a slower, dimmer trailing wave;
both the original lens and contact waves distort the actual scene. Short, faint
filaments stay on the surface. Each hit emits 7–10 short sparks whose continuous
drag and white-to-blue cooling remain readable on a 44-pixel fleet hull. Seeded
variation changes each contact without moving its authoritative impact point.
Collapse uses a separate fractured flash. Presentation remains frozen on the
simulation clock when paused.

Three contacts per ship can overlap. Each contact holds at most 24 fine segment
instances, with a fixed capacity of 256 ships. Surface instances share the base
renderer; sparks and surface detail share one compact instanced draw and a
bounded pose texture. The new sparks fit inside the existing 24-segment budget;
small hulls retain a minimum visible trail width without adding particle counts.
Expired electrical geometry keeps its event identity, so repeated submissions
of the same longer-lived flash cannot restart the discharge. Rotation and zoom
transform the retained local contact and its paths together.

Only the newest contact paints the full membrane and lens, preventing repeated
hits from stacking opaque bubbles. Each active frame captures the scene once
for the entire fleet, at up to 2048 x 1024 pixels (8 MiB), with no CPU pixel
readback. Idle frames skip this copy. A fixed 128-pixel mipmapped noise texture
supplies surface interference. Shader sampling displaces the actual scene; it
does not approximate refraction with an extra glow. GPU timing includes the
capture and shield pass. Texture limits and capture counts appear in resources.
`browser-cinematic-shields.py --visual-only` checks whole-rim visibility late in
the hit, actual source displacement against a zero-displacement control, single
scene capture with overlapping contacts, idle expiry and capture-size bounds.
It also isolates the spark pass from the bubble and checks for visible spark
and contact-flare pixels at the actual 44-pixel fleet size.
Use `--lights-off --game` to check shields alone before adding ship lighting and
combined combat. Never infer a full-game pass from the renderer's FPS.

Run `python tests/browser-cinematic-shields.py --game` for pixel checks covering
pause, duplicate submissions, seeded replay, collapse and bounded overlapping
contacts, all five populations in matched native A/B scenes, 200-ship rapid
volleys, and isolated actual-game checks at 100 and 200 ships. Evidence is saved
under `test-results/cinematic-shields/`. Results remain specific to the recorded
viewport, GPU, browser and source hashes; the candidate is not automatically
promoted or declared approved by its showcase default.

Use `--visual-only` for the GPU pixel/lifecycle checks, or `--targets --game`
to repeat the 100/200-ship A/B checks and the full-game comparisons after a
change. `VEXED_EFFECT_TEST_ROOT` can point to an immutable copy of the game and
tools when other work is changing the shared checkout. Reports include that
source root and all measured source hashes; do not stage archived measurements
against a different live checkout.

## Add a visual candidate

The `cinematic-weapons-v1` candidate extends the released cinematic shield
implementation with weapon presentation only. Its profile loads
`cinematic-shields.js`, `cinematic-primitives.js` and `cinematic-weapons.js`.
It inherits the approved bubble, contact sparks, distortion and ripple material;
it does not replace hull burst generation, motion, firing, recharge or damage.
Beam energy flows inside a stable core and irregular sheath, with emitter and
contact flares. Plasma bolts have a concentrated nose and cooling tapered wake.
Torpedoes have a compact hot core and a circulating, turbulent energy envelope.
Colours still come from the actual weapon definitions.

Weapons share one instanced GPU draw per frame, a fixed 4,096-primitive buffer
and one 64-pixel mipmapped noise texture. No weapon captures the scene or uses
a per-frame blur filter. The existing shared GPU illumination path can still
paint ship lighting. Capacity rejection invalidates performance approval.
Canvas-only preview/export paths retain a bounded 24-entry glow cache.
`tests/browser-cinematic-weapons.py` checks stationary material flow, seeded
variation, paused repeatability, fleet-size visibility, transformed positions,
empty-frame clearing and the overflow counter. The ordinary showcase shield
test checks actual firing/impact alignment, rotation, zoom and profile parity.

Use `python tests/browser-weapon-performance.py --matrix --game --baseline`
to measure mixed beams, torpedoes and plasma bolts together with shields at all
five populations. **Weapons + shields (intact hulls)** uses `shielded-battle`:
every weapon arrival exercises the shared shield contact while hulls remain
intact. The existing **Weapons + shields + hull impacts** (`battle`) additionally
forces hull bursts every fourth shot, regardless of shield charge, and remains
a separate heavier effect load. The weapons fixture fires
two events per ship per simulation second and keeps all requested hulls visible.
Lights-off and lights-on results are separate, as are the native renderer and
actual headed Brave game. `--seconds 30` extends each actual-game recording;
`VEXED_EFFECT_TEST_ROOT` selects a frozen source build. Reports include raw
intervals, actual GPU/browser, source hashes, effect counts and capacity counters.
Only actual-game results can establish the game target for that recorded load.

Put optional JavaScript in
`html-games/flashtrek-broken-mirror/effect-candidates/<name>.js`. Register it with
`nativeEffectProfiles.register('<id>', implementation)`. Supported hooks are
`createShield(baseFactory, options)` and `drawWeapon(basePainter, ctx, shot)`.
Delegating to the passed production implementation is supported. Preserve the
existing renderer lifecycle, visibility, resource and statistics APIs; keep
gameplay mutation in its established simulation owner.

`cinematic-combat-v1` extends the shield candidate with
`effect-candidates/cinematic-primitives.js` and `cinematic-combat.js`. Its weapon
and hull hooks submit bounded light primitives to the existing WebGL overlay.
The frame begins before world painting and flushes after shots, hull particles
and environmental effects. This keeps current-frame contacts aligned and keeps
weapons and hull impacts visible even when there is no active shield flash.
Legacy mode and unrelated preview canvases use the same candidate's Canvas
painters. Shape generation and simulation-clock particle updates remain outside
painting. Each emitted hull particle retains its implementation ID until expiry,
including when the user changes preview profiles.

The registry also supports `extend(id, parent, hooks)` (or a function receiving
the parent implementation), `queueShipLight`, `emitHullBurst`,
`updateHullParticle`, `drawHullParticle`, and optional presentation metrics.
Only the released profile's module list loads during ordinary gameplay.
`cinematic-battle-v2` extends `cinematic-weapons-v1` with `battle-radiance.js`
and `cinematic-battle.js`. It adds camera-aligned torpedo/disruptor flares,
weapon-coloured light on nearby artwork alpha masks, focused beam shield
contacts, spreading torpedo waves, short disruptor pulses, and cooling hull
spark streaks. Visual intensity reads absorbed damage and shield capacity;
`ship-damage.js` continues to own shield depletion and hull overflow.
`queueShipSurface` records visible artwork for illumination, `queueWeapon`
accepts transformed screen packets before Canvas state changes, and
`queueHullParticle` batches particles owned by their birth profile. Each hull
uses its three strongest nearby light sources; light sources, surfaces, masks
and GPU buffers have explicit limits and rejection counters. Hull spark births
are bounded, animation follows simulation time, and painting never integrates
particles. The released shield profile keeps its existing appearance.

The **Moving weapons + shields + hull hits** scenario (`weapons-hits`) adds
scripted pose motion and actual weapon arrivals. Three quarters of targets have
charged shields; the remaining quarter have shields lowered for hull hits.
The shared visual-impact owner preserves health and never requests destruction,
stage breakup, ship explosions or wreckage. Previous `battle` / `full-battle`
IDs are non-destructive aliases; the old `explosions` test is deferred and rejected.
Normal cadence caps firing demand at the configured rate and respects shared
weapon recharge. Realistic stress doubles demand but retains that same recharge
constraint. Explicit synthetic overload uses the fixed rate without recharge.
All three levels test only weapons, shields and hits, not autonomous combat AI.
Reports retain the level, shield/hull hit counts and zero explosion count. Run
`tests/browser-battle-performance.py` for foreground Brave measurements at
10/25/50/100/200 ships, with lighting on by default; raw frames and source hashes
are saved. `tests/browser-cinematic-battle.py` checks mask boundaries, flare
alignment, pause, spark integration and damage/type-dependent shield pixels.
Hit lens flares use `queueImpact` in the same bounded GPU batch as the weapons.
The shield adapter supplies its actual transformed bubble contact. The shared
ship visual owner retains hull-local contacts through movement, rotation and
zoom, and retires them after 260 ms. Flares use a hot core, camera-aligned
streaks and a faint optical ghost on stronger hits. Their size, colour and decay
depend on weapon type and absorbed or hull damage; draw calls cannot apply damage.
The combined candidate uses up to 32,768 instanced light primitives and 256
128-pixel hull masks for directional illumination. Masks use the actual current
damage artwork and are uploaded once per art state, not per ship or frame.
Source geometry and light direction/colour remain authoritative. The CPU
fallback shares animation surfaces across light directions and keeps its shades
in one bounded atlas. Both paths expose resource counts and expiry behaviour.

**Hull impacts** is a separate Load scenario. It runs the shared visual-impact
owner against hulls with lowered shields, preserving the benchmark's health
and population. Combined weapons/hits sends native shot arrivals to the
appropriate surface instead of adding unrelated hull hits through charged
shields. All fixture reports identify their
scripted visual load; they do not simulate autonomous battle decisions. **Mixed
weapons** rotates beams, torpedoes and bolts through the fleet while keeping the
same specified event rate. **Damage stages** distributes intact, 70%, 40% and
10% hull health across the fleet and renders the shared owner's corresponding
damage artwork. Both settings are recorded in renderer and game fixtures.

The lab and isolated game check now explicitly apply their lighting checkbox.
Earlier game reports could request lighting while the game's temporary global
lighting preference disabled it. Those measurements cannot verify the lighting
load; use current reports with `actual.lightingEnabled` and environment fields.
The shared GPU timer covers the entire overlay, including candidate weapons,
hull particles and directional illumination, rather than shields alone.

`tests/browser-cinematic-combat.py --game` covers the combined native and actual
game paths. `browser-gpu-ship-lighting.py` compares GPU illumination against the
original rendering across artwork, damage stages and rotations;
`browser-render-paths.py --visual-only` covers the Canvas fallback and warp.
`tools/validate_effect_game.py --cpu-profile <path>` records a CDP CPU diagnostic;
instrumented and visual-isolation runs are labelled diagnostic and cannot be
used as performance approvals.

Include the relative module path in the candidate profile's `modules` array and
its registration ID in `implementation`. Save that profile through the session
endpoint; reopen Stress to load it. `effect-candidates.json` is the candidate
catalog. Only modules listed in the released profile load in normal gameplay;
baseline rendering continues to select `shared-v1` during a candidate preview.
Both baseline and candidate source hashes include the candidate modules so that
A/B checks cannot silently compare different implementations.

If a requested change affects simulation, contacts, weapon specifications or
other gameplay owners, modify the shared owner with the appropriate regression
coverage and explicitly establish a new baseline. Do not create a faster
showcase-only substitute or imply that a renderer test validates changed rules.

## Verification

### Fleet rendering

`ship-lamps-gpu.js` now batches healthy ships' painted running lamps on the
existing shield/weapon WebGL context. The ordinary Canvas cache retains an
immutable hull raster, so pulse changes no longer rebuild the complete ship.
Templates share lamp geometry and pulse evaluation across matching hulls in a
frame. Masks upload once per artwork/size; the shader varies their intensity.
The original artwork profiles still supply positions and simulation clocks.
Damage, repairs, warp, unsupported Canvas operations and capacity exhaustion
retain the existing Canvas path. Disabling lighting still disables the lamps.
Older builds without the shield adapter use a lamp-only WebGL overlay and keep
their current weapon/shield renderer.

`nativeShipLampGPU.snapshot(space)` reports instances, uploads and fallbacks.
Storage is bounded to 512 128-square RGBA layers (32 MiB), 32,768 instances,
and 3 MiB each for CPU/GPU instance data. `nativeShipLampGPUEnabled=false`
selects the Canvas comparison without changing a saved lighting setting.
`browser-ship-lamps.py` checks original art, blink variation, rotated hulls,
severe-damage fallback, both Constitution variants and the standalone overlay.
The older hull batch below yields while this lamp batch is active.

October 25 measurements on the RTX 5070 Laptop GPU at 1280x720, DPR 1,
Brave headless, 165 Hz delivery, cinematic battle preview, matching mixed
weapons/ships fixture: 100 illuminated Stress ships improved from 102.3 FPS
(p99 42.4 ms) to 165.0 FPS (p99 6.4 ms, 1%-low 146.2 FPS). The ten-second
candidate run passed the existing target gate, uploaded 92 mask layers total,
rebuilt no hull sprites and had no lamp fallbacks. At 200 illuminated ships,
146.1 average FPS and p99 12.2 ms did **not** pass the gate. Raw measurements:
`test-results/ship-lights/baseline-vsync.json` and `gpu-lamps-100-200.json`.

The separate actual-game 100-ship fixture improved from 20.8 to 59.6 FPS
(`game-before-after.json`); it did **not** meet 120 FPS. A lights-off CPU
diagnostic also remained below target, with scene texture uploads and other
rendering costs. That instrumented run is diagnostic evidence only. Stress
results do not establish full-game performance. No weapon/shield candidate was
promoted or its implementation replaced by this change.

A final repeat (`gpu-lamps-final.json`) ran after Windows changed to 60 Hz:
both lights-off and lights-on delivered 60.0 FPS. The lit fixture still had
zero sprite rebuilds/fallbacks and only the original 92 mask uploads. This
repeat cannot certify 120 FPS; current refresh evidence is saved in
`test-results/ship-lights/display-final.json`. Display settings were not changed
by the lamp fix or its verification.

The active game's `hull-batch.js` queues healthy display-sized hulls into one
WebGL batch and composites them into the ordinary scene before weapons and
shield scene capture. Layer order, target markers, physical glints, warp rings
and special renderers retain their existing order. Large, damaged, repaired and
warping hulls use the shared Canvas fallback. No simulation time is skipped.
Automatic selection retains the faster immutable Canvas cache when lighting is
off and uses the GPU batch for illuminated fleets. `--batch on/off` forces each
path for comparisons; the benchmark's default `--batch auto` matches gameplay.

Painted lamp masks and generic light primitives come from the existing profile
owners. Their original pulse clocks are sampled into reusable GPU sprite layers;
brightness and bloom no longer require rebuilding a Canvas sprite per ship.
The GPU cache has 64 hull layers and 256 lamp/primitive masks, with 48 MiB of
bounded texture storage, about 0.8 MiB of CPU/GPU instance buffers and a
viewport-sized drawing buffer. Additional shared light textures report their
own bounded memory through `nativeShipEffects.metrics().sharedLightTextures`.
`nativeHullBatch.snapshot()` reports uploads, fallbacks, evictions, errors and
draw/composite counts. Weapon illumination reuses surface/source records and
three strongest-light slots. Offscreen hulls and light sources are rejected
before mask preparation; spark culling includes the full trail.

The radar background is cached until its backing size changes. Moving contacts
and target selection remain current. The resource HUD already updates on value
changes. The fast hull path supplies its transform directly to weapon lighting,
avoiding per-hull Canvas save/translate/rotate/style commands.

`browser-hull-batch.py` compares lit/unlit artwork at multiple times, sizes and
rotations, pause, overlapping hull order, mixed settings for the same asset,
target markers, bounded atlas churn and combined weapon lighting/refraction.

For a matching Canvas comparison, use `browser-battle-performance.py --batch off`
with the same root, population, lighting, viewport and display refresh rate.
On Windows, `browser-refresh-performance.py --root <frozen-root> --label <name>`
measures 50/100 ships with lights off/on at a supported 120 Hz mode. It tests
the mode first, preserves resolution/colour depth, avoids registry writes and
restores the original refresh rate in `finally`. Display evidence is saved
alongside the raw game reports. Average FPS above 120 alone cannot clear the
existing percentile/1%-low gate. The effects GPU timer still excludes the hull
batch, Canvas, compositor and other applications.

```powershell
node --test tests/effect-lab.test.cjs tests/unified-equipment.test.cjs
python -m unittest discover -s tests -p test_effect_lab.py
python -m unittest discover -s tests -p test_local_site.py
python tests/browser-effect-lab.py
python tests/browser-unified-equipment.py
python tests/browser-showcase-workspace.py
```

The lab browser regression uses temporary storage, real RAF, native call counters,
every population, A/B matching, interrupted recordings, staging and an isolated
actual-game check. Its timing numbers describe that run only.
