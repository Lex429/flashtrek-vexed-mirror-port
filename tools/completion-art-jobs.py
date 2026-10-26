"""Emit independent built-in imagegen jobs; no API calls or image synthesis."""
import json
from pathlib import Path
from system_completion import reference_for

ROOT=Path(__file__).resolve().parents[1]
PLAN=json.loads((ROOT/'tools/system-completion.json').read_text(encoding='utf-8'))
ART=ROOT/'html-games/broken-mirror-port/assets/system-planets'
SOL=ROOT/'html-games/flashtrek-broken-mirror/art-review/sol-planets'
jobs=[]
for system in PLAN['systems']:
    for planet in system['planets']:
        key=planet['asset']
        if (ART/(key+'.webp')).is_file():
            continue
        desc=planet['appearance'];lower=desc.lower()
        rings='ring' in lower
        ref=reference_for(planet)
        framing='Entire circular globe and complete correctly occluded ring ellipse inside the image with comfortable transparent margins. Never squash the globe to fit the rings.' if rings else 'Entire circular globe centered in a square image with 6 percent transparent padding on every side.'
        prompt=(f'Use case: scientific-educational. Asset type: final transparent planet sprite for Vexed Mirror. '
                f'Input image 1 is the actual Sol {ref.split(" - ")[1].removesuffix(".png")} artwork, a REFERENCE ONLY for realistic orbital photography, fine planetary-scale detail, natural spherical volume and illumination. It is not an edit target or a surface to recolor. '
                f'Generate ONE distinctive new world: {planet["name"]}, in the {system["name"]} system. Appearance specification: {desc} '
                f'Photorealistic astronomical imagery at the visual quality of the supplied Sol artwork. Invent original geography, continent silhouettes and/or storm arrangements, distinct from the reference image. '
                f'Fine natural geological or atmospheric structure, no painterly brushwork, flat texture or plastic finish. Upper-left sunlight, mostly illuminated globe, soft shaded lower-right limb and realistic terminator. '
                f'{framing} Minimum 1280x1280 preferred. Genuine alpha transparency outside the subject. '
                f'Clouds, coastlines, craters, mountains and any settlements must be appropriately small at planetary scale. Natural subdued atmospheric limb where appropriate, no excessive glow. '
                f'No stars, black backdrop, scenery, labels, text, watermarks, borders, spacecraft or other planets. No added rings unless specified. The appearance and local planetary roster are original game interpretations, not claims of screen canon.')
        jobs.append(dict(key=key,system=system['id'],name=planet['name'],prompt=prompt,references=[str(SOL/ref)]))
print(json.dumps(jobs))
