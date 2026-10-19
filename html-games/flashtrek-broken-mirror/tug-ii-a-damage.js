/* Sprite-matched breakup and persistent breach fires for Tug Class II-A. */
(() => {
  'use strict';
  const templatesByFrame = new WeakMap();
  function createTugIIADamage() {
  let burnReady=Promise.resolve();
  let frames = [], templates = [[], [], [], []], pieces = [], transition = null, flash = null;
  const breaches = [
    {stage: 1, x: .20, y: -.38, size: 4.3, phase: .4},
    {stage: 1, x: .30, y: .08, size: 3.5, phase: 2.1},
    {stage: 2, x: -.27, y: -.34, size: 5.8, phase: 1.2},
    {stage: 2, x: -.20, y: -.15, size: 5.4, phase: 3.3},
    {stage: 2, x: -.30, y: .10, size: 6.6, phase: 4.4},
    {stage: 2, x: -.39, y: .40, size: 4.8, phase: 2.7},
    {stage: 3, x: .23, y: -.37, size: 8.2, phase: 2.4},
    {stage: 3, x: .12, y: -.17, size: 7.2, phase: 5.2},
    {stage: 3, x: .07, y: .12, size: 9.5, phase: 3.8},
    {stage: 3, x: -.15, y: .26, size: 7.6, phase: 1.9},
    {stage: 3, x: .42, y: .41, size: 6.2, phase: 4.7}
  ];

  function imageData(image) {
    const canvas = document.createElement('canvas');
    canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext('2d', {willReadFrequently: true});
    context.drawImage(image, 0, 0);
    return context.getImageData(0, 0, canvas.width, canvas.height).data;
  }

  function makeShard(image, x, y, width, height, seed) {
    const shard = document.createElement('canvas');
    shard.width = width; shard.height = height;
    const context = shard.getContext('2d');
    const notch = n => (Math.sin(seed * 19.71 + n * 8.31) * .5 + .5) * .21;
    context.beginPath();
    context.moveTo(width * (.12 + notch(0)), 0);
    context.lineTo(width * (.78 + notch(1)), height * notch(2));
    context.lineTo(width, height * (.19 + notch(3)));
    context.lineTo(width * (.89 - notch(4)), height * (.79 + notch(5)));
    context.lineTo(width * (.66 + notch(6)), height);
    context.lineTo(width * notch(7), height * (.92 - notch(8)));
    context.lineTo(width * notch(9), height * (.27 + notch(10)));
    context.closePath(); context.clip();
    context.drawImage(image, -x, -y);
    return shard;
  }

  function makeTemplates(before, after, stage, final = false) {
    const width = before.width, height = before.height;
    const old = imageData(before), next = final ? null : imageData(after);
    const cell = stage === 1 ? 12 : stage === 2 ? 15 : 19;
    const candidates = [];
    for (let y = 0; y < height; y += cell) for (let x = 0; x < width; x += cell) {
      let score = 0, solid = 0;
      for (let yy = y + 1; yy < Math.min(height, y + cell); yy += 2) {
        for (let xx = x + 1; xx < Math.min(width, x + cell); xx += 2) {
          const i = (yy * width + xx) * 4, alpha = old[i + 3];
          if (alpha < 150) continue;
          solid++;
          if (final) {score += alpha / 255; continue;}
          const afterAlpha = next[i + 3];
          const oldLight = old[i] * .26 + old[i + 1] * .59 + old[i + 2] * .15;
          const newLight = next[i] * .26 + next[i + 1] * .59 + next[i + 2] * .15;
          const darkened = Math.max(0, oldLight - newLight);
          if (afterAlpha < 125) score += 3;
          else if (darkened > 26) score += Math.min(2.3, darkened / 45);
        }
      }
      if (solid < 5 || score < (final ? 7 : stage === 1 ? 5 : 9)) continue;
      candidates.push({x, y, score, width: Math.min(cell, width - x), height: Math.min(cell, height - y)});
    }
    candidates.sort((a, b) => b.score - a.score);
    const count = final ? 34 : stage === 1 ? 8 : stage === 2 ? 16 : 26;
    return candidates.slice(0, count).map((part, index) => ({...part,
      centerX: (part.x + part.width / 2) / width - .5,
      centerY: (part.y + part.height / 2) / height - .5,
      texture: makeShard(before, part.x, part.y, part.width, part.height, index + stage * 37),
      widthRatio: part.width / width, heightRatio: part.height / height
    }));
  }

  function prepare(images) {
    frames = images;
    let prepared = templatesByFrame.get(images[0]);
    if (!prepared) {
      prepared = [[], [], [], []];
      for (let stage = 1; stage < 4; stage++) prepared[stage] = makeTemplates(images[stage - 1], images[stage], stage);
      prepared[0] = makeTemplates(images[3], null, 4, true);
      templatesByFrame.set(images[0], prepared);
    }
    burnReady=window.wreckageEffects?.primeAll(prepared.flat().map(part=>part.texture))||Promise.resolve();
    templates = prepared;
    reset();
    return snapshot();
  }

  function reset() { pieces = []; transition = null; flash = null; }

  function spawn(stage, layout, angle, now, impact, final = false) {
    const cos = Math.cos(angle), sin = Math.sin(angle), source = templates[final ? 0 : stage] || [];
    for (const [index, part] of source.entries()) {
      const localX = part.centerX * layout.w, localY = part.centerY * layout.h;
      const x = layout.x + localX * cos - localY * sin;
      const y = layout.y + localX * sin + localY * cos;
      const dx = x - (impact?.x ?? layout.x), dy = y - (impact?.y ?? layout.y);
      const direction = Math.atan2(dy + (Math.random() - .5) * 55, dx + (Math.random() - .5) * 55);
      const speed = (final ? 105 : stage === 3 ? 75 : stage === 2 ? 55 : 38) + Math.random() * (final ? 115 : 55);
      const delay = final ? index * 13 + Math.random() * 70 : Math.random() * (stage === 3 ? 150 : 95);
      pieces.push({texture: part.texture, x, y, width: part.widthRatio * layout.w,
        height: part.heightRatio * layout.h, vx: Math.cos(direction) * speed,
        vy: Math.sin(direction) * speed, angle, spin: (Math.random() - .5) * (final ? 5 : 3),
        born: now + delay, ttl: final ? 3700 : 2800 + Math.random() * 850, stage});
    }
    pieces = pieces.slice(-95);
  }

  function change(before, after, layout, angle, now, impact = null) {
    if (!frames.length || after <= before) return;
    for (let stage = before + 1; stage <= Math.min(after, 3); stage++) spawn(stage, layout, angle, now, impact);
    transition = {image: frames[before], born: now, duration: after === 3 ? 330 : 260};
    flash = {x: impact?.x ?? layout.x, y: impact?.y ?? layout.y, born: now, stage: after};
  }

  function destroy(layout, angle, now) {
    if (!frames.length) return;
    spawn(4, layout, angle, now, null, true);
    transition = null;
    flash = {x: layout.x, y: layout.y, born: now, stage: 4};
  }

  function update(dt, now) {
    for (const part of pieces) {
      if (now < part.born) continue;
      part.x += part.vx * dt; part.y += part.vy * dt; part.angle += part.spin * dt;
      const drag = Math.max(0, 1 - dt * .28);
      part.vx *= drag; part.vy *= drag;
    }
    pieces = pieces.filter(part => now - part.born < part.ttl);
    if (transition && now - transition.born > transition.duration) transition = null;
    if (flash && now - flash.born > 650) flash = null;
  }

  function fireAt(ctx, x, y, size, time, phase) {
    const flicker = .76 + .18 * Math.sin(time * .014 + phase) + .12 * Math.sin(time * .032 + phase * 3);
    const radius = size * Math.max(.58, flicker);
    ctx.save(); ctx.translate(x, y); ctx.globalCompositeOperation = 'lighter';
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * 2.4);
    glow.addColorStop(0, 'rgba(255,232,135,.78)');
    glow.addColorStop(.25, 'rgba(255,120,35,.46)');
    glow.addColorStop(1, 'rgba(255,65,18,0)');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, 0, radius * 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.shadowColor = '#ff7225'; ctx.shadowBlur = radius * 1.5;
    ctx.fillStyle = '#f67628'; ctx.beginPath();
    ctx.moveTo(-radius * .65, radius * .45);
    ctx.quadraticCurveTo(-radius * .52, -radius * .8, Math.sin(time * .011 + phase) * radius * .3, -radius * (1.35 + flicker * .55));
    ctx.quadraticCurveTo(radius * .4, -radius * .7, radius * .62, radius * .48);
    ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0; ctx.fillStyle = '#ffdc83'; ctx.beginPath();
    ctx.moveTo(-radius * .25, radius * .25);
    ctx.quadraticCurveTo(-radius * .1, -radius * .32, radius * .12, -radius * .9);
    ctx.quadraticCurveTo(radius * .3, -radius * .15, radius * .28, radius * .28);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function drawHull(ctx, layout, angle, now, stage, firesEnabled) {
    if (transition && now >= transition.born) {
      const remaining = 1 - Math.min(1, (now - transition.born) / transition.duration);
      ctx.save(); ctx.translate(layout.x, layout.y); ctx.rotate(angle);
      ctx.globalAlpha = remaining * remaining;
      ctx.drawImage(transition.image, -layout.w / 2, -layout.h / 2, layout.w, layout.h);
      ctx.restore();
    }
    if (firesEnabled && stage > 0) {
      ctx.save(); ctx.translate(layout.x, layout.y); ctx.rotate(angle);
      for (const site of breaches) {
        if (site.stage > stage) continue;
        const strength = site.stage === stage ? 1 : .62;
        fireAt(ctx, site.x * layout.w, site.y * layout.h, site.size * strength * layout.h / 360, now, site.phase);
        for (let i = 0; i < 2; i++) {
          const cycle = (now * (.00043 + i * .00013) + site.phase * .23 + i * .47) % 1;
          const px = site.x * layout.w + Math.sin(now * .004 + site.phase + i) * 3 + (i ? 3 : -3) * cycle;
          const py = site.y * layout.h - cycle * (14 + site.size);
          ctx.fillStyle = `rgba(255,${Math.round(118 + 95 * (1 - cycle))},70,${(1 - cycle) * .84})`;
          ctx.fillRect(px, py, 1.1 + (1 - cycle) * 1.1, 1.1 + (1 - cycle) * 1.1);
        }
      }
      ctx.restore();
    }
  }

  function drawPieces(ctx, now) {
    if (flash && now >= flash.born) {
      const age = now - flash.born, fade = Math.max(0, 1 - age / 650), radius = (8 + age * .075) * (flash.stage === 4 ? 1.5 : 1);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = fade * .7;
      ctx.strokeStyle = '#ffb55e'; ctx.lineWidth = 2.7 * fade; ctx.shadowColor = '#ff6929'; ctx.shadowBlur = 15;
      ctx.beginPath(); ctx.arc(flash.x, flash.y, radius, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
    for (const part of pieces) {
      const age = now - part.born;
      if (age < 0 || age >= part.ttl) continue;
      const fade = Math.min(1, (part.ttl - age) / 700);
      ctx.save(); ctx.translate(part.x, part.y); ctx.rotate(part.angle); ctx.globalAlpha = fade;
      if(!window.wreckageEffects?.draw(ctx,part.texture,part.width,part.height,age))ctx.drawImage(part.texture,-part.width/2,-part.height/2,part.width,part.height);
      ctx.restore();
    }
  }

  function snapshot() {
    return {templates: templates.map(group => group.length), flyingPieces: pieces.length,
      piecePositions: pieces.slice(0, 3).map(piece => [Math.round(piece.x), Math.round(piece.y)]),
      transitioning: !!transition, flash: !!flash, fireSites: breaches.length};
  }

  return Object.freeze({prepare,get ready(){return burnReady;}, reset, change, destroy, update, drawHull, drawPieces, snapshot});
  }
  window.createTugIIADamage = createTugIIADamage;
  window.tugIIADamage = createTugIIADamage();
})();
