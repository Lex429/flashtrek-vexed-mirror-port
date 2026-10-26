# System boundaries and orbital arrangements

Every system boundary is fitted to the visible bodies in its physical catalog.
The old neighboring-system distance cap and Sol-specific ellipse are removed.
`nativeSystemCatalog.boundary` encloses the padded artwork bounds, rather than
only body centers. Map positions use the same `body.x - 220, body.y + 75` centers
as flight. Bounds are cached, include stars, moons, stations and catalog belts,
and never request artwork or activate distant simulation. Romulus and Remus share
one boundary. The enclosed Dyson companion remains hidden inside its shell.

The circles represent the extent of the charted system, not individual orbital
paths or a gravitational boundary. The existing compressed galaxy can contain
overlapping system extents; proximity to another system cannot shrink a boundary
until its own planets fall outside it. Galaxy anchors and travel quotes stay fixed.

## Evidence and physical distances

[The orbital manifest](../tools/system-orbits.json) records sources, ordering
constraints and explicit scientific assumptions. The catalog generator applies it
after planetary completion through `tools/system_orbits.py`. Every major planet
has a parent star, orbital order, separately qualified distance, and illustrative
angular phase. Moons retain their parent planets. Irtok's old station-associated
companion is documented as a facility association rather than a physical moon
orbit around a small station.

Sol uses rounded representative semimajor axes. Kepler-174 uses NASA's 0.100,
0.214 and 0.677 AU values for b, c and d. These are orbital dimensions, not current
positions at a common epoch. The existing working Sol geometry remains a
compressed schematic; it is not rendered at a constant number of units per AU.

Other unmeasured orbital distances are explicitly scientific estimates. A
representative luminosity sets a square-root distance scale; geometric spacing
allows the retained authored rosters to occupy distinct orbits. Luminosities are
assumptions, even where a stellar class is supported. The hot Rigel and Mintaka
interpretations use explicit high-luminosity assumptions instead of a solar
default. Alpha Centauri's two planetary groups keep separate parent stars and
model circumstellar distances below 2.4 AU. This is a plausible layout model,
not an N-body stability result or an observed exoplanet census.

Existing screen-diagram interpretations, licensed schemes and authored ordinal
choices retain separate evidence labels. In particular, Ferenginar's fourth-orbit
scheme is licensed reference material, Qo'noS's ordinal is authored, and Bajor's
conflicting numbered placements remain unresolved. No missing numbered slots are
filled with invented planets. The atlas explains the orbital classifications;
gameplay keeps its ordinary navigation information.

## Position repairs and saves

Five unsettled survey planets had incompatible radial order: 61 Ursae Majoris I,
II and III were placed around Archer IV with II and III beyond IV; C-111 II was
beyond Beta III. Their explicit inner ordering is now I/II/III/IV and I/II/III,
respectively. All five receive revised positions, while their prior positions
remain in the generated catalog for save reconciliation. Homeworlds, moons,
stations, populations, markets, equipment, seeded mining geometry and body IDs
retain their existing values.

An old parked ship near a moved planet retains its offset from that planet. An
active cruise retains its current ship pose and adjusts its destination endpoint.
A freely flying ship retains its pose. Reconciliation records
`orbitalLayoutVersion` once; subsequent loading cannot apply the displacement a
second time. Existing local-system schema version 2 remains valid.

## Verification

`tests/system-orbits.test.cjs` covers every visible body's padded containment,
per-star ordering, evidence and physical-distance distinctions, preservation of
existing bodies, and idempotent parked/cruising save migration.
`tests/browser-system-orbits.py` checks actual map markers against their rendered
ellipses, large and compact windows, physical cruise completion to a relocated
planet, and save/reload. Reports and screenshots go in
`test-results/system-orbits/`.

Sources include [NASA planetary distances](https://science.nasa.gov/solar-system/planet-sizes-and-locations-in-our-solar-system/),
[NASA's habitable-zone explanation](https://science.nasa.gov/exoplanets/habitable-zone/),
[Alpha Centauri stability research](https://ntrs.nasa.gov/citations/20150022375),
and the [existing qualified Trek research](research/system-lore/README.md).
