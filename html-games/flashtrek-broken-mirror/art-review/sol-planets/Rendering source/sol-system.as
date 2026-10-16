// Sol uses the existing Earth region (1), camera, native ships, combat and cargo.
function vexSolNodes()
{
   return [
      {id:0,name:"Sun",x:-6000,y:-1000,radius:210,color:16757548,kind:"star",port:false,mine:false,description:"Our star. Observe from a safe distance; there are no docking services."},
      {id:1,name:"Mercury",x:-4100,y:1100,radius:48,color:11182234,kind:"rock",port:true,mine:true,description:"A rocky inner world. Mercury Extraction Outpost buys ore and supplies equipment."},
      {id:2,name:"Venus",x:-2300,y:-1500,radius:76,color:14857318,kind:"cloud",port:true,mine:false,description:"Dense cloud cover. The Venus orbital depot handles supplies above the atmosphere."},
      {id:3,name:"Earth",x:0,y:0,radius:90,color:6865361,kind:"earth",port:true,mine:false,description:"Sol's main port. Existing Earth trading, shipyards, and government services remain here."},
      {id:4,name:"Moon",x:1400,y:-250,radius:46,color:12435142,kind:"rock",port:true,mine:true,description:"Lunar settlement and mining operations. Purchase a local mining license before extracting ore."},
      {id:5,name:"Mars",x:4800,y:1800,radius:64,color:13654366,kind:"rock",port:true,mine:false,description:"Mars Colony and Refinery. Sell mined deuranium or refine it into ship construction resources."},
      {id:6,name:"Asteroid Belt",x:8000,y:-1400,radius:180,color:11243915,kind:"belt",port:false,mine:true,description:"Rich deuranium deposits, working prospectors, and pirate activity. Stop inside the field to mine."},
      {id:7,name:"Jupiter",x:11800,y:2700,radius:135,color:14135695,kind:"gas",port:true,mine:false,description:"Jupiter orbital station supports supply ships and prospectors. Trade takes place at the station, not on the gas giant."},
      {id:8,name:"Saturn",x:15300,y:-2700,radius:115,color:14535559,kind:"rings",port:true,mine:false,description:"Saturn's orbital depot serves the outer-system shipping lanes."},
      {id:9,name:"Uranus",x:19000,y:3300,radius:88,color:8041172,kind:"ice",port:true,mine:false,description:"A remote orbital research outpost. Long journeys need protection and supplies."},
      {id:10,name:"Neptune",x:23200,y:-4400,radius:87,color:5015744,kind:"ice",port:true,mine:false,description:"Neptune Frontier Station. A distant trading and exploration destination in Sol."}
   ];
}
function vexSolJobDefs()
{
   return [
      {id:0,name:"Supply Mars Colony",kind:"supply",destination:5,claim:5,pay:650,prestige:6,description:"Collect 5 tons of sealed supplies at Earth. Deliver them to Mars while stopped at the port."},
      {id:1,name:"Asteroid Belt Pirate Bounty",kind:"bounty",destination:6,claim:3,pay:1100,prestige:10,description:"Find the two marked pirate ships near the belt. Damage each yourself and help destroy them, then return to Earth."},
      {id:2,name:"Escort the Mars Freighter",kind:"escort",destination:5,claim:5,pay:900,prestige:8,description:"Collect a real freighter at Earth. Stay within 1,500 units, defend it, and reach Mars with its cargo intact."},
      {id:3,name:"Rescue Belt Survivors",kind:"rescue",destination:6,claim:3,pay:800,prestige:8,description:"Find the marked wreck near the belt. Stop nearby, recover survivors (2 cargo tons), and return to Earth."},
      {id:4,name:"Repair a Disabled Prospector",kind:"repair",destination:5,claim:3,pay:700,prestige:6,description:"Reach the disabled ship near Mars. Spend 5 units of construction deuranium to repair it, then report to Earth."},
      {id:5,name:"Patrol the Earth-Mars Lane",kind:"patrol",destination:5,claim:3,pay:950,prestige:9,description:"Fly the Earth-Mars lane and destroy the two marked raiders. Return to Earth for your patrol reward."},
      {id:6,name:"Emergency Medicine for Venus",kind:"supply",destination:2,claim:2,pay:750,prestige:8,description:"Load 5 tons of sealed medical relief supplies at Earth. Deliver them to the Venus orbital depot."}
   ];
}
function vexSolNode(id) {return _root.vexSolChart[Number(id)];}
function vexSolPosition()
{
   var z = Math.max(0.1,Number(_root.zoom));
   return {x:(_root.player._x - _root.planet._x) * z,y:(_root.player._y - _root.planet._y) * z};
}
function vexSolDistance(id)
{
   var node = vexSolNode(id);
   var pos = vexSolPosition();
   return Math.sqrt((node.x - pos.x) * (node.x - pos.x) + (node.y - pos.y) * (node.y - pos.y));
}
function vexSolNear()
{
   var best = -1;
   var distance = 1000000;
   for(var id = 0; id < _root.vexSolChart.length; id++)
   {
      var d = vexSolDistance(id);
      if(d < distance) {distance = d;best = id;}
   }
   return {id:best,distance:distance};
}
function vexSolDocked(id)
{
   return _root.myplanet == 1 && _root._currentframe == 154 && _root.myhull > 0 && Math.abs(Number(_root.speed)) < 1 && vexSolDistance(id) <= 320;
}
function vexSolNotice(message)
{
   var e = _root.vexSol;
   e.log.unshift({time:Math.floor(e.time),text:message});
   if(e.log.length > 20) e.log.pop();
   flash.external.ExternalInterface.call("solNotice",message);
}
function vexSolPrestige(amount,reason)
{
   var old = Number(_root.localprestige[1]);
   _root.localprestige[1] = old + amount;
   _root.vexSol.lastPrestige = old + amount;
   _root.updatemenu();
   vexSolNotice("Earth prestige " + (amount >= 0 ? "+" : "") + amount + " - " + reason + ". Now " + Math.floor(old + amount) + ".");
}
function vexSolCargoUsed()
{
   var used = 0;
   for(var slot = 1; slot <= 10; slot++)
   {
      var tons = Number(_root.cargoArray[(slot - 1) * 4 + 1]);
      if(tons > 0) used += tons;
   }
   return used;
}
function vexSolCargoAdd(g,qty,destination)
{
   if(vexSolCargoUsed() + qty > Number(_root.totcargo)) return 0;
   var slot = 0;
   if(destination == undefined) slot = vexTradeSlot(g,true);
   else for(var i = 1; i <= 10; i++) if(Number(_root.cargoArray[(i - 1) * 4 + 1]) <= 0 && slot == 0) slot = (i - 1) * 4 + 1;
   if(slot == 0) return 0;
   var old = Number(_root.cargoArray[slot]);
   _root.cargoArray[slot] = (old > 0 ? old : 0) + qty;
   _root.cargoArray[slot + 1] = destination == undefined ? vexTradeGood(g) : (g == 0 ? "Sealed Sol relief supplies" : "Rescued Sol survivors");
   _root.cargoArray[slot + 2] = destination;
   _root.cargoArray[slot + 3] = 0;
   _root.updatemenu();
   return slot;
}
function vexSolCargoClear(slot)
{
   if(slot <= 0) return;
   _root.cargoArray[slot] = 0;
   _root.cargoArray[slot + 1] = "Nothing";
   _root.cargoArray[slot + 2] = undefined;
   _root.cargoArray[slot + 3] = 0;
   _root.updatemenu();
}
function vexSolCircle(clip,x,y,r,color,alpha)
{
   clip.beginFill(color,alpha);
   clip.moveTo(x + r,y);
   for(var i = 1; i <= 28; i++) clip.lineTo(x + Math.cos(i * Math.PI / 14) * r,y + Math.sin(i * Math.PI / 14) * r);
   clip.endFill();
}
function vexSolDrawBody(clip,node)
{
   var r = node.radius;
   if(node.kind == "belt")
   {
      for(var n = 0; n < 24; n++)
      {
         var a = n * 2.4;
         var reach = 45 + n * 17 % 160;
         vexSolCircle(clip,Math.cos(a) * reach,Math.sin(a) * reach,(8 + n % 6),node.color,55 + n % 40);
      }
   }
   else
   {
      for(var n = 0; n < 10; n++)
      {
         var f = 0.32 + n * 0.07;
         var red = Math.floor(((node.color >> 16) & 255) * f);
         var green = Math.floor(((node.color >> 8) & 255) * f);
         var blue = Math.floor((node.color & 255) * f);
         vexSolCircle(clip,-n * r * 0.025,-n * r * 0.025,r * (1 - n * 0.055),(red << 16) + (green << 8) + blue,100);
      }
      if(node.kind == "gas" || node.kind == "cloud")
      {
         for(var n = 0; n < 6; n++)
         {
            var y = -r * 0.6 + n * r * 0.24;
            var width = Math.sqrt(r * r - y * y) * 0.85;
            clip.lineStyle(r * 0.065,node.kind == "gas" ? 10456934 : 16769694,35);
            clip.moveTo(-width,y);clip.curveTo(0,y + r * 0.13,width,y);
         }
      }
      if(node.kind == "rock")
         for(var n = 0; n < 6; n++) vexSolCircle(clip,Math.cos(n * 2) * r * 0.45,Math.sin(n * 2) * r * 0.55,r * (0.07 + n % 3 * 0.025),3222568,25);
      if(node.kind == "rings")
      {
         clip.lineStyle(10,14535559,65);
         clip.moveTo(r * 1.55,0);
         for(var n = 1; n <= 48; n++) clip.lineTo(Math.cos(n * Math.PI / 24) * r * 1.55,Math.sin(n * Math.PI / 24) * r * 0.34);
      }
      if(node.kind == "star")
      {
         for(var n = 1; n <= 4; n++)
         {
            clip.lineStyle(8,16763955,20 / n);
            clip.moveTo(r + n * 8,0);
            for(var a = 1; a <= 40; a++) clip.lineTo(Math.cos(a * Math.PI / 20) * (r + n * 8),Math.sin(a * Math.PI / 20) * (r + n * 8));
         }
      }
   }
   clip.lineStyle();
   clip.createTextField("label",1,-160,r + 12,320,30);
   var format = new TextFormat("Arial",12,13427953,true);
   format.align = "center";
   clip.label.setNewTextFormat(format);clip.label.text = node.name;clip.label.selectable = false;
}
function vexSolSpawnRecord(role,x,y,dest,job,label)
{
   var rec = {id:_root.vexSol.serial++,role:role,x:x,y:y,destination:dest,job:job,name:label,phase:"travel",cargo:0,health:-1,playerHit:false,clock:0};
   _root.vexSol.actors.push(rec);
   return rec;
}
function vexSolProject(rec)
{
   var name = _root.vexSolLinks[rec.id];
   var ship = _root[name];
   if(rec.health == 0) return undefined;
   if(typeof ship != "movieclip")
   {
      name = "station" + _root.s;
      _root.createalliedship(rec.role == "pirate" ? 7 : 18,rec.name);
      ship = _root[name];
      _root.vexSolLinks[rec.id] = name;
      ship.vexSolID = rec.id;ship.vexSolRole = rec.role;ship.vexSolJob = rec.job;
      ship._x = _root.planet._x + rec.x / _root.zoom;
      ship._y = _root.planet._y + rec.y / _root.zoom;
      ship.vexVelocity = 0;
      ship.myorders = 2;ship.orders = 2;
      _root.shipsgovt[ship.myslot] = rec.role == "pirate" ? 15 : 12;
      ship.mygovt = _root.shipsgovt[ship.myslot];ship.myrace = rec.role == "pirate" ? 8 : 4;
      if(rec.health > 0) ship.mystrength = Math.min(rec.health,ship.totstrength);
      if(rec.health < 0) rec.health = Number(ship.mystrength);
      _root.vexTrafficFrame = undefined;
   }
   return ship;
}
function vexSolRec(id)
{
   for(var i = 0; i < _root.vexSol.actors.length; i++) if(_root.vexSol.actors[i].id == id) return _root.vexSol.actors[i];
   return undefined;
}
function vexSolPlayerHit(ship)
{
   if(_root.myplanet != 1 || ship.vexSolRole == undefined) return;
   var rec = vexSolRec(ship.vexSolID);
   if(rec == undefined) return;
   rec.playerHit = true;
   var job = _root.vexSol.job;
   if(rec.role != "pirate" && !rec.warned)
   {
      rec.warned = true;
      vexSolNotice("Civilian ship hit: " + rec.name + ". Protecting civilians earns respect; attacking them can cost it.");
      if(rec.job == job.serial && job.kind == "escort") {job.failed = true;vexSolNotice("Escort failed: you attacked the freighter.");}
   }
}
function vexSolDestroyed(ship)
{
   if(_root.myplanet != 1 || ship.vexSolDead) return;
   ship.vexSolDead = true;
   var rec = vexSolRec(ship.vexSolID);
   if(rec == undefined) return;
   rec.health = 0;
   var job = _root.vexSol.job;
   if(rec.job == job.serial && !job.failed)
   {
      if(rec.role == "pirate" && rec.playerHit && (job.kind == "bounty" || job.kind == "patrol"))
      {
         job.kills++;
         vexSolNotice("Marked pirate destroyed: " + job.kills + " / 2. Mission reward is paid when you report in.");
         if(job.kills >= 2) job.ready = true;
      }
      else if(rec.role == "pirate" && (job.kind == "bounty" || job.kind == "patrol"))
      {
         job.failed = true;vexSolNotice("Mission failed: the marked pirate was destroyed without your combat participation.");
      }
      if(rec.role == "escort" || rec.role == "disabled") {job.failed = true;vexSolNotice("Mission failed: " + rec.name + " was destroyed.");}
   }
   if(rec.job == -1) vexSolNotice(rec.role == "pirate" ? rec.name + " destroyed." : rec.name + " was lost. Its cargo will not reach the destination.");
}
function vexSolJobSpawn(job)
{
   if(job.spawned || job.failed || job.ready) return;
   var def = _root.vexSolJobs[job.id];
   if(job.kind == "escort")
   {
      var rec = vexSolSpawnRecord("escort",300,100,5,job.serial,"ESCORT - Mars Supply Freighter");
      job.actor = rec.id;job.spawned = true;
   }
   if(job.kind == "repair")
   {
      var rec = vexSolSpawnRecord("disabled",5300,1950,5,job.serial,"DISABLED - Belt Prospector");
      rec.phase = "disabled";rec.health = 50;job.actor = rec.id;job.spawned = true;
   }
   if(job.kind == "bounty" || job.kind == "patrol")
   {
      var x = job.kind == "bounty" ? 8100 : 2500;
      var y = job.kind == "bounty" ? -1300 : 950;
      var pos = vexSolPosition();
      if(Math.sqrt((pos.x - x) * (pos.x - x) + (pos.y - y) * (pos.y - y)) < 1900)
      {
         vexSolSpawnRecord("pirate",x,y,6,job.serial,"PIRATE - Marked Raider Alpha");
         vexSolSpawnRecord("pirate",x + 550,y - 250,6,job.serial,"PIRATE - Marked Raider Beta");
         job.spawned = true;_root.vexSol.course = -1;_root.speed = 0;
         vexSolNotice("Bounty contacts identified. Local cruise disengaged - prepare for combat.");
      }
   }
}
function vexSolActorTick(rec,elapsed)
{
   var ship = vexSolProject(rec);
   if(typeof ship != "movieclip" || ship.mystrength <= 0) return;
   rec.health = Number(ship.mystrength);
   rec.x = (ship._x - _root.planet._x) * _root.zoom;
   rec.y = (ship._y - _root.planet._y) * _root.zoom;
   var job = _root.vexSol.job;
   var goal = vexSolNode(rec.destination);
   var distance = Math.sqrt((rec.x - goal.x) * (rec.x - goal.x) + (rec.y - goal.y) * (rec.y - goal.y));
   var pos = vexSolPosition();
   var playerDistance = Math.sqrt((rec.x - pos.x) * (rec.x - pos.x) + (rec.y - pos.y) * (rec.y - pos.y));
   var gate = _root["vexSolGate" + rec.id];
   if(typeof gate != "movieclip") {gate = _root.createEmptyMovieClip("vexSolGate" + rec.id,30500 + rec.id);_root.vexRegisterCamera(gate,1);}
   gate._x = _root.planet._x + goal.x / _root.zoom;
   gate._y = _root.planet._y + goal.y / _root.zoom;
   if(rec.role == "pirate")
   {
      ship.alert = 3;
      ship.mytarget = rec.victim == undefined ? "player" : _root.vexSolLinks[rec.victim];
      if(typeof _root[ship.mytarget] != "movieclip") ship.mytarget = "player";
      ship.vexSolVictim = rec.victim == undefined ? undefined : ship.mytarget;
      return;
   }
   ship.alert = 1;
   ship.mytarget = "vexSolGate" + rec.id;
   ship.totspeed = Math.min(Number(ship.totspeed),rec.role == "escort" ? 10 : 12);
   if(rec.role == "disabled") {ship.mytarget = ship.myself;ship.vexVelocity = 0;return;}
   if(rec.role == "escort")
   {
      if(job.serial != rec.job || job.failed) {ship.mytarget = ship.myself;return;}
      if(playerDistance > 1500) {ship.mytarget = ship.myself;ship.vexVelocity = 0;}
      else job.accompanied += elapsed;
      if(rec.x > 2000 && !job.ambushed)
      {
         var raider = vexSolSpawnRecord("pirate",rec.x + 950,rec.y - 250,5,job.serial,"PIRATE - Convoy Ambusher");
         raider.victim = rec.id;job.ambushed = true;
         _root.vexSol.course = -1;_root.speed = 0;
         vexSolNotice("Pirate approaching your escorted freighter. Protect its cargo!");
      }
      if(distance < 330 && job.accompanied >= 10) {job.ready = true;ship.mytarget = ship.myself;ship.vexVelocity = 0;}
      return;
   }
   if(distance < 330)
   {
      if(rec.role == "miner" && rec.destination == 6)
      {
         ship.mytarget = ship.myself;ship.vexVelocity = 0;rec.clock += elapsed;
         if(rec.clock >= 3 && _root.vexSol.ore[6] > 0) {_root.vexSol.ore[6]--;rec.cargo++;rec.clock = 0;}
         rec.phase = "mining";
         if(rec.cargo >= 8 || _root.vexSol.ore[6] <= 0) {rec.destination = 5;rec.phase = "returning";}
      }
      else
      {
         if(rec.cargo > 0)
         {
            _root.vexSol.stocks[rec.destination][rec.role == "miner" ? 5 : 3] += rec.cargo;
            vexSolNotice(rec.name + " delivered " + rec.cargo + " t to " + goal.name + ".");
         }
         rec.cargo = 0;
         if(rec.role == "miner") rec.destination = 6;
         else
         {
            var qty = Math.min(8,_root.vexSol.stocks[rec.destination][3]);
            _root.vexSol.stocks[rec.destination][3] -= qty;rec.cargo = qty;
            rec.destination = rec.destination == 3 ? 5 : 3;
         }
         rec.phase = "travel";
      }
   }
}
function vexSolCapture()
{
   if(_root.myplanet != 1 || _root._currentframe != 154 || _root.vexSol == undefined) return;
   var pos = vexSolPosition();_root.vexSol.x = pos.x;_root.vexSol.y = pos.y;
   for(var i = 0; i < _root.vexSol.actors.length; i++)
   {
      var rec = _root.vexSol.actors[i];var ship = _root[_root.vexSolLinks[rec.id]];
      if(typeof ship == "movieclip" && !ship.vexSolDead)
      {
         rec.x = (ship._x - _root.planet._x) * _root.zoom;rec.y = (ship._y - _root.planet._y) * _root.zoom;
         rec.health = Math.max(0,Number(ship.mystrength));
      }
   }
}
function vexSolPilot(dt)
{
   if(_root.myplanet != 1 || _root._currentframe != 154 || _root.vexSol == undefined || _root.vexSol.course < 0) return;
   var e = _root.vexSol;
   if(Key.isDown(38) || Key.isDown(40) || Key.isDown(37) || Key.isDown(39) || _root.myhull <= 0 || _root.player.playershiptype.repair == 1 || _root.player.warp == 3)
   {e.course = -1;return;}
   var node = e.course == 11 ? e.waypoint : vexSolNode(e.course);var pos = vexSolPosition();
   if(node == undefined) {e.course = -1;return;}
   var dx = node.x - pos.x;var dy = node.y - pos.y;var distance = Math.sqrt(dx * dx + dy * dy);
   if(distance < 210 && Math.abs(_root.speed) < 2)
   {
      _root.speed = 0;e.course = -1;if(node.id >= 0) e.visited[node.id] = true;
      vexSolNotice("Arrived at " + node.name + ". Open Sol system for local services.");return;
   }
   var desired = Math.atan2(dy,dx) * 180 / Math.PI + 90;
   var turn = (desired - _root.player._rotation + 540) % 360 - 180;
   _root.player._rotation += Math.max(-90 * dt,Math.min(90 * dt,turn));
   _root.player.vexPlayerTurn = 0;
   var maximum = Math.max(10,Math.min(24,Number(_root.totspeed) * 1.2));
   if(e.job.kind == "escort" && !e.job.failed && !e.job.ready)
   {
      var ship = _root[_root.vexSolLinks[e.job.actor]];
      if(typeof ship == "movieclip")
      {
         var sx = (ship._x - _root.player._x) * _root.zoom;var sy = (ship._y - _root.player._y) * _root.zoom;
         maximum = Math.min(maximum,8);
         if(Math.sqrt(sx * sx + sy * sy) > 1100) maximum = 0;
      }
   }
   var target = Math.min(maximum,Math.sqrt(Math.max(0,distance - 140) * 2 * 26 / 13));
   if(Math.abs(turn) > 35) target = Math.min(3,target);
   var speed = Math.abs(Number(_root.speed));
   speed += Math.max(-26 * dt,Math.min(26 * dt,target - speed));
   _root.speed = -speed;
}
function vexSolRender()
{
   if(_root.myplanet != 1 || _root._currentframe != 154)
   {
      for(var i = 0; i < _root.vexSol.actors.length; i++) removeMovieClip(_root["vexSolGate" + _root.vexSol.actors[i].id]);
      removeMovieClip(_root.vexSolBodies);removeMovieClip(_root.vexSolMarkers);removeMovieClip(_root.vexSolClock);return;
   }
   var z = Math.max(0.1,Number(_root.zoom));
   for(var id = 0; id < _root.vexSolChart.length; id++)
   {
      if(id == 3) continue;
      var node = vexSolNode(id);var clip = _root.vexSolBodies["body" + id];
      clip._x = _root.planet._x + node.x / z;clip._y = _root.planet._y + node.y / z;
      clip._xscale = clip._yscale = 100 / z;
      clip._visible = clip._x > -300 && clip._x < 900 && clip._y > -300 && clip._y < 750;
   }
   var marks = _root.vexSolMarkers;marks.clear();
   var e = _root.vexSol;
   if(e.mining >= 0)
   {
      var node = vexSolNode(e.mining);
      marks.lineStyle(2,11399831,65);marks.moveTo(_root.player._x,_root.player._y);marks.lineTo(_root.planet._x + node.x / z,_root.planet._y + node.y / z);
   }
   if(e.job.kind == "rescue" && !e.job.ready && !e.job.failed)
   {
      var x = _root.planet._x + 8400 / z;var y = _root.planet._y - 1050 / z;
      marks.lineStyle(2,16765325,90);marks.moveTo(x - 8,y);marks.lineTo(x,y - 8);marks.lineTo(x + 8,y);marks.lineTo(x,y + 8);marks.lineTo(x - 8,y);
   }
}
function vexSolTick(elapsed)
{
   var e = _root.vexSol;e.time += elapsed;vexSolCapture();
   var near = vexSolNear();
   if(near.distance < 600) e.visited[near.id] = true;
   if(Number(_root.localprestige[1]) != e.lastPrestige)
   {
      var diff = Number(_root.localprestige[1]) - e.lastPrestige;
      e.lastPrestige = Number(_root.localprestige[1]);
      vexSolNotice("Earth prestige " + (diff >= 0 ? "+" : "") + diff + " from a combat or original-game action. Now " + Math.floor(e.lastPrestige) + ".");
   }
   if(e.mining >= 0)
   {
      if(!vexSolDocked(e.mining) || _root.myhull <= 0) {e.mining = -1;vexSolNotice("Mining stopped: remain stationary inside the field.");}
      else
      {
         e.mineClock += elapsed;
         if(e.mineClock >= 2)
         {
            e.mineClock = 0;
            if(e.ore[e.mining] <= 0 || vexSolCargoAdd(5,1,undefined) == 0) {e.mining = -1;vexSolNotice("Mining stopped: deposit empty or cargo hold full.");}
            else
            {
               e.ore[e.mining]--;
               if(!e.permit && _root.asteroidpass != 1) vexSolPrestige(-1,"unlicensed mining");
            }
         }
      }
   }
   var job = e.job;
   if(job != undefined) vexSolJobSpawn(job);
   var count = e.actors.length;
   for(var i = 0; i < count; i++) vexSolActorTick(e.actors[i],elapsed);
   if(job.kind == "escort" && job.ready) vexSolNoticeOnce("escortReady","Freighter reached Mars alive. Stop at Mars and claim your reward.");
   // A bounded encounter near the mining lane, with a long cooldown.
   var liveRaiders = 0;
   for(var i = 0; i < e.actors.length; i++) if(e.actors[i].role == "pirate" && e.actors[i].job == -1 && e.actors[i].health > 0) liveRaiders++;
   if(near.id == 6 && near.distance < 1200 && e.time >= e.nextRaid && job == undefined && liveRaiders < 2)
   {
      var rec = vexSolSpawnRecord("pirate",e.x + 850,e.y - 200,6,-1,"PIRATE - Belt Raider");
      e.nextRaid = e.time + 180;e.course = -1;
      vexSolNotice("Pirate detected near the mining field. A red PIRATE label identifies the threat.");
   }
   for(var key in _root.otherships)
   {
      var ship = _root[_root.otherships[key]];
      if(typeof ship != "movieclip" || ship.mystrength <= 0) continue;
      if(Number(_root.shipsgovt[ship.myslot]) == 15 && ship.solLabel == undefined)
      {
         ship.createTextField("solLabel",1005,-100,-65,200,22);
         var format = new TextFormat("Arial",11,16744850,true);format.align = "center";
         ship.solLabel.setNewTextFormat(format);ship.solLabel.text = ship.vexSolJob >= 0 ? "PIRATE - MISSION TARGET" : "PIRATE";ship.solLabel.selectable = false;
      }
   }
}
function vexSolNoticeOnce(key,message)
{
   if(_root.vexSol.job[key]) return;_root.vexSol.job[key] = true;vexSolNotice(message);
}
function vexSolState(selected)
{
   if(_root.myplanet != 1 || _root._currentframe != 154) return {ok:false,error:"Sol local navigation is available in Earth's system."};
   var e = _root.vexSol;var near = vexSolNear();var id = Number(selected);
   if(vexSolNode(id) == undefined) id = near.id;
   var node = vexSolNode(id);var nodes = [];
   for(var n = 0; n < _root.vexSolChart.length; n++)
   {
      var item = vexSolNode(n);nodes.push({id:n,name:item.name,x:item.x,y:item.y,color:item.color,kind:item.kind,visited:e.visited[n] == true,distance:Math.floor(vexSolDistance(n)),port:item.port,mine:item.mine});
   }
   var goods = [];
   for(var g = 0; g < 6; g++)
   {
      var slot = vexTradeSlot(g,false);var base = [70,25,95,70,30,45][g];
      var price = Math.round(base * Math.max(0.6,Math.min(1.8,1.7 - e.stocks[id][g] / 140)));
      goods.push({id:g,name:vexTradeGood(g),stock:e.stocks[id][g],buy:price,sell:Math.floor(price * 0.8),owned:slot > 0 ? Number(_root.cargoArray[slot]) : 0});
   }
   var jobs = [];
   for(var n = 0; n < _root.vexSolJobs.length; n++)
   {
      var def = _root.vexSolJobs[n];var cooldown = e.cooldowns[n] == undefined ? 0 : Math.max(0,Math.ceil(e.cooldowns[n] - e.time));jobs.push({id:n,name:def.name,kind:def.kind,destination:def.destination,claim:def.claim,pay:def.pay,prestige:def.prestige,description:def.description,cooldown:cooldown});
   }
   var actors = [];
   for(var n = 0; n < e.actors.length; n++)
   {
      var rec = e.actors[n];var ship = _root[_root.vexSolLinks[rec.id]];
      if(rec.health > 0) actors.push({id:rec.id,name:rec.name,role:rec.role,x:rec.x,y:rec.y,cargo:rec.cargo,phase:rec.phase,health:rec.health,screenX:ship._x,screenY:ship._y});
   }
   return {ok:true,earthDocked:vexSolDocked(3),nodes:nodes,near:near.id,distance:Math.floor(near.distance),position:vexSolPosition(),course:e.course,waypoint:e.waypoint,visited:e.visited,selected:{id:id,name:node.name,description:node.description,port:node.port,mine:node.mine,ore:e.visited[id] ? e.ore[id] : -1,docked:vexSolDocked(id),distance:Math.floor(vexSolDistance(id)),visited:e.visited[id] == true},time:Math.floor(e.time),permit:e.permit || _root.asteroidpass == 1,mining:e.mining,latinum:Number(_root.mylatinum),prestige:Number(_root.localprestige[1]),capacity:Number(_root.totcargo),used:vexSolCargoUsed(),construction:Number(_root.mydeuranium),goods:goods,jobs:jobs,job:e.job,actors:actors,log:e.log,allowed:Number(_root.localprestige[1]) > 0 || _root.planetpass == 1};
}
function vexSolAction(action,value,quantity)
{
   if(_root._currentframe != 154 || _root.myplanet != 1 || _root.myhull <= 0) return {ok:false,error:"Return to flight in Earth's system."};
   var e = _root.vexSol;var id = Number(value);var qty = Number(quantity);
   if(action == "state") return vexSolState(id);
   if(action == "open") {flash.external.ExternalInterface.call("openSol");return {ok:true};}
   if(action == "stop") {e.course = -1;e.mining = -1;_root.speed = 0;return {ok:true,message:"Local cruise and mining stopped."};}
   if(action == "shipyard")
   {
      if((id != 3 && id != 5) || !vexSolDocked(id)) return {ok:false,error:"Stop at Earth or Mars to use the regional shipyard."};
      if(Number(_root.localprestige[1]) <= 0 && _root.planetpass != 1) return {ok:false,error:"The Earth regional shipyard requires positive Earth prestige or a planet pass."};
      _root.deselectobject();_root.loadcomm();_root.commpanel._x = 297;_root.commpanel._y = 233;_root.commpanel._xscale = 135;_root.commpanel._yscale = 135;
      _root.commpanel.mytype = 4;_root.commpanel.priceadjust = _root.priceadjust;
      return {ok:true,message:"Earth regional shipyard opened. Earth and Mars share its inventory and standing requirements."};
   }
   if(action == "repairship")
   {
      if(!vexSolNode(id).port || !vexSolDocked(id)) return {ok:false,error:"Stop at a Sol port for repairs."};
      var cost = Math.ceil(Math.max(0,_root.tothull - _root.myhull) * 2 + Math.max(0,_root.totshields - _root.myshields));
      if(cost <= 0) return {ok:false,error:"Your ship is already fully repaired."};
      if(_root.mylatinum < cost) return {ok:false,error:"Full repairs cost " + cost + " latinum."};
      _root.mylatinum -= cost;_root.myhull = _root.tothull;_root.myshields = _root.totshields;_root.updatemenu();
      vexSolNotice("Port repairs complete: -" + cost + " latinum.");return {ok:true,message:"Hull and shields restored for " + cost + " latinum."};
   }
   if(action == "course")
   {
      if(vexSolNode(id) == undefined || id != Math.floor(id)) return {ok:false,error:"Select a local destination."};
      if(_root.player.playershiptype.repair == 1) return {ok:false,error:"Finish repairs before flying."};
      if(id == 0) return {ok:false,error:"The Sun has no port. Observe it from Mercury's approach."};
      e.course = id;e.mining = -1;return {ok:true,message:"Local course set to " + vexSolNode(id).name + ". Arrow keys override cruise."};
   }
   if(action == "objective")
   {
      var job = e.job;
      if(job == undefined || job.failed) return {ok:false,error:"No active mission objective."};
      if(job.ready) return vexSolAction("course",job.claim,0);
      if(job.kind == "supply" || job.kind == "escort") return vexSolAction("course",job.destination,0);
      var point;
      if(job.kind == "rescue") point = {id:-1,x:8400,y:-1050,name:"Survivor wreck beacon"};
      if(job.kind == "repair") point = {id:-1,x:5300,y:1950,name:"Disabled prospector"};
      if(job.kind == "bounty") point = {id:-1,x:8100,y:-1300,name:"Belt bounty contacts"};
      if(job.kind == "patrol") point = {id:-1,x:2500,y:950,name:"Patrol encounter"};
      e.waypoint = point;e.course = 11;e.mining = -1;return {ok:true,message:"Mission course set. Arrow keys override cruise."};
   }
   if(action == "mine")
   {
      if(e.mining >= 0) {e.mining = -1;return {ok:true,message:"Mining stopped."};}
      if(!vexSolNode(id).mine || !vexSolDocked(id)) return {ok:false,error:"Reach a mining field and stop within 320 units."};
      if(e.ore[id] <= 0) return {ok:false,error:"This deposit is exhausted."};
      if(vexSolCargoUsed() >= _root.totcargo || vexTradeSlot(5,true) == 0) return {ok:false,error:"Make room in your cargo hold."};
      e.mining = id;e.mineClock = 0;e.course = -1;return {ok:true,message:e.permit || _root.asteroidpass == 1 ? "Mining started: 1 ton every 2 seconds." : "Unlicensed mining started: Earth prestige -1 per ton."};
   }
   if(action == "permit")
   {
      if(!vexSolNode(id).port || !vexSolDocked(id)) return {ok:false,error:"Stop at a Sol port to buy a license."};
      if(e.permit || _root.asteroidpass == 1) return {ok:false,error:"You already have mining permission."};
      if(_root.mylatinum < 500) return {ok:false,error:"Sol mining license costs 500 latinum."};
      _root.mylatinum -= 500;e.permit = true;_root.updatemenu();return {ok:true,message:"Sol mining license purchased. Mining here no longer costs local prestige."};
   }
   if(action == "job")
   {
      var def = _root.vexSolJobs[id];
      if(def == undefined || id != Math.floor(id)) return {ok:false,error:"Choose an available mission."};
      if(e.job != undefined) return {ok:false,error:"Finish or abandon your active mission first."};
      if(!vexSolDocked(3)) return {ok:false,error:"Collect Sol missions while stopped at Earth."};
      if(e.cooldowns[id] > e.time) return {ok:false,error:"This mission is cooling down. Try another job."};
      var job = {id:id,serial:e.serial++,kind:def.kind,name:def.name,pay:def.pay,prestige:def.prestige,claim:def.claim,destination:def.destination,kills:0,ready:false,failed:false,spawned:false,accompanied:0,slot:0};
      if(def.kind == "supply")
      {
         if(e.stocks[3][0] < 5) return {ok:false,error:"Earth needs to replenish its medical supplies before dispatching this shipment."};
         job.slot = vexSolCargoAdd(0,5,"Sol:" + def.destination);
         if(job.slot == 0) return {ok:false,error:"You need 5 free cargo tons and an empty cargo slot."};
         e.stocks[3][0] -= 5;
      }
      e.job = job;vexSolJobSpawn(job);vexSolNotice("Accepted " + def.name + ": " + def.pay + " latinum and Earth prestige +" + def.prestige + " on completion.");
      return {ok:true,message:"Mission accepted. Your reward and objective appear under Missions."};
   }
   if(action == "abandon")
   {
      if(e.job == undefined) return {ok:false,error:"No active mission."};
      vexSolCargoClear(e.job.slot);vexSolCleanupJob(e.job.serial);e.cooldowns[e.job.id] = e.time + 180;e.job = undefined;
      return {ok:true,message:"Mission abandoned. No reward paid; this job has a 3 minute cooldown."};
   }
   if(action == "rescue")
   {
      var job = e.job;var pos = vexSolPosition();
      if(job.kind != "rescue" || job.ready || job.failed) return {ok:false,error:"No active rescue objective."};
      if(Math.abs(_root.speed) >= 1 || Math.sqrt((pos.x - 8400) * (pos.x - 8400) + (pos.y + 1050) * (pos.y + 1050)) > 320) return {ok:false,error:"Stop within 320 units of the wreck beacon (near the belt)."};
      job.slot = vexSolCargoAdd(1,2,"Sol:3");
      if(job.slot == 0) return {ok:false,error:"Survivors require 2 free cargo tons and an empty slot."};
      job.ready = true;return {ok:true,message:"Survivors rescued. Return to Earth to collect payment and prestige."};
   }
   if(action == "assist")
   {
      var job = e.job;var ship = _root[_root.vexSolLinks[job.actor]];
      if(job.kind != "repair" || job.ready || job.failed || typeof ship != "movieclip") return {ok:false,error:"No disabled mission ship to repair."};
      var dx = (_root.player._x - ship._x) * _root.zoom;var dy = (_root.player._y - ship._y) * _root.zoom;
      if(Math.abs(_root.speed) >= 1 || Math.sqrt(dx * dx + dy * dy) > 320) return {ok:false,error:"Stop within 320 units of the disabled prospector near Mars."};
      if(_root.mydeuranium < 5) return {ok:false,error:"Repair assistance needs 5 construction deuranium. Mine and refine some at Mars."};
      _root.mydeuranium -= 5;ship.mystrength = ship.totstrength;job.ready = true;_root.updatemenu();
      return {ok:true,message:"Prospector repaired. Report to Earth for your reward."};
   }
   if(action == "claim")
   {
      var job = e.job;
      if(job == undefined || job.failed) return {ok:false,error:"No successful mission to claim."};
      if(job.kind == "supply" && vexSolDocked(job.destination) && Number(_root.cargoArray[job.slot]) == 5 && _root.cargoArray[job.slot + 2] == "Sol:" + job.destination) job.ready = true;
      if(!job.ready || !vexSolDocked(job.claim)) return {ok:false,error:"Finish the objective and stop at " + vexSolNode(job.claim).name + " to collect the reward."};
      if((job.kind == "supply" || job.kind == "rescue") && (Number(_root.cargoArray[job.slot]) <= 0 || _root.cargoArray[job.slot + 2] != "Sol:" + job.claim)) return {ok:false,error:"The mission cargo is no longer aboard."};
      if(job.kind == "supply") e.stocks[job.destination][0] += 5;
      vexSolCargoClear(job.slot);_root.mylatinum += job.pay;
      vexSolPrestige(job.prestige,job.name + " completed");vexSolNotice("Paid " + job.pay + " latinum for " + job.name + ".");
      vexSolCleanupJob(job.serial);e.cooldowns[job.id] = e.time + 180;e.job = undefined;_root.updatemenu();
      return {ok:true,message:"Mission paid once. Your Earth prestige and latinum increased."};
   }
   if(action == "target")
   {
      var rec = vexSolRec(id);var name = _root.vexSolLinks[id];
      if(rec == undefined || rec.health <= 0 || typeof _root[name] != "movieclip") return {ok:false,error:"Contact no longer exists."};
      _root.deselectobject();_root.myselect = name;_root.selectobject();return {ok:true,message:"Contact selected: " + rec.name};
   }
   if(action == "refine")
   {
      if(!vexSolDocked(5)) return {ok:false,error:"Stop at Mars Refinery first."};
      var slot = vexTradeSlot(5,false);
      if(isNaN(qty) || qty < 1 || qty != Math.floor(qty) || slot == 0 || _root.cargoArray[slot] < qty) return {ok:false,error:"Choose a quantity of mined deuranium cargo you own."};
      _root.cargoArray[slot] -= qty;_root.mydeuranium += qty;_root.updatemenu();
      return {ok:true,message:"Refined " + qty + " tons into " + qty + " construction deuranium."};
   }
   if(action == "buy" || action == "sell")
   {
      var near = vexSolNear();var port = near.id;var g = id;
      if(!vexSolNode(port).port || !vexSolDocked(port)) return {ok:false,error:"Stop at a Sol port before trading."};
      if(Number(_root.localprestige[1]) <= 0 && _root.planetpass != 1) return {ok:false,error:"Improve Earth prestige above 0 or obtain a planet pass to trade."};
      if(g < 0 || g > 5 || g != Math.floor(g) || isNaN(qty) || qty < 1 || qty > 9999 || qty != Math.floor(qty)) return {ok:false,error:"Choose a valid good and whole-ton quantity."};
      var s = vexSolState(port);var good = s.goods[g];var slot = vexTradeSlot(g,action == "buy");
      if(action == "buy")
      {
         if(good.stock < qty || _root.mylatinum < qty * good.buy || vexSolCargoUsed() + qty > _root.totcargo || slot == 0) return {ok:false,error:"Insufficient stock, latinum, or cargo space."};
         vexSolCargoAdd(g,qty,undefined);_root.mylatinum -= qty * good.buy;e.stocks[port][g] -= qty;
      }
      else
      {
         if(slot == 0 || _root.cargoArray[slot] < qty) return {ok:false,error:"You do not own that much market cargo. Mission cargo is protected."};
         _root.cargoArray[slot] -= qty;_root.mylatinum += qty * good.sell;e.stocks[port][g] += qty;
      }
      _root.updatemenu();return {ok:true,message:(action == "buy" ? "Bought " : "Sold ") + qty + " t of " + good.name + ". Ordinary trades do not award prestige."};
   }
   return {ok:false,error:"Unknown Sol action."};
}
function vexSolCleanupJob(serial)
{
   var keep = [];
   for(var i = 0; i < _root.vexSol.actors.length; i++)
   {
      var rec = _root.vexSol.actors[i];
      if(rec.job != serial) {keep.push(rec);continue;}
      var ship = _root[_root.vexSolLinks[rec.id]];
      if(typeof ship == "movieclip")
      {
         if(_root.myselect == ship.myself) _root.deselectobject();
         _root.otherships[ship.myslot] = undefined;_root.shipsgovt[ship.myslot] = undefined;
         removeMovieClip(_root[ship.myblip]);removeMovieClip(ship);
      }
      removeMovieClip(_root["vexSolGate" + rec.id]);_root.vexSolLinks[rec.id] = undefined;
   }
   _root.vexSol.actors = keep;_root.vexTrafficFrame = undefined;
}
function vexSolInit()
{
   _root.vexSolChart = vexSolNodes();_root.vexSolJobs = vexSolJobDefs();
   if(_root.myplanet != 1) return;
   var e = _root.vexSol;
   if(e.version != 1 || e.stocks.length != 11)
   {
      e = {version:1,x:0,y:0,time:0,course:-1,mining:-1,mineClock:0,permit:false,visited:[],ore:[],stocks:[],actors:[],cooldowns:[],serial:1,log:[],nextRaid:35};
      for(var id = 0; id < 11; id++) {e.stocks[id] = [70,85,65,95,110,60];e.ore[id] = id == 6 ? 500 : 100;}
      e.stocks[3] = _root.vexEconomy.markets[1];e.visited[3] = true;_root.vexSol = e;
      vexSolSpawnRecord("miner",5200,1900,6,-1,"MINER - Sol Prospector One");
      vexSolSpawnRecord("miner",5700,1650,6,-1,"MINER - Sol Prospector Two");
      var rec = vexSolSpawnRecord("freighter",400,300,5,-1,"FREIGHTER - Earth-Mars Supply");
      rec.cargo = Math.min(8,e.stocks[3][3]);e.stocks[3][3] -= rec.cargo;
   }
   e.course = -1;e.mining = -1;e.lastPrestige = Number(_root.localprestige[1]);
   // Keep Earth-market stock shared after SharedObject restores arrays independently.
   e.stocks[3] = _root.vexEconomy.markets[1];
   var dx = _root.player._x - e.x / _root.zoom - _root.planet._x;
   var dy = _root.player._y - e.y / _root.zoom - _root.planet._y;
   _root.planet._x += dx;_root.planet._y += dy;
   for(var key in _root.otherships)
   {
      var ship = _root[_root.otherships[key]];if(typeof ship == "movieclip") {ship._x += dx;ship._y += dy;}
   }
   _root.vexSolLinks = [];
   var bodies = _root.createEmptyMovieClip("vexSolBodies",31400);
   for(var id = 0; id < 11; id++) if(id != 3) vexSolDrawBody(bodies.createEmptyMovieClip("body" + id,id),vexSolNode(id));
   var marks = _root.createEmptyMovieClip("vexSolMarkers",31500);
   var clock = _root.createEmptyMovieClip("vexSolClock",31800);
   clock.last = getTimer();clock.next = clock.last + 500;
   clock.onEnterFrame = function()
   {
      _root.vexSolRender();
      if(_root._currentframe != 154 || _root.myplanet != 1) return;
      var now = getTimer();
      if(now >= this.next)
      {
         var elapsed = Math.max(0,Math.min(2,(now - this.last) / 1000));
         this.last = now;this.next = now + 500;_root.vexSolTick(elapsed);
      }
   };
   vexSolTick(0);vexSolRender();
}
vexSolInit();
flash.external.ExternalInterface.addCallback("vexSol",_root,_root.vexSolAction);
