'use strict';

// ── Headless simulation framework ─────────────────────
// Requires (in load order): config.js, data.js, map.js, entities.js
// Usage from browser console:
//   SimRunner.run()                          // quick default run
//   SimRunner.run({ faction:'human', maxWaves:15 })
//   SimRunner.compare(['mammal','human','fish'], { maxWaves:20 })
//   SimRunner.waveTable()                    // print wave difficulty table
//   SimRunner.unitTable()                    // print unit stat table
//   SimRunner.depTree()                      // print dependency tree

// ── SimMap: skips DOM minimap ─────────────────────────
class SimMap extends GameMap {
  _buildMinimap() { this.minimap = null; }
}

// ── SimPlayer: skips Input, runs resources/regen ──────
class SimPlayer extends Player {
  update(dt, map) {
    this.moving = false;
    this.lastHitTimer = Math.max(0, this.lastHitTimer - dt);
    if (this.lastHitTimer === 0 && this.hp < this.maxHp)
      this.hp = Math.min(this.maxHp, this.hp + PLAYER_REGEN * dt);
    this.addResource('food', FOOD_RATE * dt);
    this.addResource('wood', WOOD_RATE * dt);
    this.addResource('coal', COAL_RATE * dt);
    this.addResource('iron', IRON_RATE * dt);
  }
}

// ── Built-in strategies ────────────────────────────────
// A strategy has one method: decide(state) → array of actions.
// Actions: { type:'build', btype, col, row }
//          { type:'fort',  ftype, col, row }
//          { type:'train', building }
//          { type:'upgrade', building }
const Strategies = {

  // Do nothing — raw baseline survival with pre-placed buildings only
  idle: {
    name: 'Idle',
    decide() { return []; },
  },

  // Build economy first, then barracks and towers
  balanced: {
    name: 'Balanced',
    decide(st) {
      const { player: p, map } = st;
      const actions = [];
      const has = t => map.buildingList.find(b => b.type === t && b.level >= 1 && !b.constructing);
      const hallLv = map.buildingList.find(b => b.type === 'chief_hall')?.level ?? 1;

      // Economy chain first
      if (!has('farm')       && p.wood >= 80)                    actions.push({ type:'build', btype:'farm' });
      if (!has('sawmill')    && p.food >= 50 && p.iron >= 20)    actions.push({ type:'build', btype:'sawmill' });
      if (!has('furnace')    && p.wood >= 120 && p.iron >= 40)   actions.push({ type:'build', btype:'furnace' });
      if (!has('coal_mine')  && has('furnace') && p.wood >= 100) actions.push({ type:'build', btype:'coal_mine' });

      // Upgrade hall to unlock barracks when affordable
      const hall = map.buildingList.find(b => b.type === 'chief_hall');
      if (hall && hallLv < 2 && !hall.constructing && p.wood >= 300) actions.push({ type:'upgrade', building: hall });

      // Barracks when hall is level 2
      if (!has('barracks') && hallLv >= 2 && p.food >= 100 && p.wood >= 150 && p.iron >= 50)
        actions.push({ type:'build', btype:'barracks' });

      // Train from barracks
      const barracks = has('barracks');
      if (barracks && !barracks.trainActive && p.food >= 50 && p.iron >= 20)
        actions.push({ type:'train', building: barracks });

      // Towers after barracks
      if (has('barracks') && p.wood >= 30 && p.iron >= 20)
        actions.push({ type:'fort', ftype:'tower' });

      return actions;
    },
  },

  // Rush military — barracks and towers as fast as possible
  rushMilitary: {
    name: 'Rush Military',
    decide(st) {
      const { player: p, map } = st;
      const actions = [];
      const has = t => map.buildingList.find(b => b.type === t && b.level >= 1 && !b.constructing);
      const hallLv = map.buildingList.find(b => b.type === 'chief_hall')?.level ?? 1;

      const hall = map.buildingList.find(b => b.type === 'chief_hall');
      if (hall && hallLv < 2 && !hall.constructing && p.wood >= 300) actions.push({ type:'upgrade', building: hall });

      if (!has('barracks') && hallLv >= 2 && p.food >= 100 && p.wood >= 150 && p.iron >= 50)
        actions.push({ type:'build', btype:'barracks' });

      const barracks = has('barracks');
      if (barracks && !barracks.trainActive && p.food >= 50 && p.iron >= 20)
        actions.push({ type:'train', building: barracks });

      if (p.wood >= 30 && p.iron >= 20) actions.push({ type:'fort', ftype:'tower' });
      if (p.wood >= 20)                 actions.push({ type:'fort', ftype:'wall' });

      return actions;
    },
  },

  // Economy focus — delay military, build resource buildings
  econFirst: {
    name: 'Economy First',
    decide(st) {
      const { player: p, map } = st;
      const actions = [];
      const has = t => map.buildingList.find(b => b.type === t && b.level >= 1 && !b.constructing);

      if (!has('farm')      && p.wood >= 80)                         actions.push({ type:'build', btype:'farm' });
      if (!has('sawmill')   && p.food >= 50 && p.iron >= 20)         actions.push({ type:'build', btype:'sawmill' });
      if (!has('furnace')   && p.wood >= 120 && p.iron >= 40)        actions.push({ type:'build', btype:'furnace' });
      if (!has('coal_mine') && has('furnace') && p.wood >= 100)      actions.push({ type:'build', btype:'coal_mine' });
      if (!has('iron_mine') && has('coal_mine') && p.wood >= 80)     actions.push({ type:'build', btype:'iron_mine' });
      if (!has('tavern')    && p.food >= 100 && p.wood >= 100)       actions.push({ type:'build', btype:'tavern' });

      // Only build towers for defense
      if (p.wood >= 30 && p.iron >= 20) actions.push({ type:'fort', ftype:'tower' });

      return actions;
    },
  },
};

