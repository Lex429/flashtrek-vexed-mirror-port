PROMETHEUS — THREE SEPARATING HULLS

Main assets: Prometheus-top.png, Prometheus-middle.png,
Prometheus-bottom.png, Prometheus-assembled.png.

All four PNGs use a transparent 1024 x 2048 canvas and the same scale.
Docking anchor: (512, 1024), normalized (0.5, 0.5). Nose points up.
To assemble: draw bottom, then middle, then top at the SAME position,
rotation and scale. No additional offsets or resizing are required.
The assembled PNG is composited directly from those three files.

These are vertically stacked hull layers, not three nose-to-tail slices.
The upper hull hides docking surfaces. In this exact overhead projection,
the upper and lower nacelle pairs share their projected docking positions.
Separating the layers reveals the complete independent sections.

Do not auto-trim the images independently without retaining their offsets.
alignment.json includes bounds and optional flight pivots for detached ships.
Use the docking anchor while joining the layers. The preview demonstrates
separation and reassembly using only translations of these exact assets.

The middle and bottom rear hulls/nacelles share registered geometry and
texture for a clean stacked projection; their forward decks remain distinct.
All lettering is absent. The materials match the silver/red/cyan asset set.

Art: built-in image generation, followed by alpha cleanup, geometric
registration, layer compositing and transparent export. Prompts included.
