'use strict';

// ── Map ───────────────────────────────────────────────
const TILE  = 48;
const COLS  = 80;
const ROWS  = 60;

const T_SAND  = 0;   // seafloor — passable
const T_CORAL = 1;   // coral reef — passable (decorative)
const T_ISLAND  = 2;   // island / land — IMPASSABLE
const T_SEAWEED = 3;   // seaweed bed — passable

const TILE_FILL  = ['#0e3848', '#c04818', '#d4b464', '#1a6830'];
const TILE_SHADE = ['#081828', '#a03010', '#b09040', '#0e4020'];

// ── Entity sizes / speeds ─────────────────────────────
const PLAYER_R      = 16;
const CAMP_R        = 72;

const PLAYER_SPEED  = 220;
const PLAYER_MAX_HP = 150;
const PLAYER_REGEN  = 5;
const INTERACT_R    = 90;

// ── Soldier types ─────────────────────────────────────
const SOLDIER_TYPES = {
  dolphin: {
    name: 'Dolphin',
    color: '#4888c8', hi: '#70b0e8', lo: '#283878',
    r: 9,  hp: 60,  dmg: 12, speed: 310, range: 130, attackRate: 0.7,
    attackType: 'bite',     ranged: false,
  },
  orca: {
    name: 'Orca',
    color: '#18202c', hi: '#e0e8e0', lo: '#080e18',
    r: 13, hp: 160, dmg: 28, speed: 185, range: 100, attackRate: 1.3,
    attackType: 'ram',      ranged: false,
  },
  ray: {
    name: 'Stingray',
    color: '#5028a8', hi: '#9050d8', lo: '#281058',
    r: 11, hp: 55,  dmg: 20, speed: 250, range: 158, attackRate: 1.1,
    attackType: 'electric', ranged: false,
  },
  seal: {
    name: 'Sea Lion',
    color: '#9a8050', hi: '#c8a870', lo: '#604828',
    r: 10, hp: 75,  dmg: 9,  speed: 200, range: 215, attackRate: 0.55,
    attackType: 'shell',    ranged: true, projSpeed: 380,
  },
  // ── Mammal tier upgrades ────────────────────────────
  dolphin_t1: {
    name: 'Bottlenose Elite',
    color: '#3070c0', hi: '#50a0e8', lo: '#182860',
    r: 10, hp: 85,  dmg: 16, speed: 350, range: 135, attackRate: 0.6,
    attackType: 'bite', ranged: false,
  },
  dolphin_t2: {
    name: 'Spinner Admiral',
    color: '#1050d0', hi: '#3080f0', lo: '#081840',
    r: 11, hp: 115, dmg: 22, speed: 400, range: 140, attackRate: 0.5,
    attackType: 'bite', ranged: false,
  },
  orca_t1: {
    name: 'Bull Orca',
    color: '#080c14', hi: '#e8f0e8', lo: '#030608',
    r: 15, hp: 240, dmg: 40, speed: 205, range: 105, attackRate: 1.1,
    attackType: 'ram', ranged: false,
  },
  orca_t2: {
    name: 'Elder Bull',
    color: '#000408', hi: '#f8fdf8', lo: '#000204',
    r: 17, hp: 340, dmg: 55, speed: 220, range: 110, attackRate: 0.9,
    attackType: 'ram', ranged: false,
  },
  seal_t1: {
    name: 'Harbor Seal',
    color: '#b09060', hi: '#d8b880', lo: '#705030',
    r: 11, hp: 100, dmg: 13, speed: 225, range: 240, attackRate: 0.48,
    attackType: 'shell', ranged: true, projSpeed: 420,
  },
  seal_t2: {
    name: 'Leopard Seal',
    color: '#707850', hi: '#9098a0', lo: '#383c28',
    r: 12, hp: 140, dmg: 18, speed: 250, range: 270, attackRate: 0.4,
    attackType: 'shell', ranged: true, projSpeed: 460,
  },
  // ── Human faction ───────────────────────────────────
  diver_t0: {
    name: 'Snorkeler',
    color: '#3870a8', hi: '#60a0d0', lo: '#183858',
    r: 8, hp: 45, dmg: 12, speed: 250, range: 145, attackRate: 0.9,
    attackType: 'spear', ranged: true, projSpeed: 340,
  },
  diver_t1: {
    name: 'Scuba Diver',
    color: '#285898', hi: '#4880c0', lo: '#122848',
    r: 9, hp: 72, dmg: 20, speed: 270, range: 175, attackRate: 0.75,
    attackType: 'spear', ranged: true, projSpeed: 380,
  },
  diver_t2: {
    name: 'Navy Seal',
    color: '#103088', hi: '#2860b0', lo: '#081840',
    r: 10, hp: 105, dmg: 30, speed: 295, range: 210, attackRate: 0.6,
    attackType: 'spear', ranged: true, projSpeed: 430,
  },
  gunner_t0: {
    name: 'Rifleman',
    color: '#507040', hi: '#789060', lo: '#283820',
    r: 8, hp: 50, dmg: 26, speed: 195, range: 200, attackRate: 1.2,
    attackType: 'shoot', ranged: true, projSpeed: 460,
  },
  gunner_t1: {
    name: 'Marine',
    color: '#3a5830', hi: '#608050', lo: '#182818',
    r: 9, hp: 85, dmg: 36, speed: 210, range: 230, attackRate: 1.0,
    attackType: 'shoot', ranged: true, projSpeed: 490,
  },
  gunner_t2: {
    name: 'Commander',
    color: '#285028', hi: '#508048', lo: '#101c10',
    r: 11, hp: 145, dmg: 50, speed: 225, range: 260, attackRate: 0.85,
    attackType: 'shoot', ranged: true, projSpeed: 520,
  },
  sub_t0: {
    name: 'Scout Sub',
    color: '#405870', hi: '#607898', lo: '#202838',
    r: 13, hp: 130, dmg: 22, speed: 165, range: 120, attackRate: 1.4,
    attackType: 'torpedo', ranged: false,
  },
  sub_t1: {
    name: 'Attack Sub',
    color: '#304868', hi: '#506080', lo: '#182030',
    r: 15, hp: 215, dmg: 35, speed: 178, range: 175, attackRate: 1.2,
    attackType: 'torpedo', ranged: true, projSpeed: 400,
  },
  sub_t2: {
    name: 'Nuclear Sub',
    color: '#182840', hi: '#384e68', lo: '#0a1420',
    r: 17, hp: 310, dmg: 50, speed: 195, range: 205, attackRate: 1.0,
    attackType: 'torpedo', ranged: true, projSpeed: 450,
  },
  // ── Fish faction ─────────────────────────────────────
  ray_t1: {
    name: 'Manta Ray',
    color: '#3818a8', hi: '#6038d8', lo: '#180858',
    r: 13, hp: 75,  dmg: 26, speed: 235, range: 168, attackRate: 0.9,
    attackType: 'electric', ranged: false,
  },
  ray_t2: {
    name: 'Electric Manta',
    color: '#4018c8', hi: '#8038f0', lo: '#200868',
    r: 15, hp: 105, dmg: 36, speed: 215, range: 185, attackRate: 0.75,
    attackType: 'electric', ranged: false,
  },
  puffer_t0: {
    name: 'Puffer Fish',
    color: '#c0a010', hi: '#e8c840', lo: '#606008',
    r: 10, hp: 80,  dmg: 14, speed: 140, range: 78, attackRate: 0.6,
    attackType: 'spike', ranged: false,
  },
  puffer_t1: {
    name: 'Poison Puffer',
    color: '#a08010', hi: '#c8b030', lo: '#504008',
    r: 12, hp: 115, dmg: 22, speed: 150, range: 86, attackRate: 0.5,
    attackType: 'spike', ranged: false,
  },
  puffer_t2: {
    name: 'Toxic Globe',
    color: '#809010', hi: '#a8c030', lo: '#404808',
    r: 14, hp: 160, dmg: 32, speed: 160, range: 96, attackRate: 0.45,
    attackType: 'spike', ranged: false,
  },
  angler_t0: {
    name: 'Lure Fish',
    color: '#280838', hi: '#480860', lo: '#100418',
    r: 11, hp: 62,  dmg: 28, speed: 125, range: 180, attackRate: 1.8,
    attackType: 'lure', ranged: true, projSpeed: 270,
  },
  angler_t1: {
    name: 'Deep Angler',
    color: '#380848', hi: '#600870', lo: '#180420',
    r: 12, hp: 92,  dmg: 38, speed: 140, range: 205, attackRate: 1.5,
    attackType: 'lure', ranged: true, projSpeed: 290,
  },
  angler_t2: {
    name: 'Abyss Angler',
    color: '#480858', hi: '#780888', lo: '#200428',
    r: 13, hp: 128, dmg: 50, speed: 155, range: 230, attackRate: 1.2,
    attackType: 'lure', ranged: true, projSpeed: 310,
  },
};
const SOLDIER_TYPE_KEYS = ['dolphin', 'orca', 'ray', 'seal'];

