# Regional small stars

The flight background's small parallax stars vary continuously with the ship's
chart position. `regional-starfield.js` owns decorative palettes, density and a
private seeded point pool. `manual-flight.js` remains the owner of coordinate
conversion; changing the saved system frame or its government cannot change the
physical region's colour mix. There is no saved schema or gameplay randomness.

The seven spectral families are white, blue, cyan, green, gold, red and violet.
They tint the actual small points, including their centres. Regional proportions
crossfade and density fades individual points in/out. The continuous background
field covers the whole chart, including the uncharted systems and space between
destinations; compact geographic overrides blend into it.

| Area | Authored treatment | Density relative to the old small-star count |
| --- | --- | --- |
| Sol | Mostly white and blue, occasional gold | 1.0 |
| Andorian neighbourhood | Predominantly blue/cyan | About 3.5 |
| Vega | Dense blue-rich concentration | 3.9 |
| Klingon-side field | Red, amber and gold | 1.9 |
| Selected Romulan-side field | Green/teal mixed with cool stars | About 1.5 |
| Harman | Sparse green/cyan anomaly outskirts | 0.38 |
| Kardon | Red/violet anomaly pocket | 0.65 |
| Vex | Dense green/cyan/violet concentration | 3.6 |
| Badlands | Warm red/pink/amber, obscured background | 0.24 |
| Outer chart gap | Very sparse mixed stars | 0.17 |

These are visual design choices, not canonical stellar population measurements.
The [Badlands' plasma storms and pink-orange appearance](https://www.startrek.com/news/brief-history-of-the-badlands)
support its warm treatment; fewer visible stars are an artistic interpretation
of obscuration. Harman, Kardon and Vex follow Broken Mirror's own anomaly story.
Green points represent a stylized anomalous/nebular colour treatment. Faction-side
palettes are authored geographic associations, not a canon rule that ownership
determines stellar colour. Existing original map anchors remain unchanged.

The fixed pool holds 1,376 points across the original five small-star parallax
rates. Density is bounded from 0.15 to 4.0 and most additional points are faint.
Offscreen points are culled before painting. One shared 504-by-240 sprite atlas
holds 210 tinted size variants; travel and preparation reuse it. Model travel and
elapsed time are carried across system rebases so normal crossings retain small
star positions and twinkle phase. Pause/reduced motion retain the existing
display clock. System suns, bright-star optics and physical lighting keep their
existing owners.

Fast flight uses the original thin diamond taper and the nearer layers' fading
20/34-unit additive streaks, scaled by the shared model's speed response. Both
parts use each point's regional colour mix, including its smooth crossfades.
Trail opacity follows density fades; reduced motion suppresses the trails.
Viewport culling includes their full reach so an offscreen head can leave a
visible tail. The original acceleration, braking and direction easing still
belong to `vexed-space-model.js`.

Run `node --test tests/regional-starfield.test.cjs` and
`python tests/browser-regional-starfield.py`. The browser check measures actual
coloured small-star pixels, density differences, pause/rebase continuity and
warm atlas reuse, and captures representative backgrounds and live gameplay.
