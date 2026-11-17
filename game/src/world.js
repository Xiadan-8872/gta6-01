// VICE RUSH — the rules. A top-down open city: drive a car, run jobs (pick up, drop
// off), dodge traffic, outrun the police. All randomness comes from the seeded
// generator passed in, so a ?seed=N run plays the same way every time. The world
// advances in fixed 1/60 s steps; the renderer only paints what is here.

import { CITY, MISSION, PICKUP, PLAYER, POLICE, PITCH, SCORE, TRAFFIC, WORLD, roadCenter } from './config.js';
import { pickWeighted, shuffle } from './random.js';

export const EVENT_PICKUP = 1;
export const EVENT_DELIVER = 2;
export const EVENT_CRASH = 4;
export const EVENT_BUSTED = 8;
export const EVENT_WIN = 16;
export const EVENT_OVER = 32;
export const EVENT_WANTED_UP = 64;
export const EVENT_NEAR_MISS = 128;
export const EVENT_SIREN = 256;
export const EVENT_HORN = 512;
export const EVENT_SKID = 1024;
export const EVENT_REPAIR = 2048;

const TAU = Math.PI * 2;
const NODES = CITY.blocks + 1; // intersections per side (10)

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

function angleDiff(a, b) {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

function nodeIndex(i, j) {
  return j * NODES + i;
}

function nodePos(n) {
  const i = n % NODES;
  const j = Math.floor(n / NODES);
  return { x: roadCenter(i), y: roadCenter(j) };
}

const BUILDING_COLORS = ['#2b2d5c', '#3d2b5c', '#233a5c', '#4a2b4d', '#2c4a4d', '#59332b'];
const NEON_COLORS = ['#ff2d95', '#00e5ff', '#ffe600', '#7cff6b', '#ff9f1c'];
const SIGN_TEXTS = ['VICE', 'HOTEL', '24H', 'TACOS', 'NEON', 'MOTEL', 'PIZZA', 'CLUB', 'OCEAN', 'BAR'];

export function createWorld(random) {
  const state = {
    time: 0,
    phase: 'title', // title | play | over | win
    overReason: '',
    player: null,
    traffic: [],
    police: [],
    buildings: [],
    signs: [],
    wrenches: [],
    particles: [],
    skids: [],
    texts: [],
    job: null,
    cash: 0,
    deliveries: 0,
    timeLeft: MISSION.timeLimit,
    wanted: 0,
    wantedTimer: 0,
    sirenTimer: 0,
    wrenchTimer: 0,
    best: 0,
    stats: { nearMiss: 0, crashes: 0, busted: 0, delivered: 0 },
    shake: 0,
    hornCooldown: 0,
  };

  // ---- city generation (seeded, once) ----
  function buildCity() {
    state.buildings = [];
    state.signs = [];
    for (let bi = 0; bi < CITY.blocks; bi += 1) {
      for (let bj = 0; bj < CITY.blocks; bj += 1) {
        const x0 = roadCenter(bi) + CITY.road / 2;
        const y0 = roadCenter(bj) + CITY.road / 2;
        // One big building per block, sometimes split into two.
        const split = random() < 0.3;
        const color = BUILDING_COLORS[Math.floor(random() * BUILDING_COLORS.length)];
        const neon = NEON_COLORS[Math.floor(random() * NEON_COLORS.length)];
        if (split && random() < 0.6) {
          const w = CITY.block * (0.42 + random() * 0.1);
          state.buildings.push({ x: x0 + 14, y: y0 + 14, w, h: CITY.block - 28, color, neon });
          state.buildings.push({
            x: x0 + w + 28, y: y0 + 14, w: CITY.block - w - 42, h: CITY.block - 28, color, neon,
          });
        } else {
          const inset = 12 + random() * 16;
          state.buildings.push({
            x: x0 + inset, y: y0 + inset, w: CITY.block - inset * 2, h: CITY.block - inset * 2, color, neon,
          });
        }
        if (random() < 0.45) {
          state.signs.push({
            x: x0 + CITY.block / 2,
            y: y0 + 8,
            text: SIGN_TEXTS[Math.floor(random() * SIGN_TEXTS.length)],
            color: NEON_COLORS[Math.floor(random() * NEON_COLORS.length)],
          });
        }
      }
    }
  }

  function nearestNode(x, y) {
    const i = clamp(Math.round((x - CITY.road / 2) / PITCH), 0, NODES - 1);
    const j = clamp(Math.round((y - CITY.road / 2) / PITCH), 0, NODES - 1);
    return nodeIndex(i, j);
  }

  // BFS route over the intersection graph; returns waypoint positions.
  function routeTo(x, y, tx, ty) {
    const start = nearestNode(x, y);
    const goal = nearestNode(tx, ty);
    if (start === goal) return [{ x: tx, y: ty }];
    const prev = new Map();
    const queue = [start];
    prev.set(start, -1);
    while (queue.length > 0) {
      const n = queue.shift();
      if (n === goal) break;
      const i = n % NODES;
      const j = Math.floor(n / NODES);
      const neighbors = [];
      if (i > 0) neighbors.push(n - 1);
      if (i < NODES - 1) neighbors.push(n + 1);
      if (j > 0) neighbors.push(n - NODES);
      if (j < NODES - 1) neighbors.push(n + NODES);
      for (const nb of neighbors) {
        if (!prev.has(nb)) {
          prev.set(nb, n);
          queue.push(nb);
        }
      }
    }
    const path = [];
    let n = goal;
    while (n !== -1 && n !== undefined) {
      path.unshift(nodePos(n));
      n = prev.get(n);
    }
    path.push({ x: tx, y: ty });
    return path;
  }

  function randomNodeFarFrom(x, y, minDist) {
    for (let tries = 0; tries < 40; tries += 1) {
      const i = Math.floor(random() * NODES);
      const j = Math.floor(random() * NODES);
      const px = roadCenter(i);
      const py = roadCenter(j);
      if (Math.hypot(px - x, py - y) >= minDist) return { x: px, y: py };
    }
    return { x: roadCenter(0), y: roadCenter(0) };
  }

  function spawnTrafficCar(farFromPlayer) {
    const p = state.player;
    let x;
    let y;
    for (let tries = 0; tries < 30; tries += 1) {
      const i = Math.floor(random() * NODES);
      const j = Math.floor(random() * NODES);
      x = roadCenter(i);
      y = roadCenter(j);
      if (!farFromPlayer || Math.hypot(x - p.x, y - p.y) > 700) break;
    }
    const node = nearestNode(x, y);
    return {
      x, y,
      angle: random() * TAU,
      vx: 0, vy: 0,
      speed: TRAFFIC.speedMin + random() * (TRAFFIC.speedMax - TRAFFIC.speedMin),
      color: TRAFFIC.colors[Math.floor(random() * TRAFFIC.colors.length)],
      node,
      next: node,
      offset: (random() - 0.5) * 36,
      nearMissed: 0,
    };
  }

  function spawnWrench() {
    const p = randomNodeFarFrom(state.player.x, state.player.y, 500);
    return { x: p.x + (random() - 0.5) * 40, y: p.y + (random() - 0.5) * 40, active: true };
  }

  function newJob() {
    const p = state.player;
    const pickup = randomNodeFarFrom(p.x, p.y, 1100);
    let drop = randomNodeFarFrom(pickup.x, pickup.y, 900);
    if (Math.hypot(drop.x - p.x, drop.y - p.y) < 500) drop = randomNodeFarFrom(p.x, p.y, 1200);
    const route = routeTo(pickup.x, pickup.y, drop.x, drop.y);
    let dist = 0;
    for (let i = 1; i < route.length; i += 1) dist += Math.hypot(route[i].x - route[i - 1].x, route[i].y - route[i - 1].y);
    const pay = Math.min(MISSION.basePay + Math.round(dist * MISSION.payPerPx), MISSION.payCap);
    state.job = { phase: 'toPickup', pickup, drop, pay, clean: true, dist };
  }

  function addWanted(n, events) {
    if (n <= 0) return events;
    const before = state.wanted;
    state.wanted = Math.min(5, state.wanted + n);
    state.wantedTimer = 0;
    if (state.wanted > before) return events | EVENT_WANTED_UP;
    return events;
  }

  function burst(x, y, color, count, speed) {
    for (let i = 0; i < count; i += 1) {
      const a = random() * TAU;
      const s = speed * (0.4 + random() * 0.8);
      state.particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.4 + random() * 0.4,
        maxLife: 0.8,
        color,
        size: 2 + random() * 3,
      });
    }
  }

  function addText(x, y, text, color) {
    state.texts.push({ x, y, text, color: color || '#ffffff', life: 1.4 });
  }

  // ---- car physics: velocity-vector model with lateral grip, so the handbrake drifts.
  function stepCar(car, dt, throttle, steer, handbrake, maxSpeed) {
    const fx = Math.cos(car.angle);
    const fy = Math.sin(car.angle);
    const fSpeed = car.vx * fx + car.vy * fy;
    const latX = -fy;
    const latY = fx;
    const lSpeed = car.vx * latX + car.vy * latY;
    // Engine / brake force along the heading.
    let accel = 0;
    if (throttle > 0) accel = PLAYER.accel * throttle;
    else if (throttle < 0) {
      accel = fSpeed > 30 ? -PLAYER.brake : PLAYER.reverseAccel * throttle;
    }
    const grip = handbrake ? PLAYER.handbrakeGrip : PLAYER.grip;
    const newLat = lSpeed * Math.exp(-grip * dt);
    let newF = fSpeed + accel * dt;
    newF *= Math.exp(-PLAYER.drag * dt * (throttle === 0 ? 1.6 : 0.6));
    newF = clamp(newF, -PLAYER.maxReverse, maxSpeed);
    // Steering: sharper with speed, much sharper with the handbrake.
    const steerAuthority = clamp(Math.abs(newF) / 220, 0, 1) * (handbrake ? PLAYER.handbrakeTurn : 1);
    car.angle += steer * PLAYER.turn * steerAuthority * dt * (newF >= 0 ? 1 : -1);
    const nfx = Math.cos(car.angle);
    const nfy = Math.sin(car.angle);
    car.vx = nfx * newF + -nfy * newLat;
    car.vy = nfy * newF + nfx * newLat;
    car.x += car.vx * dt;
    car.y += car.vy * dt;
    car.x = clamp(car.x, 20, WORLD - 20);
    car.y = clamp(car.y, 20, WORLD - 20);
    return newF;
  }

  // Circle vs building AABBs. Returns impact speed into the wall (0 when no hit).
  function collideBuildings(car, radius) {
    let worst = 0;
    for (const b of state.buildings) {
      const cx = clamp(car.x, b.x, b.x + b.w);
      const cy = clamp(car.y, b.y, b.y + b.h);
      const dx = car.x - cx;
      const dy = car.y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 >= radius * radius) continue;
      let nx;
      let ny;
      let depth;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        nx = dx / d;
        ny = dy / d;
        depth = radius - d;
      } else {
        // Center inside the block: push out along the smallest penetration axis.
        const left = car.x - b.x;
        const right = b.x + b.w - car.x;
        const top = car.y - b.y;
        const bottom = b.y + b.h - car.y;
        const m = Math.min(left, right, top, bottom);
        if (m === left) { nx = -1; ny = 0; depth = left + radius; } else if (m === right) { nx = 1; ny = 0; depth = right + radius; } else if (m === top) { nx = 0; ny = -1; depth = top + radius; } else { nx = 0; ny = 1; depth = bottom + radius; }
      }
      car.x += nx * depth;
      car.y += ny * depth;
      const into = car.vx * nx + car.vy * ny;
      if (into < 0) {
        worst = Math.max(worst, -into);
        car.vx -= nx * into * 1.5;
        car.vy -= ny * into * 1.5;
      }
    }
    return worst;
  }

  // Circle vs circle with a simple impulse. Returns the closing speed.
  function collideCars(a, b, ra, rb) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 0.001;
    const min = ra + rb;
    if (d >= min) return 0;
    const nx = dx / d;
    const ny = dy / d;
    const overlap = (min - d) / 2;
    a.x -= nx * overlap;
    a.y -= ny * overlap;
    b.x += nx * overlap;
    b.y += ny * overlap;
    const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (rel < 0) {
      const imp = -rel * 0.7;
      a.vx -= nx * imp;
      a.vy -= ny * imp;
      b.vx += nx * imp;
      b.vy += ny * imp;
      return -rel;
    }
    return 0;
  }

  function damagePlayer(amount, events) {
    const p = state.player;
    if (state.phase !== 'play') return events;
    p.hp -= amount;
    if (state.job) state.job.clean = false;
    if (p.hp <= 0) {
      p.hp = 0;
      state.phase = 'over';
      state.overReason = 'wrecked';
      return events | EVENT_OVER;
    }
    return events;
  }

  function stepTraffic(dt) {
    const p = state.player;
    for (const t of state.traffic) {
      const target = nodePos(t.next);
      // Drive on the right-hand side of the road: offset perpendicular to travel.
      const tx = target.x + (t.next % NODES === t.node % NODES ? t.offset : 0);
      const ty = target.y + (t.next % NODES !== t.node % NODES ? t.offset : 0);
      const dx = tx - t.x;
      const dy = ty - t.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 34) {
        const i = t.next % NODES;
        const j = Math.floor(t.next / NODES);
        const options = [];
        if (i > 0) options.push(t.next - 1);
        if (i < NODES - 1) options.push(t.next + 1);
        if (j > 0) options.push(t.next - NODES);
        if (j < NODES - 1) options.push(t.next + NODES);
        const back = t.node;
        const forward = options.filter((n) => n !== back);
        t.node = t.next;
        t.next = forward.length > 0 && random() < 0.8
          ? forward[Math.floor(random() * forward.length)]
          : options[Math.floor(random() * options.length)];
        continue;
      }
      const desired = Math.atan2(dy, dx);
      const steer = clamp(angleDiff(desired, t.angle) * 2.2, -1, 1);
      const throttle = Math.abs(angleDiff(desired, t.angle)) > 1.9 ? 0.25 : 1;
      stepCar(t, dt, throttle, steer, false, t.speed);
      collideBuildings(t, TRAFFIC.radius);
      if (t.nearMissed > 0) t.nearMissed -= dt;
      // Near-miss bonus for the player: close, fast, no contact.
      const pd = Math.hypot(p.x - t.x, p.y - t.y);
      const pSpeed = Math.hypot(p.vx, p.vy);
      if (pd < MISSION.nearMissRadius + 18 && pd > TRAFFIC.radius + PLAYER.radius + 2
        && pSpeed > MISSION.nearMissSpeed && t.nearMissed <= 0) {
        t.nearMissed = 3;
        state.cash += MISSION.nearMissBonus;
        state.stats.nearMiss += 1;
        addText(p.x, p.y - 30, `NEAR MISS +$${MISSION.nearMissBonus}`, '#7cff6b');
      }
    }
    // Keep traffic near the player: recycle cars that drifted far away.
    for (let i = 0; i < state.traffic.length; i += 1) {
      const t = state.traffic[i];
      if (Math.hypot(t.x - p.x, t.y - p.y) > 1700) state.traffic[i] = spawnTrafficCar(true);
    }
  }

  function stepPolice(dt, events) {
    const p = state.player;
    const want = Math.min(state.wanted, POLICE.maxActive);
    // Spawn to match the wanted level: far from the player, and not on top of
    // another police car (two cars on the same node drive as one).
    while (state.police.length < want) {
      let x;
      let y;
      for (let tries = 0; tries < 30; tries += 1) {
        const n = Math.floor(random() * NODES * NODES);
        const pos = nodePos(n);
        if (Math.hypot(pos.x - p.x, pos.y - p.y) <= POLICE.spawnDistance) continue;
        if (state.police.some((c) => Math.hypot(c.x - pos.x, c.y - pos.y) < 150)) continue;
        x = pos.x;
        y = pos.y;
        break;
      }
      if (x === undefined) break;
      state.police.push({
        x, y, angle: 0, vx: 0, vy: 0, hp: 60, disabled: 0, hitCooldown: 0, color: '#1c2733',
        route: [], routeTimer: 0,
      });
    }
    // Despawn the extras when the heat dies down.
    while (state.police.length > want) state.police.pop();
    for (const c of state.police) {
      if (c.hitCooldown > 0) c.hitCooldown -= dt;
      if (c.disabled > 0) {
        c.disabled -= dt;
        c.vx *= 0.9;
        c.vy *= 0.9;
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        continue;
      }
      // Chase along the roads to the player (a straight line through the blocks
      // would wedge the car on a building), and drive straight at them for the
      // ram once close enough to touch.
      const distToPlayer = Math.hypot(p.x - c.x, p.y - c.y);
      let desired;
      if (distToPlayer < 260) {
        desired = Math.atan2(p.y + p.vy * 0.35 - c.y, p.x + p.vx * 0.35 - c.x);
      } else {
        c.routeTimer -= dt;
        if (!c.route || c.route.length === 0 || c.routeTimer <= 0) {
          c.route = routeTo(c.x, c.y, p.x, p.y);
          c.routeTimer = 0.7;
        }
        while (c.route.length > 1 && Math.hypot(c.route[0].x - c.x, c.route[0].y - c.y) < 60) {
          c.route.shift();
        }
        const wp = c.route[0] || { x: p.x, y: p.y };
        desired = Math.atan2(wp.y - c.y, wp.x - c.x);
      }
      const diff = angleDiff(desired, c.angle);
      const steer = clamp(diff * 2.6, -1, 1);
      const throttle = Math.abs(diff) > 2.2 ? 0.35 : 1;
      stepCar(c, dt, throttle, steer, Math.abs(diff) > 2.6, POLICE.maxSpeed + state.wanted * 12);
      collideBuildings(c, POLICE.radius);
      // Ram the player.
      const impact = collideCars(c, p, POLICE.radius, PLAYER.radius);
      if (impact > POLICE.ramSpeed && c.hitCooldown <= 0) {
        c.hitCooldown = 2.2;
        events = damagePlayer(POLICE.ramDamage, events);
        burst(p.x, p.y, '#ffb020', 10, 220);
        state.shake = Math.max(state.shake, 7);
        events |= EVENT_CRASH;
      }
      if (Math.hypot(c.x - p.x, c.y - p.y) > POLICE.despawnDistance + 600 && state.wanted === 0) {
        c.disabled = -1; // flagged for removal below
      }
    }
    state.police = state.police.filter((c) => c.disabled >= 0);
    return events;
  }

  function stepJob(dt, events) {
    const p = state.player;
    const job = state.job;
    if (!job || state.phase !== 'play') return events;
    const target = job.phase === 'toPickup' ? job.pickup : job.drop;
    const d = Math.hypot(p.x - target.x, p.y - target.y);
    if (d < MISSION.markerRadius) {
      if (job.phase === 'toPickup') {
        job.phase = 'toDrop';
        addText(p.x, p.y - 34, 'PICKED UP — GO!', '#00e5ff');
        return events | EVENT_PICKUP;
      }
      // Delivered.
      let pay = job.pay;
      if (job.clean) pay += MISSION.cleanBonus;
      state.cash += pay;
      state.deliveries += 1;
      state.stats.delivered += 1;
      addText(p.x, p.y - 34, `DELIVERED +$${pay}`, '#ffe600');
      events |= EVENT_DELIVER;
      if (state.deliveries >= MISSION.total) {
        state.phase = 'win';
        return events | EVENT_WIN;
      }
      newJob();
    }
    return events;
  }

  function stepWrenches(dt) {
    const p = state.player;
    for (const w of state.wrenches) {
      if (!w.active) continue;
      if (Math.hypot(p.x - w.x, p.y - w.y) < 30) {
        w.active = false;
        p.hp = Math.min(PLAYER.maxHp, p.hp + PICKUP.heal);
        addText(p.x, p.y - 30, `REPAIRED +${PICKUP.heal} HP`, '#7cff6b');
        state.wrenchTimer = PICKUP.respawnSeconds;
        return EVENT_REPAIR;
      }
    }
    if (state.wrenches.filter((w) => w.active).length < PICKUP.maxWrenches) {
      state.wrenchTimer -= dt;
      if (state.wrenchTimer <= 0) {
        state.wrenches.push(spawnWrench());
        state.wrenchTimer = PICKUP.respawnSeconds;
      }
    }
    return 0;
  }

  function reset() {
    buildCity();
    const start = nodePos(nodeIndex(5, 5));
    state.time = 0;
    state.phase = 'title';
    state.overReason = '';
    state.player = {
      x: start.x, y: start.y, angle: -Math.PI / 2, vx: 0, vy: 0, hp: PLAYER.maxHp,
    };
    state.traffic = [];
    for (let i = 0; i < TRAFFIC.count; i += 1) state.traffic.push(spawnTrafficCar(true));
    state.police = [];
    state.wrenches = [spawnWrench(), spawnWrench()];
    state.particles = [];
    state.skids = [];
    state.texts = [];
    state.cash = 0;
    state.deliveries = 0;
    state.timeLeft = MISSION.timeLimit;
    state.wanted = 0;
    state.wantedTimer = 0;
    state.sirenTimer = 0;
    state.wrenchTimer = PICKUP.respawnSeconds;
    state.stats = { nearMiss: 0, crashes: 0, busted: 0, delivered: 0 };
    state.shake = 0;
    state.hornCooldown = 0;
    newJob();
  }

  function step(dt, input, demo) {
    state.time += dt;
    let events = 0;
    const p = state.player;
    const playing = state.phase === 'play' && !demo;

    // Drive the player car.
    const throttle = input.throttle || 0;
    const steer = input.steer || 0;
    const handbrake = !!input.handbrake;
    const speedBefore = Math.hypot(p.vx, p.vy);
    stepCar(p, dt, throttle, steer, handbrake, PLAYER.maxSpeed);
    const speed = Math.hypot(p.vx, p.vy);
    if (handbrake && speed > 260 && random() < 0.35) {
      state.skids.push({ x: p.x, y: p.y, angle: p.angle, life: 1.6 });
      if (state.skids.length > 260) state.skids.shift();
      events |= EVENT_SKID;
    }
    if (state.hornCooldown > 0) state.hornCooldown -= dt;

    // Walls hurt at speed.
    const wallImpact = collideBuildings(p, PLAYER.radius);
    if (wallImpact > PLAYER.crashDamageSpeed) {
      const dmg = Math.round((wallImpact - PLAYER.crashDamageSpeed) * PLAYER.crashDamageScale);
      burst(p.x, p.y, '#ffb020', 12, 260);
      state.shake = Math.max(state.shake, 8);
      state.stats.crashes += 1;
      events |= EVENT_CRASH;
      if (playing) events = damagePlayer(dmg, events);
    }

    // Traffic bumps.
    for (const t of state.traffic) {
      const impact = collideCars(p, t, PLAYER.radius, TRAFFIC.radius);
      if (impact > 300) {
        burst((p.x + t.x) / 2, (p.y + t.y) / 2, '#ffb020', 10, 220);
        state.shake = Math.max(state.shake, 6);
        state.stats.crashes += 1;
        events |= EVENT_CRASH;
        if (playing) {
          events = damagePlayer(Math.round((impact - 260) * 0.02), events);
          if (impact > 380) events = addWanted(1, events);
        }
      }
    }

    // Police cars can be rammed into a wreck — and pay for it.
    for (const c of state.police) {
      if (c.disabled > 0) continue;
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      if (d < POLICE.radius + PLAYER.radius + 4 && speedBefore > 380 && c.hitCooldown <= 0) {
        c.hp -= 40;
        c.hitCooldown = 1.5;
        if (c.hp <= 0) {
          c.disabled = 3;
          state.cash += SCORE.bustBonus;
          state.stats.busted += 1;
          addText(c.x, c.y - 30, `COP BUSTED +$${SCORE.bustBonus}`, '#ff5d8f');
          burst(c.x, c.y, '#9db3c8', 16, 260);
        }
      }
    }

    stepTraffic(dt);
    events = stepPolice(dt, events);
    events |= stepWrenches(dt);
    events |= stepJob(dt, events);

    // Wanted heat decays when the player keeps clean.
    if (state.wanted > 0) {
      state.wantedTimer += dt;
      if (state.wantedTimer >= POLICE.wantedDecaySeconds) {
        state.wanted -= 1;
        state.wantedTimer = 0;
      }
      state.sirenTimer -= dt;
      if (state.sirenTimer <= 0) {
        state.sirenTimer = POLICE.sirenInterval;
        events |= EVENT_SIREN;
      }
    }

    // Particles, skid marks, floating texts.
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const pt = state.particles[i];
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= 0.92;
      pt.vy *= 0.92;
      pt.life -= dt;
      if (pt.life <= 0) state.particles.splice(i, 1);
    }
    for (let i = state.skids.length - 1; i >= 0; i -= 1) {
      state.skids[i].life -= dt * 0.5;
      if (state.skids[i].life <= 0) state.skids.splice(i, 1);
    }
    for (let i = state.texts.length - 1; i >= 0; i -= 1) {
      const t = state.texts[i];
      t.y -= 26 * dt;
      t.life -= dt;
      if (t.life <= 0) state.texts.splice(i, 1);
    }
    if (state.shake > 0) state.shake = Math.max(0, state.shake - 30 * dt);

    // The clock only runs while playing for real.
    if (playing) {
      state.timeLeft -= dt;
      if (state.timeLeft <= 0) {
        state.timeLeft = 0;
        if (state.phase === 'play') {
          state.phase = 'over';
          state.overReason = 'time';
          events |= EVENT_OVER;
        }
      }
    }
    if (state.phase === 'over' || state.phase === 'win') {
      // Freeze the world on the end screens.
    }
    return events;
  }

  reset();

  return {
    state,
    reset,
    step,
    routeTo,
    nearestNode,
    newJob,
    startRun() {
      state.phase = 'play';
      state.timeLeft = MISSION.timeLimit;
    },
  };
}
