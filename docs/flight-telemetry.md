# Flight telemetry and asteroid identity

The active native game uses `flight-telemetry.js` and `flight-telemetry.css` for
the upper-left flight panel. The separate legacy `flight-status.js` and CSS
remain available to their original entry point.

The upper-right `native-hud.js` retains its original 282-by-43 source grid,
extracted resource icons, weapon artwork, labels and amount formatting.
`native-hud.css` adds illuminated edges, soft glows and bounded event sweeps
matching the upper-left console. The Canvas redraws only when artwork/content
or measured size changes. The original host draw calls `vexedHud.frame`; there
is no extra RAF loop. A sibling effect layer uses the same display dimensions.
The weapon bank has a wider separating gap and divider, while resource cards use
larger inter-card gaps, left-aligned captions and brighter, right-aligned values.
Chamfered Canvas and SVG frames share `framePath`, including horizontal scaling
for three to eight weapon bays. Moving perimeter traces, illuminated corner
brackets, icon docks and actual ready/recharging indicators provide the visual
accents. Canvas paths are cached; event effects retain the existing Web Animation
channel budget and pause/reduced-motion behavior.

Weapon feedback reads the existing typed equipment instances, their saved
`readyAt` deadlines and `weapon-rules.weaponSpec` recharge. Accepted firing pulses
the actual slot; its line fills with real simulation-time progress and signals
readiness. Rejected shots and fitting changes cannot create firing feedback.
Resource values update immediately; visible gains/spends trigger brief sweeps.
Reserve warnings use 10 deuranium, 10 antimatter and 40 latinum thresholds; Dev
unlimited resources do not warn or manufacture change pulses. Continue initializes
a quiet baseline, including any remaining weapon cooldown.

The layer supports three to eight weapon cells and three resource cells, with
two replaceable Web Animation channels per cell (at most 22). Hover is read from
the stage with a cached HUD rectangle and never intercepts flight input or opens
a tooltip. Display changes invalidate that rectangle and clear hover. Pause,
hidden views and reduced motion follow the flight-panel gates. `vexedHud.update`
and `ready` remain compatible with existing callers. No HUD read initializes or
modifies equipment, resources or simulation time.

`tests/browser-hud-feedback.py` checks real purchases and trades, actual firing
and rejected shots, halfway recharge, pause, quiet Continue, five owned weapon
bays, nonblocking hover, retained Canvas draws, read-only state, unlimited/low
reserves, responsive alignment, reduced motion and Inventory visibility. Evidence
is under ignored `test-results/hud-feedback/`; functional checks do not establish
delivered gameplay FPS.

The lower-left hull and shield display uses `ship-vitals.js` and
`ship-vitals.css`. The host draw updates it alongside flight telemetry with the
same visibility/pause gates and the display owner's safe footer inset. The old
Canvas bars are removed. Two solid, continuous bars share the illuminated corners,
glow and scan effects of the Inventory/flight panels. There is no ship diagram,
segmentation or separate console heading/footer. Compact layouts fit
beside the existing radar without covering footer controls.
Each bar occupies one slim row: label, continuous fill, and percentage at the
right edge. No numbers appear inside either bar. The desktop strip is 360 pixels
wide and about 50 pixels tall; narrow layouts reduce it further. Font, border, background and left inset
match the upper-left panel. Device status remains in each meter's accessible
value text rather than adding another visible row.

Its numeric values and foreground bars immediately reflect authoritative hull
and shield energy. Hull capacity comes from the effective upgraded definition.
Shield energy is shown against `ratedShields`, the fully functioning fitted
generator's capacity; its current device condition is retained in the accessible
meter readout.
This exposes reduced total protection when device wear lowers the effective
ceiling, rather than presenting a damaged generator as 100% healthy. Empty bays,
offline generators, depleted energy, disabled hulls and repairs have distinct
readouts. Inspection does not repair, clamp or otherwise write saved values.

`ship-damage.apply` publishes its completed player result to the optional
`nativeShipVitals.impact` observer. The shield uses `#50d5ff`, matching the shared
ship effect's shield surface and impact color, with a deeper blue fill gradient.
It stays blue at low charge, while warnings pulse on the rim. Real absorbed
damage produces a shield wave; hull damage produces a recoil/flare on the hull
bar; overflow triggers both bars.
Bright twin wave crests and electrical arcs travel across the affected bar;
damage relative to capacity controls intensity and duration. Shield collapse
flickers out, and real recharge drives a blue energy flow clipped to the actual
remaining fill. Shared contact metadata remains available to inspection.
Loss trails animate separately from the accurate foreground bars. Zero damage,
NPC damage, equipment changes and Continue cannot create fake hit reactions.
The observer is absent in bootstrap workers and has no simulation role.

Effects replace nine bounded Web Animation channels. There is no new RAF loop,
timer, physics step or effect collection. Pause freezes both CSS and event
animations; hidden panels cancel transients; reduced motion retains accurate
percentages, accessible readings and warning colors without animation.
Repairs/recharge are read from existing systems, and state replacement
initializes a quiet baseline.

`tests/browser-ship-vitals.py` exercises an actual NPC beam through the shared
fire/resolve path, shield overflow, collision damage, generator upgrades/removal,
real device repairs, read-only updates, pause, rapid-hit bounds, narrow-screen
radar/footer clearance, reduced motion and saved Continue. Evidence is retained
under ignored `test-results/ship-vitals/`. These functional checks do not qualify
delivered gameplay FPS.

