// The autopilot: drives the real rules, so screenshot scenes and the headless balance
// simulation show what a real game looks like. It follows a BFS route over the road
// grid to its target, brakes for sharp turns, backs out when stuck, swerves away
// from nearby police, and detours to a repair wrench when the car is hurt.
import { PLAYER } from './config.js';

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

function angleDiff(a, b) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function createAutopilot(world) {
  const mem = {
    route: [],
    routeTarget: null,
    lastX: 0,
    lastY: 0,
    stuckTimer: 0,
    reversing: 0,
    checkTimer: 0,
  };

  function targetOf(state) {
    const p = state.player;
    if (p.hp < 45) {
      let best = null;
      let bd = Infinity;
      for (const w of state.wrenches) {
        if (!w.active) continue;
        const d = (w.x - p.x) ** 2 + (w.y - p.y) ** 2;
        if (d < bd) { bd = d; best = w; }
      }
      if (best) return { x: best.x, y: best.y };
    }
    const job = state.job;
    if (!job) return { x: p.x, y: p.y };
    return job.phase === 'toPickup' ? job.pickup : job.drop;
  }

  return function autopilot(state) {
    const p = state.player;
    const target = targetOf(state);
    const key = `${Math.round(target.x)},${Math.round(target.y)}`;
    if (mem.routeTarget !== key || mem.route.length === 0) {
      mem.route = world.routeTo(p.x, p.y, target.x, target.y);
      mem.routeTarget = key;
    }
    // Drop waypoints already reached.
    while (mem.route.length > 1) {
      const wp = mem.route[0];
      if (Math.hypot(wp.x - p.x, wp.y - p.y) < 70) mem.route.shift();
      else break;
    }
    let wp = mem.route[0] || target;
    if (mem.route.length === 1) wp = target;

    // Stuck detection: barely moving while trying to drive.
    mem.checkTimer += 1 / 60;
    if (mem.checkTimer >= 0.5) {
      mem.checkTimer = 0;
      const moved = Math.hypot(p.x - mem.lastX, p.y - mem.lastY);
      mem.lastX = p.x;
      mem.lastY = p.y;
      const speed = Math.hypot(p.vx, p.vy);
      if (moved < 12 && speed < 60 && mem.reversing <= 0) {
        mem.stuckTimer += 0.5;
        if (mem.stuckTimer >= 1.5) {
          mem.reversing = 0.9;
          mem.stuckTimer = 0;
          mem.route = [];
        }
      } else {
        mem.stuckTimer = 0;
      }
    }
    if (mem.reversing > 0) {
      mem.reversing -= 1 / 60;
      return { throttle: -0.7, steer: -0.8, handbrake: false };
    }

    // Steer toward the waypoint, with a shove away from close police cars and
    // oncoming traffic.
    let dx = wp.x - p.x;
    let dy = wp.y - p.y;
    for (const t of state.traffic) {
      const tdx = p.x - t.x;
      const tdy = p.y - t.y;
      const td = Math.hypot(tdx, tdy) || 1;
      if (td < 110) {
        const w = (110 - td) / 110;
        dx += (tdx / td) * w * 200;
        dy += (tdy / td) * w * 200;
      }
    }
    for (const c of state.police) {
      if (c.disabled > 0) continue;
      const ddx = p.x - c.x;
      const ddy = p.y - c.y;
      const d = Math.hypot(ddx, ddy) || 1;
      if (d < 150) {
        const w = (150 - d) / 150;
        dx += (ddx / d) * w * 260;
        dy += (ddy / d) * w * 260;
      }
    }
    const desired = Math.atan2(dy, dx);
    const diff = angleDiff(desired, p.angle);
    const steer = clamp(diff * 2.4, -1, 1);
    const speed = Math.hypot(p.vx, p.vy);
    const wpDist = Math.hypot(wp.x - p.x, wp.y - p.y);
    let throttle = 1;
    if (Math.abs(diff) > 1.6) throttle = speed > 200 ? -0.7 : 0.3;
    else if (Math.abs(diff) > 1.0) throttle = 0.45;
    else if (wpDist < 130 && speed > 260) throttle = 0.4; // ease into the turn
    return { throttle, steer, handbrake: false };
  };
}

/** A reckless pilot: full throttle, no steering sense — used to prove losing is real. */
export function doomedPilot() {
  return { throttle: 1, steer: 0.6, handbrake: false };
}

export { PLAYER };
