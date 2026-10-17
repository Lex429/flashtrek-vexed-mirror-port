# Hull contact and shield clearance

Baseline: `bb63e51`, 2026-10-17. Physical contact previously used the larger
shield surface while shields were charged, including NPC clearance prediction.

Ship descriptors now distinguish `hullRadii` from combat `radii`. Hull geometry
belongs to `ship-definitions.js`; `ship-motion.js` uses that physical footprint
for ship pairs, inertia, asteroid/fragment contact and traffic bounds. Combat
continues to select shields while charged and hulls after shield depletion.
Raw motion fixtures without `hullRadii` retain their explicit `radii` fallback.

NPC clearance combines both hull bounds, a six-unit minimum gap, relative-speed
padding up to 24 units and turn room. Slow traffic can fit through tighter spaces;
fast traffic retains predictive passing/yielding. The existing task owners keep
berth leases, cargo reservations and actual revised arrival deadlines.

Physical dispatchers mark their effects `physicalContact`. The shared effect owner
projects these onto the hull and stores a separate 180 ms contact glint, with a
160 ms admission interval per ship. It paints only in the front pass, attached to
the ship's local pose, capped at three display pixels in radius under scene zoom.
It emits no damaging fragments or whole-shield surface and cannot overwrite a
weapon flash. Damage, weapon shields and blast effects retain
their existing owners and behavior. Contact never subtracts ship health.

## Verification

`hull-navigation.test.cjs` covers shield-charge-independent hull dimensions,
overlapping shield passage, swept off-center hull contact, preserved momentum,
asteroid/debris hull contact, speed-sensitive NPC clearance, and independent
collision/weapon visual lifetimes. Existing asteroid, traffic and real-key browser
checks exercise each registered ship role and camera/heading attachment.

All six new navigation cases reproduced their respective failures on the baseline.
The corrected source passes all 212 Node tests, including the 30-minute civilian
and legacy economy runs, production asteroid physics across save/reload, shared
weapon alignment, funded arrivals and preserved cargo/ore entitlements.
All 13 browser suites passed. The real-key passage travels from x=5800 to x=6326
between two parked tugs at y=5980 and y=6020, with no contact or displacement;
the player's hull remains at y=6000. Their larger shield boundaries overlap.
Actual 150-unit/s end hits still transfer 3.75 times the initial push and spin
of equivalent 40-unit/s hits. The native flight renderer verifies the contact
position and three-pixel display limit; ordinary weapon shield alignment also
passes. Baseline logs are `hull-before-node.log` and
`traffic-hull-baseline-browsers.json`; final logs are `hull-after-node.log` and
`traffic-hull-after-browsers.json` under ignored `test-results/`.

## Performance comparison

Both versions used the same saved 169-ship population (159 civilians, nine tugs
and the player), Edge 155.0.4283.45 and 1280 by 850 viewport. Initial save SHA-256:
`2878ea104bafcc6a9b05b4840dc776d750c5b8b701c78e005aad82bd1e9d36bb`.

The first baseline recorded flight/map mean simulation times of 1.70/1.03 ms;
the initial changed-source sample recorded 6.07/3.35 ms. An immediate rerun of
the unchanged `bb63e51` also recorded 6.74/3.40 ms, with the same slower browser
frame cadence. This made the original samples unsuitable for attributing a
regression to the code. No runtime changes were made during this investigation.

The adjacent confirmation pair recorded flight mean/P95 of 6.74/15.50 ms before
and 6.25/13.00 ms after; map mean/P95 was 3.40/8.80 ms before and 3.10/8.60 ms
after. Save hashes, population, browser version and viewport match. Short samples
vary with Windows/browser frame delivery and do not establish an improvement;
flight frame stalls remain. All four reports are preserved under ignored
`test-results/npc-performance-hull-*.json`, including `hull-confirm-before` and
`hull-confirm-after` and their per-frame samples.

Generated reports, screenshots and local installation backups stay outside Git.
