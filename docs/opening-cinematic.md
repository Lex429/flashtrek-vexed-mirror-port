# A Firm Hand — campaign opening

The 99.31-second film follows the supplied recording. It plays only when the
player selects **Opening film** on the main menu. New Game and Continue launch
directly. Close film, Escape and natural completion return to the menu and restore
focus; playback is rejected during setup or gameplay. The button participates in
the normal keyboard and controller menu navigation. Neither save mode is modified.

## Campaign and artwork

`opening-campaign.js` directs 24 camera cuts. Enterprise 426, the actual named
I.S.S. Enterprise NCC-1701, leads attacks on civilian traffic at Orion, Vulcan,
Andoria and Tellar, followed by orbital bombardment. Rebellion, the Klingon advance,
a border conflict, the Earth–Klingon battle and its aftermath follow. The ending
shows more of the game's existing worlds before returning to Earth and the title.

Twenty visible ship classes include both Constitution variants, civilian
runabouts, shuttles and tugs, an Olympic, and several distinct Imperial, Klingon,
Vulcan and Romulan hulls. Sixteen world artworks are loaded from the actual system
catalog, together with up to three real companion planets or moons per system.
Each uses the current shared limb, atmosphere and directional-lighting functions.
Gallery shots identify the separate worlds being shown. The archive
reports the catalog's own totals: 90 physical systems and 311 planets/moons.

Population readouts start from the game's authored population estimates. Film
casualties respond to civilian vessel losses and actual surface hits, with authored
cinematic casualty scales. They are historical illustration estimates, not canon
censuses or changes to saved populations.

## Shared combat and effects

`nativeCombatShots.fork()` gives the film an independent firing runtime while
sharing the normal weapon catalog, equipment rules, launch mechanics, range,
cooldowns, collision queries and weapon painting. `nativeShipEffects.fork()` owns
the film's impacts, damage-stage fragments, hull sparks, shield flashes and
ship-specific destruction. Default gameplay instances retain their existing APIs.
The effects fork's `shots: () => campaign.shots` supplies its beam-contact owner;
the fog renderer's `collect` callback supplies its actor descriptors.
Shield beam contacts resolve through that same isolated firing runtime. Previously
they called the live game's combat owner, which could initialize civilian-world
lookups against the film's deliberately minimal state and terminate its RAF loop.

The film opens the same sprite-cache and hull-batch frame used by gameplay.
Base hull artwork is available before optional damage materials. Two concurrent
class jobs use the shared cooperative preparation queue and ordinary bounded
damage cache; startup no longer waits for every class's full wreck preparation
or simulates eight future battle scenes. Painting reads campaign counters directly
instead of cloning diagnostic history on every frame.

Azure Nebula, Badlands plasma and Bassen Rift shots use their current authored
gas styles and seeds, with independent instances of the game's worker-backed
material renderer. Film actors supply descriptors to its existing hull-mask and
fluid path. It never queries the saved civilian population. Gas fields are released
when the shot changes or the film closes. Badlands shots also use the current
world weather owner for lightning, sheet flashes, plasma heat, currents and
material vortices, sampled against a film-owned state and narration clock.
These are local cinematic compositions of the existing regions, rather than
changes to their galaxy geography.

The director selects movement goals and targets. `nativeShipMotion.step`,
`avoidShips` and `shipPairContact` integrate and separate physical hulls. Damage
uses `nativeShipDamage.apply`; its shield-first overflow and disable policy
produce persistent damaged and disabled ships. The foreground ship receives a
crippling volley using the existing nonlethal policy before the lethal barrage.
No renderer applies damage or emits a death.

Combat time is compressed 3.5:1 for the campaign. Explosion particles, hull
fragments and shield presentation use a separate normal-speed visual clock so
the actual game destruction remains readable. Each hull's prepared artwork,
fracture sites, core, damage stages and lighting belong to its shared profile.

Debris contacts use `createEnvironmentalImpacts` and the real shared motion
solver. Fragments reflect from ships and asteroids and displace their local
cinematic targets. Ship debris contacts preserve health under the existing game
policy. Asteroids use the same environmental damage calculation, three-chip
preparation, fragment advancement and painting as normal gameplay, including its
25% health floor and no ore rewards. Those helpers were extracted from the existing
asteroid owner without changing its normal contact or mining policy.

The film owns an independent instance of the real 350-star parallax/optical
renderer and GPU presentation. `cinematic-battle-v2` is the exact profile selected
from the user's showcase page: shared cinematic shields, weapons, hull sparks,
weapon illumination and lens flares. This version is also released to normal
gameplay through the effect lab's measured staging/promotion workflow.