// ── Core simulation runner ─────────────────────────────
class _SimRun {
  constructor({ faction = 'mammal', seed = null, strategy = null, maxWaves = 20 } = {}) {
    this.faction   = faction;
    this.seed      = seed ?? (Math.random() * 0xffffffff | 0);
    this.strategy  = strategy ?? Strategies.balanced;
    this.maxWaves  = maxWaves;
  }

  run() {
    const map    = new SimMap();
    map.generate(this.seed);
    const sp     = hexCenter(Math.floor(COLS/2), Math.floor(ROWS/2) + 2);
    const player = new SimPlayer(sp.x, sp.y);
    const fDef   = FACTION_DEFS[this.faction];

    const st = {
      player, map,
      soldiers:     [],
      enemies:      [],
      faction:      this.faction,
      unlockedUnits: new Set(fDef.lines.map(l => l.units[0])),
      waveNumber:   0,
      waveTimer:    0,
      waveInterval: WAVE_INTERVAL,
      prodTimer:    0,
      torpedoes:    [],
      kills:        0,
      gameOver:     false,
      done:         false,
      waveLog:      [],
      stratTimer:   0,
    };

    const DT       = 1 / 20;
    const MAX_TICKS = 20 * 60 * 45;   // 45 game-minutes ceiling

    for (let tick = 0; tick < MAX_TICKS && !st.done && !st.gameOver; tick++) {
      this._step(st, DT);
    }

    return {
      faction:   this.faction,
      strategy:  this.strategy.name,
      seed:      this.seed,
      survived:  !st.gameOver,
      waves:     st.waveNumber,
      kills:     st.kills,
      soldiers:  st.soldiers.length,
      resources: _res(st.player),
      waveLog:   st.waveLog,
    };
  }

