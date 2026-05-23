'use strict';

// ── Player (Captain Nemo — Nautilus) ──────────────────
class Player {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.r = PLAYER_R;
    this.angle = 0;
    this.hp = PLAYER_MAX_HP; this.maxHp = PLAYER_MAX_HP;
    this.lastHitTimer = 0;
    this.food = 200; this.wood = 200; this.coal = 100; this.iron = 50;
    this._acc = { food: 0, wood: 0, coal: 0, iron: 0 };
    this.kills = 0;
    this.moving = false;
  }

  addResource(res, amt) {
    this._acc[res] = (this._acc[res] || 0) + amt;
    if (this._acc[res] >= 1) {
      this[res] += Math.floor(this._acc[res]);
      this._acc[res] %= 1;
    }
  }

  update(dt, map) {
    let dx = 0, dy = 0;
    if (Input.isDown('w') || Input.isDown('ArrowUp'))    dy -= 1;
    if (Input.isDown('s') || Input.isDown('ArrowDown'))  dy += 1;
    if (Input.isDown('a') || Input.isDown('ArrowLeft'))  dx -= 1;
    if (Input.isDown('d') || Input.isDown('ArrowRight')) dx += 1;
    const joy = Input.TouchUI.joy;
    if (joy.dx !== 0 || joy.dy !== 0) { dx += joy.dx; dy += joy.dy; }
    this.moving = (dx !== 0 || dy !== 0);
    if (this.moving) {
      const len = Math.hypot(dx, dy);
      dx /= len; dy /= len;
      this.angle = Math.atan2(dy, dx);
      let nx = this.x + dx * PLAYER_SPEED * dt;
      let ny = this.y + dy * PLAYER_SPEED * dt;
      // Building collision: axis-aligned sliding
      if (_blockedByBuilding(nx, ny, this.r, map, true)) {
        if (!_blockedByBuilding(nx, this.y, this.r, map, true))      { ny = this.y; }
        else if (!_blockedByBuilding(this.x, ny, this.r, map, true)) { nx = this.x; }
        else                                                           { nx = this.x; ny = this.y; }
      }
      this.x = nx; this.y = ny;
      // Island collision: smooth pushout along boundary segments (3 iterations to settle corners)
      for (let i = 0; i < 3; i++) {
        const pp = _pushOutOfIslands(this.x, this.y, this.r, map);
        this.x = clamp(pp.x, this.r, MAP_W - this.r);
        this.y = clamp(pp.y, this.r, MAP_H - this.r);
      }
    }
    this.lastHitTimer = Math.max(0, this.lastHitTimer - dt);
    if (this.lastHitTimer === 0 && this.hp < this.maxHp)
      this.hp = Math.min(this.maxHp, this.hp + PLAYER_REGEN * dt);

    this.addResource('food', FOOD_RATE * dt);
    this.addResource('wood', WOOD_RATE * dt);
    this.addResource('coal', COAL_RATE * dt);
    this.addResource('iron', IRON_RATE * dt);
  }
}

// ── Soldier ───────────────────────────────────────────
class Soldier {
  constructor(x, y, type) {
    this.x = x; this.y = y;
    this.type = type || SOLDIER_TYPE_KEYS[Math.floor(Math.random() * SOLDIER_TYPE_KEYS.length)];
    const def = SOLDIER_TYPES[this.type];
    this.r         = def.r;
    this.hp        = def.hp;  this.maxHp = def.hp;
    this.dmg       = def.dmg;
    this.speed     = def.speed;
    this.range     = def.range;
    this.attackRate = def.attackRate;
    this.ranged    = def.ranged;
    this.projSpeed = def.projSpeed || 0;
    this.angle     = 0;
    this.state     = 'follow';
    this.target    = null;
    this.attackTimer = 0;
    this.hitFlash  = 0;
    this.projectiles = [];
    this.animT       = 0;
    this.moving      = false;
    this._stuckTimer = 0;
    this._pathWP     = null;
    this._wanderA    = (Math.random() - 0.5) * 1.5;
    const a = Math.random() * Math.PI * 2;
    const d = 28 + Math.random() * 55;
    this.ox = Math.cos(a) * d;
    this.oy = Math.sin(a) * d;
  }

