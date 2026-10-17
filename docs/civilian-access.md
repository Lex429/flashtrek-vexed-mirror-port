# Civilian destinations and mining-only visits

Civilian ships never spawn, base, trade or select journeys at these systems:

| System | ID |
| --- | --- |
| Harman | 32 |
| Kardon | 33 |
| Vex | 34 |
| Dyson | 51 |
| Pirates Haven | 52 |

The exclusions override population changes, colonization and the presence of
asteroids. They apply to civilians; asteroid belts and player navigation remain
available.

Other systems use their saved, current population counts (falling back to saved
population figures or original world data). Civilians base and trade only at
permitted inhabited worlds. A change from inhabited to empty triggers a policy
audit. Empty systems do not receive civilian markets, household consumption,
manufacturing, parking or ordinary freight destinations. Existing saved market
stock and treasury data are retained, without running civilian commerce there.

## Mining trips

Miners normally work near their inhabited base. Periodically they consider the
three nearest permitted empty systems within 100 chart units, or use those belts
when local resources are exhausted. A trip requires an actual intact, unclaimed
asteroid, cargo room and an inhabited buyer with purchasing funds and demand.
The original legacy `asteroids` map flag is not used as a substitute for actual
regional belt geometry.

The task reserves the asteroid before departure. `mining-transit` records the
journey directly to that rock, followed by the existing approach, cutting and
collection phases. Four ore entitlements become owned cargo once, then the ship
returns through an ordinary saved journey to an inhabited refinery. No imaginary
port or buyer is created at the empty world. If the reserved rock is depleted
before arrival, the crew returns to its inhabited base rather than parking there.
Save/reload and pause retain the same task, claim, cargo and deadlines.

## Existing saves and new fleets

The existing fleet's IDs, hulls, equipment, cargo and money remain intact. New
games retain the same 159 civilian identities; seed slots formerly assigned to
excluded or empty worlds are assigned to nearby permitted inhabited bases.

On load, old residents at excluded worlds and non-mining residents at empty
worlds are relocated immediately to a permitted inhabited system. Unsafe old
contracts release their stock, demand and payment reservations without paying
again or deleting carried cargo. Invalid homes/bases and inbound destinations
are repaired. Valid mining trips continue. The migration does not mine new
rocks, restore depleted rocks or duplicate deliveries.

`civilian-access.js` owns pure eligibility and geography. `civilian-traffic.js`
uses it for initial placement. `npc-lives.js` owns the migration, destination
checks, jobs, claims and transactions. `port-docking.js` chooses clear refuge
positions through its existing hull-aware bounded search; one-time policy
relocations do not consume the normal per-frame docking job budget. Activation
applies the policy before the first save or render.

Asteroids have **no automatic respawn**. Their stable IDs remain in the saved
mined/destroyed lists, and depleted belts remain depleted after reload. This
change does not alter that behavior.

## Verification

`node --test tests/civilian-access.test.cjs` checks initial placement, permanently
excluded destinations, old funded/loaded contracts, conservation, repeated reload,
refuge clearance, outbound and return mining saves, pause, depletion, population
changes and thirty minutes of full-fleet work. In that simulation, the six other
empty systems (Paso, Gorn, Denmark, Iconia, Konae and Xonok) receive actual mining
visits; the five excluded systems receive none.

`python tests/browser-civilian-access.py` checks the ordinary Dev galaxy view,
old-save relocation without cargo or money loss, and a mining expedition that
reloads at an empty asteroid belt and delivers its ore to an inhabited buyer.
Pass a server URL to test an installed copy. The test runs in CI. Existing economy
fixtures default to their legacy policy; use `{regional:true, access:true}` for
current civilian destination and expedition behavior.

Run `python tests/browser-npc-performance.py --label NAME` before and after with
the same saved population and viewport. Reports/screenshots belong in ignored
`test-results`, not source control. Policy changes are not evidence of a frame
rate improvement, and fleet reductions must not be used to claim faster work.

The October 17, 2026 diagnostic and repeat used Edge 155.0.4283.45, 1280×850,
the same 169-ship save (SHA-256 beginning `2878ea104bafcc6a`), and six-second
windows. Before flight simulation p95 was 0.5–0.6 ms; after it was 0.6–1.4 ms.
Flight frame-interval p95 was 30.3 ms before and 30.3–48.6 ms after. The repeat
matched 30.3 ms on both revisions. Dev map frame p95 stayed at 6.2–7.1 ms;
scheduler backlog remained zero. The short-run variability and occasional flight
stalls remain, so these measurements do not establish a smoothness improvement.
