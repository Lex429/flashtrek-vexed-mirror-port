# Durable save ownership

`save-storage.js` owns normal/Dev slot selection, immediate durable writes,
read-back verification, failure reporting and bounded combat checkpoint retries.
Purchases, deliveries, travel and explicit saves keep their existing immediate
commit boundaries. Only redundant hit checkpoints use its bounded trailing
queue. The queue holds the authoritative state, not an old serialized snapshot.

Legacy JSON slots remain readable. Fleets with fewer than 512 civilian/company
records retain ordinary slot-version-1 JSON. Larger fleets use slot version 3:
`save-codec.js` compresses fresh JSON with bounded literal/match sequences over
UTF-16 units. Repeated structure is encoded directly without first constructing
another large object graph. This preserves numbers,
Unicode names, cargo, jobs, escrow, owned item identities, conditions, recharge
deadlines, simulation clock and unpaid physics debt. JSON projections are restored
by the existing equipment owner when the game activates, as with legacy saves;
items from different owners are never merged. Runtime spatial indexes are
reconstructed, not saved. The transitional version-2 dictionary representation
also remains readable.

Compressed data has an explicit slot version, a 32-million-unit decoded-text
limit, checked token/length/offset bounds and exact output length. JSON still
rejects cycles on writing; parsing/version validation rejects malformed saves.
The version-2 decoder retains its graph/reference limits. Failed writes remain
honest failures. The legacy
recovery copy is retained, and a normal slot cannot be resumed as Dev or vice
versa. A versioned decoder change is required before changing the stored format.

Packing increases usable quota; it does not make saving asynchronous. Large-save
serialization can still cause a main-thread hitch. Measure fresh serialization,
storage and verification separately through `nativeSaveStorage.metrics()` after
clean timing samples. Never add component costs to their inclusive total, cache
unverified snapshots, or delay required transactions to obtain a lower number.

Run `large-save-codec.test.cjs`, `combat-save.test.cjs`, equipment/economy suites
and `browser-foundation.py`. The latter reloads 5,000 records through the actual
game and verifies retained jobs, fractional cargo, equipment, owned cooldowns,
transactions and pending physics debt. Use isolated browser storage for testing;
never replace the player's normal save with a profiling fixture.