  update(dt, player, enemies, map) {
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    if (map) _escapeIfStuck(this, map);
    this.animT += dt;

    // Advance projectiles
    this.projectiles = this.projectiles.filter(p => {
      if (p.target && !p.target.dead) { p.tx = p.target.x; p.ty = p.target.y; }
      const dx = p.tx - p.x, dy = p.ty - p.y;
      const d = Math.hypot(dx, dy);
      if (d < 10 || (p.target && p.target.dead)) {
        if (p.target && !p.target.dead) {
          p.target.hp -= p.dmg; p.target.hitFlash = 0.12;
          if (p.target.hp <= 0) p.target.dead = true;
        }
        return false;
      }
      p.x += (dx/d) * this.projSpeed * dt;
      p.y += (dy/d) * this.projSpeed * dt;
      return true;
    });

    // Find nearest enemy in attack range
    let nearest = null, nearDist = this.range;
    for (const e of enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x-this.x, e.y-this.y);
      if (d < nearDist) { nearDist = d; nearest = e; }
    }

    // Movement target priority:
    //   1. Enemy in attack range (fight it)
    //   2. Any enemy on the map, weighted toward ones threatening buildings/forts
    //   3. Guard nearest building (spread around it via personal offset)
    //   4. Follow player sub as last resort
    let dTX, dTY;
    if (nearest) {
      dTX = nearest.x; dTY = nearest.y;
    } else {
      let bestE = null, bestScore = Infinity;
      for (const e of enemies) {
        if (e.dead) continue;
        let score = Math.hypot(e.x-this.x, e.y-this.y);
        if (map) {
          for (const b of map.buildingList) {
            if (b.hp > 0 && Math.hypot(e.x-b.x, e.y-b.y) < TILE * 5) { score *= 0.35; break; }
          }
          map.forts.forEach(f => {
            if (f.hp > 0 && Math.hypot(e.x-f.x, e.y-f.y) < TILE * 4) score *= 0.5;
          });
        }
        if (score < bestScore) { bestScore = score; bestE = e; }
      }
      if (bestE) {
        dTX = bestE.x; dTY = bestE.y;
      } else if (map?.buildingList?.length > 0) {
        let nearB = null, nearBDist = Infinity;
        for (const b of map.buildingList) {
          if (b.hp <= 0) continue;
          const d = Math.hypot(b.x-this.x, b.y-this.y);
          if (d < nearBDist) { nearBDist = d; nearB = b; }
        }
        dTX = nearB ? nearB.x + this.ox * 0.45 : player.x + this.ox;
        dTY = nearB ? nearB.y + this.oy * 0.45 : player.y + this.oy;
      } else {
        dTX = player.x + this.ox;
        dTY = player.y + this.oy;
      }
    }

    // Advance toward A* waypoint if active; clear when reached
    if (this._pathWP && Math.hypot(this._pathWP.x - this.x, this._pathWP.y - this.y) < TILE * 0.6)
      this._pathWP = null;
    const nTX = this._pathWP ? this._pathWP.x : dTX;
    const nTY = this._pathWP ? this._pathWP.y : dTY;

    const prevX = this.x, prevY = this.y;