  _step(st, dt) {
    const { map, player, soldiers, enemies } = st;
    _resetAstarBudget();

    player.update(dt, map);
    if (player.hp <= 0) { st.gameOver = true; return; }

    // Strategy decisions every ~1 game second
    st.stratTimer -= dt;
    if (st.stratTimer <= 0) {
      st.stratTimer = 1.0;
      for (const action of (this.strategy.decide(st) ?? [])) {
        this._applyAction(st, action);
      }
    }

    // Barracks training
    for (const b of map.buildingList) {
      if (b.type !== 'barracks' || !b.trainActive) continue;
      b.trainTimer -= dt;
      if (b.trainTimer <= 0) {
        b.trainActive = false; b.trainTimer = 0;
        const count = Math.max(2, b.level + 2);
        const pool  = [...st.unlockedUnits];
        for (let i = 0; i < count; i++) {
          const t  = pool[Math.floor(Math.random() * pool.length)];
          const sp = _findSpawnNear(b.x, b.y, SOLDIER_TYPES[t].r, map);
          soldiers.push(new Soldier(sp.x, sp.y, t));
        }
      }
    }

    // Recruit from recruit_post (auto-recruit in sim)
    for (const b of map.buildingList) {
      if (b.type !== 'recruit_post' || b.level < 1 || b.constructing || b.hp <= 0) continue;
      if (b.campCount == null) {
        b.campMax = 6 + b.level * 4; b.campCount = b.campMax;
        b.campRestoreTimer = 0; b.campRecruitTimer = 0;
      }
      const restoreTime = Math.max(8, 20 - b.level * 2);
      if (b.campCount < b.campMax) {
        b.campRestoreTimer += dt;
        if (b.campRestoreTimer >= restoreTime) { b.campRestoreTimer = 0; b.campCount++; }
      }
      if (b.campCount > 0 && soldiers.length < 30) {
        b.campRecruitTimer += dt;
        if (b.campRecruitTimer >= 0.35) {
          b.campRecruitTimer = 0; b.campCount--;
          const pool = [...st.unlockedUnits];
          const t    = pool[Math.floor(Math.random() * pool.length)];
          const sp   = _findSpawnNear(b.x, b.y, SOLDIER_TYPES[t].r, map);
          soldiers.push(new Soldier(sp.x, sp.y, t));
        }
      }
    }

    // Soldiers
    for (const s of soldiers) s.update(dt, player, enemies, map);
    for (let i = 0; i < soldiers.length; i++) {
      for (let j = i + 1; j < soldiers.length; j++) {
        const si = soldiers[i], sj = soldiers[j];
        const dx = sj.x - si.x, dy = sj.y - si.y, min = si.r + sj.r + 1;
        if (Math.abs(dx) >= min || Math.abs(dy) >= min) continue;
        const d = Math.hypot(dx, dy);
        if (d < min && d > 0.01) {
          const push = (min - d) * 0.55;
          si.x -= (dx/d)*push; si.y -= (dy/d)*push;
          sj.x += (dx/d)*push; sj.y += (dy/d)*push;
        }
      }
    }
    for (let i = soldiers.length - 1; i >= 0; i--) { if (soldiers[i].hp <= 0) soldiers.splice(i, 1); }

    // Buildings
    for (const b of map.buildingList) {
      b.hitFlash = Math.max(0, b.hitFlash - dt);
      b.checkComplete();
      if (!b.constructing && b.hp > 0 && b.hp < b.maxHp && b.hitFlash <= 0)
        b.hp = Math.min(b.maxHp, b.hp + BLDG_HEAL_RATE * dt);
    }
    st.prodTimer += dt;
    if (st.prodTimer >= PROD_TICK) {
      st.prodTimer -= PROD_TICK;
      for (const b of map.buildingList) {
        if (b.level === 0 || b.constructing || b.hp <= 0) continue;
        const def = BLDG_DEFS[b.type];
        if (def.produces) player[def.produces.resource] += def.produces.rate * b.level;
        if (def.consumesCoal) player.coal = Math.max(0, player.coal - 0.4 * b.level);
      }
    }
    for (let i = map.buildingList.length - 1; i >= 0; i--) {
      if (map.buildingList[i].hp <= 0) map.removeBuilding(map.buildingList[i]);
    }

    // Forts
    map.forts.forEach((f, key) => {
      f.update(dt, enemies);
      if (!f.dead && f.hp > 0 && f.hp < f.maxHp && f.hitFlash <= 0)
        f.hp = Math.min(f.maxHp, f.hp + BLDG_HEAL_RATE * dt);
      if (f.dead) map.forts.delete(key);
    });

    // Enemies
    for (const e of enemies) e.update(dt, player, soldiers, map);
    for (let i = enemies.length - 1; i >= 0; i--) {
      if (enemies[i].dead) { st.kills++; enemies.splice(i, 1); }
    }

    // Player auto-torpedo
    player.torpedoCooldown = Math.max(0, (player.torpedoCooldown || 0) - dt);
    if (player.torpedoCooldown <= 0) {
      let nearEnemy = null, nearDist = 380;
      for (const e of enemies) {
        const d = Math.hypot(e.x - player.x, e.y - player.y);
        if (d < nearDist) { nearDist = d; nearEnemy = e; }
      }
      if (nearEnemy) {
        const dx = nearEnemy.x - player.x, dy = nearEnemy.y - player.y, len = Math.hypot(dx, dy) || 1;
        st.torpedoes.push({ x: player.x, y: player.y, vx: dx/len*480, vy: dy/len*480, dmg: 55, life: 3 });
        player.torpedoCooldown = 2.5;
      }
    }
    for (const t of st.torpedoes) {
      t.x += t.vx * dt; t.y += t.vy * dt; t.life -= dt;
      for (const e of enemies) {
        if (!e.dead && Math.hypot(e.x - t.x, e.y - t.y) < e.r + 6) {
          e.hp -= t.dmg; if (e.hp <= 0) e.dead = true; t.life = 0; break;
        }
      }
    }
    st.torpedoes = st.torpedoes.filter(t => t.life > 0);

    // Waves
    st.waveTimer += dt;
    if (st.waveTimer >= st.waveInterval) {
      st.waveTimer = 0;
      this._spawnWave(st, st.waveNumber);
      st.waveLog.push({
        wave:      st.waveNumber,
        soldiers:  soldiers.length,
        enemies:   enemies.length,
        bldgHp:    _avgBldgHp(map),
        playerHp:  Math.round(player.hp),
        ..._res(player),
      });
      st.waveNumber++;
      if (st.waveNumber >= this.maxWaves) st.done = true;
    }
  }

