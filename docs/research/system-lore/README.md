# Star system canon research

This reference covers all **52 existing Vexed Mirror map destinations** and the
known planetary-system information useful for expanding them beyond a single
world. It separates Broken Mirror lore, Flash Trek Rebirth lore, Star Trek
Prime screen material, Mirror screen material, licensed reference books, and
real astronomy. A shared name does not make the histories interchangeable.

Research checked **October 24, 2026**. This is a source-linked census of available
evidence, not a claim that Star Trek publishes a complete astronomical atlas
for every destination. The original inventory below is archived research; the implemented expansion is
documented in [Mirror expansion](mirror-expansion.md) and
[implementation notes](../../system-expansion.md).

## Files

- [System dossiers](system-dossiers.md): one record for every current destination,
  with its known bodies, source qualifications, Mirror notes and existing game
  installations.
- [Spreadsheet index](system-index.csv): all 52 labels, game allegiances, Rebirth
  matches, evidence classifications and concise descriptions.
- [Structured research data](systems.json): original game descriptions and fields,
  installation coordinates, source references, body types, uncertainty labels,
  and a separate Rebirth ID mapping. This is research data, not a replacement for
  the active game world catalog.

## Findings

The current 52 descriptions agree with the extracted local Flash `planetData`
reference. The extraction also supplies 166 installation records. Its manifest
identifies the installed SWF and recovered baseline; the installed build has
local extensions and is not presented as a pristine download of the 2005 game.
See [the current world catalog](../../../html-games/broken-mirror-port/world-data.js)
and the extraction provenance recorded in [systems.json](systems.json).