    if (nearest) {
      this.state = 'fight'; this.target = nearest;
      const ex = nearest.x - this.x, ey = nearest.y - this.y;
      const distE = Math.hypot(ex, ey);
      const stopDist = this.ranged ? this.range * 0.75 : this.r + nearest.r + 4;
      this.angle = Math.atan2(ey, ex);
      if (distE > stopDist) {
        const ndx = nTX - this.x, ndy = nTY - this.y;
        const nd = Math.hypot(ndx, ndy);
        if (nd > 1) _moveWithSteering(this, ndx/nd, ndy/nd, this.speed, dt, map, true);
      } else {
        this.attackTimer += dt;
        if (this.attackTimer >= this.attackRate) {
          this.attackTimer = 0;
          if (this.ranged) {
            this.projectiles.push({ x: this.x, y: this.y, tx: nearest.x, ty: nearest.y, target: nearest, dmg: this.dmg });
            if (typeof Audio !== 'undefined') Audio.rangedFire();
          } else {
            nearest.hp -= this.dmg; nearest.hitFlash = 0.12;
            if (nearest.hp <= 0) nearest.dead = true;
            if (typeof Audio !== 'undefined') Audio.meleeHit();
          }
        }
      }
    } else {
      this.state = 'follow'; this.target = null; this.attackTimer = 0;
      // Drift wander angle; decay slowly back toward 0 so they don't orbit forever
      this._wanderA += (Math.random() - 0.5) * 3.5 * dt;
      this._wanderA  = Math.max(-1.2, Math.min(1.2, this._wanderA));
      this._wanderA -= this._wanderA * 0.25 * dt;
      const dx = nTX - this.x, dy = nTY - this.y;
      const d = Math.hypot(dx, dy);
      if (d > 6) {
        const wa = Math.atan2(dy, dx) + this._wanderA;
        this.angle = wa;
        _moveWithSteering(this, Math.cos(wa), Math.sin(wa), Math.min(this.speed, d * 3.5), dt, map, true);
      }
    }

    this.x = clamp(this.x, this.r, MAP_W - this.r);
    this.y = clamp(this.y, this.r, MAP_H - this.r);

    // Animation flag
    const moved = Math.hypot(this.x - prevX, this.y - prevY);
    this.moving = moved > 0.5;

    // Stuck detection → A* pathfinding when stuck for > 0.4s
    const farFromTarget = Math.hypot(dTX - this.x, dTY - this.y) > TILE;
    if (farFromTarget && moved < this.speed * dt * 0.15) {
      this._stuckTimer += dt;
    } else {
      this._stuckTimer = 0;
    }
    if (this._stuckTimer > 0.4 && map) {
      this._pathWP = _findPath(this.x, this.y, dTX, dTY, map);
      this._stuckTimer = 0;
      this._stuckA = null;
    }
  }
}

// ── Enemy ─────────────────────────────────────────────
class Enemy {
  constructor(x, y, wave, type) {
    this.x = x; this.y = y;
    this.type = type || 'mermaid';
    const def = ENEMY_TYPES[this.type];
    this.r          = def.r;
    this.hp         = def.hpBase + wave * 10;  this.maxHp = this.hp;
    this.spd        = def.speed  + wave * 3;
    this.dmg        = def.dmg    + wave * 2;
    this.attackRate = def.attackRate;
    this.ranged     = def.ranged || false;
    this.projSpeed  = def.projSpeed || 0;
    this.angle      = Math.PI;
    this.attackTimer = 0;
    this.hitFlash   = 0;
    this.dead       = false;
    this.projectiles = [];
  }

