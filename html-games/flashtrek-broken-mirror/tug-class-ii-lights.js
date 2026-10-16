/* Live emissive layers for the twelve intact Tug Class II cutouts. */
(() => {
  'use strict';
  const profiles = new Map();
  const colors = {
    red: [255, 78, 53],
    blue: [79, 195, 255],
    amber: [255, 190, 91]
  };

  function colorKind(r, g, b, a) {
    if (a < 165) return null;
    if (r > 105 && r > g * 1.43 && r > b * 1.23) return 'red';
    if (b > 88 && b > r * 1.24 && b > g * 1.08) return 'blue';
    if (r > 102 && g > 54 && r > g * 1.14 && g > b * 1.19) return 'amber';
    return null;
  }

  function prepare(id, image, stage = 0) {
    const width = image.width, height = image.height;
    const source = document.createElement('canvas');
    source.width = width; source.height = height;
    const sourceContext = source.getContext('2d', {willReadFrequently: true});
    sourceContext.drawImage(image, 0, 0);
    const rgba = sourceContext.getImageData(0, 0, width, height).data;
    const total = width * height;
    const categories = {red: new Uint8Array(total), blue: new Uint8Array(total), amber: new Uint8Array(total)};
    for (let i = 0; i < total; i++) {
      const p = i * 4, kind = colorKind(rgba[p], rgba[p + 1], rgba[p + 2], rgba[p + 3]);
      if (kind) categories[kind][i] = 1;
    }
    const layers = {}, counts = {};
    for (const kind of Object.keys(categories)) {
      const selected = categories[kind], visited = new Uint8Array(total);
      const pixels = new Uint8ClampedArray(total * 4);
      const halo = document.createElement('canvas'); halo.width = width; halo.height = height;
      const haloContext = halo.getContext('2d');
      let count = 0;
      for (let i = 0; i < total; i++) {
        if (!selected[i] || visited[i]) continue;
        const group = [], queue = [i]; visited[i] = 1;
        let xTotal = 0, yTotal = 0;
        for (let head = 0; head < queue.length; head++) {
          const index = queue[head], x = index % width, y = Math.floor(index / width);
          group.push(index); xTotal += x; yTotal += y;
          const neighbors = [x > 0 ? index - 1 : -1, x + 1 < width ? index + 1 : -1,
            y > 0 ? index - width : -1, y + 1 < height ? index + width : -1];
          for (const next of neighbors) if (next >= 0 && selected[next] && !visited[next]) {
            visited[next] = 1; queue.push(next);
          }
        }
        const area = group.length, centerX = xTotal / area, centerY = yTotal / area;
        const engineRegion = centerY > height * .70;
        const nacelleSide = centerX < width * .28 || centerX > width * .72;
        const paintedContainer = id === 418 && centerX > width * .30 && centerX < width * .70 &&
          centerY > height * .39 && centerY < height * .72;
        const isFixture = area >= 3 && (area <= 65 ||
          (kind !== 'amber' && engineRegion && nacelleSide) ||
          (kind === 'amber' && area <= 190 && engineRegion && nacelleSide)) && !paintedContainer;
        if (!isFixture) continue;
        count++;
        if (area <= 65) {
          const [r, g, b] = colors[kind], radius = Math.max(6, Math.min(11, Math.sqrt(area) * 2.4));
          const glow = haloContext.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
          glow.addColorStop(0, `rgba(${r},${g},${b},${kind === 'amber' ? .78 : .86})`);
          glow.addColorStop(.28, `rgba(${r},${g},${b},${kind === 'amber' ? .42 : .52})`);
          glow.addColorStop(1, `rgba(${r},${g},${b},0)`);
          haloContext.globalCompositeOperation = 'lighter'; haloContext.fillStyle = glow;
          haloContext.beginPath(); haloContext.arc(centerX, centerY, radius, 0, Math.PI * 2); haloContext.fill();
        }
        for (const index of group) {
          const p = index * 4, [r, g, b] = colors[kind];
          pixels[p] = r; pixels[p + 1] = g; pixels[p + 2] = b;
          pixels[p + 3] = Math.min(230, 110 + Math.max(rgba[p], rgba[p + 1], rgba[p + 2]) * .44);
        }
      }
      const layer = document.createElement('canvas'); layer.width = width; layer.height = height;
      layer.getContext('2d').putImageData(new ImageData(pixels, width, height), 0, 0);
      layers[kind] = {core: layer, halo}; counts[kind] = count;
    }
    const profile = {width, height, layers, counts, total: counts.red + counts.blue + counts.amber + 2};
    profiles.set(`${id}:${stage}`, profile);
    return profile;
  }

  function lens(ctx, x, y, radius, color, strength) {
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, `rgba(255,250,215,${.78 * strength})`);
    glow.addColorStop(.15, color.replace('ALPHA', String(.48 * strength)));
    glow.addColorStop(1, color.replace('ALPHA', '0'));
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
  }

  function draw(ctx, id, layout, angle, time, enabled, stage = 0) {
    const profile = profiles.get(`${id}:${stage}`);
    if (!enabled || !profile || stage === 3) return;
    const {width, height, layers} = profile;
    ctx.save(); ctx.translate(layout.x, layout.y); ctx.rotate(angle);
    ctx.scale(layout.w / width, layout.h / height);
    ctx.translate(-width / 2, -height / 2);
    ctx.globalCompositeOperation = 'lighter';
    for (const [kind, layer] of Object.entries(layers)) {
      const pulse = kind === 'blue' ? .85 + .15 * Math.sin(time * .0022) :
        kind === 'red' ? .80 + .20 * Math.sin(time * .0031) : 1;
      ctx.globalAlpha = .62 * pulse; ctx.filter = 'blur(15px)'; ctx.drawImage(layer.core, 0, 0);
      ctx.globalAlpha = .60 * pulse; ctx.filter = 'blur(6px)'; ctx.drawImage(layer.core, 0, 0);
      ctx.globalAlpha = .86 * pulse; ctx.filter = 'none'; ctx.drawImage(layer.halo, 0, 0);
      ctx.globalAlpha = .74 * pulse; ctx.drawImage(layer.core, 0, 0);
    }
    ctx.filter = 'none'; ctx.globalAlpha = 1;
    lens(ctx, width * .5, Math.max(10, height * .045), 13, 'rgba(255,196,93,ALPHA)', .75);
    lens(ctx, width * .5, height * .195, 12, 'rgba(255,210,117,ALPHA)', .65);
    ctx.restore();
  }

  window.tugClassIILights = Object.freeze({prepare, draw, snapshot: (id, stage = 0) => {
    const profile = profiles.get(`${id}:${stage}`);
    return profile ? {counts: {...profile.counts}, total: profile.total} : null;
  }});
})();
