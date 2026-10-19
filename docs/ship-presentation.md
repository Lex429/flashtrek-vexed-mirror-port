# Shared fleet presentation

The proposed scale preserves the established active civilian fleet: Ferengi
shuttle 11.7 units high, sailing ship 22.5, Oberth 72, Tarellian 90, and the
company Tug II approximately 100.44. Other classes retain the recovered player
flight scale and its existing large-ship compression. Width follows the aligned
artwork profile, including intentional cropped artwork such as the sailing ship.
These are readable gameplay dimensions, not a claim of a uniform metres-to-pixels
conversion or exact canonical lengths for the game's fictional classes.

The Olympic proposal is 29.443359375 by 75 units, using its 201 by 512 aligned
frame. Its former civilian 75 by 75 square made the medical ship 2.547 times too
wide. A Runabout remains 7.1982421875 by 11.7; the Galaxy is approximately 89.1925
by 119.2339. The comparison images are for approval of this gameplay scale.

`ship-definitions.presentation` owns the fleet scale. `dimensions` applies it to
player, civilian and tug categories; registered explicit dimensions remain
supported for extension roles and fixtures. `flight-assets.flightDimensions`
delegates to the same data, and the live player renderer/firing callers now use
the shared entity dimensions. Ship, shield, contact, emitter, docking and repair
consumers continue to obtain geometry from that owner. Small-craft hull minimums
are capped inside their displayed frame; shield interception policy is unchanged.

Artwork and damage frames are preserved. No frame is resized to its surviving
opaque bounding box: all four states stay on their registered aligned canvas.
Player/NPC loaders and optional preparation now share the same class/stage asset.
The special tug/C'Thia wrappers include their existing destruction/fragment data.

Every powered ship uses the same 2.8 lamp gain, 2.5 bloom, 2x display raster and
the current scene star's directional tint. The Olympic's existing source anchors
now prepare painted lamp masks through the existing fleet effect renderer. Masks
select coloured source pixels; the dark core panel uses an anchored cyan stencil.
They preserve damage alignment and use the
shared bounded lamp cache. Disabled vessels retain their existing power-off rule.
Cache budgets, artwork, simulation time and economic consequences are preserved.

Biological ship masks are prepared when individual flight frames load, avoiding
an uninitialized mask when classes 50 and 55 first appear outside the showcase.

## Checks

`ship-presentation.test.cjs` loads the production 66-class metadata and checks
role-independent size, artwork aspect, retained reference sizes, small-craft hull
geometry, and Olympic mask/alignment metadata. Existing fixture-only tests still
exercise their intentionally supplied custom sizes and legacy configurations.

`browser-ship-presentation.py` loads every class and all four damage frames in
Chromium, comparing actual player/NPC pixels at fixed time and light direction.
Healthy ships additionally run at 0.7x and 1.7x scene zoom. It checks saved sizes,
constant aligned frame dimensions, Olympic lamp animation, pause and directional
illumination. It writes an ignored machine-readable report. With
`--comparison-ref 0cf056b`, it also uses exact baseline source to produce the
two review images; this optional image-export mode requires Pillow. CI validation
does not depend on historical commits or Pillow.

Run the full Node suite, the browser smoke/ship contract, the new presentation
suite, Earth recovery, impact/traffic/asteroid physics, persistent NPC/repair,
regional/deuranium mining, ore/access/map controls, render-path and cold-art checks.
Measure `browser-npc-performance.py` before/after with the same initial save,
population, browser and viewport. Treat those short timings as diagnostics, not
as a universal FPS claim. Generated images and logs belong in ignored test-results.

The browser fixtures explicitly paint the frozen NPC map before interacting with
its controls, begin the loading assertion before a production cycle, and settle
unrelated artwork before gating a cold-art request. The mining completion wait
allows slower software rendering while retaining its simulation-time assertions.

## Local validation

The full Node suite passed 253 tests (243 CJS and 10 JS). The presentation browser
check passed all 396 comparisons for 66 classes, including 594 changed Olympic
lamp pixels. Smoke, ship contract, impacts, asteroid physics, traffic, repairs,
Earth recovery, galaxy controls, regional/deuranium mining, ore rendering,
civilian access, render paths and cold-art stability passed locally in Chromium
153 with software rendering.
Persistent NPC lives also passed the actual UI, local/map observation, real
page reload, exactly-once delivery/mining, reservation cleanup and repair checks.

Adjacent six-second population diagnostics used the same saved 172 ships,
1280 by 850 viewport, browser and initial-save SHA-256
`3ac3486612e9e68bb226470153460b8da97df307ed9088c90cb2fab11e63b87c`.
Flight mean simulation/render costs changed from 3.85/4.06 ms to 3.42/6.15 ms;
map costs changed from 4.61/1.45 ms to 3.00/1.24 ms. Flight frame-interval p95
changed from 250 to 233.3 ms, map from 200 to 149.9 ms. Lighting adds rendering
cost and both versions still exhibit frame delivery spikes on this renderer.
These short diagnostics establish neither universal smoothness nor a general
performance improvement.