  update(dt, player, soldiers, map) {
    if (this.dead) return;
    if (map) _escapeIfStuck(this, map);
    this.hitFlash = Math.max(0, this.hitFlash - dt);

    // Advance projectiles (ranged enemies)
    this.projectiles = this.projectiles.filter(p => {
      if (p.target && p.target !== player && p.target.hp <= 0) return false;
      if (p.target) { p.tx = p.target.x; p.ty = p.target.y; }
      const dx = p.tx - p.x, dy = p.ty - p.y;
      const d = Math.hypot(dx, dy);
      if (d < 10) {
        if (p.target === player) {
          player.hp -= p.dmg; player.lastHitTimer = 3;
        } else if (p.target && p.target.hp > 0) {
          p.target.hp -= p.dmg; p.target.hitFlash = 0.15;
        }
        return false;
      }
      p.x += (dx/d) * this.projSpeed * dt;
      p.y += (dy/d) * this.projSpeed * dt;
      return true;
    });

    // Find nearest target: soldiers → forts → buildings → player
    let tx = player.x, ty = player.y, tRef = player;
    let minD = Math.hypot(player.x-this.x, player.y-this.y);

    for (const s of soldiers) {
      const d = Math.hypot(s.x-this.x, s.y-this.y);
      if (d < minD) { minD = d; tx = s.x; ty = s.y; tRef = s; }
    }

    map.forts.forEach(f => {
      if (f.hp <= 0) return;
      const d = Math.hypot(f.x-this.x, f.y-this.y);
      if (d < minD) { minD = d; tx = f.x; ty = f.y; tRef = f; }
    });

    for (const b of map.buildingList) {
      if (b.hp <= 0) continue;
      const d = Math.hypot(b.x-this.x, b.y-this.y);
      if (d < minD) { minD = d; tx = b.x; ty = b.y; tRef = b; }
    }

    const dx = tx-this.x, dy = ty-this.y;
    const d = Math.hypot(dx, dy);
    const attackRange = this.ranged
      ? TILE * 4
      : this.r + (tRef.r || TILE) + 2;

    if (d > attackRange) {
      this.angle = Math.atan2(dy, dx);
      _moveWithSteering(this, dx/d, dy/d, this.spd, dt, map);
    } else {
      this.attackTimer += dt;
      if (this.attackTimer >= this.attackRate) {
        this.attackTimer = 0;
        if (this.ranged) {
          this.projectiles.push({ x: this.x, y: this.y, tx: tRef.x, ty: tRef.y, target: tRef, dmg: this.dmg });
          if (typeof Audio !== 'undefined') Audio.enemyFire();
        } else {
          if (tRef === player) {
            player.hp -= this.dmg; player.lastHitTimer = 3;
            if (typeof Audio !== 'undefined') Audio.enemyMelee();
          } else {
            tRef.hp -= this.dmg; tRef.hitFlash = 0.15;
            if (typeof Audio !== 'undefined') {
              if (tRef.col != null) Audio.structureHit(); else Audio.enemyMelee();
            }
          }
        }
      }
    }
    this.x = clamp(this.x, this.r, MAP_W - this.r);
    this.y = clamp(this.y, this.r, MAP_H - this.r);
  }
}

// ── Fortification ─────────────────────────────────────
class Fortification {
  constructor(col, row, type) {
    this.col = col; this.row = row;
    const hf = hexCenter(col, row);
    this.x = hf.x; this.y = hf.y;
    this.r = TILE/2 - 2;
    this.type = type;
    const def = FORT_DEFS[type];
    this.hp = def.hp; this.maxHp = def.hp;
    this.range = def.range; this.dmg = def.dmg;
    this.fireRate = def.fireRate; this.fireTimer = 0;
    this.projectiles = [];
    this.hitFlash = 0; this.dead = false;
  }

  update(dt, enemies) {
    if (this.dead) return;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    if (this.hp <= 0) { this.dead = true; return; }
    if (this.range > 0) {
      this.fireTimer += dt;
      if (this.fireTimer >= this.fireRate) {
        let nearest = null, nd = this.range;
        for (const e of enemies) {
          if (e.dead) continue;
          const d = Math.hypot(e.x-this.x, e.y-this.y);
          if (d < nd) { nd = d; nearest = e; }
        }
        if (nearest) {
          this.projectiles.push({ x:this.x, y:this.y, target:nearest, dmg:this.dmg });
          this.fireTimer = 0;
          if (typeof Audio !== 'undefined') Audio.rangedFire();
        }
      }
    }
    this.projectiles = this.projectiles.filter(p => {
      const dx = p.target.x-p.x, dy = p.target.y-p.y;
      const d = Math.hypot(dx, dy);
      if (d < 10 || p.target.dead) {
        if (!p.target.dead) { p.target.hp -= p.dmg; p.target.hitFlash = 0.1; }
        if (p.target.hp <= 0) p.target.dead = true;
        return false;
      }
      const spd = 420 * dt;
      p.x += (dx/d)*spd; p.y += (dy/d)*spd;
      return true;
    });
  }
}

