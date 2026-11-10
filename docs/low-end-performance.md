# Low-end device performance target

Vexed Mirror should be usable on a basic Chromebook with integrated graphics.
The proposed hardware target is a 4 GB device at 1366 x 768. This is a development
target, not a measured minimum requirement or a claim of Chromebook support.
Aim for steady 30 FPS on that device, with 60 FPS where resources allow.

The first repeatable diagnostic uses the full production save at pixel density 1,
with the host renderer CPU slowed by a factor of four. It keeps the same ships,
simulation, trading, weapons, sounds and artwork. It does not add a gameplay
quality setting or remove features to obtain a better result.

## Repeatable CPU screening

Run the performance review sequentially, without other benchmarks. Use the same
source snapshot and save for both commands. If the save path is new, the first
command captures a fresh Dev game in an isolated browser profile. Do not use a
historical small-population fixture in place of the current production fleet.
Initial game startup and artwork readiness run before CPU throttling. The slow
setting applies to subsequent setup, active recovery, and measured gameplay;
this diagnostic does not measure loading on a slow device.

```powershell
python tests/browser-performance-review.py --label low-end-baseline --fixture test-results/performance-review/low-end-save.json --width 1366 --height 768 --dpr 1 --seconds 8 --runs 2 --active-warmup 3 --scenarios flight,crowdedFlight,crowdedCombat,miningDebris,devMap --warm-only
python tests/browser-performance-review.py --label low-end-4x --fixture test-results/performance-review/low-end-save.json --width 1366 --height 768 --dpr 1 --cpu-slowdown 4 --seconds 8 --runs 2 --active-warmup 3 --scenarios flight,crowdedFlight,crowdedCombat,miningDebris,devMap --warm-only
python tools/check_low_end_performance.py test-results/performance-review/low-end-4x.json
```

Use `--source-root` for a frozen game snapshot. The review records game source
hashes, fixture hashes, actual fleet size, graphics information, and the CPU
slowdown applied to each fresh browser page. The existing default slowdown is 1,
so ordinary performance runs retain their previous behavior.

The screen requires two eight-second windows for ordinary flight, crowded
flight, real NPC weapon combat, asteroid destruction/mining debris, and map use.
Each window must retain the full fleet and meet these criteria:

| Measurement | CPU screen target |
| --- | --- |
| Average frame delivery | At least 29.5 FPS |
| 95th-percentile frame interval | At most 35 ms |
| 99th-percentile frame interval | At most 67 ms |
| Frame stalls over 100 ms | None |
| Simulation progress | At least 98% of measured active wall time |
| Outstanding physical simulation time | At most 0.1 seconds |

Startup recovery is recorded separately, must preserve accepted simulation time,
and must recover its outstanding physical time. At least 1,000 entities are
required by the current screen; a fresh production fixture currently contains
1,210. A reduced fleet or inactive combat cannot pass as a full-game result.
The review's `passed` field means the run completed without browser errors; the
separate `-screen.json` result evaluates the timing and simulation criteria.

## Real hardware confirmation

CPU slowdown is relative to the host processor. It does not reproduce a
Chromebook's integrated GPU, available RAM, ChromeOS, thermal limits, or browser
process behavior. Headless timings do not prove foreground display smoothness.
The screen always records `hardwareSupportConfirmed: false`.

Before publishing a minimum requirement, run the same workloads on an actual
basic Chromebook in foreground Chrome. Record its model, CPU, RAM, ChromeOS and
browser versions, viewport, source/save hashes and power conditions. Include
loading from a cold browser, sustained flight and combat, busy ports, map/cargo
controls, warp, sound playback, and save/Continue. Measure process and graphics
memory as well as JavaScript heap; a 4 GB label or a spoofed browser property
does not enforce a real memory budget. A longer session must also stay
responsive without growing memory or simulation debt.

If performance requires adjustable effects, retain the same authoritative
physics, contracts, stocks, ship identities and save behavior. Measure any
proposed visual setting on the device before claiming it solves the problem.

## Initial diagnostic, 2026-11-10

The initial frozen game snapshot and fresh save retain 1,210 entities. The
unthrottled baseline completed all five scenarios without browser errors.
With a 4x CPU slowdown after artwork readiness, the two ordinary-flight windows
delivered approximately 9.4 and 6.5 FPS. Their final simulation backlogs were
7.8 and 8.8 seconds. Those results fail the CPU screen and do not establish
whether any particular Chromebook can run the game.
All ten slowed gameplay windows completed without browser errors or failed
requests, using the same game source and save hashes as the baseline. All ten
missed the screen criteria; crowded combat delivered approximately 4.4–5.9 FPS.

Both rendering and simulation consumed substantial wall time in the slowed
windows. These instrumented measurements identify a performance problem to
investigate; they do not isolate a particular function or measure GPU capacity.
No gameplay, population, or visual-quality changes were made in this audit.

The first experiment also applied CPU slowdown before initial artwork readiness.
It timed out waiting for all optional effects to become ready after 120 seconds.
That failed artifact is retained separately. The gameplay diagnostic deliberately
separates initial loading from active-play measurements, and real-device loading
remains a required check.

Local evidence is under `test-results/performance-review/`: the
`low-end-baseline-20261110.json`, `low-end-4x-20261110.json` (failed initial loading
experiment), and `low-end-4x-gameplay-20261110.json` reports, with raw frame files,
run logs and the separate `-screen.json` verdict. These are generated local
artifacts, not repository assets or a Chromebook compatibility certificate.
