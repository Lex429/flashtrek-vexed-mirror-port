# Background system suns

`stellar-background.js` draws each catalog star using its existing `body.art`
image, decoded once through `vexedFlightAssets.loadImage`. The G, K, M, A and
white-dwarf assets are preserved. Main suns have a clearly visible textured disk;
companions keep smaller disks based on their catalog display size. The approved
lens streaks and rings remain, with no solid white center circle covering the
surface artwork.

Suns belong to a nearer background star plane. Their apparent disk size,
brightness and parallax rate stay constant as the player travels. The plane
slides by 24% of actual camera travel, more than the distant star layers and less
than foreground planets and ships. There is no proximity growth, viewport-sized
orbit, screen clamp or camera-following offset. A source and its flare can slide
into and out of view. Ship heading and world zoom do not rotate or resize it.
Navigation coordinates, map artwork, populations and simulation remain unchanged.
Flight excludes stars from the foreground planet pass. Planet limbs clip the
background pass, and the existing finite-disk visibility calculation controls
flare strength through partial and total eclipses. The stellar disk uses the
opaque radius of the supplied artwork, about 39.8% of its full width. Optical
reflections fade at the screen edge and fully departed suns submit no draws,
preventing lens rings from remaining on screen after their source has passed.

An uneven, diffuse corona surrounds the limb. Three localized bundles of curved
plasma loops brighten, stretch outward and fade on separate slow cycles. Their
footpoints stay anchored to fixed active regions instead of rotating an entire
ring of repeated spikes. These loops are inspired by surface-anchored
[solar prominences](https://www.nasa.gov/image-article/what-solar-prominence/).
A restrained light layer animates illumination over the unchanged surface
artwork. The existing sky's elapsed display time drives every effect; there is
no new animation loop.
Pause freezes it, and reduced motion keeps the illumination and corona static.
The visible primary remains the source passed to the existing ship/planet
lighting system. Disabling ship lighting does not remove the background sun.

Decoded star art is shared by path. Cached flare, corona, loop and surface textures are
shared by spectral tint, with no gradients, image decoding or texture rebuilding
during warm painting. Images warm before arrival, including while a source is
offscreen. A visible sun uses at most 16 cached image draws. The five catalog
tints use about 10 MB of procedural textures
and 30 MB of decoded source artwork. Metrics are available through
`nativeStellarBackground.metrics()` for diagnostics.

Run `node --test tests/background-suns.test.cjs tests/planet-lighting.test.cjs
tests/star-comfort.test.cjs` and `python tests/browser-background-suns.py`.
The browser check covers real catalog images, visible surface detail, animated
light, eclipses, pause/reduced motion, shared illumination, companion stars and
desktop/mobile layout. Actual keyboard flight pans across the star layer,
checking constant size, a fixed parallax rate, visibility and complete departure. Raw full-game
frame/cost samples are retained under `test-results/background-suns/`.
Those warm headless measurements do not qualify physical display refresh.