  _spawnWave(st, waveIdx) {
    const count = WAVE_BASE + waveIdx * WAVE_GROWTH;
    for (let i = 0; i < count; i++) {
      const edge = Math.floor(Math.random() * 4);
      const pad  = TILE * 2;
      let ex, ey;
      if      (edge === 0) { ex = pad + Math.random()*(MAP_W-pad*2); ey = pad; }
      else if (edge === 1) { ex = pad + Math.random()*(MAP_W-pad*2); ey = MAP_H - pad; }
      else if (edge === 2) { ex = pad; ey = pad + Math.random()*(MAP_H-pad*2); }
      else                 { ex = MAP_W - pad; ey = pad + Math.random()*(MAP_H-pad*2); }
      const type = _pickEnemyType(waveIdx);
      st.enemies.push(new Enemy(ex, ey, waveIdx, type));
    }
  }

  _applyAction(st, action) {
    const { player: p, map } = st;
    switch (action.type) {
      case 'build': {
        const def  = BLDG_DEFS[action.btype];
        if (!def) return;
        const dep  = canBuildDeps(action.btype, map.buildingList);
        if (!dep.ok) return;
        const cost = getBldgUpgradeCost(def, 1);
        if (!canAfford(p, cost)) return;
        // Find an open spot near base center if not specified
        const col  = action.col ?? _findBuildCol(map, def.size);
        const row  = action.row ?? _findBuildRow(map, def.size);
        if (col == null || !map.canPlaceBuilding(col, row, def.size)) return;
        const b = new Building(col, row, action.btype, 0);
        map.placeBuilding(b);
        b.upgrade(p, map.buildingList.find(x => x.type === 'chief_hall')?.level ?? 1);
        break;
      }
      case 'fort': {
        const fdef = FORT_DEFS[action.ftype];
        if (!fdef || !canAfford(p, fdef.cost)) return;
        const col = action.col ?? _findFortCol(map);
        const row = action.row ?? _findFortRow(map);
        if (col == null) return;
        if (map.isSolid(col, row) || map.hasFort(col, row) || map.hasBuilding(col, row)) return;
        p.wood -= fdef.cost.wood; p.iron -= fdef.cost.iron;
        map.placeFort(new Fortification(col, row, action.ftype));
        break;
      }
      case 'train': {
        const b = action.building;
        if (!b || b.trainActive || b.level < 1 || b.constructing) return;
        if (!canAfford(p, TRAIN_COST)) return;
        for (const [r, a] of Object.entries(TRAIN_COST)) p[r] -= a;
        b.trainActive = true; b.trainTimer = TRAIN_TIME;
        break;
      }
      case 'upgrade': {
        const b = action.building;
        if (!b || b.constructing) return;
        const hallLv = map.buildingList.find(x => x.type === 'chief_hall')?.level ?? 1;
        b.upgrade(p, hallLv);
        break;
      }
    }
  }
}

