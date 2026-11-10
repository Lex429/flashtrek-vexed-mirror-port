# Galactic collectables

Normal play and Dev mode expose the same sixteen unique, recoverable artifacts
at authored sites across the galaxy. Every faction uses identical global starting
coordinates. Dev has no separate Earth exhibit. The original transparent PNGs
from the user's `Downloads/bonus item ...` files are copied verbatim into
`assets/collectables/`; the originals remain untouched. `collectables.js` supplies
stable IDs, display names, factual archive descriptions and reference links.
`collectable-sites.js` supplies initial locations and fictional recovery logs.

The complete album contains the Tesla Roadster, Vanguard 1, Voyager, LAGEOS-1,
Pioneer 10, Pioneer 11, Apollo 10's Snoopy, Phoenix, LES-1, S.S. Botany Bay,
Ares IV, NX-Alpha, Friendship 1, S.S. Conestoga, the Kataan probe and Nomad.
The spelling and prefixes in the downloaded filenames are normalized for the
archive: Cochrane's ship is Phoenix, and Botany Bay is an S.S. sleeper ship.
NX-Alpha's record distinguishes its test flight from NX-Beta's; Nomad's record
distinguishes the original Earth probe from its later Tan Ru hybrid form.
Kataan's launch date is unknown rather than invented. Botany Bay's 1996 date is
explicitly attributed to the original TOS history. `dateLabel` and `sourceLabel`
allow each archive card to identify its event/date and reference accurately.

The recovery log is explicitly labelled **VEXED MIRROR LORE**. It explains an
invented later journey, why the item ended up at its site, and how many decades
it has spent missing or drifting. Factual archive history, dates and source links
remain separate and unchanged. NX-Alpha and Conestoga are collector
reconstructions, because the originals were destroyed or dismantled. Nomad is an
inert rebuilt casing, and the Voyager spacecraft is not V'Ger. These later
journeys are game fiction rather than additional Star Trek canon or NASA history.

Starting sites are deterministic offsets from existing catalog bodies, translated
by the shared `nativeManualFlight.anchor`. Nothing is placed in Sol. All eight
real-world artifacts start more than 100,000 global game units from Sol's origin;
they reached distant space through fictional recovery and transport, rather than
implausibly drifting interstellar distances from Earth orbit. The game uses
stylized world units, not physical kilometres or light-years.

| Item | Starting system / location | Fictional time lost or adrift |
| --- | --- | --- |
| Tesla Roadster | Ferenginar / lost collector convoy | Over 40 years |
| Vanguard 1 | Pirates Haven / Palehook salvage field | Nearly a century |
| Voyager | Dyson / abandoned Sphere survey site | 70 years |
| LAGEOS-1 | Cardassian system / confiscated archive cargo | 60 years |
| Pioneer 10 | Romulus / derelict frontier survey tender | 30 years alone |
| Pioneer 11 | Tholia / abandoned recovery line | Over 80 years |
| Apollo 10 Snoopy | Bajoran system / lost exhibition shipment | 50 years |
| Phoenix | 40 Eridani / vanished First Contact exhibit | 90 years |
| LES-1 | Badlands / storm-scattered cargo cache | Over a century |
| S.S. Botany Bay | Rigel / failed sleeper-ship salvage tow | 40 years |
| Ares IV | Vex / graviton-wake graveyard | 55 years |
| NX-Alpha | Alpha Centauri / abandoned prototype collection | Over 70 years |
| Friendship 1 | Kardon / abandoned quarantine anchorage | 40 years |
| S.S. Conestoga | New Switzerland / lost colony-route convoy | 65 years free |
| Kataan probe | Iconia / dead archive relay | Over a century |
| Nomad | Nausicaa / abandoned machine salvage | 50 years |

Only nearby, onscreen items create flight buttons and load artwork. Looking at
the map does not activate remote relic collisions, rock sectors or ship geometry.
Collected items retain their original IDs and permanent album slots; no migration
duplicates or discards ownership.

