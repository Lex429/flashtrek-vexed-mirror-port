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

## Verification

Run the deterministic combat and rendering tests with Node.js:

```sh
node --test tests/*.test.cjs tests/*.test.js
```

The browser checks use Python, Playwright, and Microsoft Edge. They start an isolated local server and browser profile, verify ship layering and actual collateral damage, and exercise shielded and unshielded showcase explosions:

```sh
python tests/browser-smoke.py
```

Pass an existing server URL, such as `http://127.0.0.1:7788`, to check an installed copy. Browser reports and screenshots are written to the ignored `test-results` folder.
