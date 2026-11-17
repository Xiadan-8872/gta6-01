// All drawing: the city, the cars, the HUD, the minimap and the screens. The camera
// follows the player car; the world is much bigger than the 1280 x 720 field. The
// renderer only paints — it never changes the world.

import { CITY, FIELD, MISSION, PITCH, PLAYER, WORLD, roadCenter } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

function fmtTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function fmtCash(n) {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  canvas.width = FIELD.width;
  canvas.height = FIELD.height;

  function toField(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    return {
      x: ((clientX - r.left) / r.width) * FIELD.width,
      y: ((clientY - r.top) / r.height) * FIELD.height,
    };
  }

  function camera(state) {
    const p = state.player;
    let cx = clamp(p.x - FIELD.width / 2, 0, WORLD - FIELD.width);
    let cy = clamp(p.y - FIELD.height / 2, 0, WORLD - FIELD.height);
    if (state.shake > 0.3) {
      const w = state.shake;
      cx += Math.sin(state.time * 47.3) * w;
      cy += Math.cos(state.time * 39.7) * w;
    }
    return { x: cx, y: cy };
  }

  function drawRoads(cam) {
    const x0 = Math.max(0, cam.x - 60);
    const y0 = Math.max(0, cam.y - 60);
    const x1 = Math.min(WORLD, cam.x + FIELD.width + 60);
    const y1 = Math.min(WORLD, cam.y + FIELD.height + 60);
    // Asphalt.
    ctx.fillStyle = '#171a26';
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    // Sidewalks: the block faces get a lighter edge.
    ctx.fillStyle = '#232742';
    for (let bi = 0; bi < CITY.blocks; bi += 1) {
      for (let bj = 0; bj < CITY.blocks; bj += 1) {
        const bx = roadCenter(bi) + CITY.road / 2 - 6;
        const by = roadCenter(bj) + CITY.road / 2 - 6;
        if (bx + CITY.block + 12 < x0 || bx > x1 || by + CITY.block + 12 < y0 || by > y1) continue;
        ctx.fillRect(bx, by, CITY.block + 12, CITY.block + 12);
      }
    }
    // Lane dashes.
    ctx.fillStyle = 'rgba(255, 214, 90, 0.5)';
    for (let i = 0; i <= CITY.blocks; i += 1) {
      const c = roadCenter(i);
      if (c > y0 - 20 && c < y1 + 20) {
        for (let x = Math.floor(x0 / 44) * 44; x < x1; x += 44) ctx.fillRect(x, c - 2, 22, 4);
      }
      if (c > x0 - 20 && c < x1 + 20) {
        for (let y = Math.floor(y0 / 44) * 44; y < y1; y += 44) ctx.fillRect(c - 2, y, 4, 22);
      }
    }
  }

  function drawBuildings(state, cam) {
    for (const b of state.buildings) {
      if (b.x + b.w < cam.x - 40 || b.x > cam.x + FIELD.width + 40
        || b.y + b.h < cam.y - 40 || b.y > cam.y + FIELD.height + 40) continue;
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      // Neon roof edge.
      ctx.strokeStyle = b.neon;
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = 3;
      ctx.strokeRect(b.x + 2, b.y + 2, b.w - 4, b.h - 4);
      ctx.globalAlpha = 1;
      // Lit windows.
      ctx.fillStyle = 'rgba(255, 240, 180, 0.28)';
      const cols = Math.max(2, Math.floor(b.w / 46));
      const rows = Math.max(2, Math.floor(b.h / 46));
      for (let i = 0; i < cols; i += 1) {
        for (let j = 0; j < rows; j += 1) {
          if ((i * 7 + j * 13) % 3 === 0) {
            ctx.fillRect(b.x + 14 + i * 46, b.y + 14 + j * 46, 18, 14);
          }
        }
      }
    }
    // Neon signs on the block faces.
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const s of state.signs) {
      if (s.x < cam.x - 80 || s.x > cam.x + FIELD.width + 80
        || s.y < cam.y - 40 || s.y > cam.y + FIELD.height + 40) continue;
      const glow = 0.65 + 0.35 * Math.sin(state.time * 2.4 + s.x);
      ctx.globalAlpha = glow;
      ctx.font = '700 22px system-ui, sans-serif';
      ctx.fillStyle = s.color;
      ctx.fillText(s.text, s.x, s.y);
      ctx.globalAlpha = 1;
    }
  }

  function drawMarker(state, now) {
    const job = state.job;
    if (!job || state.phase !== 'play') return;
    const target = job.phase === 'toPickup' ? job.pickup : job.drop;
    const color = job.phase === 'toPickup' ? '#00e5ff' : '#ffe600';
    const pulse = 1 + 0.12 * Math.sin(now * 4);
    const r = 46 * pulse;
    // Light pillar.
    const grad = ctx.createLinearGradient(target.x, target.y - 260, target.x, target.y);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(1, color);
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = grad;
    ctx.fillRect(target.x - 16, target.y - 260, 32, 260);
    ctx.globalAlpha = 1;
    // Ring + icon.
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(target.x, target.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = '700 26px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(job.phase === 'toPickup' ? 'P' : '$', target.x, target.y + 1);
    ctx.font = '600 15px system-ui, sans-serif';
    ctx.fillText(job.phase === 'toPickup' ? 'PICK UP' : `DELIVER · ${fmtCash(job.pay)}`, target.x, target.y - r - 14);
  }

  function drawWrenches(state, now) {
    for (const w of state.wrenches) {
      if (!w.active) continue;
      const bob = Math.sin(now * 3 + w.x) * 3;
      ctx.fillStyle = '#0e2a1e';
      ctx.strokeStyle = '#7cff6b';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(w.x, w.y + bob, 17, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Cross = repair.
      ctx.strokeStyle = '#7cff6b';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(w.x - 7, w.y + bob);
      ctx.lineTo(w.x + 7, w.y + bob);
      ctx.moveTo(w.x, w.y + bob - 7);
      ctx.lineTo(w.x, w.y + bob + 7);
      ctx.stroke();
    }
  }

  function drawCar(x, y, angle, color, opts) {
    const o = opts || {};
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(-19, -11, 40, 26);
    // Wheels.
    ctx.fillStyle = '#0a0a0c';
    ctx.fillRect(-15, -17, 10, 5);
    ctx.fillRect(6, -17, 10, 5);
    ctx.fillRect(-15, 12, 10, 5);
    ctx.fillRect(6, 12, 10, 5);
    // Body.
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(-20, -13, 40, 26, 7);
    ctx.fill();
    // Cabin + windshield.
    ctx.fillStyle = 'rgba(20,24,40,0.9)';
    ctx.beginPath();
    ctx.roundRect(-4, -10, 15, 20, 5);
    ctx.fill();
    ctx.fillStyle = 'rgba(160,220,255,0.75)';
    ctx.beginPath();
    ctx.roundRect(8, -9, 5, 18, 2);
    ctx.fill();
    // Headlights / taillights.
    ctx.fillStyle = '#fff6c9';
    ctx.fillRect(18, -10, 3, 5);
    ctx.fillRect(18, 5, 3, 5);
    ctx.fillStyle = '#ff3b30';
    ctx.fillRect(-21, -10, 3, 5);
    ctx.fillRect(-21, 5, 3, 5);
    if (o.police) {
      // Flashing light bar.
      const on = Math.floor(o.now * 4) % 2 === 0;
      ctx.fillStyle = on ? '#ff2d55' : '#0a84ff';
      ctx.fillRect(-8, -13, 7, 5);
      ctx.fillStyle = on ? '#0a84ff' : '#ff2d55';
      ctx.fillRect(1, -13, 7, 5);
    }
    if (o.disabled) {
      ctx.fillStyle = 'rgba(120,120,120,0.5)';
      ctx.beginPath();
      ctx.arc(0, -18, 7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawSkids(state) {
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    for (const s of state.skids) {
      ctx.globalAlpha = Math.min(0.6, s.life * 0.4);
      ctx.beginPath();
      ctx.moveTo(s.x - Math.cos(s.angle) * 12, s.y - Math.sin(s.angle) * 12);
      ctx.lineTo(s.x + Math.cos(s.angle) * 12, s.y + Math.sin(s.angle) * 12);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawParticles(state) {
    for (const pt of state.particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawTexts(state) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of state.texts) {
      ctx.globalAlpha = Math.min(1, t.life);
      ctx.font = '700 20px system-ui, sans-serif';
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }

  function drawObjectiveArrow(state) {
    const job = state.job;
    if (!job || state.phase !== 'play') return;
    const p = state.player;
    const target = job.phase === 'toPickup' ? job.pickup : job.drop;
    const dx = target.x - p.x;
    const dy = target.y - p.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 420) return; // on screen already
    const ang = Math.atan2(dy, dx);
    const cx = FIELD.width / 2 + Math.cos(ang) * 300;
    const cy = FIELD.height / 2 + Math.sin(ang) * 200;
    const color = job.phase === 'toPickup' ? '#00e5ff' : '#ffe600';
    ctx.save();
    ctx.translate(clamp(cx, 60, FIELD.width - 60), clamp(cy, 90, FIELD.height - 60));
    ctx.rotate(ang);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(-10, -11);
    ctx.lineTo(-4, 0);
    ctx.lineTo(-10, 11);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.font = '600 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = color;
    ctx.fillText(`${Math.round(dist)}m`, clamp(cx, 60, FIELD.width - 60), clamp(cy, 90, FIELD.height - 60) + 26);
  }

  function drawMinimap(state) {
    const w = 208;
    const h = 208;
    const x0 = FIELD.width - w - 16;
    const y0 = 16;
    const s = w / WORLD;
    ctx.fillStyle = 'rgba(10, 12, 24, 0.82)';
    ctx.beginPath();
    ctx.roundRect(x0 - 6, y0 - 6, w + 12, h + 12, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();
    // Roads.
    ctx.strokeStyle = 'rgba(180,190,220,0.55)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= CITY.blocks; i += 1) {
      const c = roadCenter(i) * s + x0;
      ctx.beginPath();
      ctx.moveTo(c, y0);
      ctx.lineTo(c, y0 + h);
      ctx.stroke();
      const r = roadCenter(i) * s + y0;
      ctx.beginPath();
      ctx.moveTo(x0, r);
      ctx.lineTo(x0 + w, r);
      ctx.stroke();
    }
    const job = state.job;
    if (job && state.phase === 'play') {
      const t = job.phase === 'toPickup' ? job.pickup : job.drop;
      ctx.fillStyle = job.phase === 'toPickup' ? '#00e5ff' : '#ffe600';
      ctx.beginPath();
      ctx.arc(t.x * s + x0, t.y * s + y0, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const c of state.police) {
      if (c.disabled > 0) continue;
      ctx.fillStyle = '#ff2d55';
      ctx.beginPath();
      ctx.arc(c.x * s + x0, c.y * s + y0, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    const p = state.player;
    ctx.fillStyle = '#ff2d95';
    ctx.beginPath();
    ctx.arc(p.x * s + x0, p.y * s + y0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  function drawHud(state, now) {
    // Top bar.
    ctx.fillStyle = 'rgba(8, 10, 22, 0.72)';
    ctx.fillRect(0, 0, FIELD.width, 64);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(0, 64, FIELD.width, 1);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffe600';
    ctx.font = '700 26px system-ui, sans-serif';
    ctx.fillText(fmtCash(state.cash), 20, 26);
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.font = '600 14px system-ui, sans-serif';
    ctx.fillText(`DELIVERIES ${state.deliveries}/${MISSION.total}`, 20, 48);
    // Timer.
    const urgent = state.timeLeft < 60;
    ctx.textAlign = 'center';
    ctx.fillStyle = urgent && Math.floor(now * 2) % 2 === 0 ? '#ff5d5d' : '#ffffff';
    ctx.font = '700 30px system-ui, sans-serif';
    ctx.fillText(fmtTime(state.timeLeft), FIELD.width / 2, 28);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillText(state.phase === 'play' ? 'TIME LEFT' : 'VICE RUSH', FIELD.width / 2, 50);
    // Wanted stars.
    ctx.textAlign = 'right';
    ctx.font = '700 26px system-ui, sans-serif';
    let stars = '';
    for (let i = 0; i < 5; i += 1) stars += i < state.wanted ? '★' : '☆';
    ctx.fillStyle = state.wanted > 0 ? '#ff5d5d' : 'rgba(255,255,255,0.4)';
    ctx.fillText(stars, FIELD.width - 240, 26);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillText(state.wanted > 0 ? 'WANTED' : 'CLEAN', FIELD.width - 240, 48);
    // HP bar + speed, bottom-left.
    const hpW = 220;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.roundRect(20, FIELD.height - 44, hpW, 16, 8);
    ctx.fill();
    const hpFrac = state.player.hp / PLAYER.maxHp;
    ctx.fillStyle = hpFrac > 0.5 ? '#7cff6b' : hpFrac > 0.25 ? '#ffb020' : '#ff5d5d';
    ctx.beginPath();
    ctx.roundRect(20, FIELD.height - 44, hpW * hpFrac, 16, 8);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`HP ${Math.round(state.player.hp)}`, 20, FIELD.height - 58);
    const speed = Math.round(Math.hypot(state.player.vx, state.player.vy) * 0.32);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 24px system-ui, sans-serif';
    ctx.fillText(`${speed}`, FIELD.width - 20, FIELD.height - 52);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillText('km/h', FIELD.width - 20, FIELD.height - 30);
    // Objective line, bottom-center.
    if (state.job && state.phase === 'play') {
      const job = state.job;
      const target = job.phase === 'toPickup' ? job.pickup : job.drop;
      const d = Math.round(Math.hypot(target.x - state.player.x, target.y - state.player.y));
      ctx.textAlign = 'center';
      ctx.fillStyle = job.phase === 'toPickup' ? '#00e5ff' : '#ffe600';
      ctx.font = '700 17px system-ui, sans-serif';
      ctx.fillText(
        job.phase === 'toPickup' ? `PICK UP THE PACKAGE · ${d}m` : `DELIVER IT · ${fmtCash(job.pay)} · ${d}m`,
        FIELD.width / 2, FIELD.height - 26,
      );
    }
  }

  function drawScreenTitle(state, best) {
    ctx.fillStyle = 'rgba(8, 6, 20, 0.55)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const glow = 0.75 + 0.25 * Math.sin(state.time * 2);
    ctx.globalAlpha = glow;
    ctx.font = '900 96px system-ui, sans-serif';
    ctx.fillStyle = '#ff2d95';
    ctx.fillText('VICE RUSH', FIELD.width / 2, 220);
    ctx.globalAlpha = 1;
    ctx.font = '700 26px system-ui, sans-serif';
    ctx.fillStyle = '#00e5ff';
    ctx.fillText('A GTA 6 FAN GAME · NEON VICE CITY', FIELD.width / 2, 288);
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 19px system-ui, sans-serif';
    ctx.fillText('Drive jobs across the city. 6 deliveries before the clock runs out.', FIELD.width / 2, 340);
    ctx.fillText('Outrun the cops. Wrecked or late — and the run is over.', FIELD.width / 2, 368);
    ctx.fillStyle = '#ffe600';
    ctx.font = '700 24px system-ui, sans-serif';
    ctx.fillText('PRESS ENTER OR CLICK TO START', FIELD.width / 2, 440);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = '600 16px system-ui, sans-serif';
    ctx.fillText('WASD / Arrows — drive · Space — handbrake · P — pause · M — mute · R — restart', FIELD.width / 2, 500);
    if (best > 0) {
      ctx.fillStyle = '#7cff6b';
      ctx.font = '700 18px system-ui, sans-serif';
      ctx.fillText(`BEST HAUL ${fmtCash(best)}`, FIELD.width / 2, 540);
    }
  }

  function drawScreenPaused() {
    ctx.fillStyle = 'rgba(8, 6, 20, 0.6)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 64px system-ui, sans-serif';
    ctx.fillText('PAUSED', FIELD.width / 2, 320);
    ctx.font = '600 20px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText('Press P or click to keep driving', FIELD.width / 2, 380);
  }

  function drawScreenEnd(state, best, win) {
    ctx.fillStyle = win ? 'rgba(6, 20, 12, 0.62)' : 'rgba(24, 6, 12, 0.62)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = win ? '#7cff6b' : '#ff5d5d';
    ctx.font = '900 72px system-ui, sans-serif';
    ctx.fillText(win ? 'VICE LEGEND' : state.overReason === 'time' ? 'TIME UP' : 'WRECKED', FIELD.width / 2, 280);
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 22px system-ui, sans-serif';
    ctx.fillText(
      win ? 'Six jobs, clean getaway. The city is yours.'
        : state.overReason === 'time' ? 'The clock beat you to the last drop.'
          : 'Your ride is scrap. The cops tow what is left.',
      FIELD.width / 2, 348,
    );
    ctx.fillStyle = '#ffe600';
    ctx.font = '700 26px system-ui, sans-serif';
    ctx.fillText(
      `HAUL ${fmtCash(state.cash)} · ${state.deliveries}/${MISSION.total} DELIVERIES · ${state.stats.nearMiss} NEAR MISSES`,
      FIELD.width / 2, 410,
    );
    if (best > 0) {
      ctx.fillStyle = '#7cff6b';
      ctx.font = '700 18px system-ui, sans-serif';
      ctx.fillText(`BEST HAUL ${fmtCash(best)}`, FIELD.width / 2, 452);
    }
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 22px system-ui, sans-serif';
    ctx.fillText('PRESS R OR CLICK TO DRIVE AGAIN', FIELD.width / 2, 510);
  }

  function draw(state, screen, best, now) {
    ctx.clearRect(0, 0, FIELD.width, FIELD.height);
    // Sunset backdrop outside the city.
    const bg = ctx.createLinearGradient(0, 0, 0, FIELD.height);
    bg.addColorStop(0, '#1b1035');
    bg.addColorStop(0.55, '#2c1445');
    bg.addColorStop(1, '#3d1a3d');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    const cam = camera(state);
    ctx.save();
    ctx.translate(-cam.x, -cam.y);
    drawRoads(cam);
    drawBuildings(state, cam);
    drawSkids(state);
    drawMarker(state, now);
    drawWrenches(state, now);
    for (const t of state.traffic) {
      drawCar(t.x, t.y, t.angle, t.color, { now });
    }
    for (const c of state.police) {
      if (c.disabled < 0) continue;
      drawCar(c.x, c.y, c.angle, '#223349', { police: true, now, disabled: c.disabled > 0 });
    }
    drawParticles(state);
    drawCar(state.player.x, state.player.y, state.player.angle, '#ff2d95', { now });
    drawTexts(state);
    ctx.restore();
    drawObjectiveArrow(state);
    drawMinimap(state);
    drawHud(state, now);
    if (screen === SCREEN_TITLE) drawScreenTitle(state, best);
    else if (screen === SCREEN_PAUSED) drawScreenPaused();
    else if (screen === SCREEN_OVER) drawScreenEnd(state, best, false);
    else if (screen === SCREEN_WIN) drawScreenEnd(state, best, true);
  }

  return { draw, toField };
}
