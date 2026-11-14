# Player targeting

`player-combat-controls.js` owns intent scoring, transient attention, the stable
target cycle and analog trigger edges. `player-targeting.js` builds a bounded
read model from the shared spatial registry and draws the faint corner preview.
`native-game.js` applies an explicit selection through the existing asteroid,
civilian and tug selection owners. Pointing the mouse is never a scoring input.

The player's actual `heading` controls the preference, including during sideways
drift and reverse. Targets within 45 degrees of the nose receive a strong bonus;
alignment toward the center receives more weight than distance. A canonical
instant nose ray uses physical hull radii and rock geometry, so a large hull
crossing the nose can beat a smaller object's center behind it. The hull-only
query copies descriptors and never changes the weapon scene. Off-axis targets
remain available for deliberate cycling and fallback.

Currently attacking ships receive stronger priority than remembered attackers,
neutral traffic and asteroids. The shared `combat-shots.threats` forecast supplies
imminent projectile urgency; an impact within 0.35 seconds can outweigh a forward
attacker. Existing recent shot, retaliation and six-second attacker memory remain
useful between volleys. Remembered threat weight fades across its six-second
lifetime, while actively fighting ships retain their priority. Attacking a target or mining records ten seconds of
runtime attention, with a small bonus when that target remains near the nose.

A tool alone is weak evidence. A slow, aligned approach within mining range,
recent mining activity, or braking toward a nearby rock strengthens mining intent.
A bounded 0.8-second/32-sample history measures settling and deceleration using
shared simulation time. Aim evidence builds over roughly 0.25 seconds, with less
credit during a fast turn; repeated reads at one timestamp earn no evidence.
New turns can still select immediately. Fast crossing objects receive less idle
attention than an aim that has settled. Mining range comes from `asteroid-combat.miningRange`; NPC mining
claims, depleted and destroyed asteroids remain excluded. All asteroid field
types come through the canonical spatial query, including interstellar fields.

Weapon suitability is a soft preference from `combat-shots.firingStatus`, not a
second firing policy. Readiness never prevents acquiring a recharging target.
`weapon-rules.firstContact` supplies a current straight-line obstruction check;
this conservative center-to-target awareness does not alter muzzle positions,
projectile guidance, interception, actual damage or firing eligibility.

The preview updates at most once per 0.12 simulation seconds unless the player
turns by about five degrees, moves 60 units, changes lock, or explicitly presses
target. Each update assesses at most twelve exact weapon/line queries. Input
always refreshes immediately. Rendering follows the selected preview object's
shared interpolated pose and never acquires a target, emits a shot or saves data.
The corners are steady, unlabelled and hidden by flight gates and held firing.
The preview does not consume a cycling step or move an existing lock. Near ties
within fourteen score points hold the current suggestion; a stronger challenger
normally needs 0.18 simulation seconds. A substantial turn, lost candidate or new
priority attacker can replace it immediately.

Painting publishes the actual visible choice. A subsequent press honours that
choice for up to 0.3 simulation seconds when the same lock/context remains, the
ship has turned less than 0.2 radians and moved less than 100 units. Fresh input
still queries eligibility immediately. Lost/out-of-range targets and a newly
active or more urgent threat override the promise. The published choice becomes
the first entry of a fresh cycle, preserving the runner-up for the next press.

Quick cycling records an unconfirmed correction for three simulation seconds.
Only an accepted shot or started mining action at the corrected target confirms
it. That target preference and its skipped alternatives fade over eight seconds;
it only applies while the chosen object remains available and the original
bearing is within 0.15 radians. Cycling alone teaches nothing, no general ship or
ore preference is inferred, and no learning is saved. All memory resets on game
activation. This is temporary evidence about the current choice.

Repeated presses within two simulation seconds retain the initial ranked order,
skipping lost candidates and appending new ones. Turning over 45 degrees makes
the next press reconsider the nose direction. A newly active priority attacker
can interrupt an existing cycle. With no repeat, the next press chooses the best
current intent. Runtime memory resets on game activation and is not saved.

Keyboard Shift retains tap-to-acquire/cycle and the 0.5-second hold-to-clear.
Future controller bindings use `nativeTargetingActions.trigger(value)`, with a
press threshold of 0.65 and release threshold of 0.35. A held trigger never repeats
or clears the lock; a blocked press is consumed until release. Explicit
`acquire()` and `clear()` actions share the same flight gates. This exposes a
controller binding interface; polling or mapping physical gamepads is separate.
`snapshot()` is read-only diagnostics for the latest preview and scores.

Validation: `player-controls.test.cjs`, `player-targeting.test.cjs`,
`flight-feel.test.cjs` and `browser-combat-controls.py` cover facing independent
of velocity, threat urgency, remembered/active attackers, mining, shared geometry,
bounded previews, shape-aware aim, preview promises, expiring corrections,
stable cycles, real Shift and Space input, controller edges,
Inventory gates and saved weapon behaviour. Existing equipment and combat
awareness/save regressions must continue to pass.

Foreign deployed DOTs now participate through the same registered
`repair-drone` category, including click selection, smart cycling, weapon
eligibility and a hull target frame. Player-owned DOTs are omitted. A shot retains
its original DOT target after a later lock change. See `ship-looting.md` for
disabled-ship interactions and their live controller panel.