Artifacts coast in a straight line at gentle individual velocities (0.09–0.135
world units/second) and tumble slowly; large wrecks turn more slowly than small
satellites. Catalog `physics` profiles supply initial velocity and spin, plus
stylized mass/aspect data. They consume no gameplay randomness. Initial spin is
about ten times slower than the earlier decorative animation. Movement never
automatically reverses or returns to a display anchor.

`collectable-motion.js` retains version-3 `state.collectableMotion.items` records
keyed by catalog ID, containing **global** position, heading, velocity, angular
velocity, the shared simulation timestamp and a `settling` contact flag. The root
also records the authored site layout version. Physical poses are projected into
the current observer frame for rendering and shared contact queries, then contact
results are translated back into global saved positions. Changing systems cannot
move a relic's galactic position.

Legacy version-1/2 Earth-only Dev records migrate by relocating **uncollected**
items to the new authored sites. Existing manifests are preserved verbatim, so
already collected artifacts stay in their original album slots and cannot
respawn. Current version-3 displaced poses and settling survive Continue. Normal
and Dev both initialize this owner, using their existing separate saves.
No separate clock or storage key is introduced. The shared `ship-motion.step`
integrates untouched coasting/spin, and the fixed game schedule alone commits it.
Read methods sample cloned poses without mutating state. Calendar skips coast
analytically and never turn an unattended journey into a local collision sweep.

Only relics intersecting the active physical buffer participate in contacts.
The existing spatial ship/asteroid query discovers swept contacts. Shared
`shipPairContact` handles oriented hull geometry, masses, inertia, off-centre
angular impulses and fast impacts. Player/NPC pushes go through
`ship-systems.applyContact`; rock pushes go through `asteroid-motion.applyContact`
and its saved rock owner. Artifacts also physically contact one another. These
contacts do not award an item or alter health, equipment, cargo or ore.
An impact changes the item's course and spin and starts gradual settling.
The shared `ship-motion.settleVelocity` analytically integrates both translation
and rotation: drift decays at 0.8/second to a 0.04-unit/second stop threshold, and
spin at 1/second to a 0.001-radian/second threshold. The finite cutoff brings both
exactly to rest, usually within about 8–12 simulation seconds for ordinary rams.
The item stays at its new resting position and can be pushed again. Untouched
items retain their initial gentle drift. Saved settling continues through
Continue, and many small steps match a single distant sample. Pause, Inventory
and hidden tabs stop physical time.
The shared render-pose interpolation smooths physical steps. Transporter range
reads the authoritative pose; click targets follow the rendered pose. Only artwork
rotates, with labels upright and click bounds covering the rotated image.

Each catalog entry supplies its own `spaceSize` in gameplay units and a readable
`minPixels` visibility floor. Oriented hull ellipses use the catalog's physical
size and original image aspect ratio, independent of viewport and image readiness.
The visibility floor keeps small items readable; it never enlarges the collision
body when the window shrinks. Invisible click targets remain at least 44 CSS pixels. The game
uses a stylized ship scale rather than metres. The size relationships reflect
the small satellite bodies, the Roadster, probe booms and the lunar module;
the visibility floors range from 20 to 52 CSS pixels so artifacts remain
recognizable among stars at both desktop and phone sizes.
Artwork keeps its original aspect ratio and has a gentle staggered outline glow,
with no surrounding rings. Reduced motion suppresses artwork rotation and uses
a steady glow while retaining the current world target position. Pausing hides
the flight items. Inventory and archive artwork retain their full display size.

`nativeCollectables.collect` is the only acquisition owner. It validates the
current valid galactic frame, ship availability, 700-unit **global** transporter
range and stable item ID. The saved acquisition location records global
coordinates. It appends a saved `state.collectables` entry and requires a successful
verified write through `nativeSaveStorage`. On failure it restores the previous
manifest, retaining the pickup. Duplicate requests cannot add a second copy.
Collection has no cargo mass, ore, equipment or economic side effects.

The optional manifest remains compatible with old saves and preserves existing
entries. Collected IDs remove their corresponding world objects when either mode
resumes. A fresh game begins a fresh collection in that mode. The existing save codec
and separate normal/Dev slots retain ownership; there is no parallel storage key.