// ── Building ──────────────────────────────────────────
class Building {
  constructor(col, row, type, level = 0) {
    this.col = col; this.row = row;
    this.type = type;
    const def = BLDG_DEFS[type];
    this.size = def.size;
    // Hex-flower (size 3) center IS (col, row); 2×2 quad center is between the 4 tiles
    const hc = this.size === 3
      ? hexCenter(col, row)
      : hexCenter(col + Math.floor(this.size / 2), row + Math.floor(this.size / 2));
    this.x = hc.x;
    this.y = hc.y;
    this.level = level;
    this.hp = def.hp; this.maxHp = def.hp;
    this.hitFlash = 0;
    this.constructing = false;
    this.constructEnd = 0;
    this.constructDuration = 0;
    this.trainActive = false;
    this.trainTimer  = 0;
  }

  get constructProgress() {
    if (!this.constructing) return 1;
    const total = this.constructDuration * 1000;
    return clamp((Date.now() - (this.constructEnd - total)) / total, 0, 1);
  }

  get constructRemaining() {
    return this.constructing ? Math.max(0, (this.constructEnd - Date.now()) / 1000) : 0;
  }

  checkComplete() {
    if (this.constructing && Date.now() >= this.constructEnd) {
      this.constructing = false;
      this.level++;
      this.maxHp = BLDG_DEFS[this.type].hp * this.level;
      this.hp = this.maxHp;
      return true;
    }
    return false;
  }

  upgrade(player, hallLevel) {
    const def = BLDG_DEFS[this.type];
    const next = this.level + 1;
    if (next > def.maxLevel) return { ok: false, reason: 'Max level reached' };
    if (this.constructing)   return { ok: false, reason: 'Already constructing' };
    if (this.type !== 'chief_hall' && next > hallLevel)
      return { ok: false, reason: `Command must reach level ${next} first` };

    const cost = getBldgUpgradeCost(def, next);
    if (!canAfford(player, cost)) {
      const missing = Object.entries(cost)
        .filter(([r, a]) => (player[r] ?? 0) < a)
        .map(([r, a]) => `${a} ${r}`)
        .join(', ');
      return { ok: false, reason: `Need ${missing}` };
    }

    for (const [r, a] of Object.entries(cost)) player[r] -= a;
    const dur = Math.floor(def.baseBuildTime * Math.pow(def.timeScale, next - 1));
    this.constructing = true;
    this.constructEnd = Date.now() + dur * 1000;
    this.constructDuration = dur;
    return { ok: true, dur };
  }
}

// ── Pathfinding ───────────────────────────────────────

// Per-frame A* call budget — reset by game.js each update tick.
let _astarCallsThisFrame = 0;
function _resetAstarBudget() { _astarCallsThisFrame = 0; }

// Binary min-heap helpers (in-place on an array, keyed by .f).
function _heapPush(h, node) {
  h.push(node);
  let i = h.length - 1;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (h[p].f <= h[i].f) break;
    const tmp = h[p]; h[p] = h[i]; h[i] = tmp; i = p;
  }
}
function _heapPop(h) {
  const top = h[0];
  const last = h.pop();
  if (h.length > 0) {
    h[0] = last; let i = 0;
    for (;;) {
      let s = i, l = 2*i+1, r = 2*i+2;
      if (l < h.length && h[l].f < h[s].f) s = l;
      if (r < h.length && h[r].f < h[s].f) s = r;
      if (s === i) break;
      const tmp = h[i]; h[i] = h[s]; h[s] = tmp; i = s;
    }
  }
  return top;
}

