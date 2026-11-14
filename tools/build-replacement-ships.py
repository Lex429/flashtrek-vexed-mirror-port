"""Package the user's replacement sprites and measure shared lighting/damage data.

Artwork edits come from built-in image_gen. Pillow only validates, measures and
deploys each complete frame through one crop/scale derived from the intact PNG.
Usage: python tools/build-replacement-ships.py path/to/incoming.json
"""
import hashlib
import json
import math
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SHARED = ROOT / 'html-games/flashtrek-broken-mirror'
ART = SHARED / 'showcase-assets'
DEST = ART / 'replacement-ships'
STAGES = ['intact', 'light', 'heavy', 'severe']


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def components(points):
    points = set(points)
    result = []
    while points:
        first = points.pop()
        group = [first]
        for x, y in group:
            for dx, dy in [(-1, -1), (0, -1), (1, -1), (-1, 0), (1, 0), (-1, 1), (0, 1), (1, 1)]:
                neighbor = (x + dx, y + dy)
                if neighbor in points:
                    points.remove(neighbor)
                    group.append(neighbor)
        result.append(group)
    return sorted(result, key=lambda group: (-len(group), min(group)))


def runs(group, left, top):
    result = []
    for x, y in sorted(group, key=lambda p: (p[1], p[0])):
        if result and result[-1][0] == y - top and result[-1][1] + result[-1][2] == x - left:
            result[-1][2] += 1
        else:
            result.append([y - top, x - left, 1])
    return result