// ── Enemy types ───────────────────────────────────────
const ENEMY_TYPES = {
  mermaid: {
    name: 'Mermaid',
    color: '#18b080', hi: '#30d0a0',
    r: 10, hpBase: 50,  dmg: 14, speed: 88,  attackRate: 1.0,
    attackType: 'trident', ranged: false,
  },
  shark: {
    name: 'Shark',
    color: '#507090', hi: '#708ab0',
    r: 13, hpBase: 90,  dmg: 26, speed: 118, attackRate: 1.1,
    attackType: 'bite',    ranged: false,
  },
  anglerfish: {
    name: 'Anglerfish',
    color: '#3c1850', hi: '#602878',
    r: 12, hpBase: 75,  dmg: 20, speed: 50,  attackRate: 2.5,
    attackType: 'lure',    ranged: true, projSpeed: 295,
  },
  jellyfish: {
    name: 'Jellyfish',
    color: '#c030b0', hi: '#e050d0',
    r: 11, hpBase: 38,  dmg: 30, speed: 60,  attackRate: 0.8,
    attackType: 'sting',   ranged: false,
  },
  swordfish: {
    name: 'Swordfish',
    color: '#1c4878', hi: '#2c6898',
    r: 9,  hpBase: 42,  dmg: 13, speed: 158, attackRate: 0.7,
    attackType: 'charge',  ranged: false,
  },
};