// A* on the hex grid. Returns pixel centre of the first step toward (toX,toY),
// or null if no path exists within the iteration budget.
function _findPath(fromX, fromY, toX, toY, map) {
  if (_astarCallsThisFrame >= 2) return null;
  _astarCallsThisFrame++;

  const s = pixelToHex(fromX, fromY);
  const g = pixelToHex(toX,   toY);
  if (s.c === g.c && s.r === g.r) return null;

  const EVEN = [[1,0],[-1,0],[0,-1],[-1,-1],[0,1],[-1,1]];
  const ODD  = [[1,0],[-1,0],[1,-1],[0,-1],[1,1],[0,1]];
  const idx  = (c, r) => c + r * COLS;
  const heur = (c, r) => Math.hypot(c - g.c, r - g.r);

  const heap   = [];
  const gScore = new Map();   // idx → best g seen
  const prev   = new Map();   // idx → parent idx (null for start)

  const si = idx(s.c, s.r);
  gScore.set(si, 0);
  prev.set(si, null);
  _heapPush(heap, { c: s.c, r: s.r, f: heur(s.c, s.r), g: 0 });

  for (let iter = 0; iter < 300 && heap.length; iter++) {
    const cur = _heapPop(heap);
    const ci  = idx(cur.c, cur.r);
    if (cur.g > (gScore.get(ci) ?? Infinity)) continue; // stale entry

    if (cur.c === g.c && cur.r === g.r) {
      // Trace back to find first step from start
      let curI = ci, parentI = prev.get(curI);
      while (parentI !== null && parentI !== si) { curI = parentI; parentI = prev.get(curI); }
      const fc = curI % COLS, fr = (curI / COLS) | 0;
      return hexCenter(fc, fr);
    }

    for (const [dc, dr] of (cur.r & 1 ? ODD : EVEN)) {
      const nc = cur.c + dc, nr = cur.r + dr;
      if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
      if (map.isSolid(nc, nr) || map.hasBuilding(nc, nr)) continue;
      const ni = idx(nc, nr);
      const ng = cur.g + 1;
      if (ng < (gScore.get(ni) ?? Infinity)) {
        gScore.set(ni, ng);
        prev.set(ni, ci);
        _heapPush(heap, { c: nc, r: nr, f: ng + heur(nc, nr), g: ng });
      }
    }
  }
  return null;
}

// ── Movement / steering helpers ───────────────────────

// Moves entity toward (dirX,dirY) at speed.
// 1. Direct move — never blocks narrow passages.
// 2. Axis-slide  — glide along one axis.
// 3. Repulsion steer — deflects away from nearby walls when blocked.
// 4. Direction scan  — systematic 16-direction search when all else fails;
//    picks the passable direction closest to the target angle so the entity
//    flows around convex corners and out of caves.
function _blockedByBuilding(x, y, r, map, friendly = false) {
  const cr = r - 1;
  const check = (cx, cy) => {
    const h = pixelToHex(cx, cy);
    if (!map.hasBuilding(h.c, h.r)) return false;
    if (friendly) { const b = map.getBuildingAt(h.c, h.r); if (b?.type === 'recruit_post') return false; }
    return true;
  };
  return check(x-cr,y-cr) || check(x+cr,y-cr) || check(x-cr,y+cr) || check(x+cr,y+cr);
}

function _pushOutOfIslands(x, y, r, map) {
  const HALF = HEX_R / 2;
  const EVEN = [[1,0],[-1,0],[0,-1],[-1,-1],[0,1],[-1,1]];
  const ODD  = [[1,0],[-1,0],[1,-1],[0,-1],[1,1],[0,1]];
  const { c: ec, r: er } = pixelToHex(x, y);
  for (let dc = -2; dc <= 2; dc++) {
    for (let dr = -2; dr <= 2; dr++) {
      const oc = ec + dc, or_ = er + dr;
      if (map.isSolid(oc, or_)) continue;
      const dirs = (or_ & 1) ? ODD : EVEN;
      for (const [ndc, ndr] of dirs) {
        const sc = oc + ndc, sr = or_ + ndr;
        if (!map.isSolid(sc, sr)) continue;
        // boundary segment between open (oc,or_) and solid (sc,sr)
        const hc = hexCenter(oc, or_), hn = hexCenter(sc, sr);
        const ex = hn.x - hc.x, ey = hn.y - hc.y;
        const el = Math.hypot(ex, ey);
        if (el < 0.1) continue;
        const dx = ex/el, dy = ey/el;
        const mx = (hc.x + hn.x)/2, my = (hc.y + hn.y)/2;
        const ax = mx - dy*HALF, ay = my + dx*HALF;
        const bx = mx + dy*HALF, by = my - dx*HALF;
        const sdx = bx-ax, sdy = by-ay;
        const lenSq = sdx*sdx + sdy*sdy;
        if (lenSq < 0.001) continue;
        let t = ((x-ax)*sdx + (y-ay)*sdy) / lenSq;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const cpx = ax + t*sdx, cpy = ay + t*sdy;
        const edx = x-cpx, edy = y-cpy;
        const d = Math.hypot(edx, edy);
        if (d < r) {
          if (d > 0.001) { x += edx*(r-d)/d; y += edy*(r-d)/d; }
          else           { x -= dx*r; y -= dy*r; }
        }
      }
    }
  }
  return { x, y };
}