// ── Placement helpers ──────────────────────────────────
function _scanForFreeSpot(map, size, preferCol, preferRow, radius = 12) {
  for (let d = 1; d <= radius; d++) {
    for (let dc = -d; dc <= d; dc++) {
      for (let dr = -d; dr <= d; dr++) {
        if (Math.abs(dc) !== d && Math.abs(dr) !== d) continue;
        const c = (preferCol ?? Math.floor(COLS/2)) + dc;
        const r = (preferRow ?? Math.floor(ROWS/2)) + dr;
        if (c < 1 || c >= COLS-size || r < 1 || r >= ROWS-size) continue;
        if (map.canPlaceBuilding(c, r, size)) return { col: c, row: r };
      }
    }
  }
  return null;
}
function _findBuildCol(map, size) { return _scanForFreeSpot(map, size)?.col ?? null; }
function _findBuildRow(map, size) { return _scanForFreeSpot(map, size)?.row ?? null; }
function _findFortCol(map) {
  const cx = Math.floor(COLS/2), cy = Math.floor(ROWS/2);
  for (let d = 3; d <= 14; d++) {
    for (let dc = -d; dc <= d; dc++) {
      for (let dr = -d; dr <= d; dr++) {
        if (Math.abs(dc) !== d && Math.abs(dr) !== d) continue;
        const c = cx + dc, r = cy + dr;
        if (!map.isSolid(c, r) && !map.hasFort(c, r) && !map.hasBuilding(c, r)) return c;
      }
    }
  }
  return null;
}
function _findFortRow(map) {
  const cx = Math.floor(COLS/2), cy = Math.floor(ROWS/2);
  for (let d = 3; d <= 14; d++) {
    for (let dc = -d; dc <= d; dc++) {
      for (let dr = -d; dr <= d; dr++) {
        if (Math.abs(dc) !== d && Math.abs(dr) !== d) continue;
        const c = cx + dc, r = cy + dr;
        if (!map.isSolid(c, r) && !map.hasFort(c, r) && !map.hasBuilding(c, r)) return r;
      }
    }
  }
  return null;
}
function _pickEnemyType(waveIdx) {
  const pool = ['mermaid'];
  if (waveIdx >= 3)  { pool.push('shark'); pool.push('shark'); }
  if (waveIdx >= 6)  pool.push('swordfish');
  if (waveIdx >= 10) pool.push('anglerfish');
  if (waveIdx >= 14) pool.push('jellyfish');
  return pool[Math.floor(Math.random() * pool.length)];
}
function _res(p)        { return { food: Math.round(p.food), wood: Math.round(p.wood), coal: Math.round(p.coal), iron: Math.round(p.iron) }; }
function _avgBldgHp(map) {
  if (!map.buildingList.length) return 100;
  const pct = map.buildingList.reduce((s, b) => s + b.hp / b.maxHp, 0) / map.buildingList.length;
  return Math.round(pct * 100);
}

