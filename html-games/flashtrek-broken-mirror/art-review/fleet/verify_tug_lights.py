from io import BytesIO
import os
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw
from playwright.sync_api import sync_playwright


BASE = os.environ.get("TUG_REVIEW_BASE", "http://127.0.0.1:7788/html-games/flashtrek-broken-mirror/damage-showcase.html")
OUT = Path(__file__).parent / "tug-class-ii-live-lights-gallery.jpg"
NAMES = ["II", "II-S", "II-A", "II-T", "II-C", "II-R", "II-M", "II-P", "II-H", "II-U", "II-V", "II-X"]


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path=r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe", headless=True)
    page = browser.new_page(viewport={"width": 1200, "height": 900}, device_scale_factor=1)
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    gallery = Image.new("RGB", (1800, 430), (5, 16, 26))
    draw = ImageDraw.Draw(gallery)
    for index, name in enumerate(NAMES):
        for attempt in range(3):
            page.goto(f"{BASE}?ship={414 + index}&v=tug-ii-crop-light-2", wait_until="networkidle")
            try:
                page.wait_for_selector("#cthia-controls:not([hidden])", timeout=5000)
                ready = page.evaluate(f"window.tugClassIILights.snapshot({414 + index})")
            except Exception:
                ready = False
            if ready:
                break
            print(f"{name}: image load failed; retrying ({attempt + 1}/3)")
        assert page.evaluate(f"window.tugClassIILights.snapshot({414 + index})"), name
        page.wait_for_timeout(150)
        assert page.locator("#ship-lights").get_attribute("aria-pressed") == "true", name
        shot = Image.open(BytesIO(page.locator("#scene").screenshot())).convert("RGB")
        tile = shot.resize((300, 180))
        x, y = (index % 6) * 300, (index // 6) * 215
        gallery.paste(tile, (x, y + 20))
        draw.text((x + 8, y + 4), name, fill=(225, 235, 244))
        page.locator("#ship-lights").click()
        assert page.locator("#ship-lights").get_attribute("aria-pressed") == "false", name
        page.wait_for_timeout(150)
        dark = Image.open(BytesIO(page.locator("#scene").screenshot())).convert("RGB")
        diff = ImageChops.difference(shot.crop((330, 15, 570, 500)), dark.crop((330, 15, 570, 500)))
        changed = sum(1 for pixel in diff.get_flattened_data() if max(pixel) >= 35)
        assert changed >= 100, (name, changed)
        print(f"{name}: light toggle changed {changed} ship-area pixels")
    gallery.save(OUT, quality=93)
    if errors:
        print(f"Unrelated page script errors during rapid navigation: {errors}")
    browser.close()

print(f"Gallery: {OUT}")