// ── Fortification definitions ─────────────────────────
const FORT_DEFS = {
  wall:      { name: 'Coral Wall',   cost: { wood: 20, iron: 0  }, hp: 350, range: 0,   dmg: 0,  fireRate: 0   },
  tower:     { name: 'Torpedo Post', cost: { wood: 30, iron: 20 }, hp: 150, range: 210, dmg: 30, fireRate: 1.8 },
  barricade: { name: 'Bubble Net',   cost: { wood: 10, iron: 0  }, hp: 100, range: 0,   dmg: 0,  fireRate: 0   },
};
const FORT_KEYS = ['wall', 'tower', 'barricade'];

// ── Resource display ──────────────────────────────────
const RES_DISPLAY = {
  food: { icon: '🐟', name: 'Rations' },
  wood: { icon: '🪝', name: 'Salvage' },
  coal: { icon: '⛽', name: 'Fuel'    },
  iron: { icon: '🔩', name: 'Metal'   },
};

// ── Building definitions ──────────────────────────────
const BLDG_DEFS = {
  chief_hall: {
    name: 'Nautilus Command', icon: '⚓', size: 3, maxLevel: 10,
    desc: 'Heart of your undersea domain. Caps all structure levels.',
    baseCost: { food: 0, wood: 300, coal: 0, iron: 0 },
    costScale: 1.8, baseBuildTime: 45, timeScale: 1.7,
    hp: 800, color: '#1a3860', hi: '#2a5890', lo: '#0a1830',
    bonus: l => `Structure cap: ${l}\nCrew cap: ${l*50+100}`,
    produces: null,
  },
  furnace: {
    name: 'Thermal Vent', icon: '♨️', size: 2, maxLevel: 10,
    desc: 'Geothermal power for the entire base complex.',
    baseCost: { food: 0, wood: 120, coal: 0, iron: 40 },
    costScale: 1.6, baseBuildTime: 30, timeScale: 1.55,
    hp: 400, color: '#7a1808', hi: '#b03010', lo: '#3a0800',
    bonus: l => `Power ${l*10}/10 · Fuel burn: ${(0.4*l).toFixed(1)}/s`,
    produces: null, consumesCoal: true,
  },
  farm: {
    name: 'Fish Farm', icon: '🐠', size: 2, maxLevel: 10,
    desc: 'Breeds fish to sustain the crew.',
    baseCost: { food: 0, wood: 80, coal: 0, iron: 0 },
    costScale: 1.5, baseBuildTime: 20, timeScale: 1.5,
    hp: 200, color: '#1a6848', hi: '#2a9868', lo: '#0a3828',
    bonus: l => `+${l*2} rations/s`,
    produces: { resource: 'food', rate: 2 },
  },
  sawmill: {
    name: 'Salvage Bay', icon: '🪝', size: 2, maxLevel: 10,
    desc: 'Recovers materials from sunken wrecks on the seafloor.',
    baseCost: { food: 50, wood: 0, coal: 0, iron: 20 },
    costScale: 1.5, baseBuildTime: 20, timeScale: 1.5,
    hp: 200, color: '#7a5030', hi: '#a07050', lo: '#403010',
    bonus: l => `+${(l*1.5).toFixed(1)} salvage/s`,
    produces: { resource: 'wood', rate: 1.5 },
  },
  coal_mine: {
    name: 'Fuel Cell', icon: '⛽', size: 2, maxLevel: 10,
    desc: 'Extracts fuel from methane vents below the seafloor.',
    baseCost: { food: 30, wood: 100, coal: 0, iron: 0 },
    costScale: 1.5, baseBuildTime: 22, timeScale: 1.5,
    hp: 250, color: '#181828', hi: '#303050', lo: '#080810',
    bonus: l => `+${(l*1.2).toFixed(1)} fuel/s`,
    produces: { resource: 'coal', rate: 1.2 },
  },
  iron_mine: {
    name: 'Ore Extractor', icon: '🔩', size: 2, maxLevel: 10,
    desc: 'Drills mineral deposits from the ocean floor.',
    baseCost: { food: 30, wood: 80, coal: 30, iron: 0 },
    costScale: 1.55, baseBuildTime: 25, timeScale: 1.55,
    hp: 250, color: '#384860', hi: '#507080', lo: '#182030',
    bonus: l => `+${(l*0.8).toFixed(1)} metal/s`,
    produces: { resource: 'iron', rate: 0.8 },
  },
  barracks: {
    name: 'Training Pool', icon: '🐬', size: 2, maxLevel: 10,
    desc: 'Trains marine creatures for combat duty.',
    baseCost: { food: 100, wood: 150, coal: 0, iron: 50 },
    costScale: 1.6, baseBuildTime: 30, timeScale: 1.6,
    hp: 350, color: '#186888', hi: '#2888b0', lo: '#083848',
    bonus: l => `Crew HP +${l*10} · ATK +${l}`,
    produces: null, militaryBonus: true,
  },
  hospital: {
    name: 'Healing Pod', icon: '💊', size: 2, maxLevel: 10,
    desc: 'Regenerates wounded crew members over time.',
    baseCost: { food: 80, wood: 80, coal: 0, iron: 40 },
    costScale: 1.55, baseBuildTime: 28, timeScale: 1.55,
    hp: 250, color: '#a0d0e0', hi: '#c0e8f8', lo: '#607080',
    bonus: l => `Crew regen: +${l*2} hp/s`,
    produces: null, healsUnits: true,
  },
  warehouse: {
    name: 'Supply Hold', icon: '📦', size: 2, maxLevel: 10,
    desc: 'Expands storage capacity for all resources.',
    baseCost: { food: 0, wood: 120, coal: 0, iron: 60 },
    costScale: 1.5, baseBuildTime: 25, timeScale: 1.5,
    hp: 300, color: '#786040', hi: '#a08060', lo: '#503820',
    bonus: l => `Resource cap ×${(1+l*0.4).toFixed(1)}`,
    produces: null, affectsCapacity: true,
  },
  research_lab: {
    name: 'Deep Lab', icon: '🔬', size: 2, maxLevel: 10,
    desc: 'Advances Nautilus technology and crew effectiveness.',
    baseCost: { food: 0, wood: 100, coal: 50, iron: 80 },
    costScale: 1.6, baseBuildTime: 35, timeScale: 1.65,
    hp: 200, color: '#302870', hi: '#504890', lo: '#181040',
    bonus: l => `All production +${l*5}% · Crew ATK +${l*3}%`,
    produces: null, researchBonus: true,
  },
  city_wall: {
    name: 'Reef Barrier', icon: '🪸', size: 2, maxLevel: 10,
    desc: 'Hardened coral fortification — absorbs heavy punishment.',
    baseCost: { food: 0, wood: 200, coal: 0, iron: 100 },
    costScale: 1.6, baseBuildTime: 35, timeScale: 1.6,
    hp: 1000, color: '#585868', hi: '#787888', lo: '#383848',
    bonus: l => `Defense +${l*500} · HP: ${l*1000}`,
    produces: null,
  },
  tavern: {
    name: 'The Galley', icon: '🍖', size: 2, maxLevel: 10,
    desc: 'Crew quarters boost morale and ration output.',
    baseCost: { food: 100, wood: 100, coal: 0, iron: 20 },
    costScale: 1.5, baseBuildTime: 22, timeScale: 1.5,
    hp: 200, color: '#784818', hi: '#a06830', lo: '#482808',
    bonus: l => `+${l} rations/s · Hero slots: ${Math.ceil(l/3)}`,
    produces: { resource: 'food', rate: 1 },
  },
};

