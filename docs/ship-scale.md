# Federation ship scale atlas

Open `http://127.0.0.1:7790/html-games/broken-mirror-port/ship-scale.html`.
The game uses a compact fleet scale for docking and readable gameplay. Danube
keeps its complete 11.7-unit frame; craft already smaller than Danube stay at
their existing size. Larger hulls are reduced proportionally in width and height,
with the longest frame reduced from about 345 to 175 units. Hulls exceeding the
ordinary dock's 83-unit width or 130-unit length use its existing external service
collar. All hulls retain
their existing balance, equipment, mass, inertia and flight behavior.

`ship-scale-settings.js` retains the 33 full reference measurements in `ships`,
and records compact dimensions plus preserved physical properties for the whole
87-hull roster in `gameplayShips`. The `gameplay` section records the compression
around Danube's fixed height. The shared definition owner applies them to player and NPC
ships, hull and shield boundaries, docking, weapon mounts and physical debris.
The game, startup/travel worker, effects lab and atlas load the same settings.
The atlas itself remains read-only: it does not activate a galaxy or read/write
game saves. Its Reference scale view retains the full published proportions;
Current game shows the smaller gameplay fleet and is selected by default.

The atlas reads `nativeFederationShips.ids` and `nativeShipDefinitions.get` after
loading the same artwork profiles, reference sizes and named-ship registrations
as the active game. The atlas has 45 Federation-related entries.
Existing catalog PNGs provide the actual intact hulls;
the page does not redraw ships or substitute silhouettes.

## Scale and controls

Danube is the fixed reference: its current visible width, length and full
11.7-unit flight frame are retained. The page loads and aligns its real artwork
first, measures its occupied hull, and creates one conversion:
`unitsPerMeter = danubeCurrentVisibleHeight / 23.1`. Every sourced visible hull
then uses `referenceMeters * unitsPerMeter`, without individual fit-to-card
sizing. The current artwork measures about 10.9 visible game units, so the new
corrected fleet is about 1.95 times the previous Voyager-based preview size.

The initial lineup places Danube, Kirk's Enterprise, the named Voyager,
Enterprise-D and Sovereign first, followed by the remaining entries. All ships
share a stern baseline and a common meter ruler. Current/corrected switching
preserves Danube's width and height exactly.

- **Reference scale / Current game** changes the comparison dimensions.
- **All ships / Danube & flagships** selects the full lineup or five-ship view.
- **Zoom** scales every ship and the ruler together.
- The lineup scrolls horizontally; the reference table scrolls independently.
- Search and source filters apply to the lineup and chart. Source filters
  distinguish supported lengths, provisional estimates, parent hulls and
  designs with no matching length.
- Select a hull or table entry for its current/corrected dimensions and provenance.
- **Export CSV** exports the filtered chart and proposed flight-frame heights.

The page prepares each intact image through the definition-owned alignment
function. Bounds include pixels with alpha at least 32, excluding transparent
padding and very faint halos. The current visible hull height is the current
flight-frame height multiplied by the occupied vertical fraction. The proposed
frame height is corrected hull height divided by that fraction.

The anchor is measured from the live definition and aligned intact artwork;
there is no hardcoded crop fraction or Voyager-sized fallback. Its complete
frame includes transparent padding, so its 11.7-unit frame contains a roughly
10.9-unit visible hull. The chart shows both hull and frame dimensions so this
distinction remains reviewable. Artwork proportions are retained; the atlas
does not reconstruct published beam/height dimensions or establish that every
source illustration has accurate proportions.

## Reference decisions

`ship-scale-data.js` owns the reference choices independently of gameplay data.
The current 45 entries contain 29 supported reference mappings, 4 provisional
mappings, 3 tug conversions with parent-hull references only, and 9 unmatched
designs. The page displays 29 sourced entries and 16 requiring verification.

Official StarTrek.com articles support Voyager/Intrepid, Sovereign, Nebula,
Nova, Danube, Akira and Defiant. The Smithsonian's original-series Enterprise
length is 947 ft, represented here by the familiar rounded 288.6 m. Named Terran
and unmarked Constitution art use this original-series counterpart reference,
not the movie refit or Enterprise-A.

The scanned *Deep Space Nine Technical Manual* was visually checked at printed
pages 151 and 154 (PDF pages 161 and 164). It lists Galaxy at 642.51 m and Miranda
at 277.76 m. The corresponding row links jump to those PDF pages.