// ── Public API ────────────────────────────────────────
const SimRunner = {

  // Run one simulation and return the result object
  run(opts = {}) {
    const r = new _SimRun(opts).run();
    this._printResult(r);
    return r;
  },

  // Run each faction with the same seed and print a comparison table
  compare(factions = FACTION_KEYS, opts = {}) {
    const seed = opts.seed ?? (Math.random() * 0xffffffff | 0);
    console.log(`\n=== FACTION COMPARISON  seed:${seed}  strategy:${(opts.strategy ?? Strategies.balanced).name} ===`);
    console.log('Faction          Survived  Waves  Kills  Soldiers  Food  Wood  Coal  Iron');
    console.log('─'.repeat(75));
    const results = factions.map(f => {
      const r = new _SimRun({ ...opts, faction: f, seed }).run();
      const sur = r.survived ? 'YES' : `died@${r.waves}`;
      console.log(
        `${f.padEnd(16)} ${sur.padEnd(9)} ${String(r.waves).padStart(5)}  ${String(r.kills).padStart(5)}` +
        `  ${String(r.soldiers).padStart(8)}  ${String(r.resources.food).padStart(4)}` +
        `  ${String(r.resources.wood).padStart(4)}  ${String(r.resources.coal).padStart(4)}  ${String(r.resources.iron).padStart(4)}`
      );
      return r;
    });
    return results;
  },

  // Compare strategies for one faction
  compareStrategies(faction = 'mammal', opts = {}) {
    const seed = opts.seed ?? (Math.random() * 0xffffffff | 0);
    const strats = opts.strategies ?? Object.values(Strategies);
    console.log(`\n=== STRATEGY COMPARISON  faction:${faction}  seed:${seed} ===`);
    console.log('Strategy         Survived  Waves  Kills  Soldiers');
    console.log('─'.repeat(52));
    strats.forEach(strategy => {
      const r = new _SimRun({ ...opts, faction, seed, strategy }).run();
      const sur = r.survived ? 'YES' : `died@${r.waves}`;
      console.log(`${strategy.name.padEnd(16)} ${sur.padEnd(9)} ${String(r.waves).padStart(5)}  ${String(r.kills).padStart(5)}  ${String(r.soldiers).padStart(8)}`);
    });
  },

  // Print wave-by-wave log from a run
  waveLog(opts = {}) {
    const r = new _SimRun(opts).run();
    console.log(`\n=== WAVE LOG  faction:${r.faction}  strategy:${r.strategy} ===`);
    console.log('Wave  Soldiers  Enemies  BldgHP  PlayerHP  Food  Wood  Coal  Iron');
    console.log('─'.repeat(66));
    r.waveLog.forEach(w => {
      console.log(
        `${String(w.wave+1).padStart(4)}  ${String(w.soldiers).padStart(8)}  ${String(w.enemies).padStart(7)}` +
        `  ${String(w.bldgHp+'%').padStart(6)}  ${String(w.playerHp).padStart(8)}` +
        `  ${String(w.food).padStart(4)}  ${String(w.wood).padStart(4)}  ${String(w.coal).padStart(4)}  ${String(w.iron).padStart(4)}`
      );
    });
    return r;
  },

  // Print wave difficulty table (static calculation)
  waveTable(maxWave = 20) {
    console.log('\n=== WAVE DIFFICULTY TABLE ===');
    console.log('Wave  Count  TotalHP  TotalDPS  EnemyTypes');
    console.log('─'.repeat(60));
    for (let w = 0; w < maxWave; w++) {
      const s     = waveStats(w);
      const types = [];
      if (w >= 0)  types.push('mermaid');
      if (w >= 3)  types.push('shark(×2)');
      if (w >= 6)  types.push('swordfish');
      if (w >= 10) types.push('anglerfish');
      if (w >= 14) types.push('jellyfish');
      console.log(
        `${String(w+1).padStart(4)}  ${String(s.count).padStart(5)}  ${String(s.totalHp).padStart(7)}` +
        `  ${String(s.totalDps).padStart(8)}  ${types.join(', ')}`
      );
    }
  },

  // Print unit stat table
  unitTable() {
    console.log('\n=== UNIT STATS ===');
    console.log('Unit               HP   DMG  ATK/s   DPS  SPD  RNG  Type');
    console.log('─'.repeat(65));
    for (const [k, u] of Object.entries(SOLDIER_TYPES)) {
      const dps = (u.dmg / u.attackRate).toFixed(1);
      console.log(
        `${(u.name).padEnd(18)} ${String(u.hp).padStart(4)} ${String(u.dmg).padStart(5)}` +
        `  ${(1/u.attackRate).toFixed(2).padStart(5)}  ${dps.padStart(5)}` +
        ` ${String(u.speed).padStart(4)} ${String(u.range).padStart(4)}  ${u.attackType}`
      );
    }
  },

  // Print building dependency tree
  depTree() {
    console.log('\n=== BUILDING DEPENDENCY TREE ===');
    for (const key of BLDG_KEYS) {
      const deps = BLDG_DEPS[key];
      const def  = BLDG_DEFS[key];
      if (!deps) {
        console.log(`${def.icon} ${def.name.padEnd(22)} (no prerequisites)`);
      } else {
        const req = deps.map(d => `${BLDG_DEFS[d.type].name} Lv${d.level}`).join(' + ');
        console.log(`${def.icon} ${def.name.padEnd(22)} requires: ${req}`);
      }
    }
    console.log('\n=== UNIT PREREQUISITE TREE ===');
    for (const [uk, reqs] of Object.entries(UNIT_DEPS)) {
      const uname = SOLDIER_TYPES[uk]?.name ?? uk;
      const req   = Object.entries(reqs).map(([b, l]) => `${BLDG_DEFS[b]?.name} Lv${l}`).join(' + ');
      console.log(`  ${uname.padEnd(22)} requires: ${req}`);
    }
  },

  _printResult(r) {
    console.log(
      `[Sim] faction:${r.faction} strategy:${r.strategy} ` +
      `waves:${r.waves} kills:${r.kills} soldiers:${r.soldiers} ` +
      `survived:${r.survived} seed:${r.seed}`
    );
  },
};

// Expose Strategies for external use
SimRunner.Strategies = Strategies;
