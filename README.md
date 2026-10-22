# FlashTrek: Vexed Mirror Port

Browser port of FlashTrek: Vexed Mirror, extracted from the local Games Hub.

## Play locally

On Alex's Windows computer, open **http://127.0.0.1:7790/** or the **Vexed Mirror** desktop shortcut. The **Vexed Mirror Local Site** scheduled task starts the loopback-only server and background Git sync at sign-in. This is a standalone local website; it does not require Games Hub or public hosting.

The served project is `C:\Users\alphi\Vexed-Mirror-Port-GitHub`, connected to `Lex429/flashtrek-vexed-mirror-port`. Edit this folder to update the standalone game. The older Games Hub copies are separate installations.

Local changes wait for 60 seconds without edits, then the sync service runs its own integration tests, all Node regressions and the browser smoke suite before committing and pushing to GitHub `main`. New GitHub commits are pulled automatically after their `regression` Actions check passes. Refresh the game after an update. Existing browser saves are not uploaded, and saved game schemas remain unchanged. The old Games Hub's browser saves remain at its original address; browser storage is separate at the new address.

If GitHub and local work both advance, checks fail, someone stages a manual commit, or the working branch changes, synchronization pauses instead of discarding work. Resolve the cause to resume; after a failed test, editing the affected files or restarting the task retries the checks. No reset, stash, rebase, force push or automatic conflict resolution is used. Logs and current status are outside the repository in `%LOCALAPPDATA%\VexedMirror`; `http://127.0.0.1:7790/__vexed/status` reports the current phase. Stop/start the scheduled task to pause/resume the entire local service.

For another computer, serve this folder over HTTP and open `html-games/broken-mirror-port/index.html`. For a local server without synchronization:

```sh
python tools/local_site.py --serve-only
```

Open `http://127.0.0.1:7790/`. To enable synchronization, omit `--serve-only`; GitHub CLI authentication and the test dependencies below must already be installed.

The `flashtrek-broken-mirror` folder contains artwork, audio, data, and JavaScript shared by the browser port. The original Flash builds and development previews are excluded.

## Combat and effects

Live flight uses retained GPU shields: a bright contact flash, a clean cyan
outline and an expanding energy wave, with an orange shield-collapse animation.
Player ships and NPCs use the same shared impact events. Normal ship lighting,
protection, damage, interception, contact geometry and saves keep their existing
owners. Devices without WebGL2 retain the existing Canvas shield effect.
The [100-ship demonstration](demos/shield-gpu/index.html) isolates rendering with
**ship lighting OFF**; its results do not establish 120-FPS battles. See the
[shield integration and verification notes](docs/gpu-shields.md).

Inventory now displays and fits the current hull's weapon, repair-drone, ability,
engineering and shield bays. The Olympic has six drone bays for players and NPCs.
Hull changes preserve owned equipment in fitted bays or the locker; buy additional
Dots at a port instead of receiving free equipment with empty slots. Normal and
Dev games have separate Continue buttons and save slots. See the
[shared hardware and registration guide](docs/unified-ships.md).

All flight ships render above planets. Weapon shots collide with the first ship, asteroid, or registered destructible object in their path, including when the original target moves away or disappears. Armed civilian ships can return fire against the actual attacker.

Hold **Space** to keep firing at the selected target as owned weapons recharge.
Click or tap **Shift** to select a target without releasing throttle or steering;
attacking ships lead the cycle, which still includes neutral ships and asteroids.
Hold Shift to clear the target. Changing or losing the target stops held firing.
The target status shows fitted weapon ranges, recharge and other firing failures.
Phasers can fire behind the ship and stop at the first physical shield or hull.

Civilian crews notice live projectiles after a reaction delay and choose movement
from their weapons, damage, surroundings and saved crew traits. Loaded cargo crews
and medical crews prioritize escape, retaining valid jobs, cargo and escrow through
combat, repairs and reloads. Their movement and weapons use the same statistics
and shared systems as the player.

The port and [damage showcase](html-games/flashtrek-broken-mirror/damage-showcase.html) use the same phaser, disruptor, and torpedo renderer. Explosion pressure and flying wreckage trigger shield flashes or hull sparks without reducing ship health. Nearby asteroids can be destroyed by these environmental impacts.

Ships now share definitions, movement, owned weapon recharge, firing, target collisions, damage and animation systems. Controllers choose jobs and commands. See the [ship system contract](docs/ship-system-contract.md) for ownership, extension examples, coordinate/time conventions and save migrations. [AGENTS.md](AGENTS.md) records the rules for future changes.

Civilian lives and Sol freighters retain their saved identities, tasks, cargo and recent history. Stock-backed deliveries travel between systems using saved routes and deadlines; distant lives progress through bounded scheduled events. The Dev galaxy inspector searches individual ships, tracks their authoritative positions and moves only the observer when inspecting locally. See the [life contract and delivery walkthrough](docs/npc-life-contract.md).

