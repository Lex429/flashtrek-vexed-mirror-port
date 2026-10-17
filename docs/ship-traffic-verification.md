# Ship contact and traffic avoidance

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
