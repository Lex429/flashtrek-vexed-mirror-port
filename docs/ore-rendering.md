# Ore rendering and offscreen mining regression

`asteroid-combat.js` rejects offscreen ore fields, individual pieces, blue ore
shields and collection effects before requesting artwork, sampling pixels or
drawing. Bounds include glow, transport shimmer and flare spill. Culling projects
world positions through the camera zoom into the logical viewport; display pixel
ratio is handled separately by the raster cache.

These are drawing decisions only. Mining completion, ore masks, NPC cargo,
collection deadlines, debris contacts and effect expiry remain in the existing
simulation owners. Looking away does not pause or complete a job. Paint does not
grant ore or alter saved state.

`ore-sprite-cache.js` downsamples ore artwork before applying its colour treatment
and glow. It caches physical display sizes in two-pixel buckets, including the
current canvas transform, artwork identity and collection glow variant. Warm
frames draw the cached surface without filtering the original image again.
The LRU is limited to 128 entries and 4 MB of retained RGBA surfaces. Temporary
downsampling canvases are released after construction. Transport pixel samples
remain shared per source image and are only requested for visible effects.

`node --test tests/ore-rendering.test.cjs` checks early rejection, unchanged saved
rewards, expiry while unseen, edge halos, zoom projection, display-scale cache
invalidation and bounded retention under churn.

`python tests/browser-ore-performance.py` uses the existing 169-ship saved fixture
at 1280×850. Four existing ordinary miners accept local claims through
`npc-lives.js` while the player flies far from their work. Sixty completed ore
fields provide a reproducible accumulated backlog; collection fades are also
queued offscreen. The test asserts:

- NPCs complete mining and collect their four ore units; ore entitlements reach
  zero and the fleet count stays constant.
- The player actually moves while the normal animation and simulation run.
- Offscreen ore painting issues zero image requests, pixel reads, draw calls,
  shield gradients or filter assignments, and does not use/build cached sprites.
- Visible cached ore contains art and glow at 1×, 1.5× and 2× display scale, with
  a cache hit on the second draw. Cold/warm mean channel differences stay below
  0.05 of one 8-bit step, allowing browser GPU/CPU readback rounding.

The scenario runs in CI without machine-specific frame-time thresholds. For
longer comparable measurements, run:

```sh
python tests/browser-ore-performance.py --revision 9388401 --label before --repetitions 3 --seconds 20
python tests/browser-ore-performance.py --label after --repetitions 3 --seconds 20
```

Compare saved-fixture hashes, browser version, viewport and population before
interpreting simulation, rendering, frame interval and stall measurements.
Reports, individual frame samples and screenshots are written to ignored
`test-results/ore-performance-*` files. Historical runs record the old draw work;
only the updated implementation must satisfy the zero-draw assertion.

## Recorded comparison

October 17, 2026, Windows, Edge 155.0.4283.45, 1280×850 viewport, three 20-second
windows per revision, identical 169-ship fixture SHA-256
`2878ea104bafcc6a9b05b4840dc776d750c5b8b701c78e005aad82bd1e9d36bb`:

| Measurement | Before (`9388401`) | Updated |
| --- | --- | --- |
| Mean render CPU per frame, averaged across runs | 9.94 ms | 2.17 ms |
| Frame interval p95, range of the three runs | 116.1–133.4 ms | 12.0–12.2 ms |
| Frames above 50 ms, total across the three windows | 568 | 0 |
| Untimed offscreen probe: image draws | 283 | 0 |
| Untimed offscreen probe: filter assignments | 244 | 0 |
| Untimed offscreen probe: shield/flare gradients | 69 | 0 |
| Untimed offscreen probe: pixel reads | 7 | 0 |

All runs retained the fleet and completed the four miners' collection. Visible
ore passed the display-scale pixel/cache checks. These timings describe this
deliberately ore-heavy scenario on this machine, not a universal frame-rate
guarantee. Simulation CPU per frame also fell as fewer long frames required
catch-up steps; the simulation rules and workload were not reduced.