function _moveWithSteering(entity, dirX, dirY, speed, dt, map, friendly = false) {
  const step = speed * dt;
  let ex = entity.x + dirX * step, ey = entity.y + dirY * step;

  if (!map) { entity.x = ex; entity.y = ey; return; }

  // Buildings: tile-based axis-aligned sliding
  if (_blockedByBuilding(ex, ey, entity.r, map, friendly)) {
    if (!_blockedByBuilding(ex, entity.y, entity.r, map, friendly))      { ey = entity.y; }
    else if (!_blockedByBuilding(entity.x, ey, entity.r, map, friendly)) { ex = entity.x; }
    else                                                                   { ex = entity.x; ey = entity.y; }
  }
  entity.x = ex; entity.y = ey;

  // Islands: smooth sliding via boundary segments (3 iterations to settle corners)
  for (let i = 0; i < 3; i++) {
    const p = _pushOutOfIslands(entity.x, entity.y, entity.r, map);
    entity.x = p.x; entity.y = p.y;
  }
}

// ── Collision helpers ─────────────────────────────────
function collidesMap(x, y, r, map) {
  const cr = r - 2;
  const check = (cx, cy) => { const h = pixelToHex(cx, cy); return map.blocksAt(h.c, h.r); };
  return check(x-cr,y-cr) || check(x+cr,y-cr) || check(x-cr,y+cr) || check(x+cr,y+cr);
}

function _canMoveEnemy(x, y, r, map) {
  const h = pixelToHex(x, y);
  if (map.isSolid(h.c, h.r)) return false;
  const cr = r - 1;
  const check = (cx, cy) => { const t = pixelToHex(cx, cy); return map.isSolid(t.c, t.r) || map.hasBuilding(t.c, t.r); };
  return !check(x-cr,y-cr) && !check(x+cr,y-cr) && !check(x-cr,y+cr) && !check(x+cr,y+cr);
}

function _canMoveFriendly(x, y, r, map) {
  const h = pixelToHex(x, y);
  if (map.isSolid(h.c, h.r)) return false;
  const cr = r - 1;
  const check = (cx, cy) => {
    const t = pixelToHex(cx, cy);
    if (map.isSolid(t.c, t.r)) return true;
    if (!map.hasBuilding(t.c, t.r)) return false;
    const b = map.getBuildingAt(t.c, t.r);
    return b?.type !== 'recruit_post';
  };
  return !check(x-cr,y-cr) && !check(x+cr,y-cr) && !check(x-cr,y+cr) && !check(x+cr,y+cr);
}

function _findSpawnNear(cx, cy, r, map) {
  // Spiral outward in rings so we always find the nearest valid tile
  for (let dist = 0; dist <= TILE * 6; dist += TILE * 0.5) {
    const steps = dist < 1 ? 1 : Math.max(8, Math.round((Math.PI * 2 * dist) / (TILE * 0.5)));
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const tx = cx + Math.cos(a) * dist, ty = cy + Math.sin(a) * dist;
      if (_canMoveFriendly(tx, ty, r, map)) return { x: tx, y: ty };
    }
  }
  return { x: cx, y: cy };
}

// Teleports entity to the nearest valid position if stuck in land or a building.
function _escapeIfStuck(entity, map) {
  if (_canMoveEnemy(entity.x, entity.y, entity.r, map)) return;
  for (let dist = TILE * 0.5; dist <= TILE * 6; dist += TILE * 0.5) {
    const steps = Math.max(8, Math.round((Math.PI * 2 * dist) / (TILE * 0.5)));
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const tx = entity.x + Math.cos(a) * dist, ty = entity.y + Math.sin(a) * dist;
      if (_canMoveEnemy(tx, ty, entity.r, map)) { entity.x = tx; entity.y = ty; return; }
    }
  }
}
