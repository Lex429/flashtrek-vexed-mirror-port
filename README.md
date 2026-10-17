# FlashTrek: Vexed Mirror Port

Browser port of FlashTrek: Vexed Mirror, extracted from the local Games Hub.

## Play locally

Serve this folder over HTTP, then open `html-games/broken-mirror-port/index.html` in a browser. For example, with Python installed:

```sh
python -m http.server 8000
```

Open `http://localhost:8000/`.

The `flashtrek-broken-mirror` folder contains artwork, audio, data, and JavaScript shared by the browser port. The original Flash builds and development previews are excluded.

## Combat and effects

All flight ships render above planets. Weapon shots collide with the first ship, asteroid, or registered destructible object in their path, including when the original target moves away or disappears. Armed civilian ships can return fire against the actual attacker.

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
python tests/browser-galaxy-controls.py
python tests/browser-regional-mining.py
python tests/browser-render-paths.py --visual-only
python tests/browser-stability.py
```

The second browser suite checks real Canvas beam emitters and target contacts across ship roles, camera movement, custom shield shapes, pause/inventory and projectile save/load. Job regressions also simulate tug deliveries, civilian mining/trading and saved player mining without any rendering.

Install Python test dependencies with `python -m pip install -r requirements-test.txt`. Pass an existing server URL, such as `http://127.0.0.1:7788`, to either browser script to check an installed copy. Browser reports and screenshots are written to the ignored `test-results` folder. Windows uses installed Microsoft Edge by default; set `BROWSER_CHANNEL` to an empty value to use Playwright Chromium after `python -m playwright install chromium`.

The [test workflow](.github/workflows/test.yml) runs the Node suite (including full-population economic recovery), the three gameplay browser suites, player lighting/warp pixel checks and cold damage-art preparation checks on pushes and pull requests. It uploads reports as artifacts.

Record a comparable scheduling benchmark with `python tests/browser-npc-performance.py --help`. Its before/after runs use the same saved population, viewport and browser. Measurements are diagnostic rather than machine-independent timing thresholds.

The stabilization benchmark is `python tests/browser-stability.py --measure`: three 20-second windows each of flight, crowded combat, mining/debris, warp and the Dev map, plus cold/warm artwork probes. Use `--revision c41559c --label before` and then `--label after` with the same saved fixture. See [performance evidence](docs/npc-performance.md) for measurements and remaining bottlenecks; lower simulation CPU alone does not establish smoother frame delivery.

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
