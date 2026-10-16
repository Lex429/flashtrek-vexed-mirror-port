"""Review II-A's four selectable damage stages in the live showcase."""

from io import BytesIO
import os
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw
from playwright.sync_api import sync_playwright


URL = os.environ.get("TUG_REVIEW_URL", "http://127.0.0.1:7788/html-games/flashtrek-broken-mirror/damage-showcase.html?ship=416&v=tug-ii-a-anim-3")
OUT = Path(__file__).parent / "tug-ii-a-live-damage-review.jpg"

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path=r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe", headless=True)
    page = browser.new_page(viewport={"width": 1200, "height": 900}, device_scale_factor=1)
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    for attempt in range(3):
        page.goto(URL, wait_until="networkidle")
        try:
            page.wait_for_function("window.showcaseState && window.showcaseState().ready && window.showcaseState().ship === 416", timeout=5000)
            break
        except Exception:
            print(f"Page assets missed a request; retrying ({attempt + 1}/3)")
    assert page.evaluate("window.showcaseState && window.showcaseState().ready")
    assert page.locator("#cthia-controls").is_visible()
    assert page.locator("#damage-effects").is_visible()
    assert page.locator(".damage-card:not([disabled])").count() == 4
    print("Fragment templates:", page.evaluate("window.showcaseState().tugIIADamage.templates"))
    sheet = Image.new("RGB", (1200, 230), (5, 16, 26))
    draw = ImageDraw.Draw(sheet)
    for stage, label in enumerate(("INTACT", "LIGHT", "HEAVY", "SEVERE")):
        page.locator(f'button[data-stage="{stage}"]').click()
        page.wait_for_function(f"window.showcaseState().stage === {stage}")
        page.wait_for_timeout(130)
        if stage:
            assert page.evaluate("window.showcaseState().tugIIADamage.flyingPieces") > 0, label
        if stage == 2:
            before_motion = page.evaluate("({positions:window.showcaseState().tugIIADamage.piecePositions,time:window.showcaseState().time,paused:window.showcaseState().paused})")
            page.wait_for_timeout(230)
            after_motion = page.evaluate("({positions:window.showcaseState().tugIIADamage.piecePositions,time:window.showcaseState().time,paused:window.showcaseState().paused})")
            print("Fragment motion:", before_motion, after_motion, "page errors:", errors)
            assert before_motion["positions"] != after_motion["positions"], "Hull fragments did not move"
        shot = Image.open(BytesIO(page.locator("#scene").screenshot())).convert("RGB")
        sheet.paste(shot.resize((300, 180)), (stage * 300, 20))
        draw.text((stage * 300 + 8, 3), label, fill=(230, 238, 245))
        print(f"{label}: {page.locator('#stage-badge').inner_text()}")
    assert "running lights are out" in page.locator("#cthia-status").inner_text()
    page.wait_for_timeout(450)
    page.locator("#pause").click()
    page.wait_for_timeout(80)
    fire_on = Image.open(BytesIO(page.locator("#scene").screenshot())).convert("RGB")
    fire_on.save(Path(__file__).parent / "tug-ii-a-severe-fire.png")
    page.locator("#damage-effects").click()
    page.wait_for_timeout(80)
    fire_off = Image.open(BytesIO(page.locator("#scene").screenshot())).convert("RGB")
    difference = ImageChops.difference(fire_on, fire_off)
    changed = sum(1 for pixel in difference.get_flattened_data() if max(pixel) > 25)
    assert changed > 100, changed
    print(f"Hull fires toggle changed {changed} scene pixels")
    page.locator("#damage-effects").click()
    page.locator("#pause").click()
    sheet.save(OUT, quality=93)
    page.locator('button[data-stage="0"]').click()
    page.locator("#visual-damage").evaluate("el => { el.checked = true; el.dispatchEvent(new Event('change', {bubbles:true})); }")
    page.locator("#fire-weapon").evaluate("el => el.click()")
    page.wait_for_timeout(800)
    assert page.evaluate("window.showcaseState().hull") < 100
    print(f"Weapon hit reduced hull to {page.evaluate('window.showcaseState().hull')}")
    for _ in range(2):
        page.locator("#fire-weapon").evaluate("el => el.click()")
        page.wait_for_timeout(800)
    assert page.evaluate("window.showcaseState().stage") == 3
    print(f"Three weapon hits reached severe stage at {page.evaluate('window.showcaseState().hull')} hull")
    page.locator("#fire-weapon").evaluate("el => el.click()")
    page.wait_for_timeout(800)
    assert page.evaluate("window.showcaseState().destroyed")
    assert page.evaluate("window.showcaseState().tugIIADamage.flyingPieces") > 0
    page.locator("#repair").click()
    assert page.evaluate("window.showcaseState().stage") == 0
    assert page.evaluate("window.showcaseState().tugIIADamage.flyingPieces") == 0
    assert not errors, errors
    browser.close()

print(f"Live review: {OUT}")
