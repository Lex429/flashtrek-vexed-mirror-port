# Unified ship verification

Baseline: `286f87e` (the previously installed sizing/lighting update).
The package was already present and was preserved rather than installed twice.

Local verification used Microsoft Edge 155.0.4283.62 on Windows. The baseline
passed 253 Node tests, eight standalone-site tests and the 16 existing browser
suites. The completed change passed **264 Node tests**, with zero failures,
skips or cancellations, and the eight standalone-site tests.

The 17 browser suites passed: unified-equipment, smoke, ship-contract,
ship-presentation, asteroid-physics, ship-traffic, impact-controls, npc-lives,
ship-repairs, earth-jam, galaxy-controls, regional-mining, deuranium-mining,
ore-performance, civilian-access, render-paths (`--visual-only`), and stability.
The fleet presentation suite checks 396 class/frame/zoom comparisons.

The asteroid browser suite encountered one image-decoding failure and passed
on rerun. The deuranium fixture required a Python quoting correction after
switching its saved mining equipment fixture; its corrected complete run passed.
Original failure logs and successful rechecks remain in ignored test-results.

The first GitHub run exposed inherited startup collision momentum in the beam
attachment fixture. Its controlled actors now explicitly start at rest through
the shared motion owner. The complete contract suite passed locally in both Edge
and bundled Chromium after this fixture correction; gameplay physics is unchanged.

The new Inventory browser suite purchases Olympic, Constellation Tug and Runabout
hulls through ordinary shipyard buttons. It buys and fits six actual Dots, launches
all six through the shared repair owner, verifies cargo rejection before charging,
fits an ability with a saved recharge deadline, reloads the normal save slot,
checks an upgrade against the fitted engine, and verifies the real Save failed UI.
Its screenshots are generated from the game, not mockups.

## Timing diagnostics

Both extended runs used the identical saved initial 172-ship population, Edge
155.0.4283.62 and 1280 x 850 viewport. Each scenario has three 20-second windows.
Initial-save SHA-256:
`03b88a67687fd187e057a9ef6a6dcdef9a95b1f55977d55edc097d3056f09d74`.

| Scenario | Mean simulation ms before / after | Mean render ms before / after | Frame-interval p95 ms before / after | Largest after interval ms |
| --- | ---: | ---: | ---: | ---: |
| flight | 1.40 / 1.11 | 3.68 / 2.80 | 48.1 / 24.1 | 141.4 |
| crowdedCombat | 34.60 / 9.50 | 18.41 / 4.89 | 230.0 / 92.4 | 310.1 |
| miningDebris | 6.65 / 4.49 | 6.00 / 3.62 | 78.9 / 62.4 | 144.1 |
| warp | 0.97 / 0.81 | 2.79 / 2.09 | 39.5 / 22.6 | 148.4 |
| devMap | 0.69 / 0.72 | 0.71 / 0.65 | 8.3 / 8.2 | 16.0 |

These are diagnostics on this device. The short six-second population sample
differed from the longer windows; do not treat the table as a universal FPS claim.
Crowded combat still produced intervals above 300 ms, and flight, mining/debris
and warp retained occasional spikes above 100 ms. Artwork preparation, rendering
and heavy tactical work remain measurable costs. Distant tactical work stayed
outside the active boundary; observed scheduler backlog remained zero.

Additional finishing checks cover only commerce UI and legacy overflow recovery;
a fresh matched short before/after sample is retained alongside the extended
reports. Generated timing samples, logs and screenshots stay out of Git.

## Publication checks

The final commit must be verified on GitHub main and its Actions result checked
separately from these local results. The workflow includes the new equipment
browser suite and uploads its actual Inventory screenshots in the browser
regression artifact. See the final task report for the published commit and CI result.

## Deliberate limits

The existing utility catalog gains independent saved fitting, not new activation
effects. The mining laser is real fitted equipment. Medical supply policy uses
existing deuranium processing; a different repair material needs a genuine recipe.
Legacy overload is preserved and shown, rather than silently discarding cargo.
Full hardware, migration and extension details are in [unified ships](unified-ships.md).

The finishing six-second sample used the same fixture, device, browser and
viewport, with 172 ships in both runs:

| Mode | Simulation mean ms before / after | Render mean ms before / after | Frame p95 ms before / after |
| --- | ---: | ---: | ---: |
| flight | 1.58 / 1.95 | 4.71 / 5.85 | 77.5 / 84.8 |
| devMap | 0.65 / 0.71 | 0.77 / 0.74 | 8.2 / 8.2 |
