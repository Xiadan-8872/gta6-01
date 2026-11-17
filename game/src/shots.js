// The screenshot scenes behind ?shot=start|play|chase|end. Each one plays the real
// rules forward from a fresh world for a fixed time, steered by the autopilot, so the
// frame is what a real game looks like and the same seed always gives the same frame.
// The chase pilot runs with the heat already on; the end pilot plays to win.
import { SHOT, STEP } from './config.js';
import { createAutopilot } from './pilot.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';

/**
 * Set `world` to the named scene (start, play, chase or end; any other name is start)
 * and return the screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  const pilot = createAutopilot(world);
  world.reset();
  if (name !== 'play' && name !== 'chase' && name !== 'end') {
    // Title: the autopilot cruises the city behind the title screen.
    for (let i = 0; i < SHOT.startSeconds / STEP; i += 1) {
      world.step(STEP, pilot(world.state), true);
    }
    return { screen: SCREEN_TITLE, best: 0 };
  }
  world.startRun();
  if (name === 'chase') {
    // Heat already on: four stars, the chase in full swing. Stop while the chase
    // is at its peak (three cars on the player, three stars still lit, and at
    // least one of them close enough to see) rather than after the heat has
    // decayed away.
    world.state.wanted = 4;
    world.state.wantedTimer = 0;
    for (let i = 0; i < SHOT.chaseSeconds / STEP; i += 1) {
      world.step(STEP, pilot(world.state), false);
      if (world.state.phase !== 'play') break;
      const s = world.state;
      const close = s.police.some((c) => Math.hypot(c.x - s.player.x, c.y - s.player.y) < 500);
      if (s.police.length >= 3 && s.wanted >= 3 && close) break;
    }
    return { screen: SCREEN_PLAY, best: world.state.cash };
  }
  if (name === 'play') {
    // Play until the first delivery lands and the next job is under way.
    for (let i = 0; i < SHOT.playSeconds / STEP; i += 1) {
      world.step(STEP, pilot(world.state), false);
      if (world.state.phase !== 'play') break;
      if (world.state.deliveries >= 1) break;
    }
    return { screen: SCREEN_PLAY, best: world.state.cash };
  }
  // The end scene: the autopilot plays to win.
  for (let i = 0; i < SHOT.endSeconds / STEP; i += 1) {
    world.step(STEP, pilot(world.state), false);
    if (world.state.phase !== 'play') break;
  }
  const win = world.state.phase === 'win';
  return { screen: win ? SCREEN_WIN : SCREEN_OVER, best: world.state.cash };
}
