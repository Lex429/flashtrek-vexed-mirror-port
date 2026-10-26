# Local solar systems

The active game now contains **91 destinations across 90 physical catalogs**, with
**491 local bodies** (490 visible; the enclosed Dyson companion stays hidden). All 52 original
destinations and the earlier Halka addition retain their IDs. Romulus and Remus
remain in one system with separate historical population and market keys.

The Mirror expansion adds 38 destinations, expands Ferenginar and Hof-Maso, and
adds four working yards alongside Mars. It restores visible Dev and Continue Dev
menu buttons and removes evidence badges from the gameplay map and clicked-world
panel. Research classifications remain available in the
[atlas](../html-games/broken-mirror-port/system-atlas.html) and source data.

The October 25 [blended layout](system-layout.md) interleaves the latest 38
destinations while keeping the original map and Halka fixed. It retains all
local bodies and seeded mining fields. Chart positions are owned by
[system-layout.json](../tools/system-layout.json).

The subsequent [planetary completion](system-completion.md) implements the
user's 215-planet roster across 40 of these existing systems. It adds 175 major
planets and an exposed Dyson companion star, with 215 individually generated
Sol-reference planet sprites. The existing eleven moons in those 40 systems
remain; the additional 28 moon specifications await the external catalogue.

The [orbital arrangement and boundary update](system-orbits.md) fits every
system ring to its catalog, repairs the misplaced Archer IV/Beta III survey
neighbors, and records measured orbital distances separately from scientific
estimates and qualified Trek ordering.

## Content and continuity

The [expansion manifest](../tools/mirror-expansion.json) is the editable source of
truth for the 38 additions, existing-system overlays, stellar profiles and yards.
[The expansion dossier](research/system-lore/mirror-expansion.md) lists every new
destination and explains the differences between screen references, licensed
reference choices and deliberately adapted Prime geography. Mentioning a species
does not establish a complete home-system census.

Vintaak has a ringed giant and individually selectable moons; its operating
Tholian salvage yard is a game continuation of the historical facility. Epsilon
Indi IV has an operating Imperial Shipyard and remains separate from the original
Epsilon destination (ID 8). Harlak remains an intact planet with a localized
bombardment scar. Mirror Risa has rings, Vega IX retains its colonial history,
and Gorlan's destroyed homeworld appears as lifeless remnants, separate from
Gorlan Station. Kepler-174 includes b, c and d, with NASA reference measurements
separate from the fictional Mirror culture and surface depiction.

Badlands, Fowla, Ventar, Wurna Minor, Elpha and Quam retain region identities where
individual planets are unestablished. Porathia is represented by its asteroid
belts. Ilvia and Dahkur enrich the existing Bajor description; Luna remains the
existing Earth moon. Prime locations from the users' lists are explicit Mirror
adaptations. This setting combines historical references across centuries; it
does not claim that all episode events happened together in one canonical era.

Ferenginar uses the licensed **Ventarus Idrilon / fourth planet** interpretation;
it does not combine that scheme with Alpha Krellek. Five neighboring bodies have
authored terrain and game spacing, and Clarus and Irtok are separate nearby trade
systems. Their operating exchange stations are original game facilities. Hof-Maso
gains Korth Forge, Khor’Vak, Maso A and Mok’Tar as original neighbors.
Those names are game fiction, not newly discovered screen canon.

The previous fixes remain: Andoria orbits the ringed Andor; Vulcan and its
reported companions share the 40 Eridani catalog; Qo'noS and Praxis stay together;
Bajor retains its named moons and Bajor VIII; Cardassia Prime and Cardassia II are
one body; Sol retains eight major planets and the five recognized dwarf planets.
The existing Rigel destination now represents Rigel X in the user-approved
ten-planet Beta Rigel interpretation. No Kelvin destruction or Prime
Romulan supernova replaces an existing destination.

Halka (53) remains peaceful and independently populated. Its 300 million people
are a game estimate; Tharn, Serevan and Lethan are original neighbors. Its two
finite mining fields retain **396 rocks, including 289 dilithium rocks**. All 53
pre-expansion fields retain their complete serialized rock hashes, identities,
ore types and depletion keys. The original 52-field historical fixture also stays
unchanged. New destinations seed no competing civilian fleet.

The 23 former Reach display names were replaced with the user-approved names on
October 25, 2026. These remain original game names, including V’Ralas, Draevan,
Serevan and Lethan. Body IDs, artwork, types, positions and saved navigation
references are retained; Tharn remains the existing Halkan moon.