The licensed *Official Starships Collection* PDFs were inspected for Delta
Flyer (21 m), Saber (approximately 223 m), NX (225 m), Olympic (320 m),
Steamrunner (356 m), Centaur (210 m), New Orleans (approximately 340 m),
Excelsior (467 m), Ambassador (520 m), and Prometheus (415 m). Their original
links are attached to the rows. The Ambassador and Prometheus issues differ
from the initially supplied 526 m and approximately 414 m values, and the UI
records those alternatives. Miranda's licensed Reliant issue instead gives
233 m; the atlas explicitly chooses the DS9 manual's value. These are reference
choices, not a claim that screen scaling and all publications agree.

The Sagan/Stargazer 540.7 m value remains provisional: DITL attributes it to
production designer Dave Blass, and Ex Astris Scientia corroborates the value as
a Picard season 2 scale-chart annotation. The original production post/chart
was not accessible for direct inspection. Both Sagan entries remain provisional.

The game’s Class 9 Shuttle artwork resembles Voyager’s Type-9, so the preview
uses a clearly provisional approximately 8.5 m match. The StarTrek.com shuttle
article identifies the Type-9 but does not state a length; the length comes from
Ex Astris Scientia’s annotations, attributed to *Star Trek Fact Files*. The
page links those two claims separately.

The Galaxy Dreadnaught has the three-nacelle future Enterprise-D configuration.
Its closest licensed reference, *Official Starships Collection* XL 20, lists
641 m. The PDF was inspected directly; applying it to this game artwork remains
a provisional design match, so the preview labels it accordingly.

For the three tug conversions, parent measurements are displayed without
applying them as exact conversion lengths. The original Grissom is 395 ft
(about 120 m) on the inspected *Star Trek III* production chart. The same chart
puts the movie-refit Enterprise at 1,000 ft (about 305 m); the Smithsonian
original-series counterpart remains about 289 m. The old Stargazer NCC-2893 is
310 m in the inspected licensed XL 31 guide. Parent references appear in the
table, detail panel and CSV, while the actual tug’s reference/corrected size
remains empty and its current display size is retained.

The nine designs without a matching published length remain Deforest,
Kingston, Tug Class II, Vega, Aries, Mozart, Akuzi, Dreadnaught Class and the
armored Tug Class II-A. None receives a guessed physical length.

Downloaded source documents and rendered reference pages remain outside the
repository in `C:/Users/alphi/LocalAI/research/ship-scale/`.

## Implementation and validation

`ship-scale.html`, `ship-scale.css`, `ship-scale-data.js` and `ship-scale.js` are
standalone page files. The page does not load the save owner, bootstrap owner,
NPC-life simulation or native game entry point. Image preparation is bounded to
three concurrent loads. Layout updates follow user events; there is no running
animation/simulation loop. Original images are aligned through the existing
profiles and copied into bounded preview surfaces for display.

Run:

```powershell
node --test tests/ship-scale.test.cjs tests/ship-scale-game.test.cjs tests/federation-ships.test.cjs
python -X utf8 tests/browser-ship-scale.py
python -X utf8 tests/browser-ship-scale-game.py
```

The reference update passed eleven Node tests plus the browser regression.
The browser checks actual rendered hull ratios and baseline alignment for all
45 entries, exact Danube current/corrected size parity, common zoom, presets, search, source
filters, an unverified ship, and CSV contents. It checks widths 1440, 1024, 768,
390 and 320 without page overflow, preserving independent chart/lineup scrolling.
Storage instrumentation verifies zero page writes and an unchanged sentinel.
There were no JavaScript errors or failed requests. Local screenshots and the
raw report are in ignored `test-results/ship-scale/`.
The new reference cases also verify the four provisional estimates, the three
parent-only rows, nine unmatched designs, supporting links, and that CSV parent
lengths never leak into the actual ship’s reference or corrected-size columns.

The gameplay regression measures actual aligned hull pixels against the compact
frames, retains all 33 full reference lengths, checks every player/NPC/tug dimension, and compares the full
roster's hardware and flight properties with the pre-install snapshot when
`--before path/to/game-before.json` is supplied. The production rendering check
covers all four damage stages and common zooms; physical debris uses the same
definition-owned dimensions. Unreferenced and unlisted hulls also use the compact
gameplay sizing, without inventing published measurements. A browser regression
completes real Danube, Galaxy, Sovereign and Enterprise-D approaches to their
appropriate upgrade berths, including the outside collar for larger hulls, and
verifies that all nine upgrade choices are available.
