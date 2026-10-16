"""Extract the twelve intact Tug Class II variants from the supplied sheet."""

from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw


SOURCE = Path(r"C:\Users\alphi\Downloads\tug class type 2.png")
ROOT = Path(__file__).resolve().parents[2]
DEST = ROOT / "showcase-assets" / "tug-class-ii"
BOXES = [
    ("ii", (22, 103, 476, 278)),
    ("ii-s", (526, 101, 985, 279)),
    ("ii-a", (990, 88, 1505, 281)),
    ("ii-t", (15, 325, 475, 505)),
    ("ii-c", (506, 326, 997, 506)),
    ("ii-r", (1022, 325, 1505, 506)),
    ("ii-m", (22, 550, 511, 733)),
    ("ii-p", (539, 552, 988, 733)),
    ("ii-h", (997, 553, 1505, 733)),
    ("ii-u", (63, 779, 478, 924)),
    ("ii-v", (527, 782, 985, 924)),
    ("ii-x", (1061, 783, 1497, 924)),
]
CAPTION_STARTS = [258] * 3 + [489] * 3 + [714] * 3 + [924, 924, 915]


def extract(sheet, box, caption_start):
    crop = sheet.crop(box).convert("RGBA")
    source = np.asarray(crop)
    rgb = source[:, :, :3]
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    # Detail separates the bright ship from the soft spotlight. The source
    # alpha will be used separately to recover the dark structural neck.
    smooth = cv2.GaussianBlur(gray.astype(np.float32), (0, 0), 4)
    variance = cv2.GaussianBlur((gray.astype(np.float32) - smooth) ** 2, (0, 0), 3)
    detail = np.sqrt(variance)
    bright = np.uint8(((gray > 70) & (detail > 7)) | (gray > 155)) * 255
    # The labels overlap the nacelles vertically. Keep the aft quarter of
    # those rows while excluding the central caption under each ship.
    bright[max(0, caption_start - box[1]):, :round(bright.shape[1] * .72)] = 0
    bright = cv2.morphologyEx(bright, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
    contours, _ = cv2.findContours(bright, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    rough = np.zeros(gray.shape, np.uint8)
    for contour in contours:
        if cv2.contourArea(contour) >= 75:
            cv2.drawContours(rough, [contour], -1, 255, cv2.FILLED)
    mask = rough
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    solid = np.zeros_like(mask)
    for contour in contours:
        if cv2.contourArea(contour) >= 55:
            cv2.drawContours(solid, [contour], -1, 255, cv2.FILLED)
    mask = cv2.GaussianBlur(solid, (3, 3), 0.6)
    rgba = np.dstack([rgb, mask])
    ys, xs = np.nonzero(mask > 8)
    bounds = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
    ship = Image.fromarray(rgba, "RGBA").crop(bounds)
    neck_alpha = source[ys.min():ys.max() + 1, xs.min():xs.max() + 1, 3]
    return restore_neck(ship, neck_alpha).transpose(Image.Transpose.ROTATE_270)


def restore_neck(ship, source_alpha):
    """Keep the dark connector between saucer and cargo body opaque."""
    pixels = np.asarray(ship).copy()
    alpha = pixels[:, :, 3]
    height, width = alpha.shape
    center_rows = (alpha[max(0, height // 2 - 8):height // 2 + 8] > 128).sum(axis=0)
    search_start, search_end = int(width * .16), int(width * .48)
    gaps = []
    start = None
    for x in range(search_start, search_end):
        if center_rows[x] == 0 and start is None:
            start = x
        elif center_rows[x] > 0 and start is not None:
            gaps.append((start, x - 1))
            start = None
    # These are the roughly 15-23 pixel gaps left where the dark neck was
    # mistaken for the backdrop. The source alpha preserves its real outline.
    neck = next((gap for gap in gaps if 12 <= gap[1] - gap[0] + 1 <= 26), None)
    if neck is None:
        raise ValueError("Could not locate ship neck")
    x0, x1 = neck
    left, right = x0 - 3, x1 + 4
    original = source_alpha[:, left:right]
    recovered = np.uint8(original > 245) * 255
    recovered[:round(height * .27)] = 0
    recovered[round(height * .80):] = 0
    recovered = cv2.morphologyEx(recovered, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    added = (recovered > 0) & (alpha[:, left:right] < 128)
    alpha[:, left:right] = np.maximum(alpha[:, left:right], recovered)
    # The neck is almost black on the source sheet. Lift its original detail
    # enough to distinguish the connector from the dark showcase backdrop.
    neck_rgb = pixels[:, left:right, :3]
    neck_rgb[added] = np.clip(neck_rgb[added].astype(np.int16) + 36, 0, 255).astype(np.uint8)
    pixels[:, left:right, :3] = neck_rgb
    pixels[:, :, 3] = alpha
    return Image.fromarray(pixels, "RGBA")


def main():
    DEST.mkdir(parents=True, exist_ok=True)
    sheet = Image.open(SOURCE)
    samples = []
    for (name, box), caption_start in zip(BOXES, CAPTION_STARTS):
        ship = extract(sheet, box, caption_start)
        ship.save(DEST / f"tug-class-{name}.png", optimize=True)
        samples.append((name, ship))
        print(name, ship.size)
    contact = Image.new("RGB", (1500, 1040), (10, 18, 27))
    draw = ImageDraw.Draw(contact)
    for i, (name, ship) in enumerate(samples):
        x = (i % 6) * 250
        y = (i // 6) * 520
        contact.paste(ship, (x + (250 - ship.width) // 2, y + 20), ship)
        draw.text((x + 20, y + 482), name.upper(), fill=(220, 234, 247))
    contact.save(Path(__file__).with_name("tug-class-ii-contact-review.jpg"), quality=90)


if __name__ == "__main__":
    main()
