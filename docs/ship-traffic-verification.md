# Ship contact and traffic avoidance

October 25 recovery fix: stopped pilots can leave an extra clearance margin
without requiring pre-existing outward velocity. Incoming momentum still brakes
and the hull turns toward a clear exit before accelerating. The same physical
contact owners continue to resolve actual hits.

Normal scheduled traffic now distinguishes its broad cruising gap from the last
braking segment into an adjacent clear destination. That segment must retain a
six-unit gap outside the combined physical hull circles. Parked obstacles are
included once in the fallback detour; the fallback uses the same clearance as
the initial detour. Previously a duplicated, larger parked-hull obstacle could
make a clear destination unreachable and repeatedly extend a yielding route.
Genuinely blocked destinations still wait and retain their cargo/reservations.

The regression places a normal NPC beside a planet and a parked ship, with
70/90/110-unit clear destination offsets. Before the fix it repeatedly yielded
without finishing; after the fix all three arrive without ship contact or
changing their task, cargo or credits. Browser coverage repeats adjacent arrivals
with both `devMode` values and checks blocked delivery/save/reload, ordinary
head-on traffic, physical contact pixels and actual keyboard controls. The 7788
installation now uses the same shared avoidance decisions, obstacle queries and
scheduled detour recovery, while retaining its existing physical integration
and surrounding game. Its broader AI remains a separate build.

Verification for this recovery change: 44 Node regressions passed, including
the simulated 30-minute economy; native browser traffic/contact and real-key
impact-control checks passed. In the audited Earth jam, all 36 stuck ships moved
and delivered during each 30-minute local/map replay, with zero scheduler
backlog. `test-results/earth-jam-browser.json` retains those observations.
The five-second headless performance windows reused the same saved population,
browser and 1280x850 viewport. Mean simulation CPU was 4.11 to 4.45 ms in flight
and 4.63 to 5.18 ms on the map; median simulation CPU was 2.20 to 2.10 ms and
2.60 to 2.50 ms respectively. These short, noisy measurements are not an FPS
improvement claim. Raw comparisons are in
`test-results/ship-traffic/performance-avoidance.json`.

October 25 publication integrates the frozen local build with GitHub's newer
civilian crew tactics, live projectile awareness, held-fire controls, retained
spatial queries and fixed simulation scheduling. The combined browser Earth-jam
replay again moved and delivered all 36 ships during both 30-minute scenarios,
with no waiting-payment ships or scheduler backlog. Constitution 426/427 passed
actual keyboard flight, firing, all three damaged appearances and saved fitting
reload. GPU lamps passed 144 Canvas comparisons, including damage suppression.

The merge also retains inventory/shipyard callbacks and inventory clock-gate
notifications. Brief movement taps survive between physical steps. Sol freight
painting is restricted to Sol so jumping to another system cannot terminate the
flight renderer. Both expanded 5,000-ship save slots round-trip through bounded
VM4 storage encoding; older JSON, VM2 and VM3 saves remain readable. This extends
storage representation only; it does not drop gameplay fields or change durable
transaction boundaries. Browser checks distinguish semantic saved data from
JavaScript object property order. Synthetic 60/120/144-Hz checks verify equal
physics and clock gating, not delivered monitor FPS.

October 20 follow-up: ordinary civilian jobs and company freight now build
routes around planet and asteroid clearance, using bounded visibility planning.
Every proposed passing segment is checked against the combined obstacles.
Legacy straight legs are rechecked; displaced rock geometry invalidates that
check. Berths exclude intact rocks. A blocked remote mining approach retains
its resources and returns home through the task owner instead of idling at an
empty world. Task rerouting keeps the real arrival deadline and economic escrow.

New-player insertion uses the actual world viewport and a clear point beside
existing continuing traffic. It does not move or create a crew. New-world
history receives the real presentation metadata in its worker and checks all
six active hull/category dimensions against the main definitions before use.
Physical contact uses the definition-owned hull regardless of shield charge;
weapon interception retains the powered shield boundary.

Combat steering checks actual closing velocity as well as its desired heading,
then applies shared planet/rock avoidance last. A safe desired heading cannot
waive braking against existing momentum. Ordinary traffic gives the manual
player additional clearance. Sudden player turns can still cause physical
contact; avoidance does not make the player immune to collision.

Controller ownership audited in this browser port:

| Controller | Route or intent owner | Avoidance and contact |
| --- | --- | --- |
| Civilian freight, trade, mining, courier and patrol jobs | `npc-lives.js` | shared scheduled traffic |
| Company freight | `sol-economy.js` | shared scheduled traffic |
| Disputes and retaliation | `civilian-combat-ai.js` | shared velocity prediction, then body/rock steering |
| Olympic response and repair drones | `npc-lives.js`, `ship-repairs.js` | shared scheduled traffic, physical service clearance |
| Player | manual input | shared contact; AI yields around the player |

This port has no independent follower/escort controller. The old Flash
controller's individual follower stations are a useful reference, not an
existing browser-port fleet to replace. Service craft already use distinct
physical work points and the shared `serviceApproach` rule.

