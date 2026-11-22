// Keyboard and pointer input. Held keys give movement and driving; one-shot
// presses (confirm, pause, enter a car, punch, mute, repair, switch weapon)
// are queued as bit flags and taken once by the loop, so a press between two
// frames is never lost and never counted twice. The mouse aims and fires.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER = 4;
export const ACTION_PUNCH = 8;
export const ACTION_MUTE = 16;
export const ACTION_REPAIR = 32;
export const ACTION_SWITCH = 64;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const CONFIRM = new Set(['Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const ENTER = new Set(['KeyE']);
const PUNCH = new Set(['Space']);
const MUTE = new Set(['KeyM']);
const REPAIR = new Set(['KeyR']);
const SWITCH = new Set(['KeyQ']);

export function createInput(canvas) {
  const keys = { up: false, down: false, left: false, right: false, run: false };
  let actions = 0;
  const mouse = { x: 0, y: 0, down: false };

  function mark(code, down) {
    if (UP.has(code)) keys.up = down;
    else if (DOWN.has(code)) keys.down = down;
    else if (LEFT.has(code)) keys.left = down;
    else if (RIGHT.has(code)) keys.right = down;
    else if (code === 'ShiftLeft' || code === 'ShiftRight') keys.run = down;
  }

  window.addEventListener('keydown', (event) => {
    if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (ENTER.has(event.code)) {
      if (!event.repeat) actions |= ACTION_ENTER;
    } else if (PUNCH.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PUNCH;
    } else if (MUTE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else if (REPAIR.has(event.code)) {
      if (!event.repeat) actions |= ACTION_REPAIR;
    } else if (SWITCH.has(event.code)) {
      if (!event.repeat) actions |= ACTION_SWITCH;
    } else if (UP.has(event.code) || DOWN.has(event.code) || LEFT.has(event.code) || RIGHT.has(event.code) || event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
      mark(event.code, true);
    } else {
      return;
    }
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => mark(event.code, false));
  // A key released while the tab is hidden never sends keyup: let go on blur.
  window.addEventListener('blur', () => {
    keys.up = keys.down = keys.left = keys.right = keys.run = false;
    mouse.down = false;
  });

  function trackPointer(event) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = event.clientX - rect.left;
    mouse.y = event.clientY - rect.top;
  }
  canvas.addEventListener('pointermove', trackPointer);
  canvas.addEventListener('pointerdown', (event) => {
    trackPointer(event);
    mouse.down = true;
    actions |= ACTION_CONFIRM;
  });
  window.addEventListener('pointerup', () => {
    mouse.down = false;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    keys,
    mouse,
    /** Movement vector, normalised, from the held keys. */
    move() {
      const x = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
      const y = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
      if (x === 0 && y === 0) return { x: 0, y: 0 };
      const len = Math.hypot(x, y);
      return { x: x / len, y: y / len };
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