const BLDG_KEYS = [
  'chief_hall', 'furnace',      'farm',         'sawmill',
  'coal_mine',  'iron_mine',    'barracks',     'hospital',
  'warehouse',  'research_lab', 'city_wall',    'tavern',
];

// ── Economy ───────────────────────────────────────────
const WOOD_RATE = 1.0;
const IRON_RATE = 0.3;
const FOOD_RATE = 0.5;
const COAL_RATE = 0.2;
const PROD_TICK = 1.0;

// ── Waves ─────────────────────────────────────────────
const WAVE_INTERVAL = 50;
const WAVE_BASE     = 4;
const WAVE_GROWTH   = 3;

// ── Camera / UI ───────────────────────────────────────
const CAM_LERP  = 7;
const MM_W      = 170;
const MM_H      = 128;
const MM_MARGIN = 12;

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

// ── Expedition sites ──────────────────────────────────
const EXPEDITION_DEFS = [
  { id: 'wreck',    name: 'Sunken Wreck',       icon: '🚢', color: '#3a4858',
    desc: 'A merchant vessel on the seafloor. Salvage its cargo.',
    reward: { food: 150, wood: 80  }, cost: { food: 20 }, cooldown: 90  },
  { id: 'kelp',     name: 'Kelp Forest',         icon: '🌿', color: '#1a4828',
    desc: 'Dense kelp growth harbours biomass and hidden salvage.',
    reward: { wood: 200, coal: 50  }, cost: { food: 30 }, cooldown: 120 },
  { id: 'vent',     name: 'Hydrothermal Vent',   icon: '🌋', color: '#381808',
    desc: 'Mineral-rich vents — fuel and metal for the taking.',
    reward: { coal: 120, iron: 80  }, cost: { food: 50 }, cooldown: 150 },
  { id: 'colony',   name: 'Deep Colony',         icon: '🏘️', color: '#2a2808',
    desc: 'Aid a struggling undersea outpost in exchange for supplies.',
    reward: { food: 100, iron: 60  }, cost: { food: 60 }, cooldown: 180 },
  { id: 'iceshelf', name: 'Ice Shelf',           icon: '🧊', color: '#102840',
    desc: 'Ancient ice holds rare metal veins near the surface.',
    reward: { iron: 150, coal: 40  }, cost: { food: 40 }, cooldown: 140 },
];

