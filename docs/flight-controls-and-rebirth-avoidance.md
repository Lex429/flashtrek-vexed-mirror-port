# Flight, targeting and navigation changes

The active build is `html-games/broken-mirror-port/index.html` on port 7790.
Dev and regular games use the same motion, targeting and weapon owners.

| Input | Action |
| --- | --- |
| W / Up | Forward thrust; brake out of reverse before accelerating forward |
| S / Down | Brake to a full stop and stay stopped while held; release and press again at rest to reverse at up to 45% forward speed |
| A / D, Left / Right | Turn while travelling forward or backward |
| X | Brake to a complete stop; also cancel a turnaround |
| Q | One braking half-turn per press; ordinary steering can interrupt it |
| Shift tap | Smart lock: active/recent attacker, active mining rock, then nearest target |
| Quick Shift taps | Deliberately cycle the ranked candidates |
| Shift hold | Clear the lock |
| Space hold | Fire at the locked target while fitted weapons recharge normally |

Reverse stores its direction in the existing ship state and survives reload.
Pausing, menus, blur and state changes clear pending control gestures. The
ordinary shared movement owner handles reverse and braking; no renderer moves
the player or grants different equipment statistics.

Incoming fire is remembered for six simulation seconds so a beam disappearing
between volleys does not make a nearby rock take priority. Active escape intent
does not count as a continuing attack. Outside combat, selection uses actual
distance rather than screen visibility. A rapid sequence means taps separated
by less than 0.7 simulation seconds; isolated presses recompute the best lock.
Manual clicking remains available, and a changed lock stops held fire.

Default reach is 1100 units for beams, 900 for disruptors and 1500 for torpedoes;
explicit model ranges still override these defaults. All three can aim around
the ship independently of its nose. Damage, recharge, torpedo speed and homing
turn rate retain their existing model data. An obstructed lock can be fired at;
the actual swept path hits its first intervening surface.

Aim error is zero within 30% of model range and increases quadratically beyond
that distance. A deterministic angular offset is saved on the shot, and the
same offset drives physical interception and visible beam tracing. Misses are
actual misses, not a hidden damage roll. Existing saved shots without an error
field retain their original path. Precision geometry fixtures explicitly set
zero spread; separate tests exercise default long-range hit/miss behavior.

## Rebirth source reviewed

Reference: the installed `Downloads/FlashTrek Rebirth/flashtrek.html`.
The relevant combat separation block starts near line 11042. Nearby living,
non-warping ships contribute distance-weighted separation vectors. That vector
is normalized and blended with goal direction at strength 0.55. Avoidance
reduces thrust to 85%. A separate physics path handles actual overlap/contact;
this steering block does not construct an intersection queue or negotiate
priority between every pair of ships. Ship steering then uses a damped heading
controller, alignment-sensitive thrust and the selected combat range.

The port uses that local goal/separation blend for ordinary ship steering.
Scheduled traffic keeps its existing saved route/deadline owner, reacts to a
nearby physical crossing corridor, and avoids waiting merely because another
moving hull has priority. It retains physical passing waypoints, body/rock
clearance and actual contact response. A genuinely occupied final berth still
waits: completing deliveries through another ship would corrupt cargo handling.
Maintenance craft retain their dedicated hatch and close-approach handling.

In the identical four-ship crossing fixture, the previous implementation used
10 replans, accumulated 2.03 stopped ship-seconds and finished in 7.85 simulated
seconds. The revised behavior used 6 replans, accumulated 0.17 stopped
ship-seconds and finished in 6.55 seconds. Both had zero contacts and retained
cargo/credits. This is a gameplay-progress comparison, not a delivered-FPS claim.
The raw report is in ignored `test-results/flight-feel-20261026/`.

Coverage includes `flight-feel.test.cjs`, `browser-flight-feel.py`, existing
motion/traffic, beam/awareness, held controls, engine, impact, repair and economy
regressions. Browser checks use isolated saves and real key events.