`collectables-view.js` presents the transporter reveal and archive dialog. Its
frame method only reads state; it never grants an item. The dialog gates the
shared simulation clock and notifies the existing host at both edges. Background
controls are inert, focus is trapped and returned, Escape closes the top dialog,
and reduced motion skips the materialization effect.

`collectable-transporter.js` owns only the brief UI materialization. It prepares
bounded canvases (at most 640 pixels on either side) from the original artwork,
clips shimmer and the formation edge to its alpha mask, and sends irregular light
filaments upward from the pad. A private decorative random stream seeds its fine
grain and particles without consuming gameplay randomness. The existing game RAF
ticks its presentation clock while the dialog pauses physical time; hidden tabs
suspend it without catching up. Closing the dialog cancels it immediately, and
switching to reduced motion resolves to the solid item. Archive inspection shows
the item immediately. Once solid, the artwork and its glow gently drift sideways,
rise and fall, and tilt slightly on a seamless 9.6-second loop above the stationary
pad. The compact layout reduces its travel; hidden tabs pause it and reduced motion disables
it. No renderer can grant a collectable or write a save.

Inventory can open directly on Collectables. The album uses permanent numbered
catalog slots in a responsive
paged grid. Missing artifacts show a question mark without revealing their artwork
or names. Each missing slot is a keyboard-accessible button labelled **READ CLUE**. It opens
the original single authored rumour, naming a system and nearby landmark without
revealing the artifact's name, artwork, exact coordinates or full recovery story.
There are no additional per-item hint layers or generated search bearings.

The first six catalog slots have clues from the start. Every unique artifact
recovered unlocks the next clue in catalog order: one find reveals slot 7, six
finds reveal all clues for slots 7-12, and seven finds reveal slot 13. Locked cards
show only how many more finds are needed. They expose no rumour, location,
reference image or asset URL. Unlocked cards retain the existing planet/landmark
artwork alongside their original rumour.

Album pages always contain six permanent catalog slots (the final page has four).
The grid adapts from three columns to two, with compact cards on short screens;
resizing cannot move an artifact into a different page or change clue eligibility.
`nativeCollectables.clueProgress` derives the available clue count from unique
catalog IDs in the existing ownership manifest, capped at sixteen. Unknown legacy
keepsakes and duplicate entries do not count. A failed transport cannot unlock a
clue. Existing collections and Continue retain progress without a new save field,
and normal/Dev remain separate. Collecting an artifact announces the next clue
when one becomes available. Clue locks never prevent finding an item in space.

Opening an unlocked clue loads only its displayed catalog reference image, without
activating distant physics or jobs. The artifact's own artwork stays hidden. The
read-only
clue dialog shares the archive's pause, focus trap, inert background and Escape/
Back behavior; it retains the current album page and missing slot. Opening a clue
does not collect anything, load artifact artwork or write to the save. Collected
tiles show the saved artwork and name and open the archive
record by click or keyboard. A collected/total counter tracks completion. The album
is a read-only view of the catalog and saved manifest; older noncatalog items are
retained after the catalog slots.

Validation: `node --test tests/collectables.test.cjs tests/collectable-physics.test.cjs`,
`python tests/browser-collectables.py` and `python tests/browser-collectable-physics.py`.
The collision regressions cover momentum, mass response, mirrored off-centre hits,
fast sweeps, finite settling, midway reload, repeated bumps, NPC contact, pickup pairs, asteroid ownership
legacy migration, frame-independent positions and normal/Dev separation. The physics browser check rams an item using the
actual W key, pauses, saves, uses Continue, verifies that movement and spin reach
zero and stay there, and transports it into Inventory.
The collection browser check clicks the real markers
at all sixteen actual galactic sites in normal play, injects a failed save, verifies the transporter and
pause gate, recovers all sixteen items, reloads the actual normal save, checks Inventory
at desktop and phone sizes, and exercises mode separation, keyboard controls,
hidden-tab suspension, cancellation during transport and switching to reduced
motion during materialization. It also checks live drifting targets, matching
artwork rotation/click bounds, frozen world poses in Inventory, clearly labelled recovery logs, lazy remote artwork, and seamless
archive sway without scaling the original artwork. Generated screenshots and reports remain under
`test-results/`.
