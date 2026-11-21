// Every tuning number, colour and place in one place. Azure Bay is a fixed
// 3840x2560 world; the camera shows a 1280x720 window of it, scaled to fit
// the browser window, so no rule below depends on the screen size.

export const STEP = 1 / 60;

export const WORLD = { width: 3840, height: 2560 };

/** Logical view the camera shows; the canvas scales it to the window. */
export const VIEW = { width: 1280, height: 720 };

export const SAVE_KEY = 'azure-bay.save.v1';
export const BEST_KEY = 'azure-bay.best';

export const PLAYER = {
  radius: 14,
  walkSpeed: 250,
  runSpeed: 350,
  health: 100,
  punchDamage: 14,
  punchRange: 40,
  punchCooldown: 0.35,
  pistolDamage: 26,
  pistolCooldown: 0.22,
  pistolMag: 12,
  pistolRange: 520,
};

export const CAR = {
  length: 64,
  width: 30,
  accel: 460,
  brake: 700,
  reverseMax: 180,
  steer: 2.6,
  maxSpeed: 560,
  trafficSpeed: 230,
  policeSpeed: 620,
  health: 100,
  enterRadius: 70,
};

export const PED = { radius: 11, walkSpeed: 70, runSpeed: 210 };

export const COP = { radius: 13, runSpeed: 330, bustTime: 1.2 };

export const WANTED = {
  max: 5,
  decaySeconds: 12,
  decayDistance: 450,
  spawnDistance: 750,
  despawnDistance: 1300,
  bustCashLoss: 0.1,
};

export const PALETTE = {
  grass: '#7fae62',
  grassDark: '#6f9c55',
  sand: '#e8d29a',
  water: '#3aa7c9',
  waterDeep: '#2b8fb0',
  asphalt: '#3d4450',
  asphaltDark: '#343a45',
  sidewalk: '#b9b3a4',
  lane: '#e8e4d2',
  park: '#5d9c4e',
  building: '#e8dcc8',
  roof: '#c96f4a',
  text: '#f2ede0',
  muted: '#c9c2ae',
  panel: 'rgba(16, 20, 28, 0.82)',
  accent: '#ffb03a',
  danger: '#ff5a4e',
  police: '#3a6fd8',
  marker: '#ffd23a',
  health: '#58d68d',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Fixed places in Azure Bay, all on or beside roads. */
export const PLACES = {
  garage: { x: 1000, y: 380, name: "Rosa's Garage" },
  club: { x: 2280, y: 1820, name: 'Club Lumen' },
  pier: { x: 3680, y: 1280, name: 'Pier 4' },
  safehouse: { x: 360, y: 2200, name: 'Safehouse' },
  warehouse: { x: 2920, y: 860, name: 'Dock Warehouse' },
  hospital: { x: 1640, y: 2200, name: 'St. Aurelia Hospital' },
  policeHQ: { x: 2280, y: 380, name: 'Police HQ' },
  lighthouse: { x: 3520, y: 2450, name: 'Lighthouse' },
  plaza: { x: 1920, y: 1500, name: 'Downtown Plaza' },
  playerStart: { x: 1600, y: 1280 },
};