The film presents on every display animation callback, with no 30 FPS throttle.
Its audio clock and fixed combat steps are unchanged. Camera cuts ease in over
0.65 seconds and out over 0.55 seconds, shortened only for cuts too brief to
retain a visible middle. The Canvas scene and GPU overlay share the fade,
including the final title fade. `tests/browser-opening-frame-pacing.py` checks
120 Hz and 165 Hz scheduling and paused frames with stubbed rendering/audio;
that deterministic scheduling check is not a hardware performance benchmark.

Film shot impacts use their fork's damage callback and skip ordinary gameplay
resolution notifications. Asteroid chips bind cached textures during painting
from the film's loaded artwork, using the shared fragment texture helper.

The October 26 module audit is recorded in generated evidence at
`test-results/opening-frame-pacing/effect-audit.json`. The five effect modules
and shield shader match the earlier passing foreground 50-ship test exactly.
The current adapter additionally supports GPU running lamps. That historical
passing fixture had 44-pixel hulls, lights off and no destruction; its approval
does not extend to the film's larger hulls, lights and destruction workload.

Damage preparation permits three simultaneous base-art requests. Its isolated
optional cache is bounded to 24 classes / 384 MiB; this sequence prepares 20
classes. Film-owned damage caches, particles and GPU resources are released on
closing. The gameplay world clock remains suspended, and no actors register with
traffic, economy or save owners. Reduced motion holds each shot's simulation and
starfield while speech continues.

## Narration, music and explosions

The voice is the actual user recording, preserved byte-for-byte as
`assets/opening/intro-speech-original.mp3`, SHA-256
`abc3bb07966216a597916c7643e36e4cde25d7c8c69b017a8775a7b90b6432ca`.
Playback applies a 70 Hz high-pass and measured -17 LUFS / -2 dBTP normalization,
with a three-second lead. Pace and pitch remain unchanged. Measured word timings
are retained in `tools/opening-narration-timing.json` and the runtime manifest.

The score edits the installed `startup/the-void-beyond.mp3` into ten passages,
using 0.6-second equal-power crossfades and speech ducking. The title uses paired
source-song transients at 277.08 and 277.46 seconds. The user has not confirmed that
this is the particular “dun dun” passage originally intended.

The film plays no weapon or shield-hit sounds. Destruction events trigger the
actual small/large explosion recordings at their observed film time, with at most
three concurrent sounds and extra speech ducking. Pause stops them, resume restores
eligible tails, seeking discards unrelated tails, and closing releases every node.
Narration, Music and Explosions controls persist under the existing settings key.

To rebuild the recording/music, with FFmpeg and Python/NumPy installed:

```powershell
python tools/build-opening-recut.py
```

The packaged original is the input; no private Downloads path is required. The
old synthetic narration and fixed weapon-sound-track builders are historical.
The runtime loads only narration, edited music and the two game explosion clips.
A listening preview and decoded default-mix validation can be generated from the
browser's captured destruction timeline with `tools/package-opening-effects.py`.

## Verification

`tests/opening-cinematic.test.cjs` checks recording integrity, word/camera timing,
campaign coverage, recurring raids, catalog variety, reduced motion and clock
isolation. Shared effects/weapon tests verify independent clocks, scenes,
contacts and GPU resets while retaining actual visual catalog data.

`tests/browser-opening-campaign.py --continuous` captures each encounter, checks
shield collapse, hull damage, disabled/destruction progression, debris contacts,
asteroid health floors, matching effect profile, explosion-only sound and saves,
and records full-length playback. Evidence is in `test-results/opening-campaign/`.
`tests/browser-opening-cinematic.py` separately covers optional menu playback,
direct New Game and Continue, audible
narration, synchronization, pause, seeking, controls, replay, both save modes and
closing during cold preparation. The campaign check also verifies all three gas
styles, additional catalog bodies, and absence of queries to the live world.

The effect lab records its staged fixture and source hashes; actual-game
verification uses `tools/validate_effect_game.py`. Renderer timing and headless
results must not be represented as a foreground 120 FPS approval.

November 12, 2026 verification: uninterrupted playback completed naturally with
zero browser errors, 17 visited systems, 45 catalog bodies, three gas styles and
43 actual destructions. The lifecycle check passed audible narration, pause,
seeking, replay, cold cancellation, a failed-load retry, controller-menu access,
save isolation, and direct New Game/Continue. Cold menu-click-to-ready time was
3.73 seconds in that headless Edge run; this is loading latency, not an FPS result.
The focused Node run passed 98 tests, including shared firing, effect isolation,
nebula weather and regenerated physical-debris signatures for all 86 hulls.
Reports and screenshots remain under `test-results/film-repair/`,
`test-results/opening-cinematic/` and `test-results/opening-campaign/`.
