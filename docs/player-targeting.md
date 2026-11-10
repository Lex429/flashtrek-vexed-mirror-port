# Player targeting

`player-combat-controls.js` owns intent scoring, transient attention, the stable
target cycle and analog trigger edges. `player-targeting.js` builds a bounded
read model from the shared spatial registry and draws the faint corner preview.
`native-game.js` applies an explicit selection through the existing asteroid,
civilian and tug selection owners. Pointing the mouse is never a scoring input.

The player's actual `heading` controls the preference, including during sideways
drift and reverse. Targets within 45 degrees of the nose receive a strong bonus;
alignment toward the center receives more weight than distance. Off-axis targets
remain available for deliberate cycling and fallback.

Currently attacking ships receive stronger priority than remembered attackers,
neutral traffic and asteroids. The shared `combat-shots.threats` forecast supplies
imminent projectile urgency; an impact within 0.35 seconds can outweigh a forward
attacker. Existing recent shot, retaliation and six-second attacker memory remain
useful between volleys. Attacking a target or mining records ten seconds of
runtime attention, with a small bonus when that target remains near the nose.

A slow ship with a mining tool, or recent mining activity, favours an available
asteroid ahead. Mining range comes from `asteroid-combat.miningRange`; NPC mining
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
The preview does not consume a cycling step or move an existing lock.

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
bounded previews, stable cycles, real Shift and Space input, controller edges,
Inventory gates and saved weapon behaviour. Existing equipment and combat
awareness/save regressions must continue to pass.
