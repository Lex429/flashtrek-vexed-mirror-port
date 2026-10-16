"""Size the generated II-A damage masters to the existing showcase sprite frame."""

from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[2]
SPRITES = ROOT / "showcase-assets" / "tug-class-ii"
MASTERS = Path(__file__).parent / "tug-ii-a-damage-masters"
SIZE = Image.open(SPRITES / "tug-class-ii-a.png").size
STAGES = ("intact", "light", "heavy", "severe")

for stage in STAGES[1:]:
    with Image.open(MASTERS / f"{stage}.png") as master:
        frame = master.convert("RGBA").resize(SIZE, Image.Resampling.LANCZOS)
        frame.save(SPRITES / f"tug-class-ii-a-{stage}.png", optimize=True)

sheet = Image.new("RGB", (SIZE[0] * 4 + 100, SIZE[1] + 50), (5, 16, 26))
draw = ImageDraw.Draw(sheet)
for index, stage in enumerate(STAGES):
    path = SPRITES / ("tug-class-ii-a.png" if index == 0 else f"tug-class-ii-a-{stage}.png")
    with Image.open(path) as frame:
        x = 20 + index * (SIZE[0] + 20)
        sheet.paste(frame, (x, 25), frame)
        draw.text((x, 7), stage.upper(), fill=(227, 238, 245))

sheet.save(Path(__file__).parent / "tug-ii-a-damage-review.jpg", quality=93)
print(f"Four aligned II-A frames: {SIZE}")
