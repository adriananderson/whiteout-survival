'use strict';

class GameMap {
  constructor() {
    this.tiles          = new Uint8Array(COLS * ROWS);
    this.forts          = new Map();          // `${c},${r}` → Fortification
    this.buildings      = new Map();          // `${c},${r}` → Building (footprint tiles)
    this.buildingList   = [];                 // unique Building instances
    this.camps          = [];
    this.expeditions    = [];
    this.minimap        = null;
  }

  idx(c, r) { return r * COLS + c; }

  get(c, r) {
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return T_ISLAND;
    return this.tiles[this.idx(c, r)];
  }

  set(c, r, t) {
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return;
    this.tiles[this.idx(c, r)] = t;
  }

  isSolid(c, r)    { return this.get(c, r) === T_ISLAND; }
  hasFort(c, r)    { return this.forts.has(`${c},${r}`); }
  hasBuilding(c, r){ return this.buildings.has(`${c},${r}`); }
  getBuildingAt(c, r) { return this.buildings.get(`${c},${r}`) ?? null; }

  blocksAt(c, r) { return this.isSolid(c, r) || this.hasBuilding(c, r); }

  placeBuilding(b) {
    for (const [c, r] of buildingTiles(b.col, b.row, b.size))
      this.buildings.set(`${c},${r}`, b);
    this.buildingList.push(b);
  }

  removeBuilding(b) {
    for (const [c, r] of buildingTiles(b.col, b.row, b.size))
      this.buildings.delete(`${c},${r}`);
    const i = this.buildingList.indexOf(b);
    if (i !== -1) this.buildingList.splice(i, 1);
  }

  canPlaceBuilding(col, row, size) {
    for (const [c, r] of buildingTiles(col, row, size)) {
      if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return false;
      if (this.isSolid(c, r))     return false;
      if (this.hasFort(c, r))     return false;
      if (this.hasBuilding(c, r)) return false;
    }
    return true;
  }

  placeFort(fort)         { this.forts.set(`${fort.col},${fort.row}`, fort); }
  removeFort(col, row)    { this.forts.delete(`${col},${row}`); }

