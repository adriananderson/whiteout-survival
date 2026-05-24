'use strict';

const Renderer = (() => {
  let canvas, ctx, W, H;
  let _rangeCanvas = null, _rangeCtx = null;

  function init(c) {
    canvas = c; ctx = c.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
  }

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  function clear() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#040c1a');
    g.addColorStop(1, '#071428');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function ws(wx, wy, cam) {
    return { x: wx - cam.x + W/2, y: wy - cam.y + H/2 };
  }

  // ── Tile determinism hash ─────────────────────────────
  function _th(c, r, salt) {
    let h = (c * 1664525 + r * 1013904223 + (salt|0)) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
    h = h ^ (h >>> 16);
    return (h >>> 0) / 0xffffffff;
  }

  // ── Hex path helpers ──────────────────────────────────
  function _hexPath(sx, sy) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI/2 + (Math.PI/3) * i;
      const x = sx + HEX_R * Math.cos(a);
      const y = sy + HEX_R * Math.sin(a);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  function _hexPathR(sx, sy, R) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI/2 + (Math.PI/3) * i;
      const x = sx + R * Math.cos(a);
      const y = sy + R * Math.sin(a);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  // ── Tilemap ───────────────────────────────────────────
  function drawMap(map, cam) {
    const r0 = Math.max(0, Math.floor((cam.y - H/2 - HEX_R*2 - HEX_R) / HEX_PITCH_Y));
    const r1 = Math.min(ROWS-1, Math.ceil((cam.y + H/2 + HEX_R*2 - HEX_R) / HEX_PITCH_Y));
    const c0 = Math.max(0, Math.floor((cam.x - W/2 - TILE*2) / TILE) - 1);
    const c1 = Math.min(COLS-1, Math.ceil((cam.x + W/2 + TILE*2) / TILE) + 1);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (map.hasBuilding(c, r)) continue;
        const hc = hexCenter(c, r);
        const sx = hc.x - cam.x + W/2;
        const sy = hc.y - cam.y + H/2;
        drawTile(map.get(c, r), sx, sy, c, r, map);
      }
    }
  }

  // Hex neighbour offsets (even / odd row)
  const _EVEN_DIRS = [[1,0],[-1,0],[0,-1],[-1,-1],[0,1],[-1,1]];
  const _ODD_DIRS  = [[1,0],[-1,0],[1,-1],[0,-1],[1,1],[0,1]];

  function drawTile(type, sx, sy, c, r, map) {
    const h0 = _th(c, r, 0);
    if (type === T_ISLAND) {
      // Island — impassable, ~80-88 % lightness so it reads clearly as bright land
      const hue = 36 + h0 * 14 | 0;
      const sat = 62 + h0 * 18 | 0;
      const lit = 80 + h0 *  8 | 0;
      ctx.fillStyle = `hsl(${hue},${sat}%,${lit}%)`;
      _hexPath(sx, sy); ctx.fill();
      // Rocky texture specks
      ctx.fillStyle = `rgba(110,70,10,0.22)`;
      for (let i = 0; i < 3; i++) {
        const bx = sx + (_th(c,r,i+1) - 0.5) * HEX_R * 1.1;
        const by = sy + (_th(c,r,i+4) - 0.5) * HEX_R * 1.1;
        const br = 1 + _th(c,r,i+7) * 2.5;
        ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI*2); ctx.fill();
      }
      // Bright warm stroke — makes island edges pop against dark water
      ctx.strokeStyle = `hsl(${hue},${sat+5}%,${Math.min(lit+10,96)}%)`;
      ctx.lineWidth = 1.5;
      _hexPath(sx, sy); ctx.stroke();
    } else if (type === T_CORAL) {
      // Coral reef — shallow seafloor with vivid coral formations
      const hue = 178 + h0 * 10 | 0;  // same sea-floor base hue as T_SAND
      ctx.fillStyle = `hsl(${hue},${38+h0*14|0}%,${19+h0*10|0}%)`;
      _hexPath(sx, sy); ctx.fill();
      // Fan coral — radiating fronds from a base stalk
      const cx2 = sx + (_th(c,r,5)-0.5)*HEX_R*0.5;
      const cy2 = sy + HEX_R*0.25;
      const fh  = 9 + _th(c,r,6)*9;
      const fanW = fh * 0.7;
      const coralCol = _th(c,r,7) < 0.4 ? '#e04828' : _th(c,r,7) < 0.7 ? '#e88020' : '#c03870';
      ctx.strokeStyle = coralCol; ctx.lineCap = 'round';
      // Central stalk
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx2, cy2); ctx.lineTo(cx2, cy2 - fh); ctx.stroke();
      // Fan fronds — semi-circle of thin branches
      ctx.lineWidth = 1;
      const nFronds = 5;
      for (let fi = 0; fi < nFronds; fi++) {
        const fa = -Math.PI*0.85 + (fi/(nFronds-1))*Math.PI*0.85;
        const fx = cx2 + Math.cos(fa)*fanW*0.9;
        const fy = (cy2 - fh*0.5) + Math.sin(fa)*fanW*0.5;
        ctx.beginPath(); ctx.moveTo(cx2, cy2 - fh*0.35); ctx.lineTo(fx, fy); ctx.stroke();
      }
      // Polyp dots along frond tips
      ctx.fillStyle = _th(c,r,8) < 0.5 ? '#ffb040' : '#ff6880';
      for (let fi = 0; fi < nFronds; fi++) {
        const fa = -Math.PI*0.85 + (fi/(nFronds-1))*Math.PI*0.85;
        const fx = cx2 + Math.cos(fa)*fanW*0.9;
        const fy = (cy2 - fh*0.5) + Math.sin(fa)*fanW*0.5;
        ctx.beginPath(); ctx.arc(fx, fy, 1.5, 0, Math.PI*2); ctx.fill();
      }
      ctx.lineCap = 'butt';
    } else if (type === T_SEAWEED) {
      // Seaweed bed — murky green, passable seafloor overgrown with kelp
      const hue = 128 + h0 * 20 | 0;
      const sat = 48 + h0 * 20 | 0;
      const lit  = 16 + h0 * 12 | 0;
      ctx.fillStyle = `hsl(${hue},${sat}%,${lit}%)`;
      _hexPath(sx, sy); ctx.fill();
      // Kelp fronds — thin wiggly blades rising from the floor
      ctx.strokeStyle = `hsl(${hue + 10 | 0},${sat + 15 | 0}%,${lit + 18 | 0}%)`;
      ctx.lineCap = 'round';
      const nBlades = 3 + (_th(c, r, 20) * 3.9 | 0);
      for (let i = 0; i < nBlades; i++) {
        const bx = sx + (_th(c, r, 21 + i) - 0.5) * HEX_R * 1.1;
        const by = sy + (_th(c, r, 25 + i) - 0.5) * HEX_R * 0.9;
        const bh2 = 5 + _th(c, r, 29 + i) * 8;
        const sway = (_th(c, r, 33 + i) - 0.5) * 5;
        ctx.lineWidth = 0.8 + _th(c, r, 37 + i) * 0.7;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.quadraticCurveTo(bx + sway, by - bh2 * 0.55, bx + sway * 0.6, by - bh2);
        ctx.stroke();
      }
      ctx.lineCap = 'butt';
    } else {
      // T_SAND — deep ocean floor, ~8-18 % lightness so it reads clearly as dark water
      const hue = 188 + h0 * 16 | 0;
      const sat = 55 + h0 * 22 | 0;
      const lit =  8 + h0 * 10 | 0;
      ctx.fillStyle = `hsl(${hue},${sat}%,${lit}%)`;
      _hexPath(sx, sy); ctx.fill();
      // Coastal shallow-water fringe — gradient warm tint, stronger the more land neighbors
      if (map) {
        const dirs = (r & 1) ? _ODD_DIRS : _EVEN_DIRS;
        let deepCount = 0;
        for (const [dc, dr] of dirs) if (map.get(c + dc, r + dr) === T_ISLAND) deepCount++;
        if (deepCount > 0) {
          const a1 = (0.07 + deepCount * 0.07).toFixed(2);
          ctx.fillStyle = `rgba(200,155,55,${a1})`;
          _hexPath(sx, sy); ctx.fill();
          if (deepCount >= 2) {
            const a2 = (deepCount * 0.04).toFixed(2);
            ctx.fillStyle = `rgba(235,195,90,${a2})`;
            _hexPath(sx, sy); ctx.fill();
          }
        }
      }
      // Subtle seafloor current ripple
      ctx.strokeStyle = `rgba(80,230,200,0.15)`; ctx.lineWidth = 0.8;
      const ry = sy + (_th(c,r,30)-0.5)*HEX_R*0.5;
      const rr = 5 + _th(c,r,31)*8;
      ctx.beginPath(); ctx.arc(sx + (_th(c,r,32)-0.5)*HEX_R*0.4, ry, rr, 0.1, Math.PI-0.1); ctx.stroke();
    }
  }

  // ── Buildings ──────────────────────────────────────────
  function drawBuildings(map, cam) {
    for (const b of map.buildingList) {
      const bcx = b.x - cam.x + W/2;
      const bcy = b.y - cam.y + H/2;
      if (bcx + b.size*TILE < 0 || bcx > W || bcy + b.size*HEX_PITCH_Y < 0 || bcy > H) continue;
      const hc = hexCenter(b.col, b.row);
      const sx = hc.x - cam.x + W/2;
      const sy = hc.y - cam.y + H/2;
      _drawBuilding(ctx, b, sx, sy, cam);
    }
  }

  function _drawBuilding(ctx, b, sx, sy, cam) {
    const def = BLDG_DEFS[b.type];
    const bw = b.size * TILE, bh = b.size * HEX_PITCH_Y;
    const tiles = buildingTiles(b.col, b.row, b.size);
    const bcx = b.x - cam.x + W/2, bcy = b.y - cam.y + H/2;

    // Ground hex tiles — dark stone platform, distinct from seafloor
    for (const [tc, tr] of tiles) {
      const { x: wx, y: wy } = hexCenter(tc, tr);
      const tsx = wx - cam.x + W/2, tsy = wy - cam.y + H/2;
      // Base plate
      ctx.fillStyle = '#1a2a3a';
      _hexPath(tsx, tsy); ctx.fill();
      // Inner bevel highlight
      ctx.strokeStyle = '#2e4a64'; ctx.lineWidth = 2.5;
      _hexPath(tsx, tsy); ctx.stroke();
    }

    // Hit flash
    if (b.hitFlash > 0) {
      ctx.fillStyle = `rgba(255,80,80,${Math.min(0.85, b.hitFlash * 5)})`;
      for (const [tc, tr] of tiles) {
        const { x: wx, y: wy } = hexCenter(tc, tr);
        _hexPath(wx - cam.x + W/2, wy - cam.y + H/2); ctx.fill();
      }
    }

    if (b.constructing) {
      ctx.fillStyle = def.color + '88';
      for (const [tc, tr] of tiles) {
        const { x: wx, y: wy } = hexCenter(tc, tr);
        _hexPath(wx - cam.x + W/2, wy - cam.y + H/2); ctx.fill();
      }
      ctx.strokeStyle = '#405870'; ctx.lineWidth = 1.2; ctx.setLineDash([4,4]);
      for (const [tc, tr] of tiles) {
        const { x: wx, y: wy } = hexCenter(tc, tr);
        _hexPath(wx - cam.x + W/2, wy - cam.y + H/2); ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.font = `${Math.floor(HEX_R)}px serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.fillText('🔧', bcx, bcy);
      const prog = b.constructProgress;
      const pbx = bcx - HEX_R*0.7, pby = bcy + HEX_R*0.6, pbW = HEX_R*1.4;
      ctx.fillStyle = '#0d1a26'; ctx.fillRect(pbx, pby, pbW, 5);
      ctx.fillStyle = '#30c8f0'; ctx.fillRect(pbx, pby, pbW * prog, 5);
    } else if (b.level > 0) {
      const tier = b.level <= 3 ? 0 : b.level <= 7 ? 1 : 2;
      const gfx = _BLDG_GFX[b.type];
      // Shift sx/sy so GFX art (which does sx+bw/2, sy+bh/2) centers on bcx/bcy
      if (gfx) gfx(b, tier, bcx - bw/2, bcy - bh/2, bw, bh);
    } else {
      ctx.fillStyle = def.color;
      _hexPathR(bcx, bcy, HEX_R * 0.85); ctx.fill();
    }

    // Outer border glow
    ctx.strokeStyle = '#3a7090'; ctx.lineWidth = 1.5;
    for (const [tc, tr] of tiles) {
      const { x: wx, y: wy } = hexCenter(tc, tr);
      _hexPath(wx - cam.x + W/2, wy - cam.y + H/2); ctx.stroke();
    }

    // Level badge
    if (b.level > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(bcx + HEX_R*0.2, bcy - HEX_R*0.95, 20, 12);
      ctx.fillStyle = '#30c8f0'; ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'right'; ctx.textBaseline = 'top';
      ctx.fillText(`L${b.level}`, bcx + HEX_R*0.2 + 19, bcy - HEX_R*0.95 + 2);
    }

    // HP bar
    if (b.hp < b.maxHp && b.hp > 0) {
      const hpPct = b.hp / b.maxHp;
      const barW = HEX_R * 1.8 * b.size, barX = bcx - barW/2, barY = bcy + HEX_R*(b.size === 3 ? 1.1 : 0.8);
      ctx.fillStyle = '#330000'; ctx.fillRect(barX, barY, barW, 3);
      ctx.fillStyle = hpPct > 0.5 ? '#44cc55' : hpPct > 0.25 ? '#ffaa00' : '#ff3333';
      ctx.fillRect(barX, barY, barW * hpPct, 3);
    }
  }

  // ── Building ghost ─────────────────────────────────────
  function drawBldgGhost(bldgMode, cam) {
    if (!bldgMode.active || !bldgMode.type) return;
    const def = BLDG_DEFS[bldgMode.type];
    const gc = bldgMode.ghostCol, gr = bldgMode.ghostRow;
    const tiles = buildingTiles(gc, gr, def.size);
    const cen   = def.size === 3 ? hexCenter(gc, gr) : hexCenter(gc + Math.floor(def.size/2), gr + Math.floor(def.size/2));
    const ccx = cen.x - cam.x + W/2, ccy = cen.y - cam.y + H/2;

    ctx.globalAlpha = 0.55;
    ctx.fillStyle = bldgMode.canPlace ? '#2060c0' : '#aa2222';
    for (const [tc, tr] of tiles) {
      const { x: wx, y: wy } = hexCenter(tc, tr);
      _hexPath(wx - cam.x + W/2, wy - cam.y + H/2); ctx.fill();
    }
    ctx.font = `${Math.round(HEX_R * (def.size === 3 ? 0.95 : 0.75))}px serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(def.icon, ccx, ccy);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = bldgMode.canPlace ? '#50a0ff' : '#ff6666'; ctx.lineWidth = 2;
    for (const [tc, tr] of tiles) {
      const { x: wx, y: wy } = hexCenter(tc, tr);
      _hexPath(wx - cam.x + W/2, wy - cam.y + H/2); ctx.stroke();
    }
    const cost = getBldgUpgradeCost(def, 1);
    const parts = Object.entries(cost).filter(([,v])=>v>0).map(([r,v])=>`${RES_DISPLAY[r].icon}${v}`);
    ctx.fillStyle = bldgMode.canPlace ? '#80ffaa' : '#ff8888';
    ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(parts.join('  '), ccx, ccy + HEX_PITCH_Y * def.size * 0.6 + 8);
    if (bldgMode.depReason) {
      ctx.fillStyle = '#ffaa44'; ctx.font = '10px monospace';
      ctx.fillText(bldgMode.depReason, ccx, ccy + HEX_PITCH_Y * def.size * 0.6 + 22);
    }
  }

  // ── Interact hint ──────────────────────────────────────
  function drawInteractHint(building, cam) {
    const def = BLDG_DEFS[building.type];
    const sx = building.x - cam.x + W/2;
    const sy = building.y - cam.y + H/2;
    const halfH = building.size * TILE / 2;
    const pulse = 0.75 + 0.25 * Math.sin(Date.now() * 0.004);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#40d8ff'; ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    const hint = Input.TouchUI.isMobile ? `👆 ${def.name}` : `[E]  ${def.name}`;
    ctx.fillText(hint, sx, sy - halfH - 4);
    ctx.globalAlpha = 1;
  }

  // ── Building panel ─────────────────────────────────────
  function drawBuildingPanel(building, player, hallLevel, meta = {}) {
    const def = BLDG_DEFS[building.type];
    const PW = 270, pad = 14;
    const hasTrainUI = building.type === 'barracks' && building.level > 0 && !building.constructing;
    const hasResearchUI = building.type === 'research_lab' && !building.constructing && building.level > 0 && meta.faction;
    const researchH = hasResearchUI ? (FACTION_DEFS[meta.faction].lines.length * 64 + 30) : 0;
    const PH = building.constructing ? 180
      : building.level >= def.maxLevel ? (hasTrainUI ? 280 : 180 + researchH)
      : (hasTrainUI ? 420 : 310 + researchH);
    const px = W - PW - 16, py = 60;

    ctx.fillStyle = '#050e1eee'; ctx.strokeStyle = '#1a6080'; ctx.lineWidth = 2;
    _roundRect(px, py, PW, PH, 10); ctx.fill(); ctx.stroke();

    let y = py + pad;
    ctx.fillStyle = '#40d8ff'; ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(`${def.icon}  ${def.name}`, px+pad, y); y += 22;
    ctx.fillStyle = '#4a7090'; ctx.font = '10px monospace';
    ctx.fillText(def.desc, px+pad, y); y += 16;

    ctx.strokeStyle = '#0e2838'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(px+pad, y); ctx.lineTo(px+PW-pad, y); ctx.stroke(); y += 8;

    if (building.constructing) {
      ctx.fillStyle = '#30c8f0'; ctx.font = 'bold 13px monospace';
      ctx.fillText('🔧  Constructing…', px+pad, y); y += 20;
      const rem = building.constructRemaining;
      ctx.fillStyle = '#507080'; ctx.font = '11px monospace';
      ctx.fillText(fmtTime(rem) + ' remaining', px+pad, y); y += 18;
      const bx=px+pad, bw=PW-pad*2;
      ctx.fillStyle='#0d1a26'; ctx.fillRect(bx,y,bw,8);
      ctx.fillStyle='#30c8f0'; ctx.fillRect(bx,y,bw*building.constructProgress,8);
      return;
    }

    ctx.fillStyle = '#50a870'; ctx.font = '11px monospace';
    const bonLines = building.level > 0 ? def.bonus(building.level).split('\n') : ['Not yet built'];
    bonLines.forEach(ln => { ctx.fillText('▸ ' + ln, px+pad, y); y += 14; });
    y += 4;

    if (building.level >= def.maxLevel) {
      ctx.fillStyle = '#40d8ff'; ctx.font = 'bold 13px monospace';
      ctx.fillText('✓  Max Level', px+pad, y); y += 20;
    } else {
      const next = building.level + 1;
      ctx.strokeStyle = '#0e2838'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px+pad,y); ctx.lineTo(px+PW-pad,y); ctx.stroke(); y += 8;
      ctx.fillStyle = '#6090a8'; ctx.font = 'bold 11px monospace';
      ctx.fillText(`── Upgrade to Level ${next} ──`, px+pad, y); y += 16;
      ctx.fillStyle = '#409870'; ctx.font = '11px monospace';
      def.bonus(next).split('\n').forEach(ln => { ctx.fillText('▸ ' + ln, px+pad, y); y += 14; });
      y += 4;
      const cost = getBldgUpgradeCost(def, next);
      let cx2 = px+pad;
      ctx.font = '12px monospace'; ctx.textBaseline = 'top';
      for (const [r, a] of Object.entries(cost)) {
        if (a === 0) continue;
        ctx.fillStyle = (player[r] ?? 0) >= a ? '#88ee88' : '#ee5555';
        const str = `${RES_DISPLAY[r].icon} ${a}`;
        ctx.fillText(str, cx2, y); cx2 += ctx.measureText(str).width + 12;
      }
      y += 18;
      if (building.type !== 'chief_hall' && next > hallLevel) {
        ctx.fillStyle = '#cc8844'; ctx.font = '10px monospace';
        ctx.fillText(`⚠ Command must be Lv.${next}`, px+pad, y); y += 14;
      }
      const dur = Math.floor(def.baseBuildTime * Math.pow(def.timeScale, next-1));
      ctx.fillStyle = '#507080'; ctx.font = '10px monospace';
      ctx.fillText(`⏱  ${fmtTime(dur)}`, px+pad, y); y += 14;
      const affordable = canAfford(player, cost);
      const hallOk = building.type === 'chief_hall' || next <= hallLevel;
      const btnW = PW - pad*2, btnH = 36;
      if (affordable && hallOk) {
        ctx.fillStyle = '#0e2848'; ctx.strokeStyle = '#3080c0'; ctx.lineWidth = 1.5;
        _roundRect(px+pad, y, btnW, btnH, 6); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#60b0e0'; ctx.font = 'bold 13px monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('Upgrade', px+pad+btnW/2, y+btnH/2);
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        Input.TouchUI.hitAreas.push({ key: 'e', x: px+pad, y, w: btnW, h: btnH });
      } else {
        ctx.fillStyle = '#1a2a38'; ctx.strokeStyle = '#1a3040'; ctx.lineWidth = 1;
        _roundRect(px+pad, y, btnW, btnH, 6); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#304858'; ctx.font = '11px monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('Cannot upgrade', px+pad+btnW/2, y+btnH/2);
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      }
      y += btnH + 6;
    }

    if (hasResearchUI) {
      ctx.strokeStyle = '#0e2838'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px+pad,y); ctx.lineTo(px+PW-pad,y); ctx.stroke(); y += 8;
      const fDef = FACTION_DEFS[meta.faction];
      ctx.fillStyle = '#4a70a8'; ctx.font = 'bold 11px monospace'; ctx.textBaseline = 'top';
      ctx.fillText(`── ${fDef.name} Tech ──`, px+pad, y); y += 16;
      for (const line of fDef.lines) {
        ctx.fillStyle = '#507090'; ctx.font = 'bold 10px monospace';
        ctx.fillText(line.name, px+pad, y); y += 13;
        for (let tier = 1; tier <= 2; tier++) {
          const uk = line.units[tier];
          const def2 = SOLDIER_TYPES[uk];
          const unlocked = meta.unlockedUnits?.has(uk);
          const cost = RESEARCH_COST[tier];
          const depCheck = canResearchDeps(uk, meta.buildingList || []);
          const canRes = !unlocked && canAfford(player, cost) && depCheck.ok;
          const prereqOk = tier === 1 || meta.unlockedUnits?.has(line.units[1]);
          const btnH = depCheck.ok ? 22 : 30;
          ctx.fillStyle = unlocked ? '#0d2010' : canRes && prereqOk ? '#081828' : '#0a0c10';
          ctx.strokeStyle = unlocked ? '#30a840' : canRes && prereqOk ? '#2878b8' : '#1a2030';
          ctx.lineWidth = 1;
          _roundRect(px+pad, y, PW-pad*2, btnH, 4); ctx.fill(); ctx.stroke();
          ctx.fillStyle = unlocked ? '#40c860' : canRes && prereqOk ? '#50a0d0' : '#304050';
          ctx.font = 'bold 9px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          ctx.fillText(unlocked ? `✓ ${def2?.name || uk}` : `⚗ ${def2?.name || uk}`, px+pad+5, y+btnH/2 - (depCheck.ok ? 0 : 5));
          if (!depCheck.ok && !unlocked) {
            ctx.fillStyle = '#aa6622'; ctx.font = '8px monospace'; ctx.textBaseline = 'middle';
            ctx.fillText(depCheck.missing, px+pad+5, y+btnH/2 + 7);
          }
          if (!unlocked && prereqOk && depCheck.ok) {
            const cStr = Object.entries(cost).filter(([,v])=>v>0)
              .map(([res,v])=>`${RES_DISPLAY[res].icon}${v}`).join(' ');
            ctx.fillStyle = canAfford(player, cost) ? '#88cc88' : '#cc5555';
            ctx.font = '8px monospace'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
            ctx.fillText(cStr, px+PW-pad-5, y+btnH/2);
            if (canRes) Input.TouchUI.hitAreas.push({ key: 'research_'+uk, x: px+pad, y, w: PW-pad*2, h: btnH });
          }
          ctx.textAlign = 'left'; ctx.textBaseline = 'top';
          y += btnH + 3;
        }
        y += 4;
      }
    }

    if (hasTrainUI) {
      ctx.strokeStyle = '#0e2838'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px+pad, y); ctx.lineTo(px+PW-pad, y); ctx.stroke(); y += 10;
      ctx.fillStyle = '#6090a8'; ctx.font = 'bold 11px monospace'; ctx.textBaseline = 'top';
      ctx.fillText('── Train Crew ──', px+pad, y); y += 16;
      const perBatch = Math.max(2, building.level + 2);
      if (building.trainActive) {
        ctx.fillStyle = '#30c8f0'; ctx.font = 'bold 12px monospace';
        ctx.fillText(`🔧 Training ${perBatch} crew…`, px+pad, y); y += 18;
        const bx2=px+pad, bw2=PW-pad*2;
        ctx.fillStyle='#0d1a26'; ctx.fillRect(bx2,y,bw2,7);
        ctx.fillStyle='#30c8a0'; ctx.fillRect(bx2,y,bw2*(1-building.trainTimer/TRAIN_TIME),7);
        y += 12;
        ctx.fillStyle='#507080'; ctx.font='10px monospace';
        ctx.fillText(fmtTime(building.trainTimer) + ' remaining', px+pad, y);
      } else {
        const parts = Object.entries(TRAIN_COST).filter(([,v])=>v>0)
          .map(([r,v])=>`${RES_DISPLAY[r].icon} ${v}`).join('  ');
        const afford2 = canAfford(player, TRAIN_COST);
        ctx.fillStyle='#708898'; ctx.font='11px monospace';
        ctx.fillText(`${perBatch} crew per batch`, px+pad, y); y += 14;
        ctx.fillStyle = afford2 ? '#88ee88' : '#ee5555'; ctx.font='11px monospace';
        ctx.fillText(`Cost: ${parts}`, px+pad, y); y += 16;
        const tbtnW = PW-pad*2, tbtnH = 34;
        ctx.fillStyle = afford2 ? '#082840' : '#0a1520';
        ctx.strokeStyle = afford2 ? '#30a0c8' : '#1a2a38'; ctx.lineWidth = 1.5;
        _roundRect(px+pad, y, tbtnW, tbtnH, 5); ctx.fill(); ctx.stroke();
        ctx.fillStyle = afford2 ? '#40c0e8' : '#304858'; ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(afford2 ? 'Train Crew' : 'Not enough resources', px+pad+tbtnW/2, y+tbtnH/2);
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        if (afford2) Input.TouchUI.hitAreas.push({ key: 't', x: px+pad, y, w: tbtnW, h: tbtnH });
      }
    }
  }

  // ── Building selector ──────────────────────────────────
  function drawBldgSelector(bldgMode, player) {
    const COLS_N = 6, ROWS_N = 2;
    const cardW = 120, cardH = 86, gap = 8;
    const totalW = COLS_N*(cardW+gap) - gap;
    const totalH = ROWS_N*(cardH+gap) - gap;
    const ox = (W - totalW) / 2;
    const oy = H - totalH - 60 - (Input.TouchUI.isMobile ? 160 : 0);

    ctx.fillStyle = '#030e1cee'; ctx.strokeStyle = '#1a4060'; ctx.lineWidth = 1;
    _roundRect(ox-16, oy-42, totalW+32, totalH+58, 12); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#3a6888'; ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Select structure to place  [C] or [Esc] to cancel', W/2, oy-22);

    BLDG_KEYS.forEach((key, i) => {
      const def = BLDG_DEFS[key];
      const col = i % COLS_N, row = Math.floor(i / COLS_N);
      const cx = ox + col*(cardW+gap), cy = oy + row*(cardH+gap);
      const sel = bldgMode.type === key;
      const cost = getBldgUpgradeCost(def, 1);
      const afford = canAfford(player, cost);
      ctx.fillStyle = sel ? '#0a2a50' : '#040e1c';
      ctx.strokeStyle = sel ? '#40a8ff' : (afford ? '#1a3848' : '#441818');
      ctx.lineWidth = sel ? 2 : 1;
      _roundRect(cx, cy, cardW, cardH, 6); ctx.fill(); ctx.stroke();
      ctx.font = '26px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(def.icon, cx+cardW/2, cy+22);
      ctx.fillStyle = sel ? '#c0e8ff' : '#6090a8'; ctx.font = 'bold 9px monospace';
      ctx.fillText(def.name, cx+cardW/2, cy+44);
      const parts = Object.entries(cost).filter(([,v])=>v>0)
        .map(([r,v])=>`${RES_DISPLAY[r].icon}${v}`).join(' ');
      ctx.fillStyle = afford ? '#70c870' : '#cc5555'; ctx.font = '9px monospace';
      ctx.fillText(parts || 'free', cx+cardW/2, cy+58);
      ctx.fillStyle = '#2a5068'; ctx.font = '8px monospace';
      ctx.fillText(`${def.size}×${def.size} tiles`, cx+cardW/2, cy+70);
      def._selBounds = { x: cx, y: cy, w: cardW, h: cardH };
    });
  }

  // ── Forts ──────────────────────────────────────────────
  function drawForts(map, cam) {
    // Render all tower range fills onto an offscreen canvas with solid colour,
    // then composite once at low alpha — prevents circles stacking.
    if (!_rangeCanvas || _rangeCanvas.width !== W || _rangeCanvas.height !== H) {
      _rangeCanvas = document.createElement('canvas');
      _rangeCanvas.width = W; _rangeCanvas.height = H;
      _rangeCtx = _rangeCanvas.getContext('2d');
    }
    _rangeCtx.clearRect(0, 0, W, H);
    _rangeCtx.fillStyle = '#3cb4ff';
    _rangeCtx.strokeStyle = '#3cb4ff';
    _rangeCtx.lineWidth = 1;
    map.forts.forEach(f => {
      if (f.dead || f.type !== 'tower') return;
      const { x: sx, y: sy } = ws(f.x, f.y, cam);
      _rangeCtx.beginPath();
      _rangeCtx.arc(sx, sy, f.range, 0, Math.PI * 2);
      _rangeCtx.fill();
      _rangeCtx.stroke();
    });
    ctx.globalAlpha = 0.12;
    ctx.drawImage(_rangeCanvas, 0, 0);
    ctx.globalAlpha = 1;

    map.forts.forEach(f => {
      if (f.dead) return;
      const { x: sx, y: sy } = ws(f.x, f.y, cam);
      _drawFort(f, sx, sy);
    });
  }

  function _drawFort(f, sx, sy) {
    const hpPct = f.hp / f.maxHp;
    if (f.hitFlash > 0) ctx.globalAlpha = 0.5 + Math.sin(Date.now()*0.05)*0.4;
    if (f.type === 'wall') {
      // Coral Reef Wall — organic coral growths on a rocky seafloor hex
      const flash = f.hitFlash > 0;
      // Dark rocky base
      ctx.fillStyle = flash ? '#3a1808' : '#120a04';
      _hexPath(sx, sy); ctx.fill();
      ctx.strokeStyle = flash ? '#603020' : '#2a1408'; ctx.lineWidth = 1.5;
      _hexPath(sx, sy); ctx.stroke();
      // Rocky texture
      ctx.fillStyle = flash ? 'rgba(180,80,30,0.3)' : 'rgba(60,30,10,0.45)';
      for (let i = 0; i < 4; i++) {
        const rx = sx + (_th(f.col, f.row, i+20) - 0.5) * HEX_R * 1.2;
        const ry = sy + (_th(f.col, f.row, i+24) - 0.5) * HEX_R * 1.2;
        ctx.beginPath(); ctx.arc(rx, ry, 2 + _th(f.col, f.row, i+28) * 3, 0, Math.PI*2); ctx.fill();
      }
      // Coral growths
      const nGrowths = 3 + (_th(f.col, f.row, 0) * 2.9 | 0);
      ctx.lineCap = 'round';
      for (let g = 0; g < nGrowths; g++) {
        const angle = _th(f.col, f.row, g*4+1) * Math.PI * 2;
        const dist  = HEX_R * (0.15 + _th(f.col, f.row, g*4+2) * 0.42);
        const gx = sx + Math.cos(angle) * dist;
        const gy = sy + Math.sin(angle) * dist;
        const ct  = _th(f.col, f.row, g*4+3);
        const col = flash ? ['#ff8855','#ff99aa','#ffaa66'][g%3]
                          : ct < 0.35 ? '#c83010' : ct < 0.65 ? '#b83068' : '#c86818';
        const hi  = flash ? ['#ffcc99','#ffddcc','#ffcc88'][g%3]
                          : ct < 0.35 ? '#e85030' : ct < 0.65 ? '#d85090' : '#e09030';
        ctx.strokeStyle = col; ctx.fillStyle = hi;
        const bt = _th(f.col, f.row, g*4+4);
        if (bt < 0.38) {
          // Branching coral
          const h = 8 + _th(f.col, f.row, g*4+5) * 8;
          ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx, gy - h); ctx.stroke();
          ctx.lineWidth = 1.5;
          const nB = 2 + (_th(f.col, f.row, g*4+6) * 2.9 | 0);
          for (let b = 0; b < nB; b++) {
            const ba = -Math.PI/2 + (_th(f.col, f.row, g*4+7+b) - 0.5) * Math.PI * 0.95;
            const bl = h * (0.28 + _th(f.col, f.row, g*4+9+b) * 0.4);
            const bs = h * (0.15 + _th(f.col, f.row, g*4+11+b) * 0.55);
            const ex = gx + Math.cos(ba) * bl, ey = gy - bs + Math.sin(ba) * bl;
            ctx.beginPath(); ctx.moveTo(gx, gy - bs); ctx.lineTo(ex, ey); ctx.stroke();
            ctx.beginPath(); ctx.arc(ex, ey, 2, 0, Math.PI*2); ctx.fill();
          }
        } else if (bt < 0.72) {
          // Fan coral — semi-circular radiating fronds
          const fH = 7 + _th(f.col, f.row, g*4+5) * 7;
          const fW = fH * (0.6 + _th(f.col, f.row, g*4+6) * 0.5);
          const nF = 5 + (_th(f.col, f.row, g*4+7) * 3.9 | 0);
          ctx.lineWidth = 1;
          for (let fi = 0; fi < nF; fi++) {
            const fa = -Math.PI * 0.9 + (fi / (nF - 1)) * Math.PI * 0.9;
            ctx.beginPath();
            ctx.moveTo(gx, gy);
            ctx.quadraticCurveTo(gx + Math.cos(fa) * fW * 0.55, gy - fH * 0.55,
                                  gx + Math.cos(fa) * fW, gy - fH + Math.sin(fa) * fH * 0.25);
            ctx.stroke();
          }
          for (let fi = 0; fi < nF; fi += 2) {
            const fa = -Math.PI * 0.9 + (fi / (nF - 1)) * Math.PI * 0.9;
            ctx.beginPath(); ctx.arc(gx + Math.cos(fa) * fW, gy - fH + Math.sin(fa) * fH * 0.25, 1.5, 0, Math.PI*2);
            ctx.fill();
          }
        } else {
          // Tube / anemone cluster
          const tH = 6 + _th(f.col, f.row, g*4+5) * 6;
          const nT = 2 + (_th(f.col, f.row, g*4+6) * 2.9 | 0);
          for (let t = 0; t < nT; t++) {
            const tx = gx + (_th(f.col, f.row, g*4+7+t) - 0.5) * 9;
            const tubH = tH * (0.65 + _th(f.col, f.row, g*4+9+t) * 0.7);
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(tx, gy); ctx.lineTo(tx, gy - tubH); ctx.stroke();
            // Tentacle crown
            ctx.lineWidth = 1;
            for (let te = 0; te < 5; te++) {
              const ta = (te / 5) * Math.PI * 2;
              ctx.beginPath(); ctx.moveTo(tx, gy - tubH);
              ctx.lineTo(tx + Math.cos(ta) * (2.5 + _th(f.col, f.row, g*4+10+t+te)), gy - tubH - 3.5);
              ctx.stroke();
            }
            ctx.beginPath(); ctx.arc(tx, gy - tubH, 2.5, 0, Math.PI*2); ctx.fill();
          }
        }
      }
      ctx.lineCap = 'butt';
    } else if (f.type === 'tower') {
      // Torpedo Post — dark metal base with glowing barrel
      ctx.fillStyle = f.hitFlash > 0 ? '#ff9988' : '#283848';
      ctx.fillRect(sx-20, sy-20, 40, 40);
      ctx.fillStyle = f.hitFlash > 0 ? '#ffbbaa' : '#384858';
      ctx.fillRect(sx-14, sy-14, 28, 28);
      // Torpedo barrel
      ctx.fillStyle = f.hitFlash > 0 ? '#ffcc88' : '#60c8ff';
      ctx.beginPath(); ctx.arc(sx, sy-6, 8, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#2090c0'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sx, sy-6, 8, 0, Math.PI*2); ctx.stroke();
      // (range ring drawn once in drawForts to avoid alpha stacking)
    } else {
      // Bubble Net — translucent foam barrier
      ctx.strokeStyle = f.hitFlash > 0 ? '#ff8888' : '#80d0ff';
      ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.globalAlpha = 0.7;
      const t = Date.now()*0.003;
      for (let i = 0; i < 4; i++) {
        const by = sy - 14 + i*10 + Math.sin(t+i)*2;
        ctx.beginPath(); ctx.moveTo(sx-18, by); ctx.lineTo(sx+18, by); ctx.stroke();
      }
      ctx.globalAlpha = f.hitFlash > 0 ? 0.5 : 1;
      // Bubble dots
      ctx.fillStyle = 'rgba(150,220,255,0.6)';
      for (let i = 0; i < 5; i++) {
        const bx = sx - 16 + i*8;
        const bby = sy - 16 + Math.sin(t*1.4+i*1.1)*4;
        ctx.beginPath(); ctx.arc(bx, bby, 3, 0, Math.PI*2); ctx.fill();
      }
      ctx.lineCap = 'butt';
    }
    ctx.globalAlpha = 1;
    if (hpPct < 1) {
      ctx.fillStyle = '#330000'; ctx.fillRect(sx-TILE/2, sy+TILE/2-5, TILE, 4);
      ctx.fillStyle = hpPct>.5 ? '#44cc55' : hpPct>.25 ? '#ffaa00' : '#ff3333';
      ctx.fillRect(sx-TILE/2, sy+TILE/2-5, TILE*hpPct, 4);
    }
  }

  function drawProjectiles(map, cam) {
    // Fort (Torpedo Post) projectiles
    map.forts.forEach(f => {
      if (!f.projectiles) return;
      f.projectiles.forEach(p => {
        const { x: sx, y: sy } = ws(p.x, p.y, cam);
        ctx.shadowColor = '#40d0ff'; ctx.shadowBlur = 6;
        ctx.fillStyle = '#80e8ff';
        ctx.beginPath(); ctx.ellipse(sx, sy, 7, 3, Math.atan2(p.target.y-p.y, p.target.x-p.x), 0, Math.PI*2); ctx.fill();
        ctx.shadowBlur = 0;
      });
    });
  }

  // ── Player torpedoes + sonar ───────────────────────────
  function drawTorpedoes(torpedoes, sonarPulse, cam) {
    for (const t of torpedoes) {
      const { x: sx, y: sy } = ws(t.x, t.y, cam);
      const angle = Math.atan2(t.vy, t.vx);
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(angle);
      ctx.shadowColor = '#ffcc00'; ctx.shadowBlur = 8;
      ctx.fillStyle = '#ffe050';
      ctx.beginPath(); ctx.ellipse(0, 0, 9, 4, 0, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#ff8800';
      ctx.beginPath(); ctx.ellipse(-6, 0, 4, 2.5, 0, 0, Math.PI*2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.restore();
    }
    if (sonarPulse) {
      const { x: sx, y: sy } = ws(sonarPulse.x, sonarPulse.y, cam);
      const prog = sonarPulse.r / sonarPulse.maxR;
      ctx.strokeStyle = `rgba(80,220,255,${(1 - prog) * 0.7})`;
      ctx.lineWidth = 2.5;
      ctx.shadowColor = '#50d8ff'; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(sx, sy, sonarPulse.r, 0, Math.PI*2); ctx.stroke();
      ctx.shadowBlur = 0; ctx.lineWidth = 1;
    }
  }

  // ── Fort build ghost ───────────────────────────────────
  function drawBuildGhost(buildMode, player, cam) {
    if (!buildMode.active) return;
    const gc = buildMode.ghostCol, gr = buildMode.ghostRow;
    const hbg = hexCenter(gc, gr);
    const sx = hbg.x - cam.x + W/2, sy = hbg.y - cam.y + H/2;
    const ok = buildMode.canPlace;
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = ok ? '#2088cc' : '#cc3333';
    _hexPath(sx, sy); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = ok ? '#60c8ff' : '#ff6666'; ctx.lineWidth = 2;
    _hexPath(sx, sy); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(FORT_DEFS[buildMode.type].name, sx+TILE/2, sy+TILE/2);
  }

  // ── Camps ──────────────────────────────────────────────
  function drawCamps(camps, cam) {
    const CAMP_RESTORE_TIME = 20;
    camps.forEach(camp => {
      const { x: sx, y: sy } = ws(camp.x, camp.y, cam);
      const pulse = 0.5 + 0.5*Math.sin(Date.now()*0.003);
      const depleted = camp.count <= 0;
      ctx.strokeStyle = depleted
        ? `rgba(120,120,120,${0.15+pulse*0.15})`
        : `rgba(80,200,255,${0.25+pulse*0.3})`;
      ctx.lineWidth = 2; ctx.setLineDash([6,6]);
      ctx.beginPath(); ctx.arc(sx, sy, CAMP_R, 0, Math.PI*2); ctx.stroke();
      ctx.setLineDash([]);
      // Creature dots in a ring (greyed out when depleted)
      const n = Math.min(camp.max, 8);
      for (let i = 0; i < n; i++) {
        const a = (i/n)*Math.PI*2;
        const t = SOLDIER_TYPE_KEYS[i % SOLDIER_TYPE_KEYS.length];
        ctx.globalAlpha = i < camp.count ? 1 : 0.22;
        ctx.fillStyle = SOLDIER_TYPES[t].color;
        ctx.beginPath(); ctx.arc(sx+Math.cos(a)*18, sy+Math.sin(a)*18, 5, 0, Math.PI*2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      // Centre marker
      ctx.fillStyle = depleted ? '#203040' : '#1878a8';
      ctx.beginPath(); ctx.arc(sx, sy, 14, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = depleted ? '#304858' : '#40b8e8'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = depleted ? '#607080' : '#c0e8ff'; ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(camp.count, sx, sy);
      // Restore cooldown arc when at least one slot is missing
      if (camp.count < camp.max && camp.restoreTimer > 0) {
        const prog = camp.restoreTimer / CAMP_RESTORE_TIME;
        ctx.strokeStyle = '#40c880'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(sx, sy, 17, -Math.PI/2, -Math.PI/2 + prog*Math.PI*2); ctx.stroke();
      }
    });
  }

  // ── Enemies ────────────────────────────────────────────
  function drawEnemies(enemies, cam) {
    enemies.forEach(e => {
      if (e.dead) return;
      const { x: sx, y: sy } = ws(e.x, e.y, cam);
      if (sx < -80 || sx > W+80 || sy < -80 || sy > H+80) return;
      if (e.hitFlash > 0) ctx.globalAlpha = 0.55;

      switch (e.type) {
        case 'shark':      _drawShark(e, sx, sy);      break;
        case 'anglerfish': _drawAnglerfish(e, sx, sy); break;
        case 'jellyfish':  _drawJellyfish(e, sx, sy);  break;
        case 'swordfish':  _drawSwordfish(e, sx, sy);  break;
        default:           _drawMermaid(e, sx, sy);    break;
      }

      ctx.globalAlpha = 1;
      if (e.hp < e.maxHp) {
        ctx.fillStyle = '#440000'; ctx.fillRect(sx-e.r, sy-e.r-7, e.r*2, 4);
        ctx.fillStyle = '#ff3333'; ctx.fillRect(sx-e.r, sy-e.r-7, e.r*2*(e.hp/e.maxHp), 4);
      }

      // Enemy projectiles (anglerfish lure)
      if (e.projectiles && e.projectiles.length > 0) {
        e.projectiles.forEach(p => {
          const { x: px, y: py } = ws(p.x, p.y, cam);
          ctx.shadowColor = '#40e030'; ctx.shadowBlur = 10;
          ctx.fillStyle = '#60f040';
          ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI*2); ctx.fill();
          ctx.shadowBlur = 0;
        });
      }
    });
  }

  function _drawMermaid(e, sx, sy) {
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(e.angle + Math.PI/2);
    const c0 = e.hitFlash > 0 ? '#ff9977' : '#18b080';
    const c1 = e.hitFlash > 0 ? '#ffcc99' : '#30d0a0';
    // Tail
    ctx.fillStyle = c0;
    ctx.beginPath();
    ctx.moveTo(-5, 4); ctx.bezierCurveTo(-6, 8, -9, 13, -10, 16);
    ctx.lineTo(0, 13); ctx.lineTo(10, 16);
    ctx.bezierCurveTo(9, 13, 6, 8, 5, 4); ctx.closePath(); ctx.fill();
    // Torso
    ctx.fillStyle = c1;
    ctx.beginPath(); ctx.ellipse(0, -2, 4.5, 7, 0, 0, Math.PI*2); ctx.fill();
    // Head
    ctx.fillStyle = '#f0c8a0';
    ctx.beginPath(); ctx.arc(0, -10, 4.5, 0, Math.PI*2); ctx.fill();
    // Hair
    ctx.fillStyle = '#20a878';
    ctx.beginPath(); ctx.arc(0, -11, 5, Math.PI, Math.PI*2); ctx.fill();
    // Trident
    ctx.strokeStyle = '#d0a020'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(9, -7); ctx.lineTo(9, 4); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(7,-7); ctx.lineTo(7,-4); ctx.moveTo(9,-7); ctx.lineTo(9,-4); ctx.moveTo(11,-7); ctx.lineTo(11,-4);
    ctx.stroke();
    ctx.restore();
  }

  function _drawShark(e, sx, sy) {
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(e.angle + Math.PI/2);
    const c0 = e.hitFlash > 0 ? '#ff9988' : '#507090';
    const belly = e.hitFlash > 0 ? '#ffbbaa' : '#b8cce0';
    // Body
    ctx.fillStyle = c0;
    ctx.beginPath();
    ctx.moveTo(0,-14); ctx.bezierCurveTo(8,-10,9,0,7,10); ctx.lineTo(0,14);
    ctx.lineTo(-7,10); ctx.bezierCurveTo(-9,0,-8,-10,0,-14); ctx.closePath(); ctx.fill();
    // Belly
    ctx.fillStyle = belly;
    ctx.beginPath(); ctx.ellipse(0, 2, 3.5, 9, 0, 0, Math.PI*2); ctx.fill();
    // Dorsal fin
    ctx.fillStyle = c0;
    ctx.beginPath(); ctx.moveTo(-2,-8); ctx.lineTo(-2,-20); ctx.lineTo(5,-8); ctx.closePath(); ctx.fill();
    // Tail
    ctx.beginPath();
    ctx.moveTo(-5,11); ctx.lineTo(0,14); ctx.lineTo(5,11); ctx.lineTo(1,18); ctx.lineTo(-1,18);
    ctx.closePath(); ctx.fill();
    // Pectoral fin
    ctx.beginPath(); ctx.moveTo(-8,-2); ctx.lineTo(-15,4); ctx.lineTo(-6,4); ctx.closePath(); ctx.fill();
    // Teeth
    ctx.fillStyle = '#f0f0e8';
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath(); ctx.moveTo(i*2.5,-13); ctx.lineTo(i*2.5-1,-10); ctx.lineTo(i*2.5+1,-10); ctx.closePath(); ctx.fill();
    }
    // Eye
    ctx.fillStyle = '#101828';
    ctx.beginPath(); ctx.arc(-3,-8,2,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = '#406080';
    ctx.beginPath(); ctx.arc(-3,-8,1.2,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }

  function _drawAnglerfish(e, sx, sy) {
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(e.angle + Math.PI/2);
    const c0 = e.hitFlash > 0 ? '#ff88cc' : '#3c1850';
    const lurePulse = 0.8 + 0.2*Math.sin(Date.now()/500);
    const glow = '#40f020';
    // Body
    ctx.fillStyle = c0;
    ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = e.hitFlash > 0 ? '#ffaadd' : '#601878';
    ctx.beginPath(); ctx.arc(-3, -3, 6, 0, Math.PI*2); ctx.fill();
    // Jaw
    ctx.fillStyle = c0;
    ctx.beginPath(); ctx.moveTo(-10,2); ctx.lineTo(-12,11); ctx.lineTo(12,11); ctx.lineTo(10,2); ctx.closePath(); ctx.fill();
    // Teeth
    ctx.fillStyle = '#d0e0c0';
    for (let i = 0; i < 5; i++) {
      const tx2 = -9 + i*4.5;
      ctx.beginPath(); ctx.moveTo(tx2,3); ctx.lineTo(tx2+1,8); ctx.lineTo(tx2+2,3); ctx.closePath(); ctx.fill();
    }
    // Lure stalk
    const sway = Math.sin(Date.now()/600)*5;
    ctx.strokeStyle = '#502060'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0,-11); ctx.quadraticCurveTo(sway*0.5, -17, sway, -21); ctx.stroke();
    // Lure bulb
    ctx.shadowColor = glow; ctx.shadowBlur = 12;
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(sway, -23, 3.5*lurePulse, 0, Math.PI*2); ctx.fill();
    ctx.shadowBlur = 0;
    // Eyes
    ctx.fillStyle = '#f0e030';
    ctx.beginPath(); ctx.arc(-4,-5,2.5,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(4,-5,2.5,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(-4,-5,1.2,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(4,-5,1.2,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }

  function _drawJellyfish(e, sx, sy) {
    ctx.save(); ctx.translate(sx, sy);
    const t = Date.now();
    const pulse = 0.7 + 0.3*Math.sin(t/500);
    const c0 = e.hitFlash > 0 ? '#ff88ee' : '#c030b0';
    // Ambient glow
    ctx.globalAlpha = 0.15 * pulse;
    ctx.fillStyle = c0;
    ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = e.hitFlash > 0 ? 0.55 : 1;
    // Bell dome
    ctx.fillStyle = e.hitFlash > 0 ? '#ff99ee' : `rgba(${180+40*pulse|0},40,160,0.85)`;
    ctx.beginPath();
    ctx.arc(0, 0, 11*pulse, Math.PI, Math.PI*2);
    ctx.bezierCurveTo(11*pulse, 4, 8, 7, 0, 7);
    ctx.bezierCurveTo(-8, 7, -11*pulse, 4, -11*pulse, 0);
    ctx.closePath(); ctx.fill();
    // Ribs
    ctx.strokeStyle = e.hitFlash > 0 ? '#ffccee' : '#e060d0';
    ctx.lineWidth = 0.8; ctx.globalAlpha = 0.4;
    for (let i = -8; i <= 8; i += 4) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, -7+Math.abs(i)*0.35); ctx.stroke();
    }
    ctx.globalAlpha = e.hitFlash > 0 ? 0.55 : 1;
    // Tentacles
    ctx.strokeStyle = e.hitFlash > 0 ? '#ff88cc' : `rgba(200,50,180,0.65)`;
    ctx.lineWidth = 1.5;
    const sw = t/700;
    for (let i = 0; i < 6; i++) {
      const bx = -10 + i*4, sway = Math.sin(sw + i*0.8)*5;
      ctx.beginPath(); ctx.moveTo(bx, 7);
      ctx.bezierCurveTo(bx+sway, 12, bx-sway, 17, bx+sway*0.5, 21);
      ctx.stroke();
    }
    ctx.restore();
  }

  function _drawSwordfish(e, sx, sy) {
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(e.angle + Math.PI/2);
    const c0 = e.hitFlash > 0 ? '#aaddff' : '#1c4878';
    const c1 = e.hitFlash > 0 ? '#ccffff' : '#2c6898';
    // Body
    ctx.fillStyle = c0;
    ctx.beginPath();
    ctx.moveTo(0,-15); ctx.bezierCurveTo(5,-10,6,0,4,11);
    ctx.lineTo(0,13); ctx.lineTo(-4,11);
    ctx.bezierCurveTo(-6,0,-5,-10,0,-15); ctx.closePath(); ctx.fill();
    // Stripe
    ctx.fillStyle = c1;
    ctx.beginPath(); ctx.ellipse(0,-1,2,10,0,0,Math.PI*2); ctx.fill();
    // Sword
    ctx.strokeStyle = c1; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0,-14); ctx.lineTo(0,-30); ctx.stroke();
    ctx.lineCap = 'butt';
    // Dorsal fin
    ctx.fillStyle = c1;
    ctx.beginPath(); ctx.moveTo(-3,-8); ctx.lineTo(-3,-18); ctx.lineTo(4,-8); ctx.closePath(); ctx.fill();
    // Tail
    ctx.fillStyle = c0;
    ctx.beginPath();
    ctx.moveTo(-4,11); ctx.lineTo(0,13); ctx.lineTo(4,11); ctx.lineTo(2,17); ctx.lineTo(-2,17);
    ctx.closePath(); ctx.fill();
    // Eye
    ctx.fillStyle = '#80b0d0';
    ctx.beginPath(); ctx.arc(-2,-9,2,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(-2,-9,1,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }

  const _SOLDIER_DRAW = {
    dolphin: _drawDolphin, dolphin_t1: _drawDolphin, dolphin_t2: _drawDolphin,
    orca:    _drawOrca,    orca_t1:    _drawOrca,    orca_t2:    _drawOrca,
    ray:     _drawRay,     ray_t1:     _drawRay,     ray_t2:     _drawRay,
    seal:    _drawSeal,    seal_t1:    _drawSeal,    seal_t2:    _drawSeal,
    diver_t0: _drawDiver, diver_t1: _drawDiver, diver_t2: _drawDiver,
    gunner_t0: _drawGunner, gunner_t1: _drawGunner, gunner_t2: _drawGunner,
    sub_t0: _drawSubUnit, sub_t1: _drawSubUnit, sub_t2: _drawSubUnit,
    puffer_t0: _drawPuffer, puffer_t1: _drawPuffer, puffer_t2: _drawPuffer,
    angler_t0: _drawAnglerUnit, angler_t1: _drawAnglerUnit, angler_t2: _drawAnglerUnit,
  };

  // ── Soldiers ───────────────────────────────────────────
  function drawSoldiers(soldiers, cam) {
    soldiers.forEach(s => {
      const { x: sx, y: sy } = ws(s.x, s.y, cam);
      if (sx < -60 || sx > W+60 || sy < -60 || sy > H+60) return;
      if (s.hitFlash > 0) ctx.globalAlpha = 0.5;

      const base = s.type.includes('_') ? s.type.split('_')[0] : s.type;
      const fn = _SOLDIER_DRAW[s.type] ?? _SOLDIER_DRAW[base] ?? _drawDolphin;
      fn(s, sx, sy);

      ctx.globalAlpha = 1;
      if (s.hp < s.maxHp) {
        ctx.fillStyle = '#002200'; ctx.fillRect(sx-s.r, sy-s.r-5, s.r*2, 3);
        ctx.fillStyle = '#22cc44'; ctx.fillRect(sx-s.r, sy-s.r-5, s.r*2*(s.hp/s.maxHp), 3);
      }

      // Seal shell projectiles
      if (s.ranged && s.projectiles && s.projectiles.length > 0) {
        s.projectiles.forEach(p => {
          const { x: px, y: py } = ws(p.x, p.y, cam);
          ctx.fillStyle = '#c0a870';
          ctx.strokeStyle = '#806040'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI*2); ctx.fill(); ctx.stroke();
        });
      }
    });
  }

  function _drawDolphin(s, sx, sy) {
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(s.angle + Math.PI/2);
    const c0 = s.hitFlash > 0 ? '#ff9977' : '#4888c8';
    const c1 = s.hitFlash > 0 ? '#ffccaa' : '#70b0e8';
    const tw = s.moving ? Math.sin(s.animT * 8) * 4 : Math.sin(s.animT * 2) * 1.5;
    // Body
    ctx.fillStyle = c0;
    ctx.beginPath(); ctx.ellipse(0, 0, 4.5, 9, 0, 0, Math.PI*2); ctx.fill();
    // Belly
    ctx.fillStyle = c1;
    ctx.beginPath(); ctx.ellipse(0, 1, 2.5, 6, 0, 0, Math.PI*2); ctx.fill();
    // Dorsal fin
    ctx.fillStyle = c0;
    ctx.beginPath(); ctx.moveTo(-2,-5); ctx.lineTo(0,-12); ctx.lineTo(2,-5); ctx.closePath(); ctx.fill();
    // Pectoral fin
    ctx.beginPath(); ctx.moveTo(-4,-2); ctx.lineTo(-8,2); ctx.lineTo(-3,3); ctx.closePath(); ctx.fill();
    // Tail — wags side to side
    ctx.beginPath(); ctx.moveTo(-5+tw,9); ctx.lineTo(0,7); ctx.lineTo(5+tw,9); ctx.lineTo(tw*0.6,12); ctx.closePath(); ctx.fill();
    // Snout
    ctx.fillStyle = c1;
    ctx.beginPath(); ctx.moveTo(-1,-9); ctx.lineTo(0,-13); ctx.lineTo(1,-9); ctx.closePath(); ctx.fill();
    // Eye
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(-2,-5,1.5,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-2.5,-5.5,0.5,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }

  function _drawOrca(s, sx, sy) {
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(s.angle + Math.PI/2);
    const c0 = s.hitFlash > 0 ? '#ffaaaa' : '#18202c';
    const tw = s.moving ? Math.sin(s.animT * 7) * 5 : Math.sin(s.animT * 2) * 2;
    // Body
    ctx.fillStyle = c0;
    ctx.beginPath(); ctx.ellipse(0, 0, 7.5, 13, 0, 0, Math.PI*2); ctx.fill();
    // White belly
    ctx.fillStyle = s.hitFlash > 0 ? '#ffddcc' : '#e0e8e0';
    ctx.beginPath(); ctx.ellipse(0, 2, 4, 8, 0, 0, Math.PI*2); ctx.fill();
    // Eye patch
    ctx.fillStyle = s.hitFlash > 0 ? '#ffccbb' : '#d0e0d0';
    ctx.beginPath(); ctx.ellipse(-5, -5, 3, 2, -0.4, 0, Math.PI*2); ctx.fill();
    // Tall dorsal fin
    ctx.fillStyle = c0;
    ctx.beginPath(); ctx.moveTo(-3,-8); ctx.lineTo(0,-22); ctx.lineTo(4,-8); ctx.closePath(); ctx.fill();
    // Pectoral fin
    ctx.beginPath(); ctx.moveTo(-7,-1); ctx.lineTo(-14,6); ctx.lineTo(-5,7); ctx.closePath(); ctx.fill();
    // Tail — wags side to side
    ctx.beginPath();
    ctx.moveTo(-6+tw,12); ctx.lineTo(0,13); ctx.lineTo(6+tw,12); ctx.lineTo(2+tw*0.5,18); ctx.lineTo(-2+tw*0.5,18);
    ctx.closePath(); ctx.fill();
    // Eye
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(-4,-6,1.5,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }

  function _drawRay(s, sx, sy) {
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(s.angle + Math.PI/2);
    const c0 = s.hitFlash > 0 ? '#ffaaee' : '#5028a8';
    const c1 = s.hitFlash > 0 ? '#ffccff' : '#9050d8';
    const wf = s.moving ? Math.sin(s.animT * 6) * 3 : Math.sin(s.animT * 1.5) * 1;
    // Wing shape — tips flap up/down
    ctx.fillStyle = c0;
    ctx.beginPath(); ctx.moveTo(0,-12); ctx.lineTo(14,wf); ctx.lineTo(0,8); ctx.lineTo(-14,wf); ctx.closePath(); ctx.fill();
    // Wing centre highlight
    ctx.fillStyle = c1;
    ctx.beginPath(); ctx.moveTo(0,-9); ctx.lineTo(8,wf*0.5); ctx.lineTo(0,4); ctx.lineTo(-8,wf*0.5); ctx.closePath(); ctx.fill();
    // Tail spine
    ctx.strokeStyle = c0; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0,8); ctx.quadraticCurveTo(4,14,2,19); ctx.stroke();
    ctx.lineCap = 'butt';
    // Eye spots
    ctx.fillStyle = '#f0f080';
    ctx.beginPath(); ctx.arc(-3,-4,1.5,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(3,-4,1.5,0,Math.PI*2); ctx.fill();
    // Electric glow when fighting
    if (s.state === 'fight') {
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#a080ff';
      ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI*2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function _drawSeal(s, sx, sy) {
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(s.angle + Math.PI/2);
    const c0 = s.hitFlash > 0 ? '#ffaa88' : '#9a8050';
    const c1 = s.hitFlash > 0 ? '#ffcc99' : '#c8a870';
    // Body
    ctx.fillStyle = c0;
    ctx.beginPath(); ctx.ellipse(0, 2, 6.5, 9, 0, 0, Math.PI*2); ctx.fill();
    // Head
    ctx.fillStyle = c1;
    ctx.beginPath(); ctx.arc(0, -8, 5.5, 0, Math.PI*2); ctx.fill();
    // Flippers — kick alternately when swimming
    const fa = s.moving ? Math.sin(s.animT * 7) * 0.4 : Math.sin(s.animT * 1.8) * 0.1;
    ctx.fillStyle = c0;
    ctx.save(); ctx.translate(-8,4); ctx.rotate(-fa);
    ctx.beginPath(); ctx.ellipse(0,0,4,2,-0.5,0,Math.PI*2); ctx.fill();
    ctx.restore();
    ctx.save(); ctx.translate(8,4); ctx.rotate(fa);
    ctx.beginPath(); ctx.ellipse(0,0,4,2,0.5,0,Math.PI*2); ctx.fill();
    ctx.restore();
    // Tail flipper
    ctx.beginPath(); ctx.ellipse(0,11,5,2.5,0,0,Math.PI*2); ctx.fill();
    // Whiskers
    ctx.strokeStyle = '#706040'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(-3,-7); ctx.lineTo(-9,-8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-3,-7); ctx.lineTo(-9,-7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(3,-7); ctx.lineTo(9,-8); ctx.stroke();
    // Eye
    ctx.fillStyle = '#0a1010'; ctx.beginPath(); ctx.arc(-2,-9,1.8,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-2.6,-9.5,0.6,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }

  // ── Human faction soldiers ─────────────────────────────
  function _drawDiver(s, sx, sy) {
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(s.angle + Math.PI/2);
    const c0 = s.hitFlash > 0 ? '#ffaaaa' : SOLDIER_TYPES[s.type]?.color || '#3870a8';
    const c1 = s.hitFlash > 0 ? '#ffddcc' : SOLDIER_TYPES[s.type]?.hi    || '#60a0d0';
    const fk = s.moving ? Math.sin(s.animT * 8) * 4 : 0;
    // Wetsuit body
    ctx.fillStyle = c0;
    ctx.beginPath(); ctx.ellipse(0, 0, 4, 8, 0, 0, Math.PI*2); ctx.fill();
    // Mask
    ctx.fillStyle = c1;
    ctx.beginPath(); ctx.arc(0, -7, 4, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#70c8e8';
    ctx.beginPath(); ctx.arc(0, -7, 2.5, 0, Math.PI*2); ctx.fill();
    // Fins — alternate kick
    ctx.fillStyle = c1;
    ctx.beginPath(); ctx.moveTo(-3,5); ctx.lineTo(-6+fk,11); ctx.lineTo(0,8); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(3,5);  ctx.lineTo(6-fk,11);  ctx.lineTo(0,8); ctx.closePath(); ctx.fill();
    // Tank (tier 2+)
    if (s.type !== 'diver_t0') {
      ctx.fillStyle = '#a0b0c8';
      ctx.fillRect(2, -4, 4, 8);
      ctx.strokeStyle = '#607088'; ctx.lineWidth = 0.8; ctx.strokeRect(2, -4, 4, 8);
    }
    // Spear / harpoon gun
    ctx.strokeStyle = '#c0c8d0'; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-4, -6); ctx.lineTo(-4, -14); ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.restore();
  }

  function _drawGunner(s, sx, sy) {
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(s.angle + Math.PI/2);
    const c0 = s.hitFlash > 0 ? '#ffaaaa' : SOLDIER_TYPES[s.type]?.color || '#507040';
    const c1 = s.hitFlash > 0 ? '#ffddcc' : SOLDIER_TYPES[s.type]?.hi    || '#789060';
    const bob = s.moving ? Math.sin(s.animT * 10) * 1.5 : 0;
    ctx.translate(0, bob);
    // Body
    ctx.fillStyle = c0;
    ctx.fillRect(-4, -8, 8, 14);
    // Helmet
    ctx.fillStyle = c1;
    ctx.beginPath(); ctx.arc(0, -8, 4.5, Math.PI, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#70c0d8';
    ctx.fillRect(-3, -10, 6, 3); // visor
    // Arms
    ctx.fillStyle = c0;
    ctx.fillRect(-8, -7, 4, 3);
    ctx.fillRect(4, -7, 4, 3);
    // Gun barrel
    ctx.fillStyle = '#506070';
    ctx.fillRect(4, -9, 10, 2);
    ctx.fillStyle = '#40b0d0';
    ctx.fillRect(13, -10, 2, 4);
    // Boots
    ctx.fillStyle = c1;
    ctx.fillRect(-4, 4, 4, 3);
    ctx.fillRect(0, 4, 4, 3);
    ctx.restore();
  }

  function _drawSubUnit(s, sx, sy) {
    ctx.save(); ctx.translate(sx, sy);
    if (Math.cos(s.angle) < 0) ctx.scale(1, -1); // flip local Y before rotate: torpedo stays below hull when facing left
    ctx.rotate(s.angle + Math.PI/2);
    const c0 = s.hitFlash > 0 ? '#aabbdd' : SOLDIER_TYPES[s.type]?.color || '#405870';
    const c1 = s.hitFlash > 0 ? '#cce0ff' : SOLDIER_TYPES[s.type]?.hi    || '#607898';
    // Hull
    ctx.fillStyle = c0;
    ctx.beginPath(); ctx.ellipse(0, 0, 6, 13, 0, 0, Math.PI*2); ctx.fill();
    // Conning tower
    ctx.fillStyle = c1;
    ctx.fillRect(-2, -10, 4, 6);
    ctx.beginPath(); ctx.arc(0, -10, 2, Math.PI, Math.PI*2); ctx.fill();
    // Portholes
    ctx.fillStyle = '#50c0e0';
    ctx.beginPath(); ctx.arc(-2, -2, 1.5, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(2, -2, 1.5, 0, Math.PI*2); ctx.fill();
    // Propeller — spins faster when moving
    ctx.strokeStyle = c1; ctx.lineWidth = 2; ctx.lineCap = 'round';
    const propA = s.animT * (s.moving ? 9 : 1.5);
    for (let pi = 0; pi < 3; pi++) {
      const pa = propA + (pi/3)*Math.PI*2;
      ctx.beginPath(); ctx.moveTo(0,11); ctx.lineTo(Math.cos(pa)*6, 11+Math.sin(pa)*6); ctx.stroke();
    }
    ctx.lineCap = 'butt';
    // Torpedo (tier 1+)
    if (s.type !== 'sub_t0') {
      ctx.fillStyle = '#60a0c8';
      ctx.beginPath(); ctx.ellipse(6, 2, 2, 5, 0.5, 0, Math.PI*2); ctx.fill();
    }
    ctx.restore();
  }

  // ── Fish faction soldiers ──────────────────────────────
  function _drawPuffer(s, sx, sy) {
    ctx.save(); ctx.translate(sx, sy);
    const c0 = s.hitFlash > 0 ? '#ffee88' : SOLDIER_TYPES[s.type]?.color || '#c0a010';
    const c1 = s.hitFlash > 0 ? '#ffffaa' : SOLDIER_TYPES[s.type]?.hi    || '#e8c840';
    const r2 = SOLDIER_TYPES[s.type]?.r || 10;
    // Idle: gentle inflate/deflate pulse
    const inflate = s.moving ? 1 : 1 + Math.sin(s.animT * 2) * 0.07;
    ctx.scale(inflate, inflate);
    // Spiky round body
    ctx.fillStyle = c0;
    ctx.beginPath(); ctx.arc(0, 0, r2, 0, Math.PI*2); ctx.fill();
    // Belly lighter
    ctx.fillStyle = c1;
    ctx.beginPath(); ctx.ellipse(0, 2, r2*0.55, r2*0.45, 0, 0, Math.PI*2); ctx.fill();
    // Spines (3D spiky fish look)
    ctx.fillStyle = c0;
    for (let i = 0; i < 8; i++) {
      const a = (i/8)*Math.PI*2;
      const sx2 = Math.cos(a)*r2, sy2 = Math.sin(a)*r2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a-0.18)*r2*0.9, Math.sin(a-0.18)*r2*0.9);
      ctx.lineTo(sx2*1.3, sy2*1.3);
      ctx.lineTo(Math.cos(a+0.18)*r2*0.9, Math.sin(a+0.18)*r2*0.9);
      ctx.closePath(); ctx.fill();
    }
    // Eyes
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(-r2*0.3, -r2*0.15, 2, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(-r2*0.3-0.7, -r2*0.15-0.7, 0.8, 0, Math.PI*2); ctx.fill();
    // Poison tint (tier 2+)
    if (s.type === 'puffer_t1' || s.type === 'puffer_t2') {
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#50e060';
      ctx.beginPath(); ctx.arc(0, 0, r2*1.3, 0, Math.PI*2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function _drawAnglerUnit(s, sx, sy) {
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(s.angle + Math.PI/2);
    const c0 = s.hitFlash > 0 ? '#ff88cc' : SOLDIER_TYPES[s.type]?.color || '#280838';
    const c1 = s.hitFlash > 0 ? '#ffaadd' : SOLDIER_TYPES[s.type]?.hi    || '#480860';
    const r2 = SOLDIER_TYPES[s.type]?.r || 11;
    const lurePulse = 0.7 + 0.3*Math.sin(Date.now()/450);
    // Body
    ctx.fillStyle = c0;
    ctx.beginPath(); ctx.arc(0, 2, r2, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = c1;
    ctx.beginPath(); ctx.arc(-2, -2, r2*0.55, 0, Math.PI*2); ctx.fill();
    // Jaw
    ctx.fillStyle = c0;
    ctx.beginPath(); ctx.moveTo(-r2*0.85,3); ctx.lineTo(-r2,9); ctx.lineTo(r2,9); ctx.lineTo(r2*0.85,3); ctx.closePath(); ctx.fill();
    // Teeth
    ctx.fillStyle = '#c0d8b0';
    for (let i = 0; i < 4; i++) {
      const tx2 = -r2*0.7 + i*r2*0.45;
      ctx.beginPath(); ctx.moveTo(tx2,4); ctx.lineTo(tx2+1,7); ctx.lineTo(tx2+2,4); ctx.closePath(); ctx.fill();
    }
    // Lure stalk
    const sway = Math.sin(Date.now()/550)*4;
    ctx.strokeStyle = c1; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0,-r2); ctx.quadraticCurveTo(sway*0.5,-r2-6,sway,-r2-10); ctx.stroke();
    // Lure glow
    ctx.shadowColor = '#30e820'; ctx.shadowBlur = 8;
    ctx.fillStyle = '#40f030';
    ctx.beginPath(); ctx.arc(sway, -r2-11, 3*lurePulse, 0, Math.PI*2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  // ── Player bubble particles ────────────────────────────
  const _bubbles = [];
  let _bubbleMs = 0;

  // ── Player (Nautilus) ──────────────────────────────────
  function drawPlayer(player, cam) {
    const { x: sx, y: sy } = ws(player.x, player.y, cam);
    const a = player.angle;

    // Bubble system — update + draw before sub so they sit behind it
    const nowMs = Date.now();
    const bDt   = _bubbleMs ? Math.min((nowMs - _bubbleMs) / 1000, 0.05) : 0;
    _bubbleMs   = nowMs;

    if (player.moving && Math.random() < bDt * 22) {
      const sternX = player.x - Math.cos(a) * 28;
      const sternY = player.y - Math.sin(a) * 28;
      _bubbles.push({
        wx: sternX + (Math.random() - 0.5) * 7,
        wy: sternY + (Math.random() - 0.5) * 7,
        vx: -Math.cos(a) * 40 + (Math.random() - 0.5) * 50,
        vy: -Math.sin(a) * 40 + (Math.random() - 0.5) * 50 - 18,
        r:  1.2 + Math.random() * 2.2,
        age: 0,
        life: 0.5 + Math.random() * 0.8,
      });
    }
    for (let i = _bubbles.length - 1; i >= 0; i--) {
      const b = _bubbles[i];
      b.age += bDt;
      if (b.age >= b.life) { _bubbles.splice(i, 1); continue; }
      b.wx += b.vx * bDt;
      b.wy += b.vy * bDt;
      const fade = 1 - b.age / b.life;
      const { x: bx, y: by } = ws(b.wx, b.wy, cam);
      ctx.globalAlpha = 0.65 * fade;
      ctx.strokeStyle = '#a0dff0'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(bx, by, b.r, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath(); ctx.arc(bx - b.r * 0.3, by - b.r * 0.35, b.r * 0.28, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(a);

    // Hull shadow
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.ellipse(3, 5, 26, 9, 0, 0, Math.PI*2); ctx.fill();

    // Hull gradient
    const hg = ctx.createLinearGradient(-24, -12, -24, 12);
    hg.addColorStop(0, '#e8c060');
    hg.addColorStop(0.45, '#c89040');
    hg.addColorStop(1, '#7a5018');
    ctx.fillStyle = hg;
    ctx.beginPath(); ctx.ellipse(0, 0, 26, 11, 0, 0, Math.PI*2); ctx.fill();

    // Hull highlight band
    ctx.fillStyle = 'rgba(255,220,120,0.3)';
    ctx.beginPath(); ctx.ellipse(-3, -4, 18, 5, 0, 0, Math.PI*2); ctx.fill();

    // Bow plate
    ctx.fillStyle = '#b07028';
    ctx.beginPath();
    ctx.moveTo(24, 0); ctx.lineTo(16, -6); ctx.lineTo(34, 0); ctx.lineTo(16, 6);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#806020'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(24, 0); ctx.lineTo(34, 0); ctx.stroke();

    // Stern fin
    ctx.fillStyle = '#9a6820';
    ctx.beginPath(); ctx.moveTo(-24,0); ctx.lineTo(-16,-9); ctx.lineTo(-12,0); ctx.lineTo(-16,9); ctx.closePath(); ctx.fill();

    // Propeller — same approach as soldier sub: 3 spokes from hub
    const propA = (Date.now() / 1000) * (player.moving ? 9 : 2.5);
    ctx.save();
    ctx.translate(-27, 0);
    ctx.strokeStyle = '#d4b030'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const pa = propA + (i / 3) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(pa) * 2, Math.sin(pa) * 2);
      ctx.lineTo(Math.cos(pa) * 11, Math.sin(pa) * 11);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
    ctx.fillStyle = '#705010';
    ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI*2); ctx.fill();
    ctx.restore();

    // Conning tower + periscope — flipped to screen-upward side when facing left
    ctx.save();
    if (Math.cos(a) < 0) ctx.scale(1, -1);
    ctx.fillStyle = '#a07828';
    ctx.beginPath(); ctx.ellipse(4, -11, 7, 4.5, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#c09030';
    ctx.fillRect(0, -15, 8, 4);

    // Periscope
    ctx.strokeStyle = '#907028'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(6,-15); ctx.lineTo(6,-23); ctx.lineTo(14,-23); ctx.stroke();
    ctx.fillStyle = '#30a8c0';
    ctx.beginPath(); ctx.arc(14,-23,2.5,0,Math.PI*2); ctx.fill();
    ctx.restore();

    // Portholes
    [-10, 2, 12].forEach(px2 => {
      ctx.fillStyle = '#70c8e8';
      ctx.beginPath(); ctx.arc(px2, 0, 3.5, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#604010'; ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.beginPath(); ctx.arc(px2-1,-1,1.5,0,Math.PI*2); ctx.fill();
    });

    // Rivet row
    ctx.fillStyle = '#604010';
    for (let i = -20; i <= 20; i += 10) {
      ctx.beginPath(); ctx.arc(i,-9,1.2,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(i, 9,1.2,0,Math.PI*2); ctx.fill();
    }

    ctx.restore();

    // HP bar
    const hpPct = player.hp / player.maxHp;
    ctx.fillStyle = '#002200'; ctx.fillRect(sx-22, sy-player.r-10, 44, 5);
    ctx.fillStyle = hpPct>.5 ? '#44ee66' : hpPct>.25 ? '#ffaa00' : '#ff3333';
    ctx.fillRect(sx-22, sy-player.r-10, 44*hpPct, 5);
  }

  // ── HUD ────────────────────────────────────────────────
  function drawHUD(game) {
    const p = game.player;
    ctx.fillStyle = '#030c1acc';
    ctx.fillRect(0, 0, W, 50);
    // Subtle separator line
    ctx.strokeStyle = '#1a4060'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0,50); ctx.lineTo(W,50); ctx.stroke();

    const RES = [
      { icon: RES_DISPLAY.food.icon, val: Math.floor(p.food) },
      { icon: RES_DISPLAY.wood.icon, val: Math.floor(p.wood) },
      { icon: RES_DISPLAY.coal.icon, val: Math.floor(p.coal) },
      { icon: RES_DISPLAY.iron.icon, val: Math.floor(p.iron) },
      { icon: '🐬', val: game.soldiers.length },
      { icon: '💀', val: p.kills },
    ];
    ctx.font = 'bold 13px monospace'; ctx.textBaseline = 'middle';
    let rx = 14;
    RES.forEach(({ icon, val }) => {
      ctx.textAlign = 'left'; ctx.fillStyle = '#90c8e8';
      const str = `${icon} ${fmtNum(val)}`;
      ctx.fillText(str, rx, 25);
      rx += ctx.measureText(str).width + 22;
    });

    const wLeft = Math.max(0, game.waveInterval - game.waveTimer);
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillStyle = wLeft < 10 ? '#ff5555' : '#90c8e8';
    ctx.font = 'bold 13px monospace';
    ctx.fillText(`Attack ${game.waveNumber+1} in ${wLeft.toFixed(0)}s`, W-14, 25);

    const isMobile = Input.TouchUI.isMobile;
    if (!game.bldgSelector.open && !game.bldgMode.active && !game.buildMode.active && !isMobile) {
      ctx.fillStyle = '#2a4060'; ctx.font = '10px monospace';
      ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      ctx.fillText('WASD: move  B: fortifications  C: construct  E: interact  1/2/3: fort type', 14, H-5);
    }

    if (game.buildMode.active) {
      const bw=130, bh=52, gap=6;
      const by = H - bh - 8 - (isMobile ? 160 : 0);
      const startX = (W/2) - (FORT_KEYS.length*(bw+gap))/2;
      FORT_KEYS.forEach((k,i) => {
        const def=FORT_DEFS[k], bx=startX+i*(bw+gap), sel=game.buildMode.type===k;
        ctx.fillStyle = sel ? '#0a2848' : '#030c1acc';
        ctx.strokeStyle = sel ? '#40a8ff' : '#1a3a50'; ctx.lineWidth = sel ? 2 : 1;
        _roundRect(bx,by,bw,bh,6); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#c0e8ff'; ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(`[${i+1}] ${def.name}`, bx+bw/2, by+16);
        const costStr = Object.entries(def.cost).filter(([,v])=>v>0)
          .map(([r,v])=>`${RES_DISPLAY[r].icon}${v}`).join(' ');
        const afford = p.wood>=def.cost.wood && p.iron>=def.cost.iron;
        ctx.fillStyle = afford ? '#70e870' : '#ee5555'; ctx.font = '10px monospace';
        ctx.fillText(costStr||'free', bx+bw/2, by+34);
        // Register as touch hit area
        Input.TouchUI.hitAreas.push({ key: String(i+1), x: bx, y: by, w: bw, h: bh });
      });
      if (!isMobile) {
        ctx.fillStyle = '#2a4a60'; ctx.font = '10px monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillText('[B]/[Esc] exit  •  Right-click cancel', W/2, H-4);
      }
    }
  }

  // ── Minimap ────────────────────────────────────────────
  function drawMinimap(map, game) {
    const isMobile = Input.TouchUI.isMobile;
    // Hide minimap on mobile when a panel is open to avoid overlap
    if (isMobile && (game.openPanel || game.openExpedition || game.bldgSelector.open)) return;
    const mobileOffset = isMobile ? 160 : 0;
    const bottomOffset = (game.bldgSelector.open ? 250 : game.buildMode.active ? 70 : 0) + mobileOffset;
    const mx = W - MM_W - MM_MARGIN;
    const my = H - MM_H - MM_MARGIN - bottomOffset;
    const sx = MM_W / MAP_W, sy = MM_H / MAP_H;

    ctx.fillStyle = '#020810cc'; ctx.strokeStyle = '#1a3a50'; ctx.lineWidth = 1;
    _roundRect(mx-2, my-2, MM_W+4, MM_H+4, 4); ctx.fill(); ctx.stroke();
    if (map.minimap) ctx.drawImage(map.minimap, mx, my, MM_W, MM_H);

    // Forts
    ctx.fillStyle = '#8090b8';
    map.forts.forEach(f => { if(!f.dead) ctx.fillRect(mx+f.x*sx-2,my+f.y*sy-2,4,4); });

    // Buildings
    ctx.fillStyle = '#d4a020';
    for (const b of map.buildingList) {
      if (b.hp > 0) {
        const hb = hexCenter(b.col, b.row);
        ctx.fillRect(mx+hb.x*sx-1, my+hb.y*sy-1, b.size*TILE*sx+2, b.size*HEX_PITCH_Y*sy+2);
      }
    }

    // Camps
    ctx.fillStyle = '#30c8e8';
    game.map.camps.forEach(c => { if(c.count>0) ctx.fillRect(mx+c.x*sx-2,my+c.y*sy-2,4,4); });

    // Enemies (colour by type)
    game.enemies.forEach(e => {
      if (e.dead) return;
      ctx.fillStyle = ENEMY_TYPES[e.type]?.color || '#ff4444';
      ctx.fillRect(mx+e.x*sx-1,my+e.y*sy-1,3,3);
    });

    // Soldiers (colour by type)
    game.soldiers.forEach(s => {
      ctx.fillStyle = SOLDIER_TYPES[s.type]?.color || '#a0c8e8';
      ctx.fillRect(mx+s.x*sx-1,my+s.y*sy-1,2,2);
    });

    // Player
    ctx.fillStyle = '#ffd700';
    ctx.beginPath(); ctx.arc(mx+game.player.x*sx, my+game.player.y*sy, 3, 0, Math.PI*2); ctx.fill();

    // Viewport rect
    ctx.strokeStyle = '#ffffff22'; ctx.lineWidth = 1;
    ctx.strokeRect(mx+(game.camera.x-W/2)*sx, my+(game.camera.y-H/2)*sy, W*sx, H*sy);
  }

  // ── Expedition sites ───────────────────────────────────
  function drawExpeditions(expeditions, cam) {
    expeditions.forEach(exp => {
      const { x: sx, y: sy } = ws(exp.x, exp.y, cam);
      const now = Date.now();
      const onCool = now < exp.cooldownEnd;
      const pulse = 0.45 + 0.45*Math.sin(now*0.0025);

      if (onCool) {
        const pct = 1 - (exp.cooldownEnd - now)/(exp.cooldown*1000);
        ctx.strokeStyle = '#0a2030'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(sx, sy, 28, -Math.PI/2, -Math.PI/2+pct*Math.PI*2); ctx.stroke();
      } else {
        ctx.strokeStyle = `rgba(80,200,255,${0.2+pulse*0.3})`;
        ctx.lineWidth = 2; ctx.setLineDash([5,5]);
        ctx.beginPath(); ctx.arc(sx, sy, 34, 0, Math.PI*2); ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.fillStyle = onCool ? '#0a1828' : exp.color;
      ctx.beginPath(); ctx.arc(sx, sy, 20, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = onCool ? '#1a3858' : '#40c8ff'; ctx.lineWidth = 1.5; ctx.stroke();

      ctx.font = '15px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(exp.icon, sx, sy);

      ctx.fillStyle = onCool ? '#2a5060' : '#40d0ff';
      ctx.font = 'bold 8px monospace'; ctx.textBaseline = 'bottom';
      ctx.fillText(exp.name, sx, sy - 23);

      if (!onCool) {
        const rStr = Object.entries(exp.reward).filter(([,v])=>v>0)
          .map(([r,v])=>`${RES_DISPLAY[r].icon}${v}`).join(' ');
        ctx.fillStyle = '#70e8a0'; ctx.font = '8px monospace'; ctx.textBaseline = 'top';
        ctx.fillText(rStr, sx, sy + 23);
      }
    });
  }

  function drawExpeditionHint(exp, cam) {
    const { x: sx, y: sy } = ws(exp.x, exp.y, cam);
    const pulse = 0.75 + 0.25*Math.sin(Date.now()*0.004);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#40d0ff'; ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    const hint = Input.TouchUI.isMobile ? `👆 ${exp.name}` : `[E]  ${exp.name}`;
    ctx.fillText(hint, sx, sy - 36);
    ctx.globalAlpha = 1;
  }

  function drawExpeditionPanel(exp, player) {
    const PW = 270, PH = 260, pad = 14;
    const px = W - PW - 16, py = 60;
    const now = Date.now(), onCool = now < exp.cooldownEnd;

    ctx.fillStyle = '#050e1eee'; ctx.strokeStyle = '#1a5068'; ctx.lineWidth = 2;
    _roundRect(px, py, PW, PH, 10); ctx.fill(); ctx.stroke();

    let y = py + pad;
    ctx.fillStyle = '#40d0ff'; ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(`${exp.icon}  ${exp.name}`, px+pad, y); y += 22;
    ctx.fillStyle = '#4a7090'; ctx.font = '10px monospace';
    ctx.fillText(exp.desc, px+pad, y); y += 16;

    ctx.strokeStyle = '#0e2838'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(px+pad,y); ctx.lineTo(px+PW-pad,y); ctx.stroke(); y += 10;

    ctx.fillStyle = '#50a870'; ctx.font = 'bold 11px monospace';
    ctx.fillText('Reward:', px+pad, y); y += 14;
    const rStr = Object.entries(exp.reward).filter(([,v])=>v>0)
      .map(([r,v])=>`${RES_DISPLAY[r].icon} ${v}`).join('   ');
    ctx.fillStyle = '#90e8a0'; ctx.font = '12px monospace';
    ctx.fillText(rStr, px+pad+8, y); y += 18;

    const afford = canAfford(player, exp.cost);
    ctx.fillStyle = '#806040'; ctx.font = 'bold 11px monospace';
    ctx.fillText('Cost:', px+pad, y); y += 14;
    const cStr = Object.entries(exp.cost).filter(([,v])=>v>0)
      .map(([r,v])=>`${RES_DISPLAY[r].icon} ${v}`).join('   ');
    ctx.fillStyle = afford ? '#d8c080' : '#ee5555'; ctx.font = '12px monospace';
    ctx.fillText(cStr, px+pad+8, y); y += 18;

    ctx.beginPath(); ctx.moveTo(px+pad,y); ctx.lineTo(px+PW-pad,y); ctx.stroke(); y += 10;

    const ebtnW = PW-pad*2, ebtnH = 38;
    if (onCool) {
      const remS = Math.ceil((exp.cooldownEnd-now)/1000);
      ctx.fillStyle = '#cc8844'; ctx.font = 'bold 12px monospace';
      ctx.fillText(`⏳ Cooldown: ${fmtTime(remS)}`, px+pad, y); y += 16;
      const pct = 1-(exp.cooldownEnd-now)/(exp.cooldown*1000);
      const bw2 = PW-pad*2;
      ctx.fillStyle='#0d1a26'; ctx.fillRect(px+pad,y,bw2,5);
      ctx.fillStyle='#408080'; ctx.fillRect(px+pad,y,bw2*pct,5);
    } else if (afford) {
      ctx.fillStyle = '#0e2840'; ctx.strokeStyle = '#30a0c0'; ctx.lineWidth = 1.5;
      _roundRect(px+pad, y, ebtnW, ebtnH, 6); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#50c0e0'; ctx.font = 'bold 13px monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('Begin Expedition', px+pad+ebtnW/2, y+ebtnH/2);
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      Input.TouchUI.hitAreas.push({ key: 'e', x: px+pad, y, w: ebtnW, h: ebtnH });
    } else {
      ctx.fillStyle = '#0a1520'; ctx.strokeStyle = '#1a2a38'; ctx.lineWidth = 1;
      _roundRect(px+pad, y, ebtnW, ebtnH, 6); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#304858'; ctx.font = '12px monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('Not enough resources', px+pad+ebtnW/2, y+ebtnH/2);
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    }
  }

  // ── Wave flash / Game over ─────────────────────────────
  function drawWaveFlash(alpha) {
    if (alpha <= 0) return;
    ctx.fillStyle = `rgba(80,160,255,${alpha*.2})`; ctx.fillRect(0,0,W,H);
    ctx.fillStyle = `rgba(100,200,255,${alpha})`;
    ctx.font = 'bold 30px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('⚠  ENEMY FORCES INBOUND  ⚠', W/2, H/2-60);
  }

  function drawGameOver(kills, wave, hasCheckpoint, checkpointWave) {
    ctx.fillStyle = '#000000cc'; ctx.fillRect(0,0,W,H);
    ctx.fillStyle = '#1a90cc'; ctx.font = 'bold 48px monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('⚓ NAUTILUS SUNK ⚓', W/2, H/2-70);
    ctx.fillStyle = '#7ab8d0'; ctx.font = '22px monospace';
    ctx.fillText(`Survived to Attack ${wave}`, W/2, H/2-10);
    ctx.fillText(`Enemies defeated: ${kills}`, W/2, H/2+28);

    const btnW = Math.min(300, W - 48), btnH = 52;
    if (hasCheckpoint) {
      const ry = H/2 + 64;
      ctx.fillStyle = '#0e2a50'; ctx.strokeStyle = '#40c8ff'; ctx.lineWidth = 2;
      _roundRect(W/2-btnW/2, ry, btnW, btnH, 8); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#40c8ff'; ctx.font = 'bold 15px monospace';
      ctx.fillText(`Resume from Attack ${checkpointWave+1}`, W/2, ry + btnH/2);
      Input.TouchUI.hitAreas.push({ key: 'r', x: W/2-btnW/2, y: ry, w: btnW, h: btnH });

      const ny = H/2 + 132;
      ctx.fillStyle = '#0a1a30'; ctx.strokeStyle = '#2a6888'; ctx.lineWidth = 1.5;
      _roundRect(W/2-btnW/2, ny, btnW, btnH, 8); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#4a90b0'; ctx.font = '15px monospace';
      ctx.fillText('New Voyage', W/2, ny + btnH/2);
      Input.TouchUI.hitAreas.push({ key: 'n', x: W/2-btnW/2, y: ny, w: btnW, h: btnH });
    } else {
      const ry = H/2 + 70;
      ctx.fillStyle = '#0e2a50'; ctx.strokeStyle = '#3080c0'; ctx.lineWidth = 2;
      _roundRect(W/2-btnW/2, ry, btnW, btnH, 8); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#5090d0'; ctx.font = '16px monospace';
      ctx.fillText('New Voyage', W/2, ry + btnH/2);
      Input.TouchUI.hitAreas.push({ key: 'r', x: W/2-btnW/2, y: ry, w: btnW, h: btnH });
    }
  }

  // ── Touch overlay (joystick + action buttons) ─────────
  function drawTouchControls(game) {
    if (!Input.TouchUI.isMobile || game.gameOver) return;

    const joy = Input.TouchUI.joy;
    const jBaseX = joy.active ? joy.baseX : 110;
    const jBaseY = joy.active ? joy.baseY : H - 110;

    // Joystick base ring
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#2080a0';
    ctx.beginPath(); ctx.arc(jBaseX, jBaseY, 70, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = '#60c0e0'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(jBaseX, jBaseY, 70, 0, Math.PI*2); ctx.stroke();

    // Joystick thumb
    const tx = jBaseX + joy.thumbDx;
    const ty = jBaseY + joy.thumbDy;
    ctx.globalAlpha = joy.active ? 0.65 : 0.28;
    ctx.fillStyle = '#60d0f0';
    ctx.beginPath(); ctx.arc(tx, ty, 28, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;

    // Action buttons: 2×2 grid at bottom-right
    const BTN_R = 30;
    const bx1 = W - 113, bx2 = W - 45;
    const by1 = H - 113, by2 = H - 45;

    const actionBtns = [
      { key: 'c',      icon: '🏗', label: 'BUILD', cx: bx1, cy: by1,
        active: !!(game.bldgMode?.active || game.bldgSelector?.open) },
      { key: 'e',      icon: '⚓', label: 'USE',   cx: bx2, cy: by1,
        active: !!(game.nearBuilding || game.nearExpedition || game.openPanel || game.openExpedition) },
      { key: 'b',      icon: '🛡', label: 'FORT',  cx: bx1, cy: by2,
        active: !!(game.buildMode?.active) },
      { key: 'escape', icon: '✕',  label: 'BACK',  cx: bx2, cy: by2,
        active: !!(game.openPanel || game.openExpedition || game.buildMode?.active ||
                   game.bldgMode?.active || game.bldgSelector?.open) },
    ];

    for (const btn of actionBtns) {
      ctx.globalAlpha = btn.active ? 0.92 : 0.42;
      ctx.fillStyle = btn.active ? '#0d2848' : '#05101a';
      ctx.strokeStyle = btn.active ? '#3090e0' : '#1a3048';
      ctx.lineWidth = btn.active ? 2 : 1.5;
      ctx.beginPath(); ctx.arc(btn.cx, btn.cy, BTN_R, 0, Math.PI*2); ctx.fill(); ctx.stroke();

      ctx.globalAlpha = btn.active ? 1 : 0.45;
      ctx.font = '18px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#e0f0ff';
      ctx.fillText(btn.icon, btn.cx, btn.cy - 4);
      ctx.font = 'bold 7px monospace'; ctx.textBaseline = 'bottom';
      ctx.fillStyle = btn.active ? '#80b8d8' : '#506070';
      ctx.fillText(btn.label, btn.cx, btn.cy + BTN_R - 2);
      ctx.globalAlpha = 1;

      Input.TouchUI.hitAreas.push({ key: btn.key,
        x: btn.cx - BTN_R, y: btn.cy - BTN_R, w: BTN_R*2, h: BTN_R*2 });
    }
  }

  // ── Building canvas graphics (replaces emoji icons) ────
  // tier: 0=lv1-3  1=lv4-7  2=lv8-10
  const _BLDG_GFX = {

    chief_hall(b, tier, sx, sy, bw, bh) {
      const cx = sx+bw/2, cy = sy+bh/2;
      // Dock basin (water)
      ctx.fillStyle = '#06182e';
      ctx.beginPath(); ctx.ellipse(cx, cy+bh*0.14, bw*0.38, bh*0.28, 0, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#1a5880'; ctx.lineWidth = 2; ctx.stroke();
      if (tier >= 1) {
        ctx.strokeStyle = '#1a6090'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(cx, cy+bh*0.14, bw*0.44, bh*0.34, 0, 0, Math.PI*2); ctx.stroke();
      }
      // Pier arms
      const nPiers = tier === 0 ? 2 : tier === 1 ? 4 : 6;
      ctx.fillStyle = BLDG_DEFS.chief_hall.color;
      for (let i = 0; i < nPiers; i++) {
        const a = (i/nPiers)*Math.PI*2 - Math.PI/2;
        const pr = bw*0.37;
        const px = cx+Math.cos(a)*pr, py = (cy+bh*0.14)+Math.sin(a)*pr*0.75;
        ctx.save(); ctx.translate(px, py); ctx.rotate(a);
        ctx.fillRect(-4, -3, tier >= 2 ? 20 : 14, 6);
        ctx.restore();
      }
      // Quay wall at south (harbour boundary)
      ctx.fillStyle = '#1a3860'; ctx.fillRect(sx+8, sy+bh-10, bw-16, 8);
      ctx.strokeStyle = '#2060a8'; ctx.lineWidth = 1.5; ctx.strokeRect(sx+8, sy+bh-10, bw-16, 8);
      // Bollards on quay
      for (let i = 0; i < 4+tier*2; i++) {
        const bx2 = sx+14+(i*(bw-28)/(3+tier*2));
        ctx.fillStyle = '#50a8d0';
        ctx.beginPath(); ctx.arc(bx2, sy+bh-7, 3, 0, Math.PI*2); ctx.fill();
      }
      // Command tower
      const tr = tier === 0 ? bw*0.11 : tier === 1 ? bw*0.13 : bw*0.15;
      const tcy = cy - bh*0.04;
      ctx.fillStyle = BLDG_DEFS.chief_hall.hi;
      ctx.beginPath(); ctx.arc(cx, tcy, tr, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = BLDG_DEFS.chief_hall.lo; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = BLDG_DEFS.chief_hall.color;
      ctx.beginPath(); ctx.arc(cx, tcy, tr*0.55, 0, Math.PI*2); ctx.fill();
      // Periscope
      ctx.strokeStyle = '#90a8b8'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx+2, tcy-tr); ctx.lineTo(cx+2, tcy-tr-10-tier*4);
      ctx.lineTo(cx+12+tier*3, tcy-tr-10-tier*4); ctx.stroke();
      ctx.fillStyle = '#30b8d0';
      ctx.beginPath(); ctx.arc(cx+12+tier*3, tcy-tr-10-tier*4, 3, 0, Math.PI*2); ctx.fill();
      // Portholes
      const nPorts = 3+tier*2;
      for (let i = 0; i < nPorts; i++) {
        const a = (i/nPorts)*Math.PI*2;
        const px = cx+Math.cos(a)*bw*0.19, py = tcy+Math.sin(a)*bh*0.19;
        ctx.fillStyle = '#50c8e8';
        ctx.beginPath(); ctx.arc(px, py, 3.5, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = '#204860'; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.beginPath(); ctx.arc(px-1, py-1, 1.3, 0, Math.PI*2); ctx.fill();
      }
    },

    furnace(b, tier, sx, sy, bw, bh) {
      const cx = sx+bw/2, cy = sy+bh/2;
      ctx.fillStyle = '#2a0e04'; _roundRect(sx+4, sy+4, bw-8, bh-8, 12); ctx.fill();
      // Vent openings
      const vPos = [[cx,cy],[cx-16,cy+6],[cx+14,cy-8]].slice(0,tier+1);
      const t = Date.now()/400;
      vPos.forEach(([vx,vy], i) => {
        const vr = tier===0 ? 18 : 14;
        ctx.globalAlpha = 0.25+0.1*Math.sin(t+i);
        ctx.fillStyle = '#ff6010';
        ctx.beginPath(); ctx.arc(vx, vy, vr*1.7, 0, Math.PI*2); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#601008';
        ctx.beginPath(); ctx.arc(vx, vy, vr, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = '#c04010'; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = '#ff8020';
        ctx.beginPath(); ctx.arc(vx, vy, vr*0.6, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#ffbb50';
        ctx.beginPath(); ctx.arc(vx, vy, vr*0.3, 0, Math.PI*2); ctx.fill();
      });
      // Pipes (tier 1+)
      if (tier >= 1) {
        ctx.strokeStyle = '#502010'; ctx.lineWidth = 4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(sx+8, cy); ctx.lineTo(cx-20, cy); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(sx+bw-8, cy); ctx.lineTo(cx+18, cy); ctx.stroke();
        ctx.lineCap = 'butt';
      }
      // Steam
      ctx.fillStyle = 'rgba(255,140,60,0.2)';
      for (let i = 0; i < (tier+1)*3; i++) {
        const px = cx+Math.sin(t*1.1+i*2)*10;
        const py = cy-18-((t*18+i*12)%22);
        ctx.beginPath(); ctx.arc(px, py, 2+i*0.4, 0, Math.PI*2); ctx.fill();
      }
    },

    farm(b, tier, sx, sy, bw, bh) {
      const cx = sx+bw/2, cy = sy+bh/2;
      ctx.fillStyle = '#0a2814'; _roundRect(sx+4, sy+4, bw-8, bh-8, 12); ctx.fill();
      const pens = tier===0?[[cx,cy]]:tier===1?[[cx-16,cy-14],[cx+16,cy+14]]:[[cx-16,cy-16],[cx+16,cy-16],[cx-16,cy+16],[cx+16,cy+16]];
      const pr = tier===0?22:14, t = Date.now()/800;
      pens.forEach(([px,py], pi) => {
        ctx.fillStyle = '#082838';
        ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = '#20a048'; ctx.lineWidth = 1.5; ctx.setLineDash([3,3]);
        ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI*2); ctx.stroke();
        ctx.setLineDash([]);
        const nf = tier===0?3:2;
        for (let f = 0; f < nf; f++) {
          const fa = t+f*(Math.PI*2/nf)+pi;
          const fx = px+Math.cos(fa)*pr*0.55, fy = py+Math.sin(fa)*pr*0.4;
          ctx.fillStyle = `hsl(${170+f*50},70%,55%)`;
          ctx.beginPath(); ctx.ellipse(fx,fy,4,2.5,fa,0,Math.PI*2); ctx.fill();
        }
      });
      if (tier>=2) {
        ctx.strokeStyle='#30c858'; ctx.lineWidth=1.5; ctx.lineCap='round';
        const t2=Date.now()/700;
        for(let k=0;k<4;k++){const kx=sx+10+k*(bw-20)/3;ctx.beginPath();ctx.moveTo(kx,sy+bh-8);ctx.quadraticCurveTo(kx+Math.sin(t2+k)*5,sy+bh-18,kx+Math.sin(t2+k)*3,sy+bh-26);ctx.stroke();}
        ctx.lineCap='butt';
      }
    },

    sawmill(b, tier, sx, sy, bw, bh) {
      const cx = sx+bw/2, cy = sy+bh/2;
      ctx.fillStyle = '#281808'; _roundRect(sx+4, sy+4, bw-8, bh-8, 12); ctx.fill();
      ctx.strokeStyle = '#402818'; ctx.lineWidth = 1; ctx.stroke();
      // Cargo/debris
      [[sx+10,sy+bh-26,20,12,'#4a3010'],[sx+8,sy+bh-38,16,14,'#5a4020']].forEach(([rx,ry,rw,rh,c])=>{
        ctx.fillStyle=c; ctx.fillRect(rx,ry,rw,rh);
        ctx.strokeStyle='#706040'; ctx.lineWidth=0.8; ctx.strokeRect(rx,ry,rw,rh);
      });
      // Crane mast
      ctx.fillStyle='#504030'; ctx.fillRect(cx-5,sy+8,10,bh*0.45);
      // Crane arm
      const aLen = bw*(0.3+tier*0.08);
      ctx.strokeStyle='#786040'; ctx.lineWidth=5; ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(cx,sy+10); ctx.lineTo(cx+aLen,sy+10); ctx.stroke();
      ctx.strokeStyle='#a09060'; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.moveTo(cx+aLen,sy+10); ctx.lineTo(cx+aLen,sy+28+tier*8); ctx.stroke();
      if(tier>=1){ctx.fillStyle='#608020'; ctx.fillRect(cx+aLen-8,sy+30+tier*8,16,11); ctx.strokeStyle='#304010'; ctx.lineWidth=1; ctx.strokeRect(cx+aLen-8,sy+30+tier*8,16,11);}
      if(tier>=2){
        ctx.strokeStyle='#786040'; ctx.lineWidth=4; ctx.lineCap='round';
        ctx.beginPath(); ctx.moveTo(cx-2,sy+18); ctx.lineTo(cx-aLen,sy+18); ctx.stroke();
        ctx.strokeStyle='#a09060'; ctx.lineWidth=1.5;
        ctx.beginPath(); ctx.moveTo(cx-aLen,sy+18); ctx.lineTo(cx-aLen,sy+36); ctx.stroke();
      }
      ctx.lineCap='butt';
    },

    coal_mine(b, tier, sx, sy, bw, bh) {
      const cx = sx+bw/2, cy = sy+bh/2;
      ctx.fillStyle = '#0a0c14'; _roundRect(sx+4, sy+4, bw-8, bh-8, 12); ctx.fill();
      const nT=tier+1, tW=tier===0?32:tier===1?22:16, tH=tier===0?44:tier===1?36:28;
      const txs=tier===0?[cx]:tier===1?[cx-16,cx+16]:[cx-22,cx,cx+22];
      txs.forEach(tx=>{
        const ty=cy+6;
        const g=ctx.createLinearGradient(tx-tW/2,ty-tH/2,tx+tW/2,ty-tH/2);
        g.addColorStop(0,'#283040'); g.addColorStop(0.5,'#384858'); g.addColorStop(1,'#202830');
        ctx.fillStyle=g; ctx.fillRect(tx-tW/2,ty-tH/2,tW,tH);
        ctx.strokeStyle='#405060'; ctx.lineWidth=1.5; ctx.strokeRect(tx-tW/2,ty-tH/2,tW,tH);
        ctx.fillStyle='#505870'; ctx.beginPath(); ctx.arc(tx,ty-tH/2,tW/2-1,0,Math.PI*2); ctx.fill();
        ctx.strokeStyle='#607080'; ctx.lineWidth=1; ctx.stroke();
        ctx.fillStyle='#20e060'; ctx.beginPath(); ctx.arc(tx,ty,4,0,Math.PI*2); ctx.fill();
      });
      ctx.strokeStyle='#304050'; ctx.lineWidth=5; ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(cx,sy+8); ctx.lineTo(cx,sy+18); ctx.stroke();
      ctx.globalAlpha=0.6+0.25*Math.sin(Date.now()/200);
      ctx.fillStyle='#40f088'; ctx.beginPath(); ctx.arc(cx,sy+8,4,0,Math.PI*2); ctx.fill();
      ctx.globalAlpha=1; ctx.lineCap='butt';
    },

    iron_mine(b, tier, sx, sy, bw, bh) {
      const cx = sx+bw/2, cy = sy+bh/2;
      ctx.fillStyle = '#181c28'; _roundRect(sx+4, sy+4, bw-8, bh-8, 12); ctx.fill();
      // Ore chunks
      const oc=tier===0?3:tier===1?5:8;
      for(let i=0;i<oc;i++){
        const a=(i/oc)*Math.PI*2, d=14+tier*4;
        const ox2=cx+Math.cos(a)*d, oy2=cy+6+Math.sin(a)*d*0.6;
        ctx.fillStyle=['#6070a0','#5868a0','#7080b0'][i%3];
        ctx.beginPath(); ctx.arc(ox2,oy2,2.5+i%3,0,Math.PI*2); ctx.fill();
      }
      // Drill tower A-frame
      const dH=18+tier*8;
      ctx.strokeStyle='#506070'; ctx.lineWidth=3;
      ctx.beginPath(); ctx.moveTo(cx-5,sy+10); ctx.lineTo(cx,sy+10+dH); ctx.lineTo(cx+5,sy+10); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx-3,sy+10+dH*0.5); ctx.lineTo(cx+3,sy+10+dH*0.5); ctx.stroke();
      // Spinning drill bit
      const st=Date.now()/140;
      ctx.save(); ctx.translate(cx,sy+10+dH); ctx.rotate(st);
      ctx.fillStyle='#7090b0';
      for(let i=0;i<4;i++){const ba=(i/4)*Math.PI*2; ctx.beginPath(); ctx.moveTo(0,0); ctx.arc(0,0,6,ba,ba+0.45); ctx.fill();}
      ctx.restore();
      if(tier>=1){
        ctx.fillStyle='#303848'; ctx.fillRect(sx+8,cy-2,bw-16,14);
        ctx.strokeStyle='#506070'; ctx.lineWidth=1; ctx.strokeRect(sx+8,cy-2,bw-16,14);
        for(let i=0;i<=tier;i++){ctx.fillStyle='#20e050'; ctx.beginPath(); ctx.arc(sx+16+i*12,cy+5,3,0,Math.PI*2); ctx.fill();}
      }
    },

    barracks(b, tier, sx, sy, bw, bh) {
      const cx = sx+bw/2, cy = sy+bh/2;
      ctx.fillStyle = '#081e30'; _roundRect(sx+4, sy+4, bw-8, bh-8, 12); ctx.fill();
      ctx.strokeStyle = '#1a4860'; ctx.lineWidth = 2; ctx.stroke();
      const pR = bw*0.36;
      ctx.fillStyle = '#0a2a40';
      ctx.beginPath(); ctx.arc(cx,cy,pR,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#1a6080'; ctx.lineWidth = 2; ctx.stroke();
      // Lane dividers
      if(tier>=1){
        ctx.strokeStyle='#2070a0'; ctx.lineWidth=1; ctx.setLineDash([3,4]);
        const lanes=tier===1?3:5;
        for(let i=1;i<lanes;i++){
          const lx=cx-pR*0.8+(i/lanes)*pR*1.6;
          ctx.beginPath(); ctx.moveTo(lx,cy-pR*0.75); ctx.lineTo(lx,cy+pR*0.75); ctx.stroke();
        }
        ctx.setLineDash([]);
      }
      // Swimming creatures
      const t=Date.now()/600, ns=tier+1;
      for(let i=0;i<ns;i++){
        const a=t+(i/ns)*Math.PI*2, dr2=pR*0.52;
        const dx=cx+Math.cos(a)*dr2, dy=cy+Math.sin(a)*dr2*0.5;
        ctx.fillStyle='#4888c8';
        ctx.beginPath(); ctx.ellipse(dx,dy,5,3,a,0,Math.PI*2); ctx.fill();
      }
      if(tier>=2){
        for(let i=0;i<4;i++){
          const bkx=sx+8+i*((bw-16)/4);
          ctx.fillStyle='#183848'; ctx.fillRect(bkx,sy+6,(bw-16)/4-2,8);
          ctx.strokeStyle='#2860a0'; ctx.lineWidth=1; ctx.strokeRect(bkx,sy+6,(bw-16)/4-2,8);
        }
      }
    },

    hospital(b, tier, sx, sy, bw, bh) {
      const cx = sx+bw/2, cy = sy+bh/2;
      ctx.fillStyle = '#101e2a'; _roundRect(sx+4, sy+4, bw-8, bh-8, 12); ctx.fill();
      const pods=tier===0?1:tier===1?2:3;
      const pPos=[[cx,cy],[cx-19,cy+6],[cx+19,cy-6]].slice(0,pods);
      pPos.forEach(([px,py],i)=>{
        const pr=tier===0?22:16;
        ctx.globalAlpha=0.18+0.08*Math.sin(Date.now()/500+i);
        ctx.fillStyle='#50c8e0';
        ctx.beginPath(); ctx.arc(px,py,pr*1.45,0,Math.PI*2); ctx.fill();
        ctx.globalAlpha=1;
        ctx.fillStyle='#122838';
        ctx.beginPath(); ctx.arc(px,py,pr,0,Math.PI*2); ctx.fill();
        ctx.strokeStyle='#38b0d0'; ctx.lineWidth=2; ctx.stroke();
        // Medical cross
        const cs=pr*0.32;
        ctx.fillStyle='#40e8a8';
        ctx.fillRect(px-cs/3,py-cs,cs*0.65,cs*2);
        ctx.fillRect(px-cs,py-cs/3,cs*2,cs*0.65);
        ctx.fillStyle='rgba(192,240,224,0.5)';
        ctx.beginPath(); ctx.arc(px,py,pr*0.28,0,Math.PI*2); ctx.fill();
      });
      if(tier>=1){
        ctx.strokeStyle='#208878'; ctx.lineWidth=2; ctx.lineCap='round';
        ctx.beginPath(); ctx.moveTo(pPos[0][0],pPos[0][1]); ctx.lineTo(pPos[1][0],pPos[1][1]);
        if(tier>=2) ctx.lineTo(pPos[2][0],pPos[2][1]);
        ctx.stroke(); ctx.lineCap='butt';
      }
    },

    warehouse(b, tier, sx, sy, bw, bh) {
      const cx = sx+bw/2, cy = sy+bh/2;
      ctx.fillStyle = '#1e1408'; _roundRect(sx+4, sy+4, bw-8, bh-8, 12); ctx.fill();
      const stacks=tier+2, cW=Math.floor((bw-16)/stacks)-2;
      const cols=['#6a3c14','#4a5060','#506028','#785028'];
      for(let s=0;s<stacks;s++){
        const bkx=sx+8+s*(cW+2);
        const levels=tier===0?2:tier===1?3:Math.min(4,2+s);
        for(let l=0;l<levels;l++){
          const bky=sy+bh-12-l*14;
          const c2=cols[(s+l)%cols.length];
          ctx.fillStyle=c2; ctx.fillRect(bkx,bky,cW,12);
          ctx.strokeStyle='#140c04'; ctx.lineWidth=0.8; ctx.strokeRect(bkx,bky,cW,12);
          ctx.fillStyle='rgba(255,255,255,0.07)'; ctx.fillRect(bkx+1,bky+2,cW-2,3);
        }
      }
      // Loading crane / forklift
      if(tier>=1){ctx.fillStyle='#e0a818'; ctx.fillRect(sx+6,sy+10,12,9); ctx.fillRect(sx+6,sy+10,3,17);}
      if(tier>=2){ctx.strokeStyle='#807830'; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(sx+bw-8,sy+8); ctx.lineTo(sx+bw-8,sy+22); ctx.stroke();}
    },

    research_lab(b, tier, sx, sy, bw, bh) {
      const cx = sx+bw/2, cy = sy+bh/2;
      ctx.fillStyle = '#080618'; _roundRect(sx+4, sy+4, bw-8, bh-8, 12); ctx.fill();
      ctx.strokeStyle = '#1818a0'; ctx.lineWidth = 1; ctx.stroke();
      const dR=bw*(tier===0?0.31:0.28);
      const dg=ctx.createRadialGradient(cx-dR*0.3,cy-dR*0.3,1,cx,cy,dR);
      dg.addColorStop(0,'rgba(80,100,255,0.65)'); dg.addColorStop(0.7,'rgba(30,20,110,0.85)'); dg.addColorStop(1,'rgba(8,6,40,0.96)');
      ctx.fillStyle=dg; ctx.beginPath(); ctx.arc(cx,cy,dR,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle='#4060e0'; ctx.lineWidth=2; ctx.stroke();
      ctx.strokeStyle='rgba(60,80,200,0.35)'; ctx.lineWidth=1;
      for(let i=0;i<6;i++){const a=(i/6)*Math.PI*2; ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(cx+Math.cos(a)*dR,cy+Math.sin(a)*dR); ctx.stroke();}
      ctx.fillStyle='#8080f0'; ctx.beginPath(); ctx.arc(cx-5,cy+2,4,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#50e8a0'; ctx.beginPath(); ctx.arc(cx+6,cy-3,3,0,Math.PI*2); ctx.fill();
      if(tier>=1){
        const sd=dR*0.55;
        [[cx-bw*0.3,cy+bh*0.16],[cx+bw*0.3,cy-bh*0.1]].slice(0,tier).forEach(([dx,dy])=>{
          ctx.fillStyle='rgba(28,18,72,0.92)'; ctx.beginPath(); ctx.arc(dx,dy,sd,0,Math.PI*2); ctx.fill();
          ctx.strokeStyle='#3050c0'; ctx.lineWidth=1.5; ctx.stroke();
          ctx.fillStyle='#5090d0'; ctx.beginPath(); ctx.arc(dx,dy,sd*0.4,0,Math.PI*2); ctx.fill();
        });
        ctx.strokeStyle='#5070d0'; ctx.lineWidth=1.5; ctx.lineCap='round';
        const an=tier===1?2:4;
        for(let i=0;i<an;i++){const ax=sx+12+i*(bw-24)/(an-1); ctx.beginPath(); ctx.moveTo(ax,sy+8); ctx.lineTo(ax,sy+18); ctx.stroke(); ctx.fillStyle='#3888f0'; ctx.beginPath(); ctx.arc(ax,sy+8,2.5,0,Math.PI*2); ctx.fill();}
        ctx.lineCap='butt';
      }
      ctx.globalAlpha=0.12+0.05*Math.sin(Date.now()/700);
      ctx.fillStyle='#2030c8'; ctx.beginPath(); ctx.arc(cx,cy,dR*1.55,0,Math.PI*2); ctx.fill();
      ctx.globalAlpha=1;
    },

    city_wall(b, tier, sx, sy, bw, bh) {
      const cx = sx+bw/2, cy = sy+bh/2;
      ctx.fillStyle = '#1e1e24'; _roundRect(sx+2, sy+2, bw-4, bh-4, 10); ctx.fill();
      const wH=16+tier*10;
      ctx.fillStyle='#585868'; ctx.fillRect(sx+4,cy-wH/2,bw-8,wH);
      ctx.strokeStyle='#383840'; ctx.lineWidth=1;
      const bW=18, bkH=10;
      for(let row=0;row<Math.ceil(wH/bkH)+1;row++){
        const offX=(row%2)*(bW/2);
        for(let col=-1;col<=Math.ceil((bw-8)/bW)+1;col++) ctx.strokeRect(sx+4+col*bW+offX,cy-wH/2+row*bkH,bW,bkH);
      }
      ctx.fillStyle='#686878';
      const mW=tier===0?12:tier===1?10:8, mH=6+tier*3, gap2=8;
      for(let mx=sx+8;mx+mW<sx+bw-4;mx+=mW+gap2) ctx.fillRect(mx,cy-wH/2-mH,mW,mH);
      // Coral decorations
      ctx.fillStyle='#e04820';
      const cc=2+tier*2;
      for(let i=0;i<cc;i++){
        const cpx=sx+10+i*(bw-20)/(cc-1), cpy=cy+wH/2;
        ctx.beginPath(); ctx.moveTo(cpx,cpy); ctx.lineTo(cpx-3,cpy-9); ctx.lineTo(cpx+3,cpy-9); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(cpx-4,cpy-4); ctx.lineTo(cpx-7,cpy-10); ctx.lineTo(cpx-1,cpy-10); ctx.closePath(); ctx.fill();
      }
    },

    tavern(b, tier, sx, sy, bw, bh) {
      const cx = sx+bw/2, cy = sy+bh/2;
      ctx.fillStyle = '#200e04'; _roundRect(sx+4, sy+4, bw-8, bh-8, 12); ctx.fill();
      // Roof
      ctx.fillStyle='#4a2006';
      ctx.beginPath(); ctx.moveTo(sx+4,cy-4); ctx.lineTo(cx,sy+4); ctx.lineTo(sx+bw-4,cy-4); ctx.closePath(); ctx.fill();
      ctx.strokeStyle='#301004'; ctx.lineWidth=1.5; ctx.stroke();
      // Walls
      ctx.fillStyle='#5a3212'; ctx.fillRect(sx+10,cy-4,bw-20,bh*0.46);
      ctx.strokeStyle='#301808'; ctx.lineWidth=1; ctx.strokeRect(sx+10,cy-4,bw-20,bh*0.46);
      // Upper floor (tier 2)
      if(tier>=2){
        ctx.fillStyle='#6a4020'; ctx.fillRect(sx+14,cy-4-16,bw-28,16);
        ctx.strokeStyle='#301808'; ctx.lineWidth=1; ctx.strokeRect(sx+14,cy-4-16,bw-28,16);
        for(let i=0;i<2;i++){const uwx=cx-12+i*18,uwy=cy-4-14; ctx.fillStyle='rgba(255,170,60,0.6)'; ctx.fillRect(uwx,uwy,8,8); ctx.strokeStyle='#502808'; ctx.lineWidth=0.5; ctx.strokeRect(uwx,uwy,8,8);}
      }
      // Sign
      ctx.fillStyle='#e09818'; ctx.fillRect(cx-14,cy-10,28,8); ctx.strokeStyle='#806010'; ctx.lineWidth=1; ctx.strokeRect(cx-14,cy-10,28,8);
      // Windows
      const nW=tier+1;
      const t=Date.now()/600;
      for(let i=0;i<nW;i++){
        const wx=sx+14+(i*(bw-32)/Math.max(1,nW-1)),wy=cy+2;
        ctx.fillStyle='rgba(255,170,60,0.65)'; ctx.fillRect(wx,wy,10,10);
        ctx.strokeStyle='#502808'; ctx.lineWidth=0.8; ctx.strokeRect(wx,wy,10,10);
        ctx.strokeStyle='#503008'; ctx.lineWidth=0.5; ctx.beginPath(); ctx.moveTo(wx+5,wy); ctx.lineTo(wx+5,wy+10); ctx.moveTo(wx,wy+5); ctx.lineTo(wx+10,wy+5); ctx.stroke();
        ctx.globalAlpha=0.15+0.08*Math.sin(t+i); ctx.fillStyle='#ffaa30'; ctx.fillRect(wx,wy,10,10); ctx.globalAlpha=1;
      }
      // Door arch
      ctx.fillStyle='#140600';
      const dX=cx-6, dY=cy+bh*0.22-16;
      ctx.beginPath(); ctx.moveTo(dX,dY+16); ctx.lineTo(dX,dY+4); ctx.arc(dX+6,dY+4,6,Math.PI,0); ctx.lineTo(dX+12,dY+16); ctx.closePath(); ctx.fill();
    },
  };

  // ── Faction selection screen ───────────────────────────
  function drawFactionSelect(state, hasSave) {
    // Background
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#020810'); bg.addColorStop(1, '#040f1c');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    // Title
    ctx.fillStyle = '#40d8ff'; ctx.font = `bold ${Math.min(32, W/20)|0}px monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('⚓  Choose Your Faction  ⚓', W/2, 30);
    ctx.fillStyle = '#3a6888'; ctx.font = '13px monospace';
    ctx.fillText('Press 1 / 2 / 3  or  tap a card', W/2, 72);

    // Continue button (only when save exists)
    if (hasSave) {
      const bW = Math.min(220, W - 48), bH = 36;
      const bx = (W - bW) / 2, by = H - 56;
      ctx.fillStyle = '#0a1e38'; ctx.strokeStyle = '#2a70a8'; ctx.lineWidth = 1.5;
      _roundRect(bx, by, bW, bH, 8); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#50a8d8'; ctx.font = 'bold 13px monospace';
      ctx.textBaseline = 'middle';
      ctx.fillText('📂  Continue Saved Game', W/2, by + bH/2);
      Input.TouchUI.hitAreas.push({ key: 'load_game', x: bx, y: by, w: bW, h: bH });
    }

    const cardW = Math.min(230, (W - 80) / 3), cardH = Math.min(340, H - 160);
    const gap = Math.min(20, (W - cardW*3 - 40) / 2);
    const startX = (W - (cardW*3 + gap*2)) / 2;
    const cardY = (H - cardH) / 2 + 20;

    FACTION_KEYS.forEach((fk, i) => {
      const fd = FACTION_DEFS[fk];
      const cx2 = startX + i * (cardW + gap);
      // Card background
      ctx.fillStyle = '#040e1e'; ctx.strokeStyle = fd.color; ctx.lineWidth = 2;
      _roundRect(cx2, cardY, cardW, cardH, 12); ctx.fill(); ctx.stroke();
      // Accent glow
      ctx.shadowColor = fd.color; ctx.shadowBlur = 12;
      _roundRect(cx2, cardY, cardW, cardH, 12); ctx.stroke();
      ctx.shadowBlur = 0;
      // Key badge
      ctx.fillStyle = fd.color; ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(`[${i+1}]`, cx2 + cardW/2, cardY + 10);
      // Icon
      ctx.font = `${Math.min(52, cardW*0.22)|0}px serif`;
      ctx.fillText(fd.icon, cx2 + cardW/2, cardY + 34);
      // Name
      ctx.fillStyle = '#d0e8ff'; ctx.font = `bold ${Math.min(14, cardW/17)|0}px monospace`;
      ctx.fillText(fd.name, cx2 + cardW/2, cardY + 96);
      // Tagline
      ctx.fillStyle = '#4a7090'; ctx.font = `${Math.min(10, cardW/24)|0}px monospace`;
      _wrapText(fd.tagline, cx2 + cardW/2, cardY + 116, cardW - 20, 13);
      // Unit lines
      let ly = cardY + 148;
      fd.lines.forEach((line, li) => {
        ctx.fillStyle = '#2a5070'; ctx.font = 'bold 9px monospace';
        ctx.fillText(line.name + ' line', cx2 + cardW/2, ly); ly += 12;
        line.units.forEach((uk, ti) => {
          const ud = SOLDIER_TYPES[uk];
          const tierLabel = ['Tier I', 'Tier II', 'Tier III'][ti];
          ctx.fillStyle = ti === 0 ? '#60b0d8' : '#2a4050';
          ctx.font = `${ti === 0 ? 'bold ' : ''}8px monospace`;
          ctx.fillText(`${tierLabel}: ${ud?.name || uk}`, cx2 + cardW/2, ly); ly += 11;
        });
        ly += 4;
      });
      // Register hit area
      Input.TouchUI.hitAreas.push({ key: 'faction_' + fk, x: cx2, y: cardY, w: cardW, h: cardH });
    });
  }

  // ── Pause menu overlay ────────────────────────────────
  function drawPauseMenu(hasSave, justSaved) {
    // Dim the play field
    ctx.fillStyle = 'rgba(0,6,16,0.72)';
    ctx.fillRect(0, 0, W, H);

    const bW = Math.min(280, W - 48), bH = 48, gap = 12;
    const items = [
      { key: 'pause_resume', label: '▶  Resume',       color: '#40c8ff', bg: '#0e2a50', border: '#40c8ff' },
      { key: 'pause_save',   label: justSaved ? '✓  Saved!' : '💾  Save Game', color: justSaved ? '#40e880' : '#c0d8ff', bg: '#0a1e38', border: '#3060a0' },
      { key: 'pause_load',   label: '📂  Load Game',   color: hasSave  ? '#c0d8ff' : '#304050',   bg: '#0a1428', border: hasSave ? '#3060a0' : '#1a2840' },
      { key: 'pause_menu',   label: '⊗  Main Menu',   color: '#6090a8', bg: '#080e18', border: '#1a3048' },
    ];
    const totalH = items.length * bH + (items.length - 1) * gap;
    let y = (H - totalH) / 2 + 12;

    // Panel title
    ctx.fillStyle = '#d0eeff'; ctx.font = 'bold 22px monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('— PAUSED —', W/2, y - 38);
    ctx.fillStyle = '#2a5070'; ctx.font = '11px monospace';
    ctx.fillText('[P] to resume', W/2, y - 16);

    for (const item of items) {
      const x = (W - bW) / 2;
      ctx.fillStyle = item.bg;
      ctx.strokeStyle = item.border; ctx.lineWidth = 1.5;
      _roundRect(x, y, bW, bH, 8); ctx.fill(); ctx.stroke();
      ctx.fillStyle = item.color; ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(item.label, W/2, y + bH/2);
      if (item.key !== 'pause_load' || hasSave)
        Input.TouchUI.hitAreas.push({ key: item.key, x, y, w: bW, h: bH });
      y += bH + gap;
    }
  }

  function _wrapText(text, cx2, y, maxW, lineH) {
    const words = text.split(' ');
    let line = '';
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, cx2, y); y += lineH; line = word;
      } else { line = test; }
    }
    if (line) ctx.fillText(line, cx2, y);
  }

  function _roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.arcTo(x+w,y,x+w,y+r,r);
    ctx.lineTo(x+w,y+h-r); ctx.arcTo(x+w,y+h,x+w-r,y+h,r);
    ctx.lineTo(x+r,y+h); ctx.arcTo(x,y+h,x,y+h-r,r);
    ctx.lineTo(x,y+r); ctx.arcTo(x,y,x+r,y,r);
    ctx.closePath();
  }

  return {
    init, resize, clear,
    drawMap, drawBuildings, drawBldgGhost, drawInteractHint, drawBuildingPanel, drawBldgSelector,
    drawExpeditions, drawExpeditionHint, drawExpeditionPanel,
    drawForts, drawProjectiles, drawTorpedoes, drawBuildGhost, drawCamps,
    drawEnemies, drawSoldiers, drawPlayer,
    drawHUD, drawMinimap, drawWaveFlash, drawGameOver, drawTouchControls,
    drawFactionSelect, drawPauseMenu,
    get W() { return W; }, get H() { return H; },
  };
})();
