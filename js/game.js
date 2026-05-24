'use strict';

const Game = (() => {
  let state;

  function init() {
    const canvas = document.getElementById('canvas');
    Renderer.init(canvas);
    Input.init(canvas);
    newGame();
    requestAnimationFrame(loop);
  }

  function newGame() {
    state = { phase: 'select', lastTime: performance.now() };
  }

  function _hasSave() {
    return !!localStorage.getItem('whiteout_save');
  }

  function _saveGame() {
    const { player: p, map, soldiers, faction, unlockedUnits,
            waveNumber, waveTimer, waveInterval, mapSeed } = state;
    const save = {
      version: 2,
      savedAt: Date.now(),
      seed: mapSeed,
      faction,
      unlockedUnits: [...(unlockedUnits ?? [])],
      waveNumber, waveTimer, waveInterval,
      player: {
        x: p.x, y: p.y, angle: p.angle, hp: p.hp, kills: p.kills,
        food: p.food, wood: p.wood, coal: p.coal, iron: p.iron,
      },
      soldiers: soldiers.map(s => ({ type: s.type, x: s.x, y: s.y, hp: s.hp })),
      buildings: map.buildingList.map(b => ({
        col: b.col, row: b.row, type: b.type, level: b.level,
        hp: b.hp, maxHp: b.maxHp,
        constructing: b.constructing, constructEnd: b.constructEnd,
        constructDuration: b.constructDuration,
        campCount: b.campCount ?? null, campMax: b.campMax ?? null,
      })),
      forts: Array.from(map.forts.values()).map(f => ({
        col: f.col, row: f.row, type: f.type, hp: f.hp, maxHp: f.maxHp,
      })),
      camps: map.camps.map(c => ({ count: c.count, max: c.max, restoreTimer: c.restoreTimer ?? 0 })),
      expeditions: map.expeditions.map(e => ({ id: e.id, cooldownEnd: e.cooldownEnd })),
    };
    localStorage.setItem('whiteout_save', JSON.stringify(save));
    state.justSaved = Date.now();
  }

  function _loadGame() {
    const raw = localStorage.getItem('whiteout_save');
    if (!raw) return false;
    let save;
    try { save = JSON.parse(raw); } catch (_) { return false; }

    const seed = save.seed ?? (Date.now() & 0xffffffff);
    const map  = new GameMap();
    map.generate(seed);

    // Rebuild buildings entirely from save (replaces pre-placed ones)
    map.buildingList.slice().forEach(b => map.removeBuilding(b));
    (save.buildings ?? []).forEach(bs => {
      const b = new Building(bs.col, bs.row, bs.type, bs.level);
      b.hp = bs.hp; b.maxHp = bs.maxHp;
      b.constructing = bs.constructing;
      b.constructEnd = bs.constructEnd;
      b.constructDuration = bs.constructDuration;
      if (bs.campCount != null) {
        b.campCount = bs.campCount; b.campMax = bs.campMax;
        b.campRestoreTimer = 0; b.campRecruitTimer = 0;
      }
      map.placeBuilding(b);
    });

    map.forts.clear();
    (save.forts ?? []).forEach(fs => {
      const f = new Fortification(fs.col, fs.row, fs.type);
      f.hp = fs.hp; f.maxHp = fs.maxHp;
      map.placeFort(f);
    });

    (save.camps ?? []).forEach((cc, i) => {
      if (map.camps[i]) {
        map.camps[i].count = cc.count; map.camps[i].max = cc.max;
        map.camps[i].restoreTimer = cc.restoreTimer ?? 0;
      }
    });

    (save.expeditions ?? []).forEach(se => {
      const exp = map.expeditions.find(e => e.id === se.id);
      if (exp) exp.cooldownEnd = se.cooldownEnd;
    });

    const sp     = save.player;
    const player = new Player(sp.x, sp.y);
    player.angle = sp.angle ?? 0;
    player.hp    = sp.hp;   player.kills = sp.kills ?? 0;
    player.food  = sp.food; player.wood  = sp.wood;
    player.coal  = sp.coal; player.iron  = sp.iron;

    const soldiers = (save.soldiers ?? []).map(ss => {
      const s = new Soldier(ss.x, ss.y, ss.type);
      s.hp = ss.hp; return s;
    });

    state = {
      phase: 'play', faction: save.faction, mapSeed: seed,
      unlockedUnits: new Set(save.unlockedUnits ?? []),
      map, player, soldiers, enemies: [],
      camera: { x: sp.x, y: sp.y },
      waveNumber: save.waveNumber ?? 0,
      waveTimer:  save.waveTimer  ?? 0,
      waveInterval: save.waveInterval ?? WAVE_INTERVAL,
      waveFlash: 0,
      buildMode:    { active: false, type: 'wall', canPlace: false, ghostCol: -1, ghostRow: -1 },
      bldgMode:     { active: false, type: null,  canPlace: false, ghostCol: -1, ghostRow: -1 },
      bldgSelector: { open: false },
      openPanel: null, openExpedition: null,
      nearBuilding: null, nearExpedition: null,
      prodTimer: 0, gameOver: false, waveCheckpoint: null,
      torpedoes: [], sonarPulse: null,
      paused: false, justSaved: 0,
      lastTime: performance.now(),
    };
    Audio.startAmbient();
    return true;
  }

  function _startGame(faction) {
    Audio.startAmbient();
    const seed = Date.now() & 0xffffffff;
    const map = new GameMap();
    map.generate(seed);

    // Player spawns near Chief's Hall (harbour waterline)
    const mc = Math.floor(COLS/2), mr = Math.floor(ROWS/2) + 2;
    const spawn = hexCenter(mc, mr);

    const fDef = FACTION_DEFS[faction];
    const unlockedUnits = new Set(fDef.lines.map(l => l.units[0]));

    state = {
      phase: 'play',
      faction, mapSeed: seed,
      unlockedUnits,
      map,
      player:       new Player(spawn.x, spawn.y),
      soldiers:     [],
      enemies:      [],
      camera:       { x: spawn.x, y: spawn.y },
      waveNumber:   0,
      waveTimer:    0,
      waveInterval: WAVE_INTERVAL,
      waveFlash:    0,
      buildMode:    { active: false, type: 'wall', canPlace: false, ghostCol: -1, ghostRow: -1 },
      bldgMode:     { active: false, type: null, canPlace: false, ghostCol: -1, ghostRow: -1 },
      bldgSelector: { open: false },
      openPanel:       null,
      openExpedition:  null,
      nearBuilding:    null,
      nearExpedition:  null,
      prodTimer:       0,
      gameOver:        false,
      waveCheckpoint:  null,
      torpedoes:       [],
      sonarPulse:      null,
      paused:          false,
      justSaved:       0,
      lastTime:        performance.now(),
    };
  }

  function _handleFactionSelect() {
    FACTION_KEYS.forEach((f, i) => {
      if (Input.wasPressed(String(i + 1))) _startGame(f);
      if (Input.wasPressed('faction_' + f)) _startGame(f);
    });
    if (Input.wasPressed('load_game') && _hasSave()) _loadGame();
  }

  function getHallLevel() {
    for (const b of state.map.buildingList) {
      if (b.type === 'chief_hall') return b.level;
    }
    return 1;
  }

  function loop(ts) {
    const dt = Math.min((ts - state.lastTime) / 1000, 0.05);
    state.lastTime = ts;

    if (state.phase === 'select') {
      _handleFactionSelect();
      render();
      Input.flushPressed();
      requestAnimationFrame(loop);
      return;
    }

    if (state.phase === 'play' && !state.gameOver && Input.wasPressed('p')) {
      state.paused = !state.paused;
    }

    if (state.paused) {
      if (Input.wasPressed('pause_resume')) state.paused = false;
      if (Input.wasPressed('pause_save'))   _saveGame();
      if (Input.wasPressed('pause_load') && _hasSave()) _loadGame();
      if (Input.wasPressed('pause_menu'))   newGame();
    } else if (!state.gameOver) {
      update(dt);
    } else {
      if (Input.wasPressed('r')) {
        if (state.waveCheckpoint) _restoreCheckpoint();
        else newGame();
      }
      if (Input.wasPressed('n')) newGame();
    }

    render();
    Input.flushPressed();
    requestAnimationFrame(loop);
  }

  function update(dt) {
    const { map, player, soldiers, enemies, camera } = state;
    _resetAstarBudget();
    Audio.tick(dt);

    // ── Player movement ───────────────────────────────
    player.update(dt, map);
    if (player.hp <= 0) { state.gameOver = true; return; }

    // ── Key dispatch ─────────────────────────────────
    // Esc: close panels / exit modes in priority order
    if (Input.wasPressed('escape')) {
      if      (state.openPanel)           { state.openPanel = null; }
      else if (state.openExpedition)      { state.openExpedition = null; }
      else if (state.bldgMode.active)     { state.bldgMode.active = false; state.bldgMode.type = null; }
      else if (state.bldgSelector.open)   { state.bldgSelector.open = false; }
      else if (state.buildMode.active)    { state.buildMode.active = false; }
    }

    // B: fort build mode (only when no building modes active)
    if (Input.wasPressed('b') && !state.bldgSelector.open && !state.bldgMode.active && !state.openPanel) {
      state.buildMode.active = !state.buildMode.active;
      if (state.buildMode.active) { state.bldgSelector.open = false; state.openPanel = null; }
    }

    // 1/2/3: quick-select fort type (also activates fort build mode)
    FORT_KEYS.forEach((k, i) => {
      if (Input.wasPressed(String(i+1))) {
        state.buildMode.type = k;
        state.buildMode.active = true;
        state.bldgMode.active = false;
        state.bldgSelector.open = false;
      }
    });

    // C: toggle building selector (only when not in fort build mode or panel open)
    if (Input.wasPressed('c') && !state.buildMode.active && !state.openPanel) {
      if (state.bldgMode.active) {
        state.bldgMode.active = false; state.bldgMode.type = null;
        state.bldgSelector.open = false;
      } else {
        state.bldgSelector.open = !state.bldgSelector.open;
        if (!state.bldgSelector.open) { state.bldgMode.active = false; state.bldgMode.type = null; }
      }
    }

    // E: interact with nearby building / expedition / confirm action
    if (Input.wasPressed('e') && !state.buildMode.active && !state.bldgMode.active && !state.bldgSelector.open) {
      if (state.openPanel) {
        state.openPanel.upgrade(player, getHallLevel());   // attempt upgrade; panel shows result
      } else if (state.openExpedition) {
        const exp = state.openExpedition;
        if (Date.now() >= exp.cooldownEnd && canAfford(player, exp.cost)) {
          for (const [r, a] of Object.entries(exp.cost))   player[r] -= a;
          for (const [r, a] of Object.entries(exp.reward)) player[r] += a;
          exp.cooldownEnd = Date.now() + exp.cooldown * 1000;
        }
      } else if (state.nearExpedition) {
        state.openExpedition = state.nearExpedition;
      } else if (state.nearBuilding) {
        state.openPanel = state.nearBuilding;
        Audio.uiOpen();
      }
    }

    // R key in research lab: unlock units via hit-area keys injected by renderer
    if (state.openPanel?.type === 'research_lab' && state.faction) {
      const fDef = FACTION_DEFS[state.faction];
      for (const line of fDef.lines) {
        for (let tier = 1; tier <= 2; tier++) {
          const unitKey = line.units[tier];
          if (Input.wasPressed('research_' + unitKey)) {
            if (!state.unlockedUnits.has(unitKey)) {
              const cost = RESEARCH_COST[tier];
              const rdep = canResearchDeps(unitKey, map.buildingList);
              if (canAfford(state.player, cost) && rdep.ok) {
                for (const [res, amt] of Object.entries(cost)) state.player[res] -= amt;
                state.unlockedUnits.add(unitKey);
                if (tier === 2) state.unlockedUnits.add(line.units[1]);
              }
            }
          }
        }
      }
    }

    // T: queue barracks training when panel is open
    if (Input.wasPressed('t') && state.openPanel?.type === 'barracks') {
      const b = state.openPanel;
      if (!b.trainActive && b.level > 0 && !b.constructing && canAfford(player, TRAIN_COST)) {
        for (const [r, a] of Object.entries(TRAIN_COST)) player[r] -= a;
        b.trainActive = true;
        b.trainTimer  = TRAIN_TIME;
      }
    }

    // ── Building selector click ───────────────────────
    if (state.bldgSelector.open) {
      if (Input.consumeLeftUp()) {
        const mx = Input.mouse.x, my = Input.mouse.y;
        let clicked = false;
        BLDG_KEYS.forEach(key => {
          const b = BLDG_DEFS[key]._selBounds;
          if (b && mx >= b.x && mx <= b.x+b.w && my >= b.y && my <= b.y+b.h) {
            state.bldgMode.type = key;
            state.bldgMode.active = true;
            state.bldgSelector.open = false;
            clicked = true;
          }
        });
        if (!clicked) { /* ignore */ }
      }
      Input.consumeRightUp();
      // skip further update while selector is open
      _updateCamera(dt, player, camera);
      return;
    }

    // ── Building placement ghost + placement ──────────
    if (state.bldgMode.active && state.bldgMode.type) {
      const def = BLDG_DEFS[state.bldgMode.type];
      const wx = camera.x + (Input.mouse.x - Renderer.W/2);
      const wy = camera.y + (Input.mouse.y - Renderer.H/2);
      const ph = pixelToHex(wx, wy);
      const margin = def.size === 3 ? 1 : 0;
      const gc = clamp(ph.c, margin, COLS - (def.size === 3 ? 2 : def.size));
      const gr = clamp(ph.r, margin, ROWS - (def.size === 3 ? 2 : def.size));
      state.bldgMode.ghostCol = gc;
      state.bldgMode.ghostRow = gr;

      const cost = getBldgUpgradeCost(def, 1);
      const _depCheck = canBuildDeps(state.bldgMode.type, map.buildingList);
      state.bldgMode.depReason  = _depCheck.ok ? null : _depCheck.missing;
      state.bldgMode.canPlace =
        map.canPlaceBuilding(gc, gr, def.size) && canAfford(player, cost) && _depCheck.ok;

      if (Input.consumeLeftUp()) {
        if (state.bldgMode.canPlace) {
          const b = new Building(gc, gr, state.bldgMode.type, 0);
          map.placeBuilding(b);
          b.upgrade(player, getHallLevel());
          state.openPanel = b;
          Audio.place();
        }
      }
      if (Input.consumeRightUp()) {
        state.bldgMode.active = false; state.bldgMode.type = null;
      }
    } else if (!state.buildMode.active) {
      Input.consumeLeftUp();
      Input.consumeRightUp();
    }

    // ── Fort build mode ───────────────────────────────
    if (state.buildMode.active) {
      const wx = camera.x + (Input.mouse.x - Renderer.W/2);
      const wy = camera.y + (Input.mouse.y - Renderer.H/2);
      const fph = pixelToHex(wx, wy);
      const gc = clamp(fph.c, 0, COLS-1);
      const gr = clamp(fph.r, 0, ROWS-1);
      state.buildMode.ghostCol = gc;
      state.buildMode.ghostRow = gr;
      const def = FORT_DEFS[state.buildMode.type];
      state.buildMode.canPlace =
        !map.isSolid(gc, gr) && !map.hasFort(gc, gr) && !map.hasBuilding(gc, gr) &&
        player.wood >= def.cost.wood && player.iron >= def.cost.iron;

      if (Input.consumeLeftUp() && state.buildMode.canPlace) {
        player.wood -= def.cost.wood; player.iron -= def.cost.iron;
        map.placeFort(new Fortification(gc, gr, state.buildMode.type));
        Audio.place();
      }
      if (Input.consumeRightUp()) state.buildMode.active = false;
    }

    // ── Nearest building / expedition detection ───────
    state.nearBuilding = null;
    if (!state.openPanel && !state.openExpedition) {
      let bestD = INTERACT_R;
      for (const b of map.buildingList) {
        if (b.hp <= 0) continue;
        const d = Math.hypot(player.x - b.x, player.y - b.y);
        if (d < bestD) { bestD = d; state.nearBuilding = b; }
      }
    }
    state.nearExpedition = null;
    if (!state.openPanel && !state.openExpedition) {
      let bestD = INTERACT_R;
      for (const exp of map.expeditions) {
        const d = Math.hypot(player.x - exp.x, player.y - exp.y);
        if (d < bestD) { bestD = d; state.nearExpedition = exp; }
      }
    }
    // Close panels if source is gone / player walked away
    if (state.openPanel && state.openPanel.hp <= 0) state.openPanel = null;
    if (state.openExpedition) {
      const d = Math.hypot(player.x - state.openExpedition.x, player.y - state.openExpedition.y);
      if (d > INTERACT_R * 1.8) state.openExpedition = null;
    }

    // ── Barracks training completion ──────────────────
    for (const b of map.buildingList) {
      if (b.type !== 'barracks' || !b.trainActive) continue;
      b.trainTimer -= dt;
      if (b.trainTimer <= 0) {
        b.trainActive = false; b.trainTimer = 0;
        const count = Math.max(2, b.level + 2);
        const pool = state.unlockedUnits ? [...state.unlockedUnits] : SOLDIER_TYPE_KEYS;
        for (let i = 0; i < count; i++) {
          const t = pool[Math.floor(Math.random()*pool.length)];
          const sp = _findSpawnNear(b.x, b.y, SOLDIER_TYPES[t].r, map);
          soldiers.push(new Soldier(sp.x, sp.y, t));
        }
      }
    }

    // ── Soldier recruitment ───────────────────────────
    const CAMP_RESTORE_TIME = 20; // seconds per slot restored
    map.camps.forEach(camp => {
      if (camp.count < camp.max) {
        camp.restoreTimer += dt;
        if (camp.restoreTimer >= CAMP_RESTORE_TIME) {
          camp.restoreTimer = 0; camp.count++;
        }
      } else { camp.restoreTimer = 0; }
      if (camp.count <= 0 || soldiers.length >= 30) return;
      const d = Math.hypot(player.x - camp.x, player.y - camp.y);
      if (d < CAMP_R) {
        camp.recruitTimer += dt;
        if (camp.recruitTimer >= 0.35) {
          camp.recruitTimer = 0; camp.count--;
          const rpool = state.unlockedUnits ? [...state.unlockedUnits] : SOLDIER_TYPE_KEYS;
          const t = rpool[Math.floor(Math.random()*rpool.length)];
          const sp = _findSpawnNear(camp.x, camp.y, SOLDIER_TYPES[t].r, map);
          soldiers.push(new Soldier(sp.x, sp.y, t));
        }
      } else { camp.recruitTimer = 0; }
    });

    // ── Recruit from Training Pools ───────────────────
    for (const b of map.buildingList) {
      if (b.type !== 'barracks' || b.level < 1 || b.constructing || b.hp <= 0) continue;
      if (b.campCount == null) {
        b.campMax = 6 + b.level * 4;
        b.campCount = b.campMax;
        b.campRestoreTimer = 0;
        b.campRecruitTimer = 0;
      }
      const restoreTime = Math.max(8, 20 - b.level * 2);
      if (b.campCount < b.campMax) {
        b.campRestoreTimer += dt;
        if (b.campRestoreTimer >= restoreTime) { b.campRestoreTimer = 0; b.campCount++; }
      } else { b.campRestoreTimer = 0; }
      if (b.campCount <= 0 || soldiers.length >= 30) continue;
      const bd = Math.hypot(player.x - b.x, player.y - b.y);
      if (bd < CAMP_R) {
        b.campRecruitTimer += dt;
        if (b.campRecruitTimer >= 0.35) {
          b.campRecruitTimer = 0; b.campCount--;
          const rpool = state.unlockedUnits ? [...state.unlockedUnits] : SOLDIER_TYPE_KEYS;
          const t = rpool[Math.floor(Math.random()*rpool.length)];
          const sp = _findSpawnNear(b.x, b.y, SOLDIER_TYPES[t].r, map);
          soldiers.push(new Soldier(sp.x, sp.y, t));
        }
      } else { b.campRecruitTimer = 0; }
    }

    // ── Soldiers update + separation ─────────────────
    for (const s of soldiers) s.update(dt, player, enemies, map);
    for (let i=0; i<soldiers.length; i++) {
      for (let j=i+1; j<soldiers.length; j++) {
        const si=soldiers[i],sj=soldiers[j];
        const dx=sj.x-si.x,dy=sj.y-si.y;
        const min=si.r+sj.r+1;
        if (Math.abs(dx)>=min || Math.abs(dy)>=min) continue; // cheap axis pre-check
        const d=Math.hypot(dx,dy);
        if (d<min && d>0.01) {
          const push=(min-d)*.55;
          si.x-=(dx/d)*push; si.y-=(dy/d)*push;
          sj.x+=(dx/d)*push; sj.y+=(dy/d)*push;
        }
      }
    }
    for (let i=soldiers.length-1; i>=0; i--) { if(soldiers[i].hp<=0) soldiers.splice(i,1); }

    // ── Buildings: check completions + production tick + passive heal
    for (const b of map.buildingList) {
      b.hitFlash = Math.max(0, b.hitFlash - dt);
      b.checkComplete();
      if (!b.constructing && b.hp > 0 && b.hp < b.maxHp && b.hitFlash <= 0)
        b.hp = Math.min(b.maxHp, b.hp + BLDG_HEAL_RATE * dt);
    }
    state.prodTimer += dt;
    if (state.prodTimer >= PROD_TICK) {
      state.prodTimer -= PROD_TICK;
      _applyBuildingProduction(player, map);
    }
    // Remove destroyed buildings
    for (let i = map.buildingList.length-1; i >= 0; i--) {
      if (map.buildingList[i].hp <= 0) {
        map.removeBuilding(map.buildingList[i]);
      }
    }

    // ── Forts update ──────────────────────────────────
    map.forts.forEach((f, key) => {
      f.update(dt, enemies);
      if (!f.dead && f.hp > 0 && f.hp < f.maxHp && f.hitFlash <= 0)
        f.hp = Math.min(f.maxHp, f.hp + BLDG_HEAL_RATE * dt);
      if (f.dead) map.forts.delete(key);
    });

    // ── Enemies update ────────────────────────────────
    for (const e of enemies) e.update(dt, player, soldiers, map);
    for (let i=enemies.length-1; i>=0; i--) {
      if (enemies[i].dead) { player.kills++; enemies.splice(i,1); }
    }

    // ── Torpedo + Sonar input ─────────────────────────
    player.torpedoCooldown = Math.max(0, (player.torpedoCooldown || 0) - dt);
    player.sonarCooldown   = Math.max(0, (player.sonarCooldown   || 0) - dt);

    // Auto-torpedo: fire at nearest enemy within 380px when ready
    if (player.torpedoCooldown <= 0) {
      let nearEnemy = null, nearDist = 380;
      for (const e of enemies) {
        const d = Math.hypot(e.x - player.x, e.y - player.y);
        if (d < nearDist) { nearDist = d; nearEnemy = e; }
      }
      if (nearEnemy) {
        const dx = nearEnemy.x - player.x, dy = nearEnemy.y - player.y;
        const len = Math.hypot(dx, dy) || 1;
        state.torpedoes.push({ x: player.x, y: player.y, vx: dx/len*480, vy: dy/len*480, dmg: 55, life: 3 });
        player.torpedoCooldown = 2.5;
      }
    }

    // Auto-sonar: pulse when any enemy is within 90px
    if (player.sonarCooldown <= 0) {
      const SONAR_R = 120;
      const hasClose = enemies.some(e => Math.hypot(e.x - player.x, e.y - player.y) < 90);
      if (hasClose) {
        for (const e of enemies) {
          if (Math.hypot(e.x - player.x, e.y - player.y) <= SONAR_R) {
            e.hp -= 25;
            if (e.hp <= 0) e.dead = true;
          }
        }
        state.sonarPulse = { x: player.x, y: player.y, r: 0, maxR: SONAR_R, t: 0.6 };
        player.sonarCooldown = 8;
      }
    }

    // ── Torpedoes update ──────────────────────────────
    for (const torp of state.torpedoes) {
      torp.x += torp.vx * dt;
      torp.y += torp.vy * dt;
      torp.life -= dt;
      for (const e of enemies) {
        if (!e.dead && Math.hypot(e.x - torp.x, e.y - torp.y) < e.r + 6) {
          e.hp -= torp.dmg;
          if (e.hp <= 0) e.dead = true;
          torp.life = 0;
          break;
        }
      }
    }
    state.torpedoes = state.torpedoes.filter(t => t.life > 0);
    if (state.sonarPulse) {
      state.sonarPulse.r += (state.sonarPulse.maxR / state.sonarPulse.t) * dt;
      state.sonarPulse.t -= dt;
      if (state.sonarPulse.t <= 0) state.sonarPulse = null;
    }

    // ── Waves ─────────────────────────────────────────
    state.waveTimer += dt;
    if (state.waveTimer >= state.waveInterval) {
      _spawnWave(state.waveNumber);
      state.waveNumber++; state.waveTimer = 0; state.waveFlash = 2.5;
    }
    state.waveFlash = Math.max(0, state.waveFlash - dt);
    const ttw = state.waveInterval - state.waveTimer;
    if (ttw <= 10 && ttw > 9.5 && state.waveFlash <= 0) state.waveFlash = 1.5;

    _updateCamera(dt, player, camera);
  }

  function _applyBuildingProduction(player, map) {
    for (const b of map.buildingList) {
      if (b.level === 0 || b.constructing || b.hp <= 0) continue;
      const def = BLDG_DEFS[b.type];
      if (def.produces) player[def.produces.resource] += def.produces.rate * b.level;
      if (def.consumesCoal)  player.coal = Math.max(0, player.coal - 0.4 * b.level);
    }
  }

  function _pickEnemyType(waveIdx) {
    const pool = ['mermaid'];
    if (waveIdx >= 3)  { pool.push('shark'); pool.push('shark'); }
    if (waveIdx >= 6)  pool.push('swordfish');
    if (waveIdx >= 10) pool.push('anglerfish');
    if (waveIdx >= 14) pool.push('jellyfish');
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function _saveCheckpoint() {
    const { player, map, soldiers, waveNumber } = state;
    state.waveCheckpoint = {
      waveNumber,
      faction: state.faction,
      unlockedUnits: state.unlockedUnits ? [...state.unlockedUnits] : [],
      playerPos: { x: player.x, y: player.y },
      resources: { food: player.food, wood: player.wood, coal: player.coal, iron: player.iron },
      soldierTypes: soldiers.map(s => s.type),
      buildings: map.buildingList.map(b => ({
        col: b.col, row: b.row, type: b.type, level: b.level,
        hp: b.hp, maxHp: b.maxHp,
        constructing: b.constructing, constructEnd: b.constructEnd, constructDuration: b.constructDuration,
      })),
      forts: Array.from(map.forts.entries()).map(([, f]) => ({
        col: f.col, row: f.row, type: f.type, hp: f.hp, maxHp: f.maxHp,
      })),
      camps: map.camps.map(c => ({ count: c.count, max: c.max, restoreTimer: c.restoreTimer })),
    };
  }

  function _restoreCheckpoint() {
    const cp = state.waveCheckpoint;
    if (!cp) return;
    const { player, map } = state;

    player.food = cp.resources.food; player.wood = cp.resources.wood;
    player.coal = cp.resources.coal; player.iron = cp.resources.iron;
    player.hp   = PLAYER_MAX_HP;
    player.x = cp.playerPos.x; player.y = cp.playerPos.y;

    state.enemies.length = 0;
    state.soldiers.length = 0;
    cp.soldierTypes.forEach(t => {
      const a = Math.random()*Math.PI*2, r = 30+Math.random()*40;
      state.soldiers.push(new Soldier(player.x+Math.cos(a)*r, player.y+Math.sin(a)*r, t));
    });

    map.buildingList.slice().forEach(b => map.removeBuilding(b));
    cp.buildings.forEach(bs => {
      const b = new Building(bs.col, bs.row, bs.type, bs.level);
      b.hp = bs.hp; b.maxHp = bs.maxHp;
      b.constructing = bs.constructing;
      b.constructEnd = bs.constructEnd;
      b.constructDuration = bs.constructDuration;
      map.placeBuilding(b);
    });

    map.forts.clear();
    cp.forts.forEach(fs => {
      const f = new Fortification(fs.col, fs.row, fs.type);
      f.hp = fs.hp; f.maxHp = fs.maxHp;
      map.placeFort(f);
    });

    cp.camps.forEach((cc, i) => {
      if (map.camps[i]) { map.camps[i].count = cc.count; map.camps[i].max = cc.max; map.camps[i].restoreTimer = cc.restoreTimer ?? 0; }
    });

    state.waveNumber = cp.waveNumber;
    state.waveTimer  = 0;
    state.waveFlash  = 0;
    state.gameOver   = false;
    state.openPanel  = null;
    state.openExpedition = null;
    if (cp.faction) { state.faction = cp.faction; state.unlockedUnits = new Set(cp.unlockedUnits || []); }
  }

  function _spawnWave(waveIdx) {
    _saveCheckpoint();
    Audio.waveWarn();
    const count = WAVE_BASE + waveIdx * WAVE_GROWTH;
    for (let i=0; i<count; i++) {
      const edge = Math.floor(Math.random()*4);
      const pad = TILE*2;
      let ex, ey;
      if (edge===0) { ex=pad+Math.random()*(MAP_W-pad*2); ey=pad; }
      else if (edge===1) { ex=pad+Math.random()*(MAP_W-pad*2); ey=MAP_H-pad; }
      else if (edge===2) { ex=pad; ey=pad+Math.random()*(MAP_H-pad*2); }
      else              { ex=MAP_W-pad; ey=pad+Math.random()*(MAP_H-pad*2); }
      state.enemies.push(new Enemy(ex, ey, waveIdx, _pickEnemyType(waveIdx)));
    }
  }

  function _updateCamera(dt, player, camera) {
    camera.x += (player.x - camera.x) * CAM_LERP * dt;
    camera.y += (player.y - camera.y) * CAM_LERP * dt;
    camera.x = clamp(camera.x, Renderer.W/2, MAP_W - Renderer.W/2);
    camera.y = clamp(camera.y, Renderer.H/2, MAP_H - Renderer.H/2);
  }

  function render() {
    Renderer.clear();
    Input.TouchUI.hitAreas.length = 0;  // rebuild touch targets each frame

    if (state.phase === 'select') {
      Renderer.drawFactionSelect(state, _hasSave());
      return;
    }

    if (state.gameOver) {
      const cp = state.waveCheckpoint;
      Renderer.drawGameOver(state.player.kills, state.waveNumber, !!cp, cp?.waveNumber ?? 0);
      return;
    }

    const { map, camera, player, soldiers, enemies, buildMode, bldgMode, waveFlash } = state;

    Renderer.drawMap(map, camera);
    Renderer.drawBuildings(map, camera);
    const _allCamps = [
      ...map.camps,
      ...map.buildingList
        .filter(b => b.type === 'barracks' && b.level >= 1 && !b.constructing && b.hp > 0)
        .map(b => ({ x: b.x, y: b.y, count: b.campCount ?? 0, max: b.campMax ?? (6 + b.level * 4), restoreTimer: b.campRestoreTimer ?? 0 })),
    ];
    Renderer.drawCamps(_allCamps, camera);
    Renderer.drawExpeditions(map.expeditions, camera);
    Renderer.drawForts(map, camera);
    Renderer.drawProjectiles(map, camera);
    Renderer.drawTorpedoes(state.torpedoes, state.sonarPulse, camera);
    Renderer.drawEnemies(enemies, camera);
    Renderer.drawSoldiers(soldiers, camera);
    Renderer.drawPlayer(player, camera);

    // Build ghosts
    if (buildMode.active)                        Renderer.drawBuildGhost(buildMode, player, camera);
    if (bldgMode.active && bldgMode.type)        Renderer.drawBldgGhost(bldgMode, camera);

    // Interact hints
    if (state.nearBuilding && !state.openPanel && !state.openExpedition)
      Renderer.drawInteractHint(state.nearBuilding, camera);
    if (state.nearExpedition && !state.openExpedition && !state.openPanel)
      Renderer.drawExpeditionHint(state.nearExpedition, camera);

    Renderer.drawWaveFlash(waveFlash > 1 ? waveFlash - 1 : 0);
    Renderer.drawHUD(state);
    Renderer.drawMinimap(map, state);

    // Panels (drawn last, on top)
    if (state.bldgSelector.open)  Renderer.drawBldgSelector(state.bldgMode, player);
    if (state.openPanel)          Renderer.drawBuildingPanel(state.openPanel, player, getHallLevel(), { faction: state.faction, unlockedUnits: state.unlockedUnits, buildingList: map.buildingList });
    if (state.openExpedition)     Renderer.drawExpeditionPanel(state.openExpedition, player);

    // Touch overlay (drawn on top of everything; also registers action button hit areas)
    Renderer.drawTouchControls(state);

    if (state.paused) Renderer.drawPauseMenu(_hasSave(), Date.now() - (state.justSaved || 0) < 2000);
  }

  window.addEventListener('DOMContentLoaded', init);
})();
