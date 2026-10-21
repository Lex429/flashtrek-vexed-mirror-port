/* Local flight radar, using the shared faction artwork and live world positions. */
(() => {
  'use strict';
  const canvas = document.createElement('canvas');
  canvas.id = 'native-radar';
  canvas.width = 320;
  canvas.height = 240;
  canvas.setAttribute('role', 'button');
  canvas.setAttribute('aria-label', 'Local flight radar');
  canvas.tabIndex = 0;
  canvas.title = 'Double-click to open map [M]';
  const stage = document.getElementById('game');
  stage.append(canvas);
  const footer = document.querySelector('body > footer');
  new ResizeObserver(() => stage.style.setProperty('--native-radar-bottom', `${footer.getBoundingClientRect().height + 8}px`)).observe(footer);
  const ctx = canvas.getContext('2d');
  const factionNames = ['Non-Aligned', 'Earth Empire', 'Klingon Empire', 'Ferengi', 'Romulan Empire', 'Vulcan', 'Cardassian Order', 'Borg Collective'];
  const emblemBounds = new Array(8);
  const emblems = Array.from({length: 8}, (_, index) => {
    const image = new Image();
    image.onload = () => {
      const sample = document.createElement('canvas');
      sample.width = 128;
      sample.height = 128;
      const sampleCtx = sample.getContext('2d', {willReadFrequently:true});
      sampleCtx.drawImage(image, 0, 0, 128, 128);
      const pixels = sampleCtx.getImageData(0, 0, 128, 128).data;
      let left = 128, top = 128, right = -1, bottom = -1;
      for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
        if (pixels[(y * 128 + x) * 4 + 3] < 64) continue;
        left = Math.min(left, x); top = Math.min(top, y);
        right = Math.max(right, x); bottom = Math.max(bottom, y);
      }
      emblemBounds[index] = right < left ? {x:0,y:0,w:image.naturalWidth,h:image.naturalHeight} : {
        x:left * image.naturalWidth / 128,
        y:top * image.naturalHeight / 128,
        w:(right - left + 1) * image.naturalWidth / 128,
        h:(bottom - top + 1) * image.naturalHeight / 128
      };
    };
    image.src = `startup/factions/faction-${index + 1}.png`;
    return image;
  });
  const centerX = 80, centerY = 57, unitsPerPixel = 25;
  let lastLabel = '';
  let hitMarkers = [];
  let lastState = null;
  let clickTimer;

  function pointedMarker(event) {
    const bounds = canvas.getBoundingClientRect();
    const x = (event.clientX - bounds.left) * 160 / bounds.width;
    const y = (event.clientY - bounds.top) * 120 / bounds.height;
    return hitMarkers.map(marker => ({marker, distance:Math.hypot(marker.x-x, marker.y-y)})).filter(entry => entry.distance <= 5).sort((a,b) => a.distance-b.distance)[0]?.marker;
  }
  canvas.addEventListener('pointermove', event => {
    const marker = pointedMarker(event);
    canvas.style.cursor = marker ? 'pointer' : 'zoom-in';
    canvas.title = marker ? `Click to ${marker.kind === 'planet' ? 'select' : 'target'} ${marker.name}; double-click to open map [M]` : 'Double-click to open map [M]';
  });
  canvas.addEventListener('click', event => {
    clearTimeout(clickTimer);
    if (event.detail > 1) return;
    const marker = pointedMarker(event);
    if (!marker) return;
    clickTimer = setTimeout(() => {
      if (canvas.hidden) return;
      if (marker.kind === 'planet') {
        window.nativeManualFlight?.clearTracking?.();
        if (lastState?.system === 1) window.vexedSolFlight?.setTarget(marker.id);
      } else {
        window.nativeAsteroidCombat?.deselect();
        window.nativeSolEconomy?.select(marker.kind === 'tug' ? marker.id : null);
        window.nativeCivilianTraffic?.select(marker.kind === 'civilian' ? marker.id : null);
        document.getElementById('space').focus({preventScroll:true});
      }
    }, 300);
  });
  function openMap() {
    clearTimeout(clickTimer);
    document.getElementById('mapBtn').click();
  }
  canvas.addEventListener('dblclick', event => {
    event.preventDefault();
    openMap();
  });
  canvas.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    openMap();
  });

  function radarPoint(x, y) {
    const dx = x / unitsPerPixel, dy = y / unitsPerPixel;
    const scale = Math.min(1, 69 / Math.max(.001, Math.abs(dx)), 35 / Math.max(.001, Math.abs(dy)));
    return {x:centerX + dx * scale, y:centerY + dy * scale, edge:scale < 1};
  }

  function marker(x, y, selected, id, name) {
    const {x:px, y:py, edge} = radarPoint(x, y);
    ctx.beginPath();
    ctx.arc(px, py, selected ? 3.6 : edge ? 2.9 : 2.5, 0, Math.PI * 2);
    ctx.fillStyle = selected ? '#f3d77e' : edge ? '#b9d9ed' : '#e9f5ff';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = selected ? '#fff4c6' : '#78b6d3';
    ctx.stroke();
    if (id !== undefined) hitMarkers.push({x:px, y:py, id, name, kind:'planet'});
  }

  function shipMarker(contact, player, selected) {
    const dx = contact.x - player.x, dy = contact.y - player.y;
    const point = radarPoint(dx, dy);
    ctx.save();
    ctx.translate(point.x, point.y);
    if (selected) {
      ctx.strokeStyle = '#ffdc78';
      ctx.lineWidth = 1.1;
      ctx.strokeRect(-5, -5, 10, 10);
    }
    ctx.rotate(Number(contact.heading) || 0);
    ctx.fillStyle = selected ? '#ffdc78' : '#82e5bd';
    ctx.strokeStyle = '#061a29';
    ctx.lineWidth = .7;
    ctx.beginPath();
    ctx.moveTo(3.5, 0);
    ctx.lineTo(-2.5, -2.5);
    ctx.lineTo(-1.3, 0);
    ctx.lineTo(-2.5, 2.5);
    ctx.closePath();
    ctx.fill();ctx.stroke();
    ctx.restore();
    hitMarkers.push({...point, id:contact.id, name:contact.name, kind:contact.kind});
  }

  function routeLine(dx, dy) {
    const scale = Math.min(64 / Math.abs(dx || .001), 31 / Math.abs(dy || .001));
    ctx.save();
    ctx.strokeStyle = 'rgba(109, 228, 242, .75)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.lineDashOffset = -performance.now() / 120;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(centerX + dx * scale, centerY + dy * scale);
    ctx.stroke();
    ctx.restore();
  }

  function destinationArrow(dx, dy, combatTarget = false) {
    if (Math.hypot(dx, dy) < 1) return;
    const scale = Math.min(64 / Math.abs(dx || .001), 31 / Math.abs(dy || .001));
    ctx.save();
    ctx.translate(centerX + dx * scale, centerY + dy * scale);
    ctx.rotate(Math.atan2(dy, dx));
    ctx.shadowColor = combatTarget ? '#ffce5e' : '#72e6f5';
    ctx.shadowBlur = 7;
    ctx.fillStyle = combatTarget ? '#ffdc78' : '#9af0f8';
    ctx.strokeStyle = combatTarget ? '#fff3c8' : '#e2ffff';
    ctx.lineWidth = .8;
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(-5, -4.5);
    ctx.lineTo(-3, 0);
    ctx.lineTo(-5, 4.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function playerMarker(angle) {
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.fillStyle = '#051c2b';
    ctx.strokeStyle = '#75e3f4';
    ctx.lineWidth = 1.2;
    ctx.shadowColor = '#5cdeef';
    ctx.shadowBlur = 7;
    ctx.beginPath();
    ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.rotate((Number(angle) || 0) + Math.PI / 2);
    ctx.fillStyle = '#edffff';
    ctx.beginPath();
    ctx.moveTo(0, -4);
    ctx.lineTo(2.7, 3);
    ctx.lineTo(0, 1.2);
    ctx.lineTo(-2.7, 3);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.font = '700 7px system-ui';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#a6f1fa';
    ctx.fillText('YOU', centerX, centerY + 14);
    ctx.textAlign = 'left';
  }

  function factionEmblem(faction) {
    const image = emblems[faction];
    if (!image.complete || !image.naturalWidth) return;
    const source = emblemBounds[faction] || {x:0,y:0,w:image.naturalWidth,h:image.naturalHeight};
    const scale = Math.min(25 / source.w, 23 / source.h);
    const width = source.w * scale, height = source.h * scale;
    ctx.drawImage(image, source.x, source.y, source.w, source.h,
      140 - width / 2, 15 - height / 2, width, height);
  }

  function paint(state, active) {
    canvas.hidden = !active || !state || state.landed;
    if (canvas.hidden) return;
    lastState = state;
    hitMarkers = [];
    const bounds = canvas.getBoundingClientRect();
    const density = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.max(1, Math.round(bounds.width * density));
    const pixelHeight = Math.max(1, Math.round(bounds.height * density));
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    ctx.setTransform(canvas.width / 160, 0, 0, canvas.height / 120, 0, 0);
    ctx.clearRect(0, 0, 160, 120);
    const background = ctx.createLinearGradient(0, 0, 160, 120);
    background.addColorStop(0, '#102e40');
    background.addColorStop(.55, '#061a29');
    background.addColorStop(1, '#091f32');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, 160, 120);
    ctx.strokeStyle = '#3e829d';
    ctx.lineWidth = 1.4;
    ctx.strokeRect(.8, .8, 158.4, 118.4);
    ctx.strokeStyle = '#82c9dc';
    ctx.lineWidth = .5;
    ctx.strokeRect(3.8, 3.8, 152.4, 112.4);
    ctx.fillStyle = 'rgba(3, 15, 26, .76)';
    ctx.fillRect(4, 99, 152, 17);
    ctx.strokeStyle = 'rgba(130, 201, 220, .65)';
    ctx.beginPath();ctx.moveTo(4, 99);ctx.lineTo(156, 99);ctx.stroke();
    ctx.strokeStyle = 'rgba(120, 174, 200, .17)';
    ctx.beginPath();
    ctx.moveTo(centerX, 19);ctx.lineTo(centerX, 95);
    ctx.moveTo(6, centerY);ctx.lineTo(154, centerY);
    ctx.stroke();
    const cruiseBody = state.localCruise && window.vexedSolFlight?.bodies.find(body => body.id === Number(state.localCruise.to));
    const manual = !cruiseBody && window.nativeManualFlight?.guidance(state);
    const player = state.system === 1 ? window.vexedSolFlight.shipPosition(state) : state;
    const tugTarget = state.system === 1 ? window.nativeSolEconomy?.target(state) : null;
    const civilianTarget = window.nativeCivilianTraffic?.target(state);
    const shipTarget = tugTarget || civilianTarget;
    const targetKind = tugTarget ? 'tug' : 'civilian';
    const nearbyTargets=window.nativeShipSystems.query(state,{minX:player.x-69*unitsPerPixel,minY:player.y-35*unitsPerPixel,
      maxX:player.x+69*unitsPerPixel,maxY:player.y+35*unitsPerPixel,categories:['tug','civilian']}).bystanders;
    const contact=target=>({id:target.entity.id,name:target.category==='tug'?`Tug II #${target.entity.id+1}`:target.entity.name,
      kind:target.category,x:target.x,y:target.y,heading:target.heading});
    const contacts=nearbyTargets.map(contact);
    if(shipTarget&&!contacts.some(ship=>ship.kind===targetKind&&ship.id===shipTarget.id)){
      const selected=window.nativeShipSystems.resolve(state,targetKind==='tug'?'tug:'+shipTarget.id:shipTarget.id);
      if(selected)contacts.push(contact(selected));
    }
    const nearby = contacts.filter(ship => shipTarget && ship.kind === targetKind && ship.id === shipTarget.id || !radarPoint(ship.x-player.x, ship.y-player.y).edge);
    ctx.font = '600 7px system-ui';
    ctx.fillStyle = '#91d1df';
    ctx.fillText(cruiseBody ? `CRUISE TO ${cruiseBody.name.toUpperCase()}` : manual ? `TRACK ${manual.name.toUpperCase()}` : `LOCAL RADAR · ${nearby.length} SHIPS`, 10, 14, 110);

    const faction = Math.max(0, Math.min(7, Number(state.faction) || 0));

    let target;
    let contactCount = 0;
    if (state.system === 1 && window.vexedSolFlight) {
      const ship = player;
      for (const body of window.vexedSolFlight.bodies) {
        const x = body.x - 220 - ship.x, y = body.y + 75 - ship.y;
        const selected = !manual && body.id === window.vexedSolFlight.targetId;
        marker(x, y, selected, body.id, body.name);
        if (selected) target = {name:body.name, dx:x, dy:y};
        contactCount++;
      }
      if (cruiseBody) {
        const goal = window.vexedSolFlight.bodyPosition(cruiseBody);
        routeLine(goal.x - ship.x, goal.y - ship.y);
      }
    } else {
      const dx = -220 - Number(state.x || 0), dy = 75 - Number(state.y || 0);
      marker(dx, dy, !manual, 'local', state.planet || 'Planet');
      target = {name:state.planet || 'Planet', dx, dy};
      contactCount = 1;
    }
      const mined=[...(state.minedAsteroids||[]),...(state.destroyedAsteroids||[])];
      const asteroids=(window.nativeSolAsteroids?.nearby?.(state.system,player,2500)||[])
        .filter(rock=>!mined.includes(rock.slotId)&&Math.hypot(rock.x-player.x,rock.y-player.y)<2500)
        .sort((a,b)=>Math.hypot(a.x-player.x,a.y-player.y)-Math.hypot(b.x-player.x,b.y-player.y))
        .slice(0,5);
      ctx.save();ctx.fillStyle='#b5bdc4';ctx.strokeStyle='#638394';ctx.lineWidth=.6;
      for(const rock of asteroids){
        const x=centerX+(rock.x-player.x)/unitsPerPixel,y=centerY+(rock.y-player.y)/unitsPerPixel;
        if(x<9||x>151||y<21||y>94)continue;
        ctx.beginPath();ctx.moveTo(x,y-2);ctx.lineTo(x+2,y);ctx.lineTo(x,y+2);ctx.lineTo(x-2,y);ctx.closePath();ctx.fill();ctx.stroke();
      }
      ctx.restore();
    if(manual){
      routeLine(manual.dx,manual.dy);
      marker(manual.dx,manual.dy,true);
      target={name:manual.name,dx:manual.dx,dy:manual.dy};
    }
    const selectedShip = nearby.find(ship => shipTarget && ship.kind === targetKind && ship.id === shipTarget.id);
    for (const ship of nearby) if (ship !== selectedShip) shipMarker(ship, player, false);
    if (selectedShip) {
      shipMarker(selectedShip, player, true);
      target = {name:selectedShip.name, dx:selectedShip.x-player.x, dy:selectedShip.y-player.y, combat:true};
    }
    if (target) {
      destinationArrow(target.dx, target.dy, target.combat);
      const distance = Math.round(Math.hypot(target.dx, target.dy));
      ctx.font = '600 9px system-ui';
      ctx.fillStyle = target.combat ? '#ffdc78' : '#dbf6f9';
      ctx.fillText(`${target.combat ? 'TARGET ' : ''}${target.name.toUpperCase()}`, 10, 111, 95);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#9ce7f0';
      ctx.fillText(`${distance.toLocaleString()} u`, 149, 111, 44);
      ctx.textAlign = 'left';
    }
    playerMarker(state.angle);
    factionEmblem(faction);
    const label = `${factionNames[faction]} local radar. Your ship is at the center, heading ${Math.round((Number(state.angle) || 0) * 180 / Math.PI)} degrees. ${contactCount} planet markers. ${nearby.length} ship contacts shown as green arrows; your targeted ship has a gold box and direction pointer. ${target?.combat ? 'Targeted ship' : 'Destination'}: ${target?.name || 'None'}, ${Math.round(Math.hypot(target?.dx || 0, target?.dy || 0)).toLocaleString()} units away. Click a ship to target it or a planet dot to select it; double-click the radar to open map, same as M.`;
    if (label !== lastLabel) {
      canvas.setAttribute('aria-label', label);
      lastLabel = label;
    }
  }
  window.nativeRadar = {paint};
})();
