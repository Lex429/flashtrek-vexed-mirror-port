# Orion Syndicate

Orion is government 45, based at Orion (system 2). New games use this government
instead of Earth Empire ownership there. A versioned migration changes older
Earth-owned Orion once, preserving played standing, population, conquests by the
player or another government, cargo, paid jobs and equipment. Subsequent conquest
remains authoritative, including a later Earth reconquest.

| Hull | ID | Ordinary duty | Flight frame | Cargo | Hull / shields | Price |
| --- | --- | --- | --- | --- | --- | --- |
| Orion Dart Scout | 446 | Civilian mining and prospecting | 22 × 22 | 55 t | 80 / 65 | 6,500 |
| Orion Corsair Raider | 447 | Military patrol | 54 × 54 | 140 t | 240 / 250 | 28,500 |
| Orion Ravager Cruiser | 448 | Military patrol | 92 × 92 | 260 t | 420 / 460 | 69,000 |
| Orion Caravan Freighter | 449 | Civilian freight, with mining capability | 66 × 66 | 650 t | 220 / 180 | 22,000 |

These are aligned artwork-frame dimensions in gameplay units. The visible hull
occupies part of that frame. Inventory, shop and Dev previews use their own
preview scale, as the existing fleet does. Installed engines and permanent hull
thrusters retain the shared equipment/motion rules.

Orion stock is offered at its planetary shipyard and shop through the ordinary
purchase boundary, including standing, cost, safe fitting and durable saves.
Forward and aft weapon mounts are checked against the intact hull's opaque
pixels; the Dart's forward mount sits on its port prong, clear of the center gap.
Patrol roles use shared military pursuit, actual fitted weapons, impact damage
and territorial defence. Civilian citizens retain civilian survival behavior.
Attacking either kind of Orion citizen inside Orion raises the same local alert
and reputation consequences. Allied NPC hits remain exempt from retaliation.

The same 1,200 crews and 100 medical ships are retained. Fresh populations use
the native roster at Orion. Older resident crews can finish their paid work,
report physically to a berth, and refit through the existing commissioning
ledger. Explicit recruitment allows residents commissioned under the former
government to transfer after work, so that their old commissions cannot leave
Orion permanently without native ships. No saved crew is added or teleported.

## Artwork and effects

The built-in `image_gen` tool generated four distinct original hull designs in
an emerald-and-copper fleet style. Each hull has four frames. Light edits intact;
heavy edits that exact light result; severe edits that exact heavy result.

All deployed RGBA sprites are under
`html-games/flashtrek-broken-mirror/showcase-assets/orion/`, named
`orion-{scout,raider,cruiser,freighter}-{intact,light,heavy,severe}.png`.
Original generated files are retained in that directory's `masters/` folder.
`generation.json` records the full prompt set, generator, source filenames,
parent hashes and output hashes. `art-audit.json` records deployed dimensions,
alpha-loss measurements and mask counts. Generated source margins may include
nearly transparent alpha=1 antialiasing dust; no opaque backdrop is accepted.

`tools/import-orion-art.py` imports selected built-in results and verifies the
immediate parent and unmodified master bytes. `tools/build-orion-art.py` only
resamples whole fixed canvases to 512 × 512 for deployment and measures metadata;
it does not create damage or replace generated image content. It produces the
shared painted lamp masks, breach sites and armor-fragment regions in
`orion-profiles.js`. It never crops frames to the surviving wreck bounds.

The ordinary Earth/fleet effects owner animates those painted lamps and breaches.
Severe lamps go dark. The shared debris builder derives physical fragments and
conserved wreck topology from the four aligned frames, available before artwork
loads. There is no Orion-specific animation loop, combat simulation or encounter
fleet. The damage showcase has a separate Orion fleet filter.

## Validation

Run `orion-faction.test.cjs` with faction/Federation, civilian population/access,
equipment, economy, navigation, pursuit and active-region regressions.
`browser-orion-faction.py` uses the production worker, real weapon collision
owner, actual normal-mode shipyard purchases, Inventory and Continue.
`browser-ship-presentation.py --ships 446,447,448,449` verifies four damage
frames, lighting and player/NPC presentation parity through the shared renderer.
Rebuild and check `tools/build-debris-geometry.py` after artwork/profile changes.
Headless timing does not establish physical 120 FPS display delivery.