def measure_lamps(frame):
    width, height = frame.size
    pixels = list(frame.getdata())
    colors = [
        ('blue', '#38ddff', lambda r, g, b: b > 130 and g > 110 and r < min(g, b) * .77),
        ('red', '#ff4c39', lambda r, g, b: r > 165 and r > g * 1.8 and r > b * 1.7),
        ('amber', '#ffe4aa', lambda r, g, b: r > 195 and g > 150 and g < r * .97 and b < g * .87),
    ]
    lamps = []
    for tint, color, predicate in colors:
        points = {(i % width, i // width) for i, (r, g, b, a) in enumerate(pixels)
                  if a >= 150 and predicate(r, g, b)}
        for group in components(points):
            if len(group) < 2:
                continue
            left, top = min(x for x, y in group), min(y for x, y in group)
            w, h = max(x for x, y in group) - left + 1, max(y for x, y in group) - top + 1
            # Large red paint/array outlines and broad gold hull plates are not lamps.
            if tint == 'red' and (w > width * .35 or h > height * .30):
                continue
            if tint == 'amber' and (len(group) > 32 or w > 18 or h > 18):
                continue
            x, y = sum(p[0] for p in group) / len(group), sum(p[1] for p in group) / len(group)
            engine = tint == 'blue' or tint == 'red' and len(group) > 20 and y > height * .35
            lamps.append({'x': round(x, 3), 'y': round(y, 3), 'left': left, 'top': top,
                          'w': w, 'h': h, 'r': round(min(22, max(3, math.sqrt(len(group)) * .8)), 3),
                          'kind': 'core' if engine else 'window' if tint == 'amber' else 'running',
                          'offSevere': True, 'warpCharge': engine, 'tint': 'lens', 'color': color,
                          'runs': runs(group, left, top), 'phase': round(len(lamps) * .73, 3)})
    assert any(p['kind'] == 'core' for p in lamps), 'No engine lamps measured'
    # Keep every measured window pixel, but animate nearby windows as banks.
    # Hundreds of tiny individual bloom surfaces cost much more than a few
    # masked banks, especially when several Galaxy hulls share the view.
    banks = {}
    result = [p for p in lamps if p['kind'] != 'window']
    for lamp in lamps:
        if lamp['kind'] != 'window':
            continue
        points = banks.setdefault((int(lamp['x']) // 96, int(lamp['y']) // 96), set())
        for y, x, length in lamp['runs']:
            points.update((lamp['left'] + dx, lamp['top'] + y) for dx in range(x, x + length))
    for key, group in sorted(banks.items()):
        left, top = min(x for x, y in group), min(y for x, y in group)
        w, h = max(x for x, y in group) - left + 1, max(y for x, y in group) - top + 1
        result.append({'x': round(sum(x for x, y in group) / len(group), 3),
                       'y': round(sum(y for x, y in group) / len(group), 3),
                       'left': left, 'top': top, 'w': w, 'h': h, 'r': 4, 'kind': 'window',
                       'offSevere': True, 'tint': 'lens', 'color': '#ffe4aa',
                       'runs': runs(group, left, top), 'phase': round(len(result) * .73, 3)})
    return result


def measure_damage(frames):
    width, height = frames[0].size
    original = list(frames[0].getdata())
    result = [[]]
    for stage in range(1, 4):
        after = list(frames[stage].getdata())
        points = {(i % width, i // width) for i, (a, b) in enumerate(zip(original, after))
                  if a[3] >= 170 and (b[3] < 50 or max(a[:3]) > 90 and sum(b[:3]) < sum(a[:3]) * .43)}
        breaches = [dict(p) for p in result[-1]]
        for group in components(points):
            if len(group) < 9:
                continue
            x, y = sum(p[0] for p in group) / len(group), sum(p[1] for p in group) / len(group)
            if any(math.hypot(p['x'] - x, p['y'] - y) < 25 for p in breaches):
                continue
            breaches.append({'x': round(x, 3), 'y': round(y, 3),
                             'r': round(min(16, max(4, math.sqrt(len(group) / math.pi) * .55)), 3)})
            if len(breaches) >= stage * 4:
                break
        assert breaches, ('No damage measured', stage)
        result.append(breaches)
    return result


def main():
    incoming = json.loads(Path(sys.argv[1]).read_text(encoding='utf8'))
    DEST.mkdir(exist_ok=True)
    profile_path = SHARED / 'new-ship-profiles.js'
    code = "const fs=require('fs'),vm=require('vm'),c=vm.createContext({window:{earthAnimationProfiles:{}}});vm.runInContext(fs.readFileSync(process.argv[1],'utf8'),c);process.stdout.write(JSON.stringify(c.window.newShipAnimationProfiles));"
    profiles = json.loads(subprocess.check_output(['node', '-e', code, str(profile_path)], text=True))
    catalog_path = ART / 'catalog.json'
    catalog = json.loads(catalog_path.read_text(encoding='utf8'))
    audit = []
    for item in incoming['ships']:
        folder = DEST / item['key']
        (folder / 'masters').mkdir(parents=True, exist_ok=True)
        source = Path(item['original'])
        with Image.open(source) as intact:
            assert intact.mode == 'RGBA', source
            original_size = intact.size
            box = intact.getchannel('A').point(lambda a: 255 if a >= 150 else 0).getbbox()
            assert box
            crop = (max(0, box[0] - 6), max(0, box[1] - 6), min(intact.width, box[2] + 6), min(intact.height, box[3] + 6))
            ratio = min(512 / (crop[2] - crop[0]), 512 / (crop[3] - crop[1]))
            size = (round((crop[2] - crop[0]) * ratio), round((crop[3] - crop[1]) * ratio))
        frames, files, metrics, lineage = [], [], [], []
        previous = source
        for stage, label in enumerate(STAGES):
            master = source if stage == 0 else Path(item[label])
            with Image.open(master) as image:
                assert image.mode == 'RGBA' and all(abs(a-b) <= 2 for a, b in zip(image.size, original_size)), (master, image.mode, image.size, original_size)
                alpha = image.getchannel('A')
                assert max(alpha.getpixel(p) for p in [(0, 0), (image.width - 1, 0), (0, image.height - 1), (image.width - 1, image.height - 1)]) < 12, 'Opaque image corners'
                normalized = image if image.size == original_size else image.resize(original_size, Image.Resampling.LANCZOS)
                frame = normalized.crop(crop).resize(size, Image.Resampling.LANCZOS)
            master_dest = folder / 'masters' / f'{label}.png'
            shutil.copy2(master, master_dest)
            target = folder / f'{label}.png'
            frame.save(target, optimize=True)
            frames.append(frame)
            files.append(target.relative_to(ART).as_posix())
            metrics.append({'stage': label, 'size': list(size), 'solidPixels': sum(frame.getchannel('A').histogram()[150:]),
                            'masterSha256': sha(master_dest), 'frameSha256': sha(target)})
            lineage.append({'stage': label, 'master': master_dest.relative_to(ART).as_posix(), 'sha256': sha(master_dest),
                            'inputSha256': sha(previous) if stage else None})
            previous = master
        width, height = size
        damage = measure_damage(frames)
        lamps = measure_lamps(frames[0])
        opaque = [(i % width, i // width) for i, pixel in enumerate(frames[0].getdata()) if pixel[3] >= 170]
        def surface(x, y):
            return min(opaque, key=lambda p: (p[0] - x * width) ** 2 + (p[1] - y * height) ** 2)
        sites = [[name, *surface(x, y)] for name, x, y in [
            ('forward hull', .5, .14), ('port forward hull', .28, .3), ('starboard forward hull', .72, .3),
            ('port mid hull', .3, .49), ('starboard mid hull', .7, .49), ('reactor housing', .5, .63),
            ('port engine', .13, .8), ('starboard engine', .87, .8), ('stern', .5, .9)]]
        sites.extend([f'breach section {i+1}', p['x'], p['y']] for i, p in enumerate(damage[3]))
        core = next(site[1:] for site in sites if site[0] == 'reactor housing')
        emitters = {'beam': {'x': 0, 'y': -.36}, 'beamAft': {'x': 0, 'y': .36}, 'projectile': {'x': 0, 'y': -.36}}
        for point in emitters.values():
            x, y = round((point['x'] + .5) * width), round((point['y'] + .5) * height)
            if frames[0].getpixel((x, y))[3] < 150:
                x, y = surface(point['x'] + .5, point['y'] + .5)
                point.update(x=x / width - .5, y=y / height - .5)
        profile = {'width': width, 'height': height, 'displayRatio': width / height,
                   'shifts': [[0, 0, width, height] for _ in STAGES], 'animationReady': True,
                   'lights': lamps, 'damage': damage, 'sites': sites, 'core': core,
                   'energyColor': '#59d9ff', 'artworkFrames': files, 'artworkEmitters': emitters,
                   'fragmentOptions': {'armorChips': True, 'darkening': 42, 'minimumAlpha': 150, 'regions': damage, 'maxPieces': 3}}
        for ship_id in item['ids']:
            profiles[str(ship_id)] = profile
            row = next(row for row in catalog['ships'] if row['id'] == ship_id)
            row.update(original=files[0], frames=files, bounds=[0, width, 0, height], damageReady=True,
                       damageFramesReady=True, artworkStatus='animated',
                       origin='User replacement artwork with generated damage stages', replacementSource=source.name)
            for point in row.get('points', []):
                x, y = surface(point['x'] + .5, point['y'] + .5)
                point.update(x=x / width - .5, y=y / height - .5)
        for stage in range(1, 4):
            a, b = list(frames[stage-1].getchannel('A').getdata()), list(frames[stage].getchannel('A').getdata())
            metrics[stage]['removedPixels'] = sum(x >= 150 and y < 50 for x, y in zip(a, b))
        audit.append({'key': item['key'], 'ids': item['ids'], 'source': source.name, 'sourceSha256': sha(source),
                      'crop': list(crop), 'size': list(size), 'lamps': len(lamps),
                      'engines': sum(p['kind'] == 'core' for p in lamps), 'frames': metrics, 'lineage': lineage})
    profile_path.write_text('/* Measured ship lamps and breaches. Replacement frames share one intact-derived crop. */\nwindow.newShipAnimationProfiles=' + json.dumps(profiles, separators=(',', ':')) + ';\nObject.assign(window.earthAnimationProfiles,window.newShipAnimationProfiles);\nif(window.newShipAnimationProfiles[58])window.olympicAnimationProfile=window.newShipAnimationProfiles[58];\n', encoding='utf8', newline='\n')
    catalog_path.write_text(json.dumps(catalog, indent=2, ensure_ascii=False) + '\n', encoding='utf8', newline='\n')
    (DEST / 'generation.json').write_text(json.dumps({'tool': 'built-in image_gen', 'prompts': incoming['prompts'], 'ships': audit}, indent=2, ensure_ascii=False) + '\n', encoding='utf8', newline='\n')
    print(json.dumps([{'key': row['key'], 'size': row['size'], 'lamps': row['lamps'], 'removed': [stage.get('removedPixels', 0) for stage in row['frames']]} for row in audit]))


if __name__ == '__main__':
    main()
