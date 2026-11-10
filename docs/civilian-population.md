# Regional civilian population

The active game and economic startup worker load `civilian-population.js`.
It supplies targets to the existing traffic, repair, docking and economic owners;
there is no additional fleet or separate movement/combat/lighting system.

The current 69 eligible inhabited systems receive 1,200 civilian ships, including
100 Olympic medical ships. Nine large hubs receive 50 ships each, 27 medium
settlements receive 18 each, and 33 small settlements receive eight each. Medical
coverage is included: Sol has eight ships, the other large hubs four each, and
every remaining inhabited settlement one. Sol's nine company freight tugs remain
a separate existing fleet. Empty and permanently excluded systems gain no bases.
Sol's medical crews are spread across its existing ports, including Earth.

If the saved population eligibility differs, proportional integer allocation
redistributes the same targets over eligible bases. Expansion preserves every
existing ship, identity, owned item, balance, cargo, contract, journey and deadline.
Each versioned migration adds only the shortfall; it never deletes excess crews
or replaces destroyed ones. A large pre-existing/custom fleet can therefore exceed
the normal fresh-game target. Repeated initialization/reload grants nothing again.

New normal crews receive 1,200–2,000 credits, recorded once in
`civilianTraffic.population.ledger.initialCapital`. New medical crews receive
15,000 credits and 100 tonnes of initial repair supplies, explicitly recorded in
`shipRepairs.ledger.medicalCapital` and `.medicalInitialSupplies`. Later supplies
use the existing paid purchase or finite mining/refining policies. The original
medical crews keep their balances and material, and gain a regional coverage base.

Crews are placed using shared docking clearance and stagger their first actions.
Medical crews retain existing freight/rescue work, replenish through the normal
policy, and return to regional standby when free. They remain eligible for the
existing nearest available responder selection. Lost crews remain lost.

Major regional ports allow 12 civilian berths, medium ports six, small ports four,
and each existing Sol port six; FIFO holding queues allow three times those
counts. Real clearance, movement, loading and unloading remain mandatory.
Regional market purchasing targets, specialty production and household demand
scale together. Migration grants no new market stock or treasury money and never
changes existing escrow. Subsequent sources/sinks use the existing economic ledger.

Expanded lives admit eight due events per host task. The existing fixed physics,
background debt service and saved deadlines remain authoritative. Economic startup
drains overdue jobs in bounded worker batches before handing its snapshot to flight;
it neither deletes pending jobs nor advances the clock to hide a backlog.
Expanded worlds use the player's 1,024-unit chunk and its eight neighbors as the
active physical area. `ship-detail.js` owns that boundary independently of camera
and map visibility. Traffic plans only for that area, and nearby contacts retain
every physical step through the existing shared geometry and contact owners.
Ordinary distant journeys progress through saved analytical routes and due job
events; their traffic planning and ship/rock encounter checks sleep. This is an
intentional simplification of unobserved encounters, not identical distant physics.
Already launched weapons and physical fragments retain their existing owners.
Crossing a chunk boundary activates the next buffer immediately. Waking samples
the current route and its preceding physical step; a pose cached before sleep
cannot become a collision sweep through the entire sleeping interval. Fleet
identities, cargo, paid jobs, docking leases, deadlines and medical coverage remain.
Tactical steering uses a two-second neighborhood forecast within this policy;
ordinary route planning retains six seconds. Physical contacts and weapon range,
damage, recharge and projectile resolution retain their shared definitions.
Historical fixtures without the active-area policy retain their regional five-Hz
contact/planning behavior, phased across twelve physical steps.
Traffic search limits now come from hulls in the same system. Sparse regions
scan their occupied cells instead of walking large empty grids, retaining the
same cell/insertion ordering and exact distance checks. Snapshot counters
`neighborCellChecks` and `neighborEntryChecks` expose that work.
Only route planning uses the six-second forecast neighborhood. Historical distant contact
discovery starts from actual movers and expands through the shared swept spatial
query to include stationary blockers and connected impact chains. A parked crew
near a future route therefore need not become a collision-search seed now.
The first distant contact sample also recovers the prior authoritative route pose,
so a fast hull crossing a parked ship between samples still produces a swept hit.
Lighting, population and authoritative active physical time remain intact.
Access audits reuse one refuge lookup per occupied system. Nearest-refuge lookup
uses the same exact distance/ID ordering in a single scan, and subsequent audits
observe population or chart edits immediately.
Individual route repairs and player spawn clearance notify `refreshShip` instead
of invalidating every NPC/asteroid membership index. Existing route deadlines,
conservative physical bounds and cached query updates remain owned by the shared
life, motion and target owners.
Mining-claim inspection uses the life owner's existing runtime mining membership,
including ships approaching their assigned rock. Selection and repeated drawing
therefore do not scan the entire saved fleet. No claim, material or mining timer
is duplicated. `mining-claim-index.test.cjs` covers approach, work, collection and
cancellation. Canvas layout measurements are retained until resize, display-mode,
toolbar or pixel-density changes; `browser-frame-reuse.py` checks actual geometry.

The active-region work has **not qualified for 120 FPS gameplay**. A real headed
Brave fullscreen run on the 2,560-by-1,600 display at 120 Hz retained the complete
1,210-record fixture (1,200 civilians, including 100 medical ships, nine tugs and
the player). Twenty-second windows delivered 117.90 FPS in ordinary flight,
117.10 across a chunk boundary, 98.07 in crowded flight and 80.56 in crowded
combat. All four windows failed the qualification criteria, including long frame
intervals; this is not a 120-FPS certification. These figures describe that local
run, not a universal rate. The ignored evidence is
`test-results/performance-review/regions-verified-fullscreen-120.json` and its
`-qualification.json`, with raw frame and startup-recovery files alongside them.
Windows display dimensions and CDP window bounds verify native fullscreen;
the browser-reported screen dimensions differed on this machine.

Historical transaction/159-ship fixtures intentionally retain their original
population. `population:true` in the shared economy fixture loads the production
population policy for migration, coverage, conservation and extended population
regressions. Real-browser coverage also checks the startup worker, ordinary save
and reload, medical distress response, local rendering and the Dev galaxy map.

`active-regions.test.cjs` and `browser-active-regions.py` cover sleep/wake,
negative coordinates, buffered boundary contacts, saved positions, continued
launched shots and complete worker checkpoint/reload. `tools/validate_gameplay_refresh.py`
uses the full saved fleet in the real foreground browser at a supported monitor
refresh, restoring the display mode afterward. It retains raw frames and every
failed window. Its flight, boundary crossing, crowded flight and combat windows
must all meet the recorded frame-delivery and simulation-progress gates before
claiming 120 FPS qualification for that source/browser/device/viewport.