## Verification

Run the deterministic combat and rendering tests with Node.js:

```sh
node --test tests/*.test.cjs tests/*.test.js
```

The browser checks use Python, Playwright, and Microsoft Edge. They start an isolated local server and browser profile, verify ship layering and actual collateral damage, and exercise shielded and unshielded showcase explosions:

```sh
python tests/browser-smoke.py
python tests/browser-ship-contract.py
python tests/browser-npc-lives.py
python tests/browser-civilian-tactics.py
python tests/browser-combat-controls.py
python tests/browser-galaxy-controls.py
python tests/browser-regional-mining.py
python tests/browser-ore-performance.py
python tests/browser-civilian-access.py
python tests/browser-render-paths.py --visual-only
python tests/browser-stability.py
python tests/browser-ship-lighting.py
python tests/browser-cold-ship-loading.py
python tests/browser-review-gameplay.py
```

The second browser suite checks real Canvas beam emitters and target contacts across ship roles, camera movement, custom shield shapes, pause/inventory and projectile save/load. Job regressions also simulate tug deliveries, civilian mining/trading and saved player mining without any rendering.

Install Python test dependencies with `python -m pip install -r requirements-test.txt`. Pass an existing server URL, such as `http://127.0.0.1:7788`, to either browser script to check an installed copy. Browser reports and screenshots are written to the ignored `test-results` folder. Windows uses installed Microsoft Edge by default; set `BROWSER_CHANNEL` to an empty value to use Playwright Chromium after `python -m playwright install chromium`.

The [test workflow](.github/workflows/test.yml) runs the Node and local-site suites, all gameplay browser regressions, player lighting/warp pixel checks and cold damage-art preparation checks on pushes and pull requests. It uploads reports as artifacts.

Record a comparable scheduling benchmark with `python tests/browser-npc-performance.py --help`. Its before/after runs use the same saved population, viewport and browser. Measurements are diagnostic rather than machine-independent timing thresholds.

Use `python tests/browser-combat-performance.py --help` to measure sustained-hit
frame delivery and verified save costs with the same saved fleet and equipment.
Redundant hit checkpoints coalesce for up to one second; explicit saves and
required transaction/travel saves remain immediate.

The [ore rendering regression](docs/ore-rendering.md) covers offscreen NPC mining
while the player flies elsewhere, early ore/effect culling and the bounded cache
for visible ore glow. It checks gameplay completion and draw work alongside frame
timings; use `python tests/browser-ore-performance.py --help` for comparison runs.

The stabilization benchmark is `python tests/browser-stability.py --measure`: three 20-second windows each of flight, crowded combat, mining/debris, warp and the Dev map, plus cold/warm artwork probes. Use `--revision c41559c --label before` and then `--label after` with the same saved fixture. See [performance evidence](docs/npc-performance.md) for measurements and remaining bottlenecks; lower simulation CPU alone does not establish smoother frame delivery.

Use `python tests/browser-render-review-performance.py --help` for separate cold
appearance and repeated flight/combat measurements, including a crowded scene
using 12 existing fleet members. It records source hashes, fixture hashes, frame intervals, canvas
allocations, animated-effect rebuilds and image/preparation phases. Serve the same
immutable baseline with `--source-root` and keep timing runs sequential. See the
[rendering review results](docs/render-review-results.md) for the measured scope
and remaining stalls.

The [Earth traffic recovery report](docs/earth-traffic-recovery.md) covers shared
player/NPC market settlement, non-exploitable lot quotes, actual Sol destination
ports, exclusive berths and the recovered 36-ship saved traffic jam. Run
`python tests/browser-earth-jam.py` for the local/Dev-map and real market UI checks.

In **Dev tools → View whole galaxy**, drag to pan and scroll or use **+ / −** to
zoom. Click a numbered group to open its ships, or use **Find a ship**. The right
panel shows only the selected ship's current activity, destination, cargo,
docking status and recent events. **Follow ship** keeps it centered; dragging
stops following. **Fit galaxy** restores the overview. Extra ship details and
**View in flight** are inside **More ship details**.

All 52 systems now have regional asteroid belts, local mining and funded mineral
refineries. The Mining shop and system Market explain each region's richest ores,
offer **Find an unclaimed asteroid**, and install mineral-funded ship upgrades.
See the [regional mining guide](docs/regional-mining.md) for ore balance, technology,
NPC jobs, save compatibility and verification.

[Civilian destination rules](docs/civilian-access.md) exclude Dyson, Pirates Haven,
Harman, Kardon and Vex. Other empty systems receive mining expeditions only;
civilian bases, refineries and trading use inhabited worlds.
