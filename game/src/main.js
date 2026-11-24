// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// renderer paints what is there. The game moves between five screens:
// title, play, paused, busted/wasted, and story complete.
//
// ?seed=N fixes the city. ?shot=meridian|rally|heli|airfield (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.

import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, stepWorld, applyBusted, applyWasted, resetWorld, applySave, loadSave, EVENT_BUSTED, EVENT_WASTED, EVENT_MISSION_DONE, EVENT_MISSION_FAILED, EVENT_WANTED_UP, EVENT_SHOT, EVENT_PUNCH, EVENT_PICKUP, EVENT_EXPLOSION, EVENT_HIT, EVENT_REPAIR } from './world.js';
import { ACTION_CONFIRM, ACTION_PAUSE, ACTION_ENTER, ACTION_PUNCH, ACTION_MUTE, ACTION_REPAIR, ACTION_SWITCH, createInput } from './input.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_COMPLETE } from './render.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';
import { saveGame } from './save.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const state = createWorld(seed);
const renderer = createRenderer(canvas);
const audio = createAudio();

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
    // Storage can be off (private windows): the best haul then lasts this visit only.
  }
}

/** Where the mouse points in world coordinates, for aiming. */
function aimAngle(input) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cw = canvas.width / dpr;
  const ch = canvas.height / dpr;
  const scale = Math.min(cw / 1280, ch / 720);
  const ox = (cw - 1280 * scale) / 2;
  const oy = (ch - 720 * scale) / 2;
  const lx = (input.mouse.x - ox) / scale;
  const ly = (input.mouse.y - oy) / scale;
  const cam = renderer.camera;
  const wx = cam.x + (lx - 640) / cam.zoom;
  const wy = cam.y + (ly - 360) / cam.zoom;
  return Math.atan2(wy - state.player.y, wx - state.player.x);
}

function runShot(name) {
  const scene = stageShot(name, state);
  // Snap the camera onto Leo before the first paint: the lerp would need
  // dozens of frames to travel across the city, and a shot gets two.
  for (let i = 0; i < 120; i += 1) renderer.updateCamera(state, STEP);
  let painted = 0;
  function paint() {
    renderer.updateCamera(state, STEP);
    renderer.draw(state, scene.screen, scene.best);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  const saved = loadSave();
  if (saved) state.hasSave = true;

  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    resetWorld(state, true);
    if (saved && !state.startedOnce) {
      applySave(state, saved);
      state.startedOnce = true;
    } else if (!state.startedOnce) {
      state.startedOnce = true;
    }
    state.missions.state = 'idle';
    screen = SCREEN_PLAY;
    audio.unlock();
    audio.startMusic();
    announce('Playing. Steal a car — the first of thirteen jobs is waiting.');
  }

  function endRun(title) {
    screen = SCREEN_OVER;
    state.overTitle = title;
    state.overSubtitle = title === 'BUSTED' ? state.overSubtitle : state.overSubtitle;
    if (state.player.cash > best) {
      best = Math.floor(state.player.cash);
      saveBest(best);
    }
    saveGame(state);
    announce(`${title}. Cash $${Math.floor(state.player.cash)}. Best $${best}.`);
  }

  function react(events) {
    if (events & EVENT_SHOT) audio.shot();
    if (events & EVENT_PUNCH) audio.punch();
    if (events & EVENT_PICKUP) audio.pickup();
    if (events & EVENT_REPAIR) audio.cash();
    if (events & EVENT_EXPLOSION) audio.explosion();
    if (events & EVENT_WANTED_UP) audio.sting();
    if (events & EVENT_HIT) {
      // A hit on Leo: the flash is drawn by the renderer.
    }
    if (events & EVENT_MISSION_DONE) {
      audio.jingle();
      saveGame(state);
      if (state.missions.storyComplete) {
        screen = SCREEN_COMPLETE;
        announce('Story complete. Azure Bay is yours.');
      }
    }
    if (events & EVENT_MISSION_FAILED) audio.fail();
    if (events & EVENT_BUSTED) {
      applyBusted(state);
      audio.busted();
      endRun('BUSTED');
    } else if (events & EVENT_WASTED) {
      applyWasted(state);
      audio.busted();
      endRun('WASTED');
    }
  }

  // One-shot presses the world itself consumes (steal a car, punch, repair,
  // switch weapon): the loop takes the input's actions once per frame and
  // hands them to the first step, so a press is never lost and never counted
  // twice.
  let frameActions = 0;

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Muted.' : 'Sound on.');
      return;
    }
    frameActions |= actions & (ACTION_ENTER | ACTION_PUNCH | ACTION_REPAIR | ACTION_SWITCH);
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_COMPLETE)) {
      startGame();
    } else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      saveGame(state);
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_PLAY) {
      while (accumulator >= STEP) {
        const events = stepWorld(state, STEP, input, aimAngle(input), frameActions);
        frameActions = 0;
        react(events);
        accumulator -= STEP;
        if (screen !== SCREEN_PLAY) break;
      }
      // The engine hum and the siren follow the chase.
      const car = state.player.inCar;
      audio.engine(car ? car.speed : 0, !!car);
      audio.siren(state.police.wanted > 0 && state.police.cars.length > 0);
    } else {
      accumulator = 0;
      audio.engine(0, false);
      audio.siren(false);
    }
    renderer.updateCamera(state, STEP);
    renderer.draw(state, screen, best);
  }

  // Leaving the tab pauses a running game rather than letting the city run unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      saveGame(state);
      announce('Paused.');
    }
  });

  announce('Azure Bay. Press Enter or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();

// A handle for play-testing: the live state, the world step and the screens.
window.__game = { state, STEP };