The local Rebirth-derived `source/vexed-mirror/flight-controller.as` reference
reduces thrust with closing clearance, passes consistently, remembers its
passing obstacle and brakes toward a hull-sized target stand-off. This port
uses its existing shared owners for those ideas. Its bounded spatial queries
and fully checked saved detours avoid importing a second movement loop,
global per-frame scans or overlap position nudges.

Current regression additions live in `startup-navigation-recovery.test.cjs`
and `ship-traffic.test.cjs`; real controls, economic settlement and actual
Canvas contact checks remain in the existing browser suites. The Desktop
October 20 checklist records the final device-specific measurements.

Verified on 2026-10-17 against baseline `11b736a`.

The existing player, civilian fleet and Sol company tugs now exchange momentum
when their active shield/hull surfaces touch. Contact preserves health, cargo,
money and reputation, and uses the native shield flashes or hull sparks. Weapons,
mining and the asteroid environmental health floor keep their existing rules.

Traffic predicts relative closest approach, passes to starboard, and yields using
mass and stable identity priority. Braking precedes a yielding hold. A ship waits
if its final destination is occupied and resumes when it clears; the player stays
manual. Traffic is best effort: sudden player maneuvers or existing overlapping
hulls can still produce physical contact.

Detours and holds are saved movement segments, with the original destination and
the task owner's revised arrival deadline. Cargo handling still requires actual
berth arrival. A version-2 straight route remains readable, and a version-3 detour
survives JSON restoration. Inspection explains passing/yielding without changing
the selected ship or preparing distant artwork.

## Verification

Baseline: 188 Node tests and all 11 existing browser suites passed. The modified
clear-space movement and Earth-jam browser fixtures were also checked against
the exact baseline source after their updates.

After implementation: all 201 Node tests and all 12 browser suites passed. Final
focused reruns also passed after the last owner/inspection changes. Coverage
includes:

- Swept high-speed contact, glancing deflection, relative mass, momentum and
  dissipated energy; rotated hulls and distinct shield surfaces.
- Head-on and crossing routes, four simultaneous crossing pilots, parked player
  avoidance, smooth braking and a five-minute blocked-destination hold.
- Pause, read-only inspection, JSON restoration, offscreen avoidance without art
  preparation, and unchanged fleet identities.
- A real funded delivery blocked by the player: no early unloading, cargo/escrow
  retained through restoration, then one settlement at the real destination.
- Real browser frame wiring and native contact pixels for player/civilian,
  player/tug and civilian/tug pairs with shields active and absent; attachments
  remain aligned as the ships turn. The selected-ship panel explains yielding.
- Thirty simulated minutes of the production regional population with asteroid
  and ship physics, with restoration halfway through. Funded work continues in
  both fifteen-minute intervals and ore entitlements stay unique.
- The audited 36-ship Earth jam with traffic physics enabled, observed both
  locally and through the map for thirty simulated minutes: all 36 ships move,
  reroute and deliver; no payment wait or scheduler backlog remains. The saved
  population remains 159 civilians and nine company tugs.
- Existing combat, beam attachments, market conservation, docking, galaxy
  controls, regional mining, civilian exclusions, ore culling, render paths and
  cold-art/pause checks.

The shared ownership and saved schemas are documented in
[the ship system contract](ship-system-contract.md). CI runs the new Node/browser
checks alongside the existing suites. Generated profiles, screenshots and raw
reports remain in ignored `test-results/`.

## Performance measurement

The timer now closes after the final physics dispatcher, including contact work;
the same correction is applied when serving the baseline. Older measurements
ending at `asteroid-combat.advance` omit later physics and are not comparable.

Serial six-second flight/map windows used the same 169-ship saved population,
1280 × 850 viewport, Edge 155.0.4283.45 and device. Fixture SHA-256:
`2878ea104bafcc6a9b05b4840dc776d750c5b8b701c78e005aad82bd1e9d36bb`.

| Measurement | Baseline | With traffic |
| --- | ---: | ---: |
| Flight simulation mean / P95 | 0.72 / 1.40 ms | 1.24 / 3.90 ms |
| Map simulation mean / P95 | 0.58 / 0.90 ms | 0.84 / 1.40 ms |
| Flight frame interval P95 | 30.5 ms | 36.2 ms |
| Map frame interval P95 | 6.2 ms | 6.2 ms |

Traffic adds CPU work. The first implementation measured 1.74 ms mean / 5.30 ms
P95 flight simulation; sharing ship descriptions within a physics step, reusing
geometry for the simultaneous snapshot, rejecting pairs by their swept circles
and precomputing contact axes reduced that cost. Invalidation after displacement,
shield changes and the next step remains covered by regression tests.

These short windows do not establish a frame-rate improvement. Flight frame
delivery still has stalls outside the simulation callback; its measured P95
interval increased in this pair even though its mean interval decreased. Raw
reports are `npc-performance-traffic-final-before.json` and
`npc-performance-traffic-optimized-after.json` under ignored `test-results/`.
