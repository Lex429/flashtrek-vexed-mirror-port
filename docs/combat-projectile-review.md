# Projectile flight and combat cost review

Implemented against the working tree based on `ee12e544`, November 2026.
The active entry remains `html-games/broken-mirror-port/index.html`.

## Flight corrections

The old torpedo/disruptor motor speeds were 225/340 units per second; the
standard player's engine reaches 427.5. Although shots already inherited launch
velocity, those motor speeds could not cancel fast sideways drift to reach a
stationary target across the ship's course. Prediction also started at the hull
centre before the shot was relocated to its actual weapon mount. Reverse flight
could fail the range check because it tested the translated lead point's distance.

`weapon-rules` now owns faster motor profiles: disruptor 1,800; gravimetric
900; photon/Magnetorp 1,350; quantum 1,650; plasma 1,100; transphasic/polaron
1,500 units/s. Torpedoes retain distinct guidance, with stronger gravimetric
turning. Shared launch prediction uses the actual selected mount and the actual
world velocity, including sideways/reverse drift. Turning or accelerating the
launcher after firing cannot redirect a ballistic bolt. Guidance turns the
torpedo's motor component relative to its retained launch velocity.

Forward cannons now have a 45-degree half-angle and torpedo tubes 60 degrees.
The catalog's turret models 11/12 and beams retain full coverage. Firing feedback
tests current separation for range and uses lead for aiming. All controllers use
these same rules. Existing flying saved shots retain their saved motor/guidance
values; damage, recharge, weapon ownership and physical swept collision remain
in their original shared owners. Fast shots still hit an intervening surface.

## Work removed

Firing feedback and trigger eligibility previously built collision wrappers and
queried and assembled blockers, then passed them to eligibility code that deliberately
did not reject a blocked shot. They now omit that discarded work. The actual
flying shot/resolving beam still queries the shared physical scene and hits its
first surface. Projectile integration also uses the recorded launch identity
instead of repeatedly resolving/describing a moving launcher; beam emitters
continue following their live source.

The isolated browser probe fits the same disruptor/photon pair in both frozen
sources, holds the complete 1,210 population/save and compares **old weapon
speeds/arcs in both**. Its alternating before/after/after/before runs measured:

| Per 200 firing-feedback checks | Before | After |
| --- | ---: | ---: |
| Median batch time, first run | 10.95 ms | 2.10 ms |
| Median batch time, second run | 10.55 ms | 1.95 ms |
| Average of those medians | 10.75 ms | 2.025 ms |
| Collision wrappers per 3,201 measured calls | 3,201 | 0 |
| Discarded swept searches per 3,201 calls | 6,402 | 0 |

That is **81.2% lower CPU time for this specific firing-feedback workload**.
It does not measure FPS, simulation throughput, or a whole combat frame.
Raw samples, identical resolved specs and the fixture hash are retained in
`test-results/combat-refine/query-performance.json`.

## Full-game measurements and limits

Sequential clean windows used Edge 157 on Windows, Intel Arc/ANGLE D3D11,
1366x768 at DPR 1, the same saved 1,210 population, 8-second windows and 3 seconds
of active warmup. No test workers from this task ran alongside these windows.
The crowd fixture provokes twelve existing NPCs with their ordinary fitted
statistics; the stress player's health is raised. These are delivered browser
callback rates, not physical monitor or Chromebook qualification.

| Source/report label | Flight FPS | Combat FPS | Warp FPS |
| --- | --- | --- | --- |
| `combat-clean-before` | 119.12, 117.35 | 86.36, 89.81 | 72.48, 57.64 |
| `combat-clean-performance`, old projectile tuning | 100.58, 119.14 | 89.85, 40.60 | 52.69, 41.31 |
| `combat-clean-final`, new projectile tuning | unmeasured | 17.16 | 29.37 |
| `combat-final-repeat`, same final source | unmeasured | 90.99, 83.63 | unmeasured |

**These windows do not establish an overall FPS improvement.** The slow windows
remain in the evidence. The first final combat window had 1,504 repeated Canvas
lamp-glow builds, 88 frames over 50 ms and 0.352 seconds of end-window physics
debt. Repeated runs of the identical frozen source had zero lamp-glow builds,
zero frames over 50 ms and 0.039/0.024 seconds of debt. Artwork/GPU readiness
and changing render paths remain material variables; the evidence does not
isolate the cause of all run-to-run variation. No elapsed simulation time was
discarded to improve the numbers. All recorded windows had no JavaScript errors.

