# Speed, impact position and player recovery

Baseline: `9156dc6`; verified on 2026-10-17.

The previous ship-pair solver already scaled linear impulse with closing speed,
but it did not apply angular impulse at the point of contact. Off-center hits
could only translate the other ship. A separate control issue was reproducible:
collision drift persisted unchanged even while the player steered or applied
thrust. Actual WASD and arrow keys worked in clear space before this correction.

The shared solver now includes both moments of inertia, contact-point velocity
and lever arms. Faster hits transfer more momentum. End hits turn a ship, mirrored
hits reverse that turn, and centered hits mostly push it straight. Contact keeps
health, shield charge, cargo, money and reputation unchanged.

Collision spin is saved independently of commanded turning. Idle ships rotate
and damp through shared motion; scheduled ships sample their saved rotation with
their route and gradually recover alignment. Rerouting rebases the spin without
replaying its previous displacement. Inspector/paint poses agree with physics.

Steering and thrust now counter residual collision drift, and braking damps it
more strongly. Unpowered coasting retains linear momentum. Normal manual speed,
acceleration, braking and turn profiles remain unchanged; no AI steers the player.

## Regression coverage

`impact-controls.test.cjs` checks a small ship striking a heavier tug at 50 versus
300 units/s, centered versus end hits, mirrored/rotated geometry, conservation of
linear and angular momentum and non-increasing kinetic energy. It also checks
manual recovery, free coasting, braking, pause, saved spin, sampling idempotence,
departure with existing spin, real contact dispatch and preserved cargo/health.

`browser-impact-controls.py` sends actual W/A/D/S and arrow-key input through the
host frame loop. It repeats the controls after a real off-center ram and verifies
that braking stops the ship and its spin. A 150-unit/s hit produces 3.75 times
the tug's initial push and angular velocity of the equivalent 40-unit/s hit.
Native shield flashes remain attached to the rotating hull under the game's
uniform scene scaling. Screenshots and JSON stay in ignored `test-results/`.

Existing combat, asteroid/debris, cargo conservation, docking, regional mining,
map controls, ore rendering and 30-minute population checks remain required.
All 206 Node tests and all 13 browser suites passed locally, with the strengthened
spinning-body conservation checks also rerun. CI runs the new browser scenario
with the existing suites. Optional `browser-impact-controls.py BASE_URL --hub`
exercises the installed Games Hub iframe and the return from Dev map to flight.
That installed scenario and the separate live map-controls driver both passed.
Runtime HTTP checks cover game files; the Hub's unrelated missing catalog
thumbnail is outside this scenario. Initial concurrent Hub startup checks timed
out; standalone reruns loaded the game and passed without JavaScript errors.

## Performance evidence

The same initial saved 169-ship population, 1280 × 850 viewport and Edge
155.0.4283.45 were used before/after. Save SHA-256:
`2878ea104bafcc6a9b05b4840dc776d750c5b8b701c78e005aad82bd1e9d36bb`.
The full physics timer, including ship contacts, recorded flight simulation mean /
P95 of 2.29 / 6.70 ms before and 1.35 / 3.80 ms after, and map mean / P95 of
1.14 / 2.00 ms before and 1.05 / 1.90 ms after. These short samples vary with
frame delivery and traffic poses; they do not establish a performance improvement.
Flight intervals still have stalls outside the simulation callback. Raw reports
are `npc-performance-impact-controls-before.json` and
`npc-performance-impact-controls-after.json` under ignored `test-results/`.
