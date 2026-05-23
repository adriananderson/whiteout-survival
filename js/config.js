'use strict';

// ── Map ───────────────────────────────────────────────
const TILE  = 48;
const COLS  = 80;
const ROWS  = 60;

const T_SAND    = 0;
const T_CORAL   = 1;
const T_ISLAND  = 2;
const T_SEAWEED = 3;

const TILE_FILL  = ['#0e3848', '#c04818', '#d4b464', '#1a6830'];
const TILE_SHADE = ['#081828', '#a03010', '#b09040', '#0e4020'];

// ── Entity sizes / speeds ─────────────────────────────
const PLAYER_R      = 16;
const CAMP_R        = 72;
const PLAYER_SPEED  = 220;
const PLAYER_MAX_HP = 150;
const PLAYER_REGEN  = 5;
const INTERACT_R    = 90;

// ── Economy ───────────────────────────────────────────
const WOOD_RATE = 1.0;
const IRON_RATE = 0.3;
const FOOD_RATE = 0.5;
const COAL_RATE = 0.2;
const PROD_TICK = 1.0;
const BLDG_HEAL_RATE = 3;

// ── Waves ─────────────────────────────────────────────
const WAVE_INTERVAL = 50;
const WAVE_BASE     = 3;
const WAVE_GROWTH   = 2;

// ── Camera / UI ───────────────────────────────────────
const CAM_LERP  = 7;
const MM_W      = 170;
const MM_H      = 128;
const MM_MARGIN = 12;

// ── Hex geometry ──────────────────────────────────────
const HEX_R       = 28;
const HEX_PITCH_Y = 42;
const MAP_W = COLS * TILE + (TILE >> 1);
const MAP_H = ROWS * HEX_PITCH_Y + HEX_R * 2;

// ── Helpers ───────────────────────────────────────────
function fmtNum(n) {
  n = Math.floor(n);
  if (n >= 1e6) return (n/1e6).toFixed(1)+'M';
  if (n >= 1e3) return (n/1e3).toFixed(1)+'K';
  return String(n);
}

function fmtTime(s) {
  s = Math.ceil(s);
  if (s < 60) return s + 's';
  if (s < 3600) return Math.floor(s/60) + 'm ' + (s%60) + 's';
  return Math.floor(s/3600) + 'h ' + Math.floor((s%3600)/60) + 'm';
}

function getBldgUpgradeCost(def, level) {
  const scale = Math.pow(def.costScale, level - 1);
  const cost = {};
  for (const [r, a] of Object.entries(def.baseCost)) cost[r] = Math.floor(a * scale);
  return cost;
}

function canAfford(player, cost) {
  return Object.entries(cost).every(([r, a]) => (player[r] ?? 0) >= a);
}

function hexCenter(c, r) {
  return {
    x: c * TILE + ((r & 1) ? (TILE >> 1) : 0),
    y: r * HEX_PITCH_Y + HEX_R,
  };
}

function pixelToHex(px, py) {
  let r = Math.round((py - HEX_R) / HEX_PITCH_Y);
  r = r < 0 ? 0 : r > ROWS - 1 ? ROWS - 1 : r;
  const xOff = (r & 1) ? (TILE >> 1) : 0;
  let c = Math.round((px - xOff) / TILE);
  c = c < 0 ? 0 : c > COLS - 1 ? COLS - 1 : c;
  return { c, r };
}

function buildingTiles(col, row, size) {
  if (size === 3) {
    const dirs = (row & 1)
      ? [[0,0],[1,0],[-1,0],[1,-1],[0,-1],[1,1],[0,1]]
      : [[0,0],[1,0],[-1,0],[0,-1],[-1,-1],[0,1],[-1,1]];
    return dirs.map(([dc, dr]) => [col+dc, row+dr]);
  }
  const tiles = [];
  for (let dc = 0; dc < size; dc++)
    for (let dr = 0; dr < size; dr++)
      tiles.push([col+dc, row+dr]);
  return tiles;
}