The panel observes `manual-flight.currentRegion`, which projects the existing catalog
ellipses used by the map into galaxy coordinates. It shows the physical system
name, including Sol, and switches to interstellar space outside those envelopes.
The simulation's `advanceRegion` activates the system at this same line, with
only floating-point tolerance. There is no 160-unit margin or late 2,500-unit
planet trigger. Romulus and Remus have one physical system label. Unknown systems
keep their undiscovered names hidden. In deep space the saved system remains a
coordinate frame. The indicator cannot rebase a pose, select a destination or
change resources. See `system-entry-streaming.md` for the activation owner.

The existing host draw loop drives telemetry updates, bounded to 20 per display
second. Text and style writes skip unchanged values. The panel adds no animation
loop, physics steps, lights or asset preparation. Small opacity/transform effects
animate the standing-colored reputation dot, panel sweeps and transition cards. Pause retains the
announcement, inventory hides the panel, and reduced-motion settings suppress
animation. Continue initializes the current location quietly. Actual crossings
produce one departure or entry card, which clears after four active display
seconds. Speed, warp/dock status and the existing physical-debt indication remain
in the same panel, with a single-row layout on small screens.

The compact panel uses the display owner's game scale. Its visible box occupies
the same y=4..40 source units as the top-right weapon/resource cells inside the
43-unit HUD, so both edges align across window sizes and Classic view. The thin
speed line sits inside the box and entry announcements appear temporarily below.

The top-left panel, radar header and navigation map all show the same rounded
galactic X/Y coordinates in ordinary flight units, sampled from the pure
`nativeManualFlight.position` owner. Sol's chart anchor is the shared zero;
factions and starting worlds never move it. Saved system/body origins are
converted before formatting, so a coordinate pair identifies the same location
through local-frame changes, deep-space travel and reload. The navigation state
exposes `galaxyShipPosition` separately from the retained `localShipPosition`
and the chart-scaled `shipPosition`. Radar contacts remain local geometry;
only the number readout uses galactic units. No display rebases a save or moves
the ship. Accessible labels and the map tooltip identify the galactic grid.

The reputation light and map share `nativeFactionStanding.colors` and the pure
`relationship` read model: blue `#4ab3ff` for allied (100+), red `#ff0000` for
hostile (negative), green `#0fff0f` for player-owned territory (government 16),
and gray `#cacaca` for neutral. Ownership takes priority over the number, and
undiscovered systems use the map's unknown gray without revealing standing.
The number reads `localPrestige[region.system]` from the physical system,
including when the saved coordinate frame remains another system. Positive
values include a plus sign; missing legacy standing defaults to zero. Warp and
interstellar space show a dash. Displaying reputation never initializes or
changes saved standing.

Real changes trigger bounded Web Animations: entry/departure slides and colored
sweeps, a 0.7-second reputation count, warp and docking transitions, and damage
halos limited to one per 0.7 seconds. Animations replace the previous effect in
each of eight channels. The existing host update advances the count; no new
animation loop or simulation owner is added. Pause freezes both CSS and event
animations, hiding the panel cancels transient effects, and reduced motion
cancels animations and immediately displays the true reputation. Continue
establishes a quiet baseline. Narrow screens condense the existing sync readout
to a small indicator to preserve the system name.


Dev games seed the four closest systems to Sol once: Epsilon Indi (55) hostile
at -75, Alpha Centauri (4) allied at +125, Orion (2) neutral at 0, and Epsilon
(8) owned by the player at +100. `devNeighborhoodVersion: 1` saves completion.
New Dev games retain the previous +100 default elsewhere; legacy Dev saves
keep unrelated standing and ownership values. The first setup resets the four
demo governments to their source faction, except Epsilon's player ownership,
so old ownership cannot hide a hostile demo behind a green light. Continue and
Dev ship changes preserve later edits. Normal games do not run this migration.

Ramming previously made some corridor asteroids jump backwards after a cached
coordinate view was evicted. The physical owner retained its original object,
while a query returned another object with the same persistent slot ID. Object
inequality admitted that pair as two rocks. The dispatcher now excludes matching
slot IDs and the shared pair solver rejects the same identity too. Genuine rock
contacts still use their existing mass, impulse, spin, damage and saved drift.

Validation on November 3, 2026 passed 57 physics/corridor/contact checks, including
the 30-minute physical fixture, and 25 location/catalog/orbit checks. The added
eviction regression failed before the correction and passed afterward. Five
browser suites cover telemetry, actual-key boundary crossings and ramming,
physical contacts/effects, flight controls, corridor mining/Continue and the host
schedule. Layouts at 1280, 720 and 390 pixels were inspected. The new telemetry
suite also exercises actual pause, inventory and reduced motion.

The retained evidence lives in `test-results/flight-status/`. Performance is
measured separately with the complete 1,210-record save, native fullscreen and
the original shared lighting. Strict 120-FPS qualification remains separate
from functional correctness and synthetic host-clock tests; failed windows must
be retained and cannot be described as certification.

The final retained 20-second windows delivered 83.05 FPS in flight, 85.81 in
corridor flight and 41.02 in crowded combat. Earlier comparison windows varied
substantially; no stable speedup is claimed. All windows retain the complete
fleet and physical debt. The final runtime hashes and failures are recorded in
`test-results/flight-status/verification.json` and
`test-results/performance-review/flight-status-final-native120*`.
Those windows precede the system-entry revision; its current boundary and
preparation validation is documented in `system-entry-streaming.md`. They also
precede the standing animation revision; these UI checks do not qualify frame
delivery or establish a performance improvement.