  generate(seed) {
    const rng = mulberry32(seed || 42);
    this.tiles.fill(T_SAND);

    // Deep water trenches — organic winding paths
    for (let m = 0; m < 6; m++) {
      let c = Math.floor(rng() * COLS);
      let r = Math.floor(rng() * ROWS);
      const steps = 18 + Math.floor(rng() * 26);
      for (let s = 0; s < steps; s++) {
        const br = 2 + Math.floor(rng() * 3);
        for (let dc = -br-2; dc <= br+2; dc++) {
          for (let dr = -br-2; dr <= br+2; dr++) {
            // sine-based warp distorts the circle edge using absolute tile position
            const warp = Math.sin((c+dc) * 0.73 + (r+dr) * 1.17) * 1.4;
            if (dc*dc + dr*dr <= (br + warp) * (br + warp))
              this.set(c+dc, r+dr, T_ISLAND);
          }
        }
        c = clamp(c + Math.floor(rng()*8)-3, 1, COLS-2);
        r = clamp(r + Math.floor(rng()*6)-2, 1, ROWS-2);
      }
    }

    // Coral reef clusters
    for (let f = 0; f < 9; f++) {
      const c = Math.floor(rng() * COLS);
      const r = Math.floor(rng() * ROWS);
      const rad = 3 + Math.floor(rng() * 4);
      for (let dc = -rad; dc <= rad; dc++)
        for (let dr = -rad; dr <= rad; dr++)
          if (dc*dc+dr*dr <= rad*rad && this.get(c+dc,r+dr) === T_SAND && rng() < 0.75)
            this.set(c+dc, r+dr, T_CORAL);
    }

    // Rocky outcrops
    for (let i = 0; i < 6; i++) {
      const c = Math.floor(rng() * COLS);
      const r = Math.floor(rng() * ROWS);
      const rad = 3 + Math.floor(rng() * 5);
      for (let dc = -rad; dc <= rad; dc++)
        for (let dr = -rad; dr <= rad; dr++)
          if (dc*dc+dr*dr <= rad*rad && this.get(c+dc,r+dr) === T_SAND)
            this.set(c+dc, r+dr, T_SEAWEED);
    }

    // Clear organic base area north of port — ellipse-ish with sinusoidal edge variation
    const cx = Math.floor(COLS/2), cy = Math.floor(ROWS/2);
    for (let dr = -9; dr <= 7; dr++) {
      const t = dr / 9;
      const halfW = 8.5 * Math.sqrt(1 - t * t * 0.55) + Math.sin(dr * 1.4) * 0.9;
      for (let dc = Math.ceil(-halfW); dc <= Math.floor(halfW); dc++)
        this.set(cx + dc, cy + dr, T_SAND);
    }

    // Harbor — organic bay south of the base, irregular coastline
    for (let dr = 8; dr <= 22; dr++) {
      const t  = (dr - 8) / 14;
      const halfW  = 6.5 - t * 1.2 + Math.sin(dr * 0.85) * 1.1;
      const leftX  = Math.ceil( -halfW + Math.sin(dr * 1.9 + 0.3) * 1.4);
      const rightX = Math.floor( halfW + Math.sin(dr * 1.5 + 1.8) * 1.4);
      for (let dc = leftX; dc <= rightX; dc++)
        this.set(cx + dc, cy + dr, T_ISLAND);
    }

    // Pre-place Nautilus Command (hex-flower, 7 tiles) centred above the harbour
    const hallCol = cx, hallRow = cy + 5;
    for (let dc = -2; dc <= 2; dc++)
      for (let dr = -2; dr <= 2; dr++)
        this.set(hallCol+dc, hallRow+dr, T_SAND);
    const hall = new Building(hallCol, hallRow, 'chief_hall', 1);
    this.placeBuilding(hall);

    // Pre-place Thermal Vent (2×2) north-east of the hall
    const furnCol = hallCol + 3, furnRow = hallRow - 4;
    for (let dc = -1; dc <= 2; dc++)
      for (let dr = -1; dr <= 2; dr++)
        this.set(furnCol+dc, furnRow+dr, T_SAND);
    const furn = new Building(furnCol, furnRow, 'furnace', 1);
    this.placeBuilding(furn);

    // Pre-place Recruit Station west of the hall
    const rpCol = hallCol - 4, rpRow = hallRow + 2;
    for (let dc = -1; dc <= 2; dc++)
      for (let dr = -1; dr <= 2; dr++)
        this.set(rpCol+dc, rpRow+dr, T_SAND);
    const rp = new Building(rpCol, rpRow, 'recruit_post', 1);
    this.placeBuilding(rp);

    // Expedition sites
    const expAngles = [0.4, 1.1, 1.9, 2.8, 4.2];
    const expDists  = [18,  22,  17,  20,  19 ];
    EXPEDITION_DEFS.forEach((def, i) => {
      let ec = clamp(cx + Math.round(Math.cos(expAngles[i]) * expDists[i]), 5, COLS-5);
      let er = clamp(cy + Math.round(Math.sin(expAngles[i]) * expDists[i]), 5, ROWS-5);
      for (let dr = 0; dr <= 4 && this.isSolid(ec, er); dr++)
        for (let dc = 0; dc <= 4 && this.isSolid(ec, er); dc++)
          { ec = clamp(ec+dc, 5, COLS-5); er = clamp(er+dr, 5, ROWS-5); }
      for (let dc = -2; dc <= 2; dc++)
        for (let dr = -2; dr <= 2; dr++)
          this.set(ec+dc, er+dr, T_SAND);
      const hexp = hexCenter(ec, er);
      this.expeditions.push({ ...def, x: hexp.x, y: hexp.y, cooldownEnd: 0 });
    });

    this._buildMinimap();
  }

  _buildMinimap() {
    const mc = document.createElement('canvas');
    mc.width = COLS; mc.height = ROWS;
    const mctx = mc.getContext('2d');
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        mctx.fillStyle = TILE_FILL[this.get(c, r)];
        mctx.fillRect(c, r, 1, 1);
      }
    this.minimap = mc;
  }
}

function mulberry32(seed) {
  let s = seed >>> 0;
  return function() {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
