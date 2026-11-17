// VICE RUSH — tuning. Every number the game plays by lives here, so the feel can be
// retuned without touching the rules (world.js) or the drawing (render.js).
// Units: pixels, seconds, hit points. The screen is a fixed logical 1280 x 720; the
// renderer scales it to the window. The city is a road grid much bigger than the
// screen; the camera follows the player car.

export const STEP = 1 / 60;
export const BEST_KEY = 'vicerush.best';
export const FIELD = { width: 1280, height: 720 };

// City layout: GRID x GRID blocks separated by roads.
export const CITY = {
  blocks: 9, // blocks per side
  block: 300, // block size in px
  road: 110, // road width in px
};
export const PITCH = CITY.block + CITY.road; // 410
export const WORLD = CITY.blocks * PITCH + CITY.road; // 3800

// Road center lines: roadCenter[i] = 55 + i * 410, i in 0..9.
export function roadCenter(i) {
  return CITY.road / 2 + i * PITCH;
}

export const PLAYER = {
  radius: 15,
  accel: 480, // px/s^2
  brake: 760,
  reverseAccel: 300,
  maxSpeed: 560,
  maxReverse: 210,
  drag: 0.32, // exponential drag when no throttle
  turn: 3.1, // rad/s at full steer and speed
  grip: 8.0, // lateral grip (1/s); handbrake drops it so the car drifts
  handbrakeGrip: 2.1,
  handbrakeTurn: 1.8,
  maxHp: 120,
  crashDamageSpeed: 260, // impact speed above this hurts
  crashDamageScale: 0.03, // hp per px/s of impact above the threshold
};

export const TRAFFIC = {
  count: 9,
  speedMin: 130,
  speedMax: 185,
  radius: 15,
  colors: ['#e8e4d8', '#c96f4a', '#5b8dd9', '#d9b45b', '#7fb069', '#b08968', '#8e7cc3'],
};

export const POLICE = {
  maxActive: 4,
  accel: 520,
  maxSpeed: 470,
  turn: 3.4,
  grip: 9.0,
  radius: 15,
  ramDamage: 7, // hp per hard ram
  ramSpeed: 240,
  spawnDistance: 900, // spawn this far from the player, on a road
  despawnDistance: 1500,
  wantedDecaySeconds: 22, // -1 star per this long without an incident
  sirenInterval: 1.25,
};

export const MISSION = {
  total: 6, // deliveries to win
  timeLimit: 300, // seconds for the whole run
  basePay: 120,
  payPerPx: 0.09, // $ per px of route distance
  payCap: 420,
  cleanBonus: 50, // no damage taken during this job
  nearMissBonus: 25,
  nearMissRadius: 46,
  nearMissSpeed: 320,
  markerRadius: 48, // drive inside this to trigger pickup/dropoff
};

export const PICKUP = {
  maxWrenches: 3,
  heal: 45,
  radius: 16,
  respawnSeconds: 20,
};

export const SCORE = {
  bustBonus: 100, // disabling a police car
};

export const SHOT = {
  startSeconds: 6,
  playSeconds: 150,
  chaseSeconds: 45,
  endSeconds: 600,
};
