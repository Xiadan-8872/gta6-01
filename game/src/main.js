// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps, and the renderer paints what is there. The game moves between five screens:
// title, play, paused, game over and victory. On the title screen the autopilot
// cruises the city behind the logo.
//
// ?seed=N fixes the random pattern. ?shot=start|play|chase|end (with &seed=N) stages
// that scene instead of running the loop, paints it twice and sets window.__shotReady
// for a screenshot.
import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createAudio } from './audio.js';
import { createWorld, EVENT_BUSTED, EVENT_CRASH, EVENT_DELIVER, EVENT_NEAR_MISS, EVENT_OVER, EVENT_PICKUP, EVENT_REPAIR, EVENT_SIREN, EVENT_SKID, EVENT_WANTED_UP, EVENT_WIN } from './world.js';
import { createAutopilot } from './pilot.js';
import { ACTION_CLICK, ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, ACTION_RESTART, createInput } from './input.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const audio = createAudio();
const renderer = createRenderer(canvas);
const input = createInput(canvas, renderer.toField);
const titlePilot = createAutopilot(world);

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  world.state.best = scene.best;
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, performance.now() / 1000);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  let screen = SCREEN_TITLE;
  let best = readBest();
  world.state.best = best;
  let accumulator = 0;
  let last = performance.now();

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    audio.unlock();
    world.reset();
    world.state.best = best;
    world.startRun();
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Playing. Six deliveries before the clock runs out.');
  }

  function endGame(win) {
    if (world.state.cash > best) {
      best = world.state.cash;
      world.state.best = best;
      saveBest(best);
    }
    screen = win ? SCREEN_WIN : SCREEN_OVER;
    if (win) {
      audio.play('win');
      announce(`Victory. Vice Legend. Haul $${world.state.cash}. Best $${best}.`);
    } else {
      audio.play('over');
      announce(`Game over. Haul $${world.state.cash}. Best $${best}.`);
    }
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Sound muted.' : 'Sound on.');
    }
    if (screen === SCREEN_TITLE) {
      if (actions & (ACTION_CONFIRM | ACTION_CLICK)) startGame();
      return;
    }
    if (screen === SCREEN_PLAY) {
      if (actions & ACTION_PAUSE) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      }
      return;
    }
    if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM | ACTION_CLICK)) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
      return;
    }
    if (screen === SCREEN_OVER || screen === SCREEN_WIN) {
      if (actions & (ACTION_CONFIRM | ACTION_CLICK | ACTION_RESTART)) startGame();
    }
  }

  function playEvents(events) {
    if (events & EVENT_CRASH) audio.play('crash');
    if (events & EVENT_SKID) audio.play('skid');
    if (events & EVENT_PICKUP) audio.play('pickup');
    if (events & EVENT_DELIVER) audio.play('cash');
    if (events & EVENT_NEAR_MISS) audio.play('pickup');
    if (events & EVENT_REPAIR) audio.play('pickup');
    if (events & EVENT_WANTED_UP) {
      audio.play('siren');
      announce(`Wanted level ${world.state.wanted}. The cops are coming.`);
    }
    if (events & EVENT_SIREN) audio.play('siren');
    if (events & EVENT_BUSTED) audio.play('busted');
    if (events & EVENT_WIN) endGame(true);
    if (events & EVENT_OVER) endGame(false);
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, titlePilot(world.state), true);
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    const d = input.drive();
    const events = world.step(STEP, { throttle: -d.my, steer: d.mx, handbrake: d.handbrake }, false);
    const speed01 = Math.min(1, Math.hypot(world.state.player.vx, world.state.player.vy) / 560);
    audio.setEngine(speed01, d.handbrake);
    playEvents(events);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best, now / 1000);
  }

  // Leaving the tab pauses a running game rather than letting the cops close in unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Vice Rush. Press Enter or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