**51 of the 52 destinations have matching location labels in Rebirth's published
69-record registry.** Three explicit name mappings are Bajora → Bajor,
Cardassia → Cardassia Prime, and Qonos → Qo'noS. Hyphen/spacing differences also
occur. **Pirates Haven has no matching record**; similarity to Freehold Haven
does not prove identity. The creator describes Rebirth as a remaster drawing
from multiple earlier games, with a Dominion-occupied setting.
[Creator site](https://vexxiang.com/),
[published location registry](https://vexxiang.com/planets.js).

**17 labels connect to named screen worlds**, although Rigel's physical-system
identity remains ambiguous. Gorn adds a canonical species connection without a
verified home-system mapping; Dyson adds a technological analogy. Epsilon is
too ambiguous to identify a particular Trek system. Worf and Kah'Less are
canonical namesakes, which does not make the game's named planets canonical.
For the other **30 game worlds**, no screen-system counterpart was established
in the reviewed material. They remain valid Broken Mirror worlds; their
unwritten neighboring planets would be authored game content.

## Evidence and continuity rules

Use **Broken Mirror as the existing game baseline**, rather than replacing its
story with whichever source is newest. For additional bodies, record the exact
episode, film, graphic, book or game that supports each claim. The body records
distinguish the following evidence:

| Evidence | Meaning for expansion |
|---|---|
| Screen fact indexed by episode | A named world or event is associated with a screen source; secondary episode indexes were consulted. This audit does not claim every original frame was independently inspected. |
| Reported screen or production graphic | Useful candidate, especially for orbital layouts; verify the original image before treating every label as certain. |
| Licensed reference | Star Charts, technical manuals, novels, RPGs and other games supply optional material. They are not automatically screen canon, and often disagree. |
| Prime, Mirror or Kelvin | Keep separate universes. A Prime planet's geography can be adapted for the game, but the transfer is a design assumption unless independently established in Mirror. |
| Game lore | Broken Mirror and Rebirth each establish fiction for their own setting; one does not override the other by implication. |
| Astronomy | Real stars and planets can inform physical design. They do not establish Star Trek settlement history or Mirror politics. |
| Unknown or disputed | Leave the field open. Do not create named planets, exact temperatures, orbital radii, populations or star types and label them canon. |

Memory Alpha was used as an **episode and reference index**, including its
background/apocrypha distinctions. Some pages were available through indexed
search content rather than direct page access. Official episode recaps and the
creator's public game data provide additional primary/official checks. Precise
production-display details still marked for verification are not ready to
become fixed game data.

## Systems with useful planetary evidence

These are known bodies or candidates, **not claims that every roster is complete**.
Each linked dossier gives body-by-body qualifications.

| Current map destination | Bodies and locations worth carrying into the expansion reference |
|---|---|
| [Earth](system-dossiers.md#system-01) | Sol; Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, Neptune; Luna, the asteroid belt and dwarf-planet layer. Modern astronomy calls Pluto a dwarf planet; older Trek can use a nine-planet census. |
| [Orion](system-dossiers.md#system-02) | Orion homeworld. Orion I/III and the Pi³ Orionis association need their own chart/source checks. Do not silently relabel Orion as Rigel VIII. |
| [Alpha Centauri](system-dossiers.md#system-04) | Named inhabited Alpha Centauri world; A/B stellar pair and Proxima companion context. No full source-confirmed planet list. |
| [Rigel](system-dossiers.md#system-11) | Rigel II, III, IV, V, VII, X and XII have episode associations; VI has reference/production associations. Rigel VII's moon and debris field matter. Rigel X's Beta Rigel placement makes a single unified orbital list unsafe. |
| [Vulcan](system-dossiers.md#system-12) | Vulcan; reported SNW graphics add T'Khut and an inner world. Charades establishes a mission to Kerkhov's moon in the Vulcan-system setting. Include the star companions as qualified chart data. Keep Kelvin Delta Vega separate. |
| [Ferenginar](system-dossiers.md#system-14) | Ferenginar homeworld. No complete neighboring-planet roster established. |
| [Lysia](system-dossiers.md#system-15) | Lysia, central-command station and sentry defenses. Conundrum's forged intelligence must not be mistaken for factual history. |
| [Nausica](system-dossiers.md#system-16) | Nausicaa homeworld. Its third-planet number is a licensed RPG claim. |
| [Tholia](system-dossiers.md#system-18) | Tholian homeworld. Second-planet/class-Y specifics are qualified reference-book claims. |
| [Iconia](system-dossiers.md#system-24) | Iconia and gateway ruins. Vandros IV is a remote gateway destination, not another planet orbiting Iconia's star. |
| [Andoria](system-dossiers.md#system-25) | Andoria is an icy **moon** of an unnamed gas giant; other moons exist. Procyon V and the stellar identifiers require separate chart provenance. |
| [Trill](system-dossiers.md#system-27) | Trill / Trillius Prime, with Caves of Mak'ala as a surface site. No full neighboring-planet roster established. |
| [Remus](system-dossiers.md#system-30) and [Romulus](system-dossiers.md#system-31) | One physical system: Romulus, Remus, an unnamed inner planet and at least one unnamed outer planet in the indexed Nemesis diagram. Preserve both game destinations without creating two duplicate systems. |
| [Qonos](system-dossiers.md#system-38) | Qo'noS and Praxis. A Kelvin-screen ordinal must not become an unquestioned Prime/Mirror orbit number. Other Klingon possessions do not automatically belong here. |
| [Bajora](system-dossiers.md#system-47) | Bajor, Bajor VIII and its referenced second moon; Derna, Jeraddo, other indexed Bajoran moons; Denorios plasma field, wormhole, and DS9/Terok Nor. A 14-world reference scheme has numbering conflicts. |
| [Cardassia](system-dossiers.md#system-50) | Cardassia I, Prime/II, III, IV and V. Eight-planet/two-belt charts and a conflicting RPG placement belong in separate optional reference layers. |

Supporting references include the [NASA planetary census](https://science.nasa.gov/solar-system/planets/),
[official Charades recap](https://www.startrek.com/news/recap-205-charades-strange-new-worlds),
[official Rigel VII recap](https://www.startrek.com/news/recap-204-among-the-lotus-eaters-strange-new-worlds),
[Romulus system episode index](https://memory-alpha.fandom.com/wiki/Romulus_system),
[Bajoran system episode/reference index](https://memory-alpha.fandom.com/wiki/Bajoran_system),
and [Cardassian system episode/reference index](https://memory-alpha.fandom.com/wiki/Cardassian_system).

## Conflicts that affect the map

1. **Romulus and Remus share a star system.** The existing map intentionally has
   two destination IDs. A future shared local scene can preserve both travel
   destinations and save IDs while pointing them at one physical body catalog.
   Do not duplicate all planets around each destination.
   [Romulan system](https://memory-alpha.fandom.com/wiki/Romulus_system).
2. **Andoria is a moon.** Its parent gas giant needs a body entry. A colony or
   starport on Andoria is different from a port on the giant.
   [Andorian system](https://memory-alpha.fandom.com/wiki/Andorian_system).
3. **Rigel is not one unambiguous published layout.** Beta Rigel, Beta Orionis and
   older Orion/Rigel VIII interpretations must remain distinguishable. Alpha
   Centauri's star Rigel Kentaurus is a further unrelated name collision.
   [Rigel background and alternatives](https://memory-alpha.fandom.com/wiki/Rigel_system).
4. **Bajor's orbital number varies by reference scheme.** A licensed VII layout
   and an indexed XI layout cannot both define the same orbital ordering. Bajor
   and Bajor XI must not be counted as two homeworlds. Numbered slots in a
   technical diagram are not fourteen separately described screen planets.
   [Bajoran system](https://memory-alpha.fandom.com/wiki/Bajoran_system),
   [Bajor](https://memory-alpha.fandom.com/wiki/Bajor).
5. **Not every named empire world is a neighboring planet.** Klingon, Cardassian,
   Romulan or Bajoran political affiliation is not evidence of an orbit around
   that empire's capital star. Keep remote colonies and gateway endpoints remote.
6. **Dyson is an analogy, not an identification.** The game's hidden inhabited
   sphere is not proved to be the one in TNG Relics.
   [Official Relics retrospective](https://www.startrek.com/news/tngs-relics-debuted-23-years-ago-today-laddie).
7. **Exact real-space distances and game travel coordinates are different.**
   Keep the existing map positions as gameplay coordinates. Canonical/real
   distances, uncertain stellar associations and artistic scene distances need
   separate fields.

## Mirror and Rebirth history

The original TOS **Mirror, Mirror** establishes the Terran Empire and the Halkan
encounter. It does not supply a complete local-system atlas. The Enterprise,
Discovery and DS9 Mirror stories cover different eras. In **Crossover**, the
Klingon-Cardassian Alliance has replaced the imperial order around Bajor, and
Terok Nor orbits the planet. That differs from Broken Mirror's starting
political map. These are continuity choices rather than missing planet assets.
[Official Mirror Mirror analysis](https://www.startrek.com/en-un/news/cadet-training-mirror-universe-episodes-mirror-mirror),
[official Crossover analysis](https://www.startrek.com/en-un/news/cadet-training-mirror-universe-episodes-crossover).

Prime Romulus's supernova history, the Kelvin destruction of Vulcan, and later
Ni'Var-era developments are likewise not automatic events in Broken Mirror.
Choose a game era before attaching history to planets.
[Official Picard watch guide](https://www.startrek.com/news/your-ultimate-star-trek-picard-watch-guide),
[Vulcan system index](https://memory-alpha.fandom.com/wiki/Vulcan_system).

Rebirth's `planetDesc`, `freeDesc` and `domDesc` are **alternative state texts**,
not simultaneous facts. Its registry has its own IDs and government numbering.
For example, its collapsed-wormhole setting and abandoned Dyson sphere differ
from the original game baseline. Its versions of Paso, Lysia and Vex also
change history or current conditions. These remain Rebirth continuity rather
than corrections to Broken Mirror or screen canon.
[Published registry](https://vexxiang.com/planets.js),
[government registry](https://vexxiang.com/registries.js).

## Coverage limits and use

All 52 current destinations have records, including both hidden locations.
Unknown neighboring worlds remain unknown. This research does not establish
precise masses, radii, temperatures, orbital periods, current populations or
artwork for every world. It also does not certify every background graphic or
exhaust every novel, RPG edition and fan wiki. The complete orbital census is
unpublished or unresolved for most destinations; those gaps are explicit in
the data rather than filled with invented canon.

The next expansion should preserve the current game IDs and original lore, add
the well-supported bodies first, keep optional reference schemes separate,
and label any newly designed game planets as authored content. Sol's existing
local extension demonstrates the presentation pattern; its port placement and
economy are game design, not proof of canon.

## All current destinations

The table below links every existing destination to its dossier. Rebirth numbers
refer only to the inspected registry, and must not replace current map IDs.

| ID | Destination | Rebirth record | Trek connection |
|---:|---|---|---|
| 1 | [Earth](system-dossiers.md#system-01) | 1 Earth | Named screen world |
| 2 | [Orion](system-dossiers.md#system-02) | 19 Orion | Named screen world |
| 3 | [Lik Prime](system-dossiers.md#system-03) | 20 Lik Prime | Game world; no screen mapping established |
| 4 | [Alpha Centauri](system-dossiers.md#system-04) | 21 Alpha Centauri | Named screen world |
| 5 | [Paso](system-dossiers.md#system-05) | 22 Paso | Game world; no screen mapping established |
| 6 | [New Switzerland](system-dossiers.md#system-06) | 23 New Switzerland | Game world; no screen mapping established |
| 7 | [Trey](system-dossiers.md#system-07) | 24 Trey | Game world; no screen mapping established |
| 8 | [Epsilon](system-dossiers.md#system-08) | 25 Epsilon | Ambiguous name |
| 9 | [Quintus](system-dossiers.md#system-09) | 26 Quintus | Game world; no screen mapping established |
| 10 | [Gorn](system-dossiers.md#system-10) | 27 Gorn | Canonical species; world unresolved |
| 11 | [Rigel](system-dossiers.md#system-11) | 28 Rigel | Named worlds; system ambiguous |
| 12 | [Vulcan](system-dossiers.md#system-12) | 2 Vulcan | Named screen world |
| 13 | [Opusab](system-dossiers.md#system-13) | 29 Opusab | Game world; no screen mapping established |
| 14 | [Ferenginar](system-dossiers.md#system-14) | 3 Ferenginar | Named screen world |
| 15 | [Lysia](system-dossiers.md#system-15) | 30 Lysia | Named screen world |
| 16 | [Nausica](system-dossiers.md#system-16) | 31 Nausica | Named screen world |
| 17 | [Denmark](system-dossiers.md#system-17) | 32 Denmark | Game world; no screen mapping established |
| 18 | [Tholia](system-dossiers.md#system-18) | 15 Tholia | Named screen world |
| 19 | [Flash](system-dossiers.md#system-19) | 33 Flash | Game world; no screen mapping established |
| 20 | [Oce Nu](system-dossiers.md#system-20) | 34 Oce Nu | Game world; no screen mapping established |
| 21 | [Koann](system-dossiers.md#system-21) | 35 Koann | Game world; no screen mapping established |
| 22 | [Biakisch](system-dossiers.md#system-22) | 36 Biakisch | Game world; no screen mapping established |
| 23 | [Delpi](system-dossiers.md#system-23) | 37 Delpi | Game world; no screen mapping established |
| 24 | [Iconia](system-dossiers.md#system-24) | 38 Iconia | Named screen world |
| 25 | [Andoria](system-dossiers.md#system-25) | 39 Andoria | Named screen world |
| 26 | [Konae](system-dossiers.md#system-26) | 40 Konae | Game world; no screen mapping established |
| 27 | [Trill](system-dossiers.md#system-27) | 7 Trill | Named screen world |
| 28 | [Tepos](system-dossiers.md#system-28) | 41 Tepos | Game world; no screen mapping established |
| 29 | [Blender](system-dossiers.md#system-29) | 42 Blender | Game world; no screen mapping established |
| 30 | [Remus](system-dossiers.md#system-30) | 9 Remus | Named screen world |
| 31 | [Romulus](system-dossiers.md#system-31) | 8 Romulus | Named screen world |
| 32 | [Harman](system-dossiers.md#system-32) | 43 Harman | Game world; no screen mapping established |
| 33 | [Kardon](system-dossiers.md#system-33) | 44 Kardon | Game world; no screen mapping established |
| 34 | [Vex](system-dossiers.md#system-34) | 45 Vex | Game world; no screen mapping established |
| 35 | [Lameu](system-dossiers.md#system-35) | 46 Lameu | Game world; no screen mapping established |
| 36 | [Batos](system-dossiers.md#system-36) | 47 Batos | Game world; no screen mapping established |
| 37 | [Worf](system-dossiers.md#system-37) | 48 Worf | Canonical namesake only |
| 38 | [Qonos](system-dossiers.md#system-38) | 10 Qo'noS | Named screen world |
| 39 | [Xonok](system-dossiers.md#system-39) | 49 Xonok | Game world; no screen mapping established |
| 40 | [Qem-Kis](system-dossiers.md#system-40) | 50 Qem Kis | Game world; no screen mapping established |
| 41 | [Anorez](system-dossiers.md#system-41) | 51 Anorez | Game world; no screen mapping established |
| 42 | [Du'Qot](system-dossiers.md#system-42) | 52 Du'Qot | Game world; no screen mapping established |
| 43 | [Hof-Maso](system-dossiers.md#system-43) | 53 Hof Maso | Game world; no screen mapping established |
| 44 | [Nyoabek](system-dossiers.md#system-44) | 54 Nyoabek | Game world; no screen mapping established |
| 45 | [Hos'Ichu](system-dossiers.md#system-45) | 55 Hos'Ichu | Game world; no screen mapping established |
| 46 | [Kah'Less](system-dossiers.md#system-46) | 56 Kah'Less | Canonical namesake only |
| 47 | [Bajora](system-dossiers.md#system-47) | 57 Bajor | Named screen world |
| 48 | [Noron](system-dossiers.md#system-48) | 58 Noron | Game world; no screen mapping established |
| 49 | [Erasariel](system-dossiers.md#system-49) | 59 Erasariel | Game world; no screen mapping established |
| 50 | [Cardassia](system-dossiers.md#system-50) | 4 Cardassia Prime | Named screen world |
| 51 | [Dyson](system-dossiers.md#system-51) | 60 Dyson | Canonical technology analogy only |
| 52 | [Pirates Haven](system-dossiers.md#system-52) | No match | Game world; no screen mapping established |
