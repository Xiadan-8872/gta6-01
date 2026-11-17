// Keyboard and mouse, read once a frame. Driving is W/S or Up/Down for throttle and
// brake/reverse, A/D or Left/Right to steer, Space for the handbrake; P or Escape
// pauses, M mutes, R restarts from the end screens, and Enter or a click confirms.
// Nothing here knows about the world — it only reports what the player did.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_MUTE = 4;
export const ACTION_RESTART = 8;
export const ACTION_CLICK = 128;

export function createInput(canvas, toField) {
  const keys = new Set();
  let actions = 0;
  let mouseX = null;
  let mouseY = null;
  let mouseSeen = false;
  let lastClick = null;

  function keyOf(e) {
    return e.key.length === 1 ? e.key.toLowerCase() : e.key;
  }

  window.addEventListener('keydown', (e) => {
    const k = keyOf(e);
    if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
    if (e.repeat) return;
    keys.add(k);
    if (k === ' ' || k === 'Enter') actions |= ACTION_CONFIRM;
    if (k === 'p' || k === 'Escape') actions |= ACTION_PAUSE;
    if (k === 'm') actions |= ACTION_MUTE;
    if (k === 'r') actions |= ACTION_RESTART;
  });
  window.addEventListener('keyup', (e) => keys.delete(keyOf(e)));
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    mouseSeen = true;
  });
  canvas.addEventListener('mousedown', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    mouseSeen = true;
    lastClick = { x: e.clientX, y: e.clientY };
    actions |= ACTION_CLICK;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // Driving input: mx is steering (-1 left, +1 right), my is throttle
  // (-1 forward, +1 brake/reverse), handbrake is Space held down.
  function drive() {
    let mx = 0;
    let my = 0;
    if (keys.has('a') || keys.has('ArrowLeft')) mx -= 1;
    if (keys.has('d') || keys.has('ArrowRight')) mx += 1;
    if (keys.has('w') || keys.has('ArrowUp')) my -= 1;
    if (keys.has('s') || keys.has('ArrowDown')) my += 1;
    return { mx, my, handbrake: keys.has(' ') };
  }

  function takeActions() {
    const a = actions;
    actions = 0;
    return a;
  }

  /** The field coordinates of the last mouse click, once; null when there was none. */
  function takeClickPos() {
    if (!lastClick) return null;
    const f = toField(lastClick.x, lastClick.y);
    lastClick = null;
    return f;
  }

  return { drive, takeActions, takeClickPos };
}
