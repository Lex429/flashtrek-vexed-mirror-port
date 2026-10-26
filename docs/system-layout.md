# Blended system layout

The October 25, 2026 layout moves **only destinations 54–91**. Every original
destination (1–52), the hidden-location fallbacks, and Halka (53) keep their
positions. Romulus and Remus retain their existing shared physical frame.
The 38 newer systems are interleaved with existing neighborhoods and irregular
outer gaps rather than appended as rows. The minimum separation involving a
moved system is **26.27 chart units**; no old system is displaced to make room.

The editable position owner is [tools/system-layout.json](../tools/system-layout.json).
Its entries include anchor IDs, source links, evidence qualifications and a
placement rationale. `tools/mirror-expansion.json` continues to own content and
facilities; it no longer contains a competing set of chart positions. Rebuild
with `python tools/build-system-catalog.py`. Existing planet names, local body
coordinates, types, artwork, services, ports and shipyard berths are unchanged.
The entire local-body catalog is byte-for-byte identical to the pre-layout copy.

## What the references support

- [Vintaak](https://memory-alpha.fandom.com/wiki/Unnamed_Alpha_and_Beta_Quadrant_planets#Vintaak_system_gas_giant)
  belongs in Tholian space, so it is placed near the retained Tholia anchor.
- [Clarus](https://memory-alpha.fandom.com/wiki/Clarus) and
  [Irtok](https://memory-alpha.fandom.com/wiki/Irtok) are neighboring systems of
  Ferenginar. Both remain near that existing homeworld.
- The [Badlands](https://memory-alpha.fandom.com/wiki/Badlands) are placed in the
  Bajoran/Cardassian border neighborhood rather than the old distant row.
- [Organia](https://memory-alpha.fandom.com/wiki/Organia) and
  [Sherman's Planet](https://memory-alpha.fandom.com/wiki/Sherman%27s_Planet)
  follow their Federation/Klingon border relationship, adapted to the old map.
- Nearby stellar identities such as Epsilon Indi, Tau Ceti, Vega and
  61 Ursae Majoris are blended into the retained core projection. Their plotted
  distances are not measured light-years or a calibrated projection of the sky.
- [New Bajor](https://memory-alpha.fandom.com/wiki/New_Bajor) is a Prime Gamma
  Quadrant colony adapted into the game. It receives a separated outer chart
  projection rather than appearing adjacent to Bajor. The existing travel
  mechanics still use compressed game distances; this change does not add a
  galaxy-scale distance model or a new wormhole route.
- [Archer's Planet](https://www.ex-astris-scientia.org/database/ent-characters-iamd.htm)
  is associated with Gamma Trianguli **sector**, which is not the Gamma Quadrant.
  It remains distinct from both New Bajor and Archer IV / 61 Ursae Majoris.

Most Mirror dialogue and computer references do not establish exact coordinates.
Harlak, Priors World, Gorlan, Gorlan Station, Tonnata, Sorna, Purmata, Porathia,
Wurna Minor, Elpha and Quam therefore have deliberately approximate placements.
Other Prime-derived locations remain adaptations. Neither current allegiance
nor a historical epithet is treated as proof of a precise stellar position.
Keeping Broken Mirror's original anchors prevents a literal reconstruction of
an official Trek atlas; the supported regional relationships take precedence
over invented coordinate claims. The layout adds no destinations or bodies.

## Applied positions

Only the following chart anchors move. Coordinates are the game's chart units.

| ID | Destination | X | Y | Placement basis |
|---:|---|---:|---:|---|
| 54 | Vintaak | 139.4 | 93.8 | regional reference |
| 55 | Epsilon Indi | -91.7 | 101.4 | nearby stellar reference |
| 56 | Harlak | 34.8 | 39.1 | unresolved game placement |
| 57 | Risa | -99.6 | 37.6 | reference adaptation |
| 58 | Vega | -98.2 | 2.6 | nearby stellar reference |
| 59 | Gorlan | -6.0 | 35.4 | unresolved game placement |
| 60 | Kepler-174 | 150.3 | 177.9 | astronomy projection |
| 61 | Priors World | -19.8 | 169.2 | unresolved game placement |
| 62 | Tonnata | 180.2 | 29.7 | unresolved game placement |
| 63 | Sorna | 121.4 | 142.8 | unresolved game placement |
| 64 | Wurna Minor | 190.6 | 115.3 | unresolved game placement |
| 65 | Purmata | -62.3 | 225.8 | unresolved game placement |
| 66 | Elpha | 201.7 | 191.4 | unresolved game placement |
| 67 | Quam | 216.3 | 64.2 | unresolved game placement |
| 68 | Mintaka | -173.2 | 30.8 | reference adaptation |
| 69 | Betazed | -99.9 | 151.6 | reference adaptation |
| 70 | Talos | -268.4 | 66.7 | reference adaptation |
| 71 | Tau Ceti | -63.3 | 124.6 | nearby stellar reference |
| 72 | Gorlan Station | 26.4 | 104.2 | unresolved game placement |
| 73 | Badlands | -139.8 | -30.7 | regional reference |
| 74 | Fowla | -81.6 | -92.3 | mirror regional inference |
| 75 | Porathia | 28.5 | 217.4 | unresolved game placement |
| 76 | Ventar | -115.9 | -122.6 | mirror regional inference |
| 77 | Organia | 13.7 | -19.2 | regional reference |
| 78 | Dannus | -284.8 | -110.6 | unresolved game placement |
| 79 | New Bajor | -352.8 | -249.6 | quadrant reference compressed |
| 80 | Pahvo | 5.2 | -51.6 | reference adaptation |
| 81 | Kwejian | -254.9 | 7.4 | reference adaptation |
| 82 | 61 Ursae Majoris | -9.6 | 104.7 | nearby stellar reference |
| 83 | Archer's Planet | -244.8 | 310.2 | reference adaptation |
| 84 | C-111 | -168.4 | -22.7 | unresolved game placement |
| 85 | Eminiar | -250.6 | 182.4 | reference adaptation |
| 86 | Sherman | -30.8 | -18.6 | regional reference |
| 87 | Tellar | -181.4 | 84.3 | core reference adaptation |
| 88 | Denobula | -198.9 | 132.6 | core reference adaptation |
| 89 | Coridan | -131.6 | 145.8 | core reference adaptation |
| 90 | Clarus | -95.6 | 194.3 | regional reference |
| 91 | Irtok | -24.5 | 198.2 | regional reference |

## Mining, travel and saved lives

Mining geometry is seeded independently from the current navigational chart.
`world.geologyMapPositions` retains the old anchor coordinates for the moved
destinations. `regional-minerals.js` uses those anchors for geological profiles,
seeded belt neighbors and clearance angles. `sol-asteroids.js` uses that same
geological coordinate accessor. Ordinary navigation, trade distances, nearby
prospecting and new journey planning use the actual current chart positions.

All **91** complete asteroid-field hashes and all geological profiles match
the pre-layout snapshot exactly. This preserves rock positions, ore types,
rewards, supplemental deuranium, health identities, IDs and depletion keys.
No civilian fleet or competing economic state is seeded.

`npc-lives.js` owns the one-time `life.chartLayoutVersion` reconciliation for
existing saved civilian journeys. It translates saved galaxy endpoints to the
new anchors using the existing local departure and arrival poses. Cargo, local
poses, the paid agreement, progress, elapsed days, timer and arrival deadline
remain intact. Effective interpolation distance/speed match the updated chart
endpoints; existing paid trips are not repriced or restarted. Subsequent loads
do not apply the translation a second time. New journeys use the new map.

The player still uses the existing navigation/travel owners and fuel formula.
Committed transit receipts survive reload without another charge or day skip.
Local cruise selections and player holdings remain keyed by the same body IDs.

## Verification

- `system-layout.test.cjs`: fixed old anchors, moved-system clearance and source
  neighborhoods; all 91 field hashes; retained local selections and holdings;
  current fuel quotes; a physically loaded paid old-layout delivery that resumes
  under the new anchors and settles once with preserved cargo, escrow and deadline.
- Full Node regression: **382 passes / 383 tests**. The remaining failure is the
  pre-existing `player-combat.test.cjs:75` assertion expecting only x/y while the
  contact also includes damage, capacity, kind and normal metadata.
- The targeted layout, regional mining and economic suites pass all **26**
  checks, including the full-population conservation and recovery simulations.
- `browser-system-layout.py`: all 38 reviewed positions match the live chart;
  all 90 overview nodes fit; large and compact screenshots; a real Kepler-174
  warp quoted at **63 days / 5 antimatter**, a committed-report page reload,
  exactly-once charging, and arrival at Kepler-174d without browser errors.
- The existing system-catalog browser checks pass all 90 atlas catalogs / 314
  visible bodies, Romulus/Remus round trips and services, local Halka travel,
  normal save/reload, removed-filler recovery and bounded overview image requests.
- Existing regional mining/refining/upgrade browser checks pass without errors.
- The persistent-NPC browser check passes its real Continue reload, map-only
  delivery, local Canvas positions, interrupted cargo, one-time mining, saved
  transport delay and paid repair checks without errors. Its deterministic
  RAF-frozen fixture uses reduced motion so menu animation does not delay Continue.

The repeatable frozen reference is
[tests/fixtures/system-layout-v1.json](../tests/fixtures/system-layout-v1.json).
The [interactive before/after comparison](../html-games/broken-mirror-port/system-layout-preview.html)
preserves the baseline dataset, so its Before view remains meaningful after
applying the map. Screenshots and local logs are in the ignored
`test-results/system-layout/` directory.
The actual game retains its existing map renderer, controls, colors and zoom;
the chart geometry is what changed.
