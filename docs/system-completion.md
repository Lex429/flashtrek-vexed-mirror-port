# Planetary roster and Sol artwork standard

The user-approved roster in `tools/system-completion.json` specifies **215 major
planets across 40 existing systems**, replacing the previous one-planet surveys
with explicit named companions. All 40 rosters are implemented, adding 175 major
planets and the exposed Dyson primary. The full game has 491 local bodies,
490 visible. It does not add galaxy destinations or move the galaxy chart.

The [illustrated catalogue](../html-games/broken-mirror-port/system-completion-preview.html)
shows the current generated-image and implemented-system counts. Its completed
art is displayed beside the actual Sol Earth, Mars and Saturn reference sprites.
Pending artwork is marked as pending; no generic planet sprite substitutes for
an unfinished image in a released system.

## Artwork

Every approved planet has a distinct `*-sol-v2.webp` asset produced using the
built-in imagegen tool with an actual Sol reference image. Earth is the benchmark
for ocean worlds, Mars for rocky terrain, Venus for opaque atmospheres, the Moon
for icy or airless surfaces, and the appropriate Sol giants for gas/ice giants.
These references establish rendering quality, planetary scale and illumination;
the user's catalogue supplies each world's geography and palette.

The original generated PNG stays under Codex's generated-images directory. The
installer converts it to WebP without resizing, recoloring or compositing. The
exact prompt, source hash, installed hash and reference-artwork hash
are retained next to each sprite. Old art remains available under its original
filename; only the corresponding released body's asset reference changes.
All 215 final sprites have square canvases with genuine alpha transparency.
Gallows was regenerated during review to remove a background halo and retain
square framing, preventing distortion in the existing game renderer.

Run `python tools/completion-art-jobs.py` to list unfinished independent built-in
generation jobs. This helper makes no image API calls. `install-system-art.py`
packages a completed image using its exact `.actual-prompt.txt` file.

## Data ownership and saves

`tools/system-completion.json` owns the approved planet names, descriptions,
types, stellar groups, order and explicit release list. `tools/system_completion.py`
applies that data inside the existing catalog generator. A released system must
have every planet's final asset and valid provenance before the build succeeds.

Existing body IDs, local coordinates, radii, moons, parent IDs, economic world
keys, facilities and services remain intact. New bodies use reserved IDs 300–399;
they have no automatic settlement or market. Existing historical descriptions
remain available alongside the separate new appearance specifications. Original
mining fields and the chart-position owner are untouched.

Alpha Centauri explicitly divides five planets around A and three around B.
Andoria remains a moon of Andor. The chosen ten-planet Rigel interpretation
retains the existing Rigel destination and identifies it as Rigel X. The
Dyson binary leaves The Sphere and its enclosed companion at their saved poses,
adding an exposed primary for the four-planet group. The binary arrangement is
authored game geography, not a claim about the TNG Relics system.

The source proposal targets **39 moons**, retaining eleven existing moons and
adding 28. The linked external-workspace catalogue was unavailable here; the
28 additional names, parent planets and appearances must be supplied before
those moons can be implemented. No substitute moon names have been invented.

Rebuild with `python tools/build-system-catalog.py` and then
`python tools/build-completion-preview.py`. Run the read-only artwork validator,
`system-completion.test.cjs` and `browser-system-completion.py`. The baseline
fixture preserves every previously implemented body and its saved pose.

Final verification passed artwork/provenance checks for all 306 generated assets,
including the 215 new sprites and their Sol-reference hashes; all 40 systems'
actual map selection, cruise and normal-mode save/reload checks; and every atlas
page across all 90 physical systems. World data remains byte-identical to the
pre-completion baseline, and rebuilding the catalogue and preview is idempotent.
The full Node checks report 390 passes and the existing player-combat contact
metadata assertion failure across 391 tests; no new failure was introduced.
The shipyard browser regression also passed physical docking, refit charging,
approach/docked reload and undocking at all four additional yards. The unified
equipment browser regression passed purchases, engine fitting, Danube equipment
dragging, saved inventory positions and repair-drone operation.
