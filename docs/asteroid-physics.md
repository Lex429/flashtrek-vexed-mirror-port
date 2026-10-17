# Asteroid impacts and persistent drift

Combat weapons destroy an intact asteroid on their first actual contact,
regardless of model strength. Firing alone does not destroy a target; beams,
projectiles, collateral contacts and restored shots resolve through the common
weapon lifecycle. Mining remains the existing timed cut/transport sequence.

Each separate debris fragment deals 25% of the target's maximum health.
The shared debris collector remembers each fragment/target pair, so overlapping
frames cannot repeatedly charge damage. Four distinct impacts destroy a healthy
rock. Asteroid pressure waves retain their visuals and ship surface effects but
do not destroy neighboring rocks; their flying fragments apply the quarter-health
rule instead. Other ship explosion pressure keeps its existing behavior.

Ships push rocks using their registered oriented shield radii when shields are
active, or hull radii otherwise. `ship-motion.asteroidContact` sweeps relative
movement and returns a mass-weighted impulse and separation. The contact owner
orders contacts along travel. Rock mass scales with size cubed; ship mass
defaults to its displayed volume proxy, with a definition mass override
available. Restitution is 0.18, with limited tangential friction for deflection
and spin. This is an ellipse/circle gameplay approximation, not pixel-perfect
rigid-body physics.

Gentle impacts below 70 world units/second of normal closing speed do not damage
the rock. Higher speeds scale damage with squared excess speed and the effective
mass ratio; damage is deterministic and capped at one full health bar per
impact. Persistent overlaps share a 250 ms contact gate for effects/damage.
Ship shield flashes and hull sparks use the existing renderer and contact
surfaces. These environmental contacts do not subtract ship health.

Whole drifting asteroids collide with other whole rocks, including rocks in
offscreen systems. Swept circle contacts exchange equal/opposite impulses using
each rock's cubic size mass, restitution 0.18, and rotational friction. Small
rocks accelerate more; large rocks resist more. Glancing hits transfer spin and
deflect trajectories. These body contacts do not generate ore or apply the
fragment-specific 25% damage rule. The existing weapon/debris rules remain
separate. Queries use the spatial grid for ordinary steps and bounded field
scans for long calendar sweeps; no artwork is needed. Each pair resolves once
per step, with at most 2048 pair resolutions per step for crowded chains.

`asteroid-motion.js` dispatches contacts for registered actors in the active
system once per physics step. Civilian and freight task owners retain their
scheduled route deadlines and economic reservations. Saved `motionKick.version:1`
retains external ship momentum separately from engine velocity, so steering does
not erase a sideways shove. Manual flight coasts until braking; goal/holding
commands damp the external velocity. Scheduled ships sample a smooth displacement
and recovery over up to three seconds, ending at their existing route goal and
deadline. Inspection reads the same saved curve without replaying displacement.
Explicit motion stops clear knockback, including ordinary zero-speed resets.
NPC miners approach the rock's current position again if it has moved beyond
cutting range. Player mining stops if its target is destroyed or leaves range.

Displaced positions, velocities and angular velocities are saved under
`asteroidMotion.version:1`, keyed by the original global rock ID. Old saves
start with an empty movement map. Positions drift analytically using the saved
simulation clock, including offscreen systems and calendar skips. Pause, hidden
tabs, inventory and warp obey the existing simulation gate. No asteroid artwork
is loaded for drift. Depleted rocks freeze their ore/burst origins and never
respawn automatically.

`sol-asteroids.relocate` moves the authoritative geometry and its spatial-grid
membership together. Mining, targeting, projectile interception, radar and
rendering consume those same positions. Switching saves restores seeded anchors
before applying the new save's poses. Delayed catalog loading retries restoration
once geometry is ready. Painting only reads state, including existing damaged
asteroid artwork for remaining health.

## Verification

The Node regressions cover quarter-health fragment deduplication, arbitrary
weapon strength, exactly-once ore, momentum conservation, small/large masses,
glancing spin, high-speed sweeps, shield/hull boundaries, drift across grid cells,
offscreen movement, pause, independent saves and frozen destruction origins.
Additional checks cover whole-rock momentum/energy, glancing spin, an offscreen
three-rock chain, incoming small/large rocks, continued sideways ship drift,
braking, and deterministic scheduled NPC knockback through JSON restoration.
The production-policy fixture runs 30 minutes with all civilian identities,
funded jobs and unique ore claims, including a midway JSON reload. Legacy economy
fixtures keep their established defaults unless `physics:true` is requested.

`browser-asteroid-physics.py` exercises actual weak beam/disruptor/torpedo models,
all three ship categories with shield/hull art, camera movement and rotated
shield contacts, four real debris samples, and disk save/Continue with velocity
preserved. Incoming 20/70-unit rocks are also tested against player, civilian and
freight ships, along with an actual offscreen three-rock chain. Existing mining,
freight, population, render and map suites remain
required. Screenshots and reports stay under ignored `test-results/`.

A diagnostic six-second Edge comparison used the unchanged 169-ship save
`2878ea104bafcc6a9b05b4840dc776d750c5b8b701c78e005aad82bd1e9d36bb`
at 1280 x 850. Simulation p95 was 0.7 ms before / 0.8 ms after in flight and
0.4 / 0.5 ms on the Dev map. These short samples show the additional contact
work's cost; they do not establish a smoothness improvement or remove previously
documented frame-delivery stalls.

The whole-rock follow-up used the same save and viewport: six-second simulation
p95 samples were 0.6 ms before / 0.5 ms after in flight and 0.3 / 0.5 ms on the
Dev map. These small, noisy samples are diagnostic only; no smoothness gain is
claimed. Functional offscreen-mining checks remain the performance regression
gate for avoiding artwork or pixel work outside the viewport.