// ── Barracks training ─────────────────────────────────
const TRAIN_COST = { food: 50, iron: 20 };
const TRAIN_TIME = 20;

// ── Hex geometry ──────────────────────────────────────
const HEX_R       = 28;   // circumradius (pointy-top)
const HEX_PITCH_Y = 42;   // vertical center-to-center = 1.5 × HEX_R
const MAP_W = COLS * TILE + (TILE >> 1);        // ≈ 3864
const MAP_H = ROWS * HEX_PITCH_Y + HEX_R * 2;  // ≈ 2576

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

// Returns array of [c, r] tile coords occupied by a building.
// size=3 uses a hex flower (center + 6 neighbors); size≤2 uses an axial quad.
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

// ── Faction / tech tree ───────────────────────────────
const FACTION_DEFS = {
  mammal: {
    name: 'Pod Alliance', icon: '🐬', color: '#2060b8',
    tagline: 'Agile ocean mammals — speed and numbers.',
    lines: [
      { name: 'Dolphin', units: ['dolphin',   'dolphin_t1', 'dolphin_t2'] },
      { name: 'Orca',    units: ['orca',       'orca_t1',    'orca_t2']   },
      { name: 'Seal',    units: ['seal',       'seal_t1',    'seal_t2']   },
    ],
  },
  human: {
    name: 'Nautilus Corps', icon: '⚓', color: '#3060a8',
    tagline: 'Human marines — superior range and firepower.',
    lines: [
      { name: 'Diver',  units: ['diver_t0',  'diver_t1',  'diver_t2']  },
      { name: 'Gunner', units: ['gunner_t0', 'gunner_t1', 'gunner_t2'] },
      { name: 'Sub',    units: ['sub_t0',    'sub_t1',    'sub_t2']    },
    ],
  },
  fish: {
    name: 'Deep Shoal', icon: '🐡', color: '#186850',
    tagline: 'Ancient deep-sea creatures — high burst damage.',
    lines: [
      { name: 'Ray',    units: ['ray',       'ray_t1',    'ray_t2']    },
      { name: 'Puffer', units: ['puffer_t0', 'puffer_t1', 'puffer_t2'] },
      { name: 'Angler', units: ['angler_t0', 'angler_t1', 'angler_t2'] },
    ],
  },
};
const FACTION_KEYS = ['mammal', 'human', 'fish'];

const RESEARCH_COST = {
  1: { food: 150, iron:  80, coal:  40 },
  2: { food: 350, iron: 180, coal: 100 },
};