## Operating yards

Click a nearby station, request docking, and let the ship physically reach its
berth. Services unlock at the clamps. The same outfitting controller, verified
save boundary, refit budget, equipment identities and resource settlement apply
at all five yards:

| Yard | Destination / body |
|---|---|
| Mars Orbital Shipyard | Sol / Mars |
| Ferenginar Exchange Yard | Ferenginar |
| Hof-Maso Fleet Yard | Hof-Maso |
| Vintaak Tholian Salvage Yard | Vintaak A |
| Imperial Shipyard | Epsilon Indi IV |

Station names and operator labels follow the location. All use the existing
modular station frame and its hull-clear berth profiles, plus the existing shared
compatible equipment catalog. This change does not introduce faction-exclusive
new hull models or a second shipbuilding economy. Oversized ships use the
existing outside collar. Approach, docked service and departure remain saved
phases. An unrelated or forged station ID does not authorize purchases.

## Stars and artwork

There are **306 generated transparent WebP assets** in
[assets/system-planets](../html-games/broken-mirror-port/assets/system-planets).
All earlier 91 images remain, including Haumea's regenerated complete-ring sprite;
215 `*-sol-v2` images implement the planetary catalogue. The ten images from
the earlier Mirror expansion are `star-g`, `star-k`, `star-m`, `star-a`,
`star-white-dwarf`, `mirror-risa`, `vintaak-giant`, `harlak`, `gorlan-remnants`,
and `survey-region`.

All ten were created with the built-in image_gen tool. The five stellar assets
used NASA SDO/HMI continuum imagery as a visual reference; the other five were
generated from text. These are interpreted game illustrations, not photographs
of fictional stars. HMI's assigned orange color is not treated as the Sun's true
visible color. Supported types select white/yellow, orange, red-orange,
blue-white or white-dwarf imagery; unknown types remain documented game choices.
Star names include Sol, Keid / 40 Eridani A, Rigil Kentaurus / Alpha Centauri A,
Epsilon Indi A, Vega, B'hava'el, Cardassia, Tau Ceti, Clarus and Irtok. Reference
associations and unknown survey designations are not promoted to screen facts.

Each asset has its exact `.actual-prompt.txt` and `.provenance.json` beside it.
The [prompt manifest](../html-games/broken-mirror-port/assets/system-planets/prompts.json)
records all prompts. Provenance retains the generated original PNG path and hash.
WebP packaging preserves composition and alpha without pixel painting or
compositing. All images are at least 1024 pixels per side. A few generated glow
surfaces have a maximum alpha of 253 or 254; this comes from the generated PNG.

Flight culls before requesting artwork, keeps at most eight extra body images,
and retains the existing four-image planet-preview cache. The tested distant
overview requested two planet images, rather than preloading the galaxy.

## Building and verification

Run `python tools/build-system-catalog.py` after editing the explicit JSON data.
It preserves the extracted original world table and regenerates its append-only
extension, catalog and prompt manifest. `tools/system-additions.json` continues
to own Halka; `tools/system-neighborhoods.json` owns the earlier original-world
neighbors. `python tools/validate-system-catalog.py` checks IDs, parent links,
asset paths, resolution, transparency, prompts and provenance checksums.

Node coverage includes `system-catalog.test.cjs`, `mirror-expansion.test.cjs`,
`regional-mining.test.cjs`, `mars-shipyard.test.cjs` and `shipyard-refits.test.cjs`.
The completion verification records **390 passes and one existing player-combat
assertion failure across 391 tests**, including all CJS and JS test files. The
known failure expects a contact point containing only x/y but receives existing
damage, capacity, kind and normal metadata as well. It predates this expansion.

Real-browser catalog checks cover all 90 atlas catalogs / 490 visible bodies,
Romulus/Remus travel and services, Halka cruise/reload, removed-filler save
migration and the removed gameplay badge. `browser-mirror-shipyards.py` clicks
Dev and Continue Dev, then physically docks, buys a refit, saves during approach
and at the clamps, resumes and undocks at all four additional yards. The existing
Mars yard, unified equipment, regional mining and flight/combat browser checks
also pass. Logs and screenshots stay in ignored `test-results/mirror-expansion/`,
`test-results/system-expansion/`, and the existing suite output folders.

`browser-system-completion.py` additionally verifies every approved planet's
local-map entry and performs actual cruise, artwork loading and normal-mode
save/reload at a new planet in each of all 40 completed systems. Its screenshots
and report stay in ignored `test-results/system-completion/`.
