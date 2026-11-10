# Procedural nebula gas

The active entry point loads `nebula-gas.js` and `procedural-nebulae.js`.
All four regions use continuously evaluated gas density, with no photographs,
cloud image requests, fixed cloud patterns or noise-image textures. The earlier
photographic implementation is no longer loaded by the game.

`nebula-gas.js` owns a shared WebGL2 renderer. Its time-varying 3D noise, domain
warping, local flow and density-derived shading change wisps and folds inside
the cloud. Three depth planes provide parallax. Their geometry and global
brightness remain fixed while their internal density evolves, so animation
cannot be explained by moving or rotating an unchanged picture.

Four finite cloud regions follow the world's existing `nebula` flags:

| Region | Basis | Appearance |
| --- | --- | --- |
| Badlands | Television plasma region, placed in the existing Bajoran/Cardassian neighbourhood | Warm pink/orange storm fronts and curled plasma eddies |
| Harman | Broken Mirror's anomaly story | Thin blue-grey gas and slow wisps |
| Kardon | Broken Mirror's anomaly story | Denser violet/rose gas |
| Vex | Broken Mirror's anomaly story | Dense teal/green folds and turbulence |

Sol, Orion, Andoria, Vega, Romulus and Qonos no longer receive invented broad
homeworld nebulae. Ordinary space retains its regional point stars. In
particular, the planet called Orion is not treated as proof that it sits inside
the real Orion Nebula. Political ownership does not establish a nebula's location.

The Badlands treatment follows the television plasma-storm depiction discussed
in [StarTrek.com's history](https://www.startrek.com/news/brief-history-of-the-badlands)
and its [Discovery episode recap](https://www.startrek.com/news/recap-508-discovery-labyrinths).
The procedural storm treatment is an interpretation of that environment, not an
exact reconstruction of an episode shot. Its use in the Mirror game is an
adaptation of the TV appearance; a game-specific alternate-universe palette is
not assumed to be a general screen-canon rule.

Harman, Kardon and Vex are identified as game fiction, not canonical Trek
nebulae. Named phenomena such as Mutara or the Briar Patch have not been attached
to unrelated systems merely to add familiar names. The map keeps its established
original anchors and does not supply exact positions for those other regions.

The Badlands have warm orange/pink gas, broad storm fronts and faster internal
flow. Local density changes produce dark channels, soft edges and brighter
folds. The implementation is a layered procedural visual effect, not a full
physical fluid or 3D volumetric simulation. Stars, restored speed trails,
physical suns, ships and foreground occlusion retain their existing owners.

Three layers use fixed parallax rates 0.004, 0.007 and 0.011, with constant
apparent sizes at a given viewport. Fixed chart positions and smooth finite
coverage let clouds slide past the ship and fade into clear space. Geographic
selection uses player position; projection uses the actual camera. Governments
do not change cloud positions. Visibility culling precedes image requests.

The existing sky display clock controls internal flow. Stopping the ship stops
camera parallax while density and wisps continue to evolve. Pause freezes that
clock and reuses the identical last field. Reduced motion freezes turbulence
while retaining camera parallax. Carrying elapsed time across system rebases
preserves the same gas phase through a normal crossing. Shader evaluation never
consumes gameplay randomness or changes saved physics, cargo or simulation time.

The GPU surface is bounded to 384 pixels wide and 288 high; software GPU adapters
use at most 192 pixels wide. Normal rendering performs no pixel readback and
loads no input textures. Identical time, camera and region parameters reuse the
last result. Resize or a changed parameter invalidates that retained frame.
Surface-byte metrics describe the output surface, not total driver memory.

When WebGL2 is unavailable or its context is lost, a lower-detail Canvas backend
calculates evolving density into a reusable buffer at at most 96 by 64 pixels.
It also uses no image assets or fixed cloud pattern. GPU restoration recompiles
the field and resumes the shader. Preparation respects cancellation and never
activates a system. Clear/offscreen regions do not initialize or paint a field.

Run `node --test tests/parallax-nebulae.test.cjs` and
`python tests/browser-parallax-nebulae.py`. Browser evidence includes actual
actual shader compilation, changing pixels with stationary geometry, no nebula
image requests, clear ordinary systems, parallax, pause/reduced motion, coordinate
rebases, retained frames, foreground occlusion and live gameplay. GPU-loss tests
verify moving CPU gas and restoration. Node regressions cover density evolution,
fallback pixels, image independence and catalog membership. The generated GIF
shows a fixed camera with time accelerated 12 times; it is a preview artifact.