Heavy traces are stored separately as
`combat-refine-before-crowdedCombat` and
`combat-refine-performance-crowdedCombat`. They exposed native image drawing,
GPU uploads, spatial preparation and saving costs. Their instrumentation reduced
simulation progress; lower raw query/shot counts across those traces must not
be described as an optimization. Their timing is separate from clean FPS.

A damaged-lamp GPU experiment failed the existing ship appearance gate
(mean error 11.01, allowed below 8; significant pixels 11.75%, allowed below
10%) and was removed. The released lamp renderer and visual thresholds are
unchanged. A native snapshot-copy experiment reduced total save preparation
but required a single 18-21 ms main-thread copy, longer than the measured
10.5-12 ms incremental final validation. It was not retained. Verified immediate
transaction writes and the current coherent checkpoint capture remain unchanged.

Frozen code, manifests and traces are ignored under `test-results/combat-refine`
and `test-results/performance-review`. `source-performance` differs from
`source-before` only in combat query/source reuse and script version tags;
`source-final` additionally has the projectile fixes. Timing harnesses remain
the same. A real 4 GB Chromebook still needs its own matched measurements.

## Reproduction and regression checks

`tests/browser-combat-query-performance.py --before <frozen-before> --after
<frozen-performance-only> --fixture <same-save.json>` runs the CPU comparison
and rejects different weapon specs or populations. Full-game measurements use
`tests/browser-performance-review.py --source-root <snapshot> --fixture
<same-save.json> --width 1366 --height 768 --dpr 1 --seconds 8 --runs 2
--scenarios flight,crowdedCombat,warp --warm-only --active-warmup 3`.

`projectile-flight.test.cjs` covers sideways/reverse interception, a true offset
mount, immutable ballistic flight after steering, reverse range feedback,
model arcs/speeds, tiny intervening rocks and old saved projectile profiles.
`browser-projectile-flight.py` uses real Space/D keys through the active game
for twelve disruptor/photon/quantum flight scenarios plus an in-flight save and
Continue restore. Its synthetic host clock makes screenshots reproducible;
it is a functional test and cannot establish FPS. Screenshots are saved under
`test-results/projectile-flight`. CI includes this browser regression.

Validation passed 140 Node checks across projectile flight, flight feel, firing
lifecycle, collateral combat, awareness, checkpoint/save capture/codec,
equipment, civilian tactics, spatial searches and tactical cadence. Seven actual
browser suites passed: projectile flight, combat controls, unified equipment,
cinematic weapons, civilian tactics, flight feel and beam targeting. Browser
evidence includes real Inventory, NPC dodge/escape/job retention, normal Continue
and beam contact pixels. No JavaScript errors were reported by those suites.

The older civilian browser fixture now gives an ordinary crew a long torpedo
approach: a close 1,800-unit/s bolt can arrive before its existing reaction
delay. Its first 0.14-second no-reaction assertion remains, and the later check
must observe a dodge while the real shot is still alive. Teleport setup also
resets prior poses so it cannot invent a world-spanning swept collision. The
beam fixture excludes unrelated new corridor rocks while retaining explicitly
tested blockers, and uses legal generator/hull capacity for exact damage checks.
Physical interception, pixel, timing and exactly-once damage assertions remain.

## Unlocked firing follow-up

Space now explicitly chooses forward-fire mode when no combat target is locked.
It fires ready fitted torpedoes/disruptors along the nose through the same saved
projectile lifecycle. Holding Space retains normal recharge. A real lock retains
the existing assisted aim, leading, arcs and torpedo guidance. Beams require a
lock and do not spend charge during forward fire. Unguided torpedoes never
acquire a hidden target, including after save/Continue. Acquiring or clearing a
lock ends the previous hold and requires a fresh Space press.

The follow-up passed 144 Node checks and browser projectile-flight, combat-control,
beam-targeting and unified-equipment suites. The flight report now includes
twelve locked and six unlocked disruptor/photon/quantum scenarios, thirteen
recharge-paced manual shots during a two-second hold, lock-transition stops,
pause/inventory/focus-loss stops, beam-only refusal, physical hits with actual
retaliation, intentional misses while drifting, and both locked/unlocked
in-flight save/Continue. Unit checks cover every projectile model, all registered
shooter roles, blockers, expiration, event import and firing gates.

Evidence remains under `test-results/projectile-flight`; the synthetic clock
tests functionality and does not measure FPS. The earlier frozen performance
reports above predate this manual-fire follow-up; no new FPS gain is claimed.
