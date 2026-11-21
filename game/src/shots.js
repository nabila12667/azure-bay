// The screenshot scenes behind ?shot=start|drive|chase|mission. Each one
// plays the real rules forward from a fresh world for a fixed number of
// steps, steered by a simple autopilot, so the frame is what a short game
// really looks like and the same seed always gives the same frame. The
// cover is the chase: three wanted stars, two cruisers on Leo's tail, the
// minimap and the mission objective all on screen at once.

import { STEP, PLACES } from './config.js';
import { stepWorld, resetWorld } from './world.js';
import { enterCar, exitCar } from './player.js';
import { setWanted } from './police.js';
import { startMission } from './missions.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { planRoute, followRoute } from './vehicles.js';
import { randomIntersection } from './city.js';

const START_SECONDS = 6;
const DRIVE_SECONDS = 8;
const CHASE_SECONDS = 7;
const MISSION_SECONDS = 6;

/** A scripted input for the autopilot: it answers move() from a function. */
function scriptedInput(moveFn) {
  return {
    keys: { run: false },
    mouse: { down: false },
    move: moveFn,
    takeActions() { return 0; },
  };
}

/**
 * Follow a road route to `to`, re-planning to a new far intersection when
 * the route runs out (for the chase, which has nowhere to arrive at).
 */
function makeRouteInput(state, to, replan) {
  let waypoints = planRoute(state.player.x, state.player.y, to.x, to.y);
  return scriptedInput(() => {
    const car = state.player.inCar;
    if (!car) return { x: 0, y: 0 };
    if (waypoints.length === 0) {
      if (!replan) return { x: 0, y: 0 };
      const far = randomIntersection(state.random, car.x, car.y, 1200);
      waypoints = planRoute(car.x, car.y, far.x, far.y);
    }
    return followRoute(car, waypoints);
  });
}

function walkToward(state, x, y) {
  const dx = x - state.player.x;
  const dy = y - state.player.y;
  const d = Math.hypot(dx, dy);
  if (d < 20) return { x: 0, y: 0 };
  return { x: dx / d, y: dy / d };
}

function aimAt(state, x, y) {
  return Math.atan2(y - state.player.y, x - state.player.x);
}

export function stageShot(name, state) {
  resetWorld(state, true);
  const player = state.player;
  if (name === 'drive') {
    // Leo steals the parked sedan by the plaza and takes it up to Rosa's
    // Garage, following the roads so the shot shows him driving, not
    // cutting across a block.
    const car = state.cars.find((c) => !c.exploded && Math.hypot(c.x - 2300, c.y - 1340) < 200) || state.cars[0];
    player.x = car.x;
    player.y = car.y;
    enterCar(player, car, state);
    state.missions.index = 0;
    startMission(state.missions, state);
    const input = makeRouteInput(state, { x: 1000, y: 380 }, false);
    for (let i = 0; i < DRIVE_SECONDS / STEP; i += 1) {
      stepWorld(state, STEP, input, player.angle);
    }
    return { screen: SCREEN_PLAY, best: 0 };
  }
  if (name === 'chase') {
    // Three stars, cruisers on Leo's tail, Mara's job on the HUD: the car
    // follows the roads and the shot is taken while it is still intact,
    // before the rams pile it into traffic.
    const car = state.cars.find((c) => !c.exploded && Math.hypot(c.x - 2300, c.y - 1340) < 200) || state.cars[0];
    player.x = car.x;
    player.y = car.y;
    enterCar(player, car, state);
    state.missions.index = 2;
    startMission(state.missions, state);
    setWanted(state.police, 3);
    const far = randomIntersection(state.random, car.x, car.y, 1200);
    const input = makeRouteInput(state, far, true);
    for (let i = 0; i < CHASE_SECONDS / STEP; i += 1) {
      stepWorld(state, STEP, input, player.angle);
    }
    return { screen: SCREEN_PLAY, best: 0 };
  }
  if (name === 'mission') {
    // Dockside Trouble: Leo walks in on the warehouse from the west and
    // opens fire on the Gulls. He starts far enough out that the shot
    // catches the firefight in progress — the banner faded, rivals still
    // standing, muzzle flashes on screen — instead of the next mission.
    state.missions.index = 3;
    startMission(state.missions, state);
    player.x = PLACES.warehouse.x - 1100;
    player.y = PLACES.warehouse.y + 220;
    player.hasPistol = true;
    player.ammo = 48;
    const input = scriptedInput(() => ({ x: 0, y: 0 }));
    input.mouse.down = true;
    for (let i = 0; i < MISSION_SECONDS / STEP; i += 1) {
      const alive = state.rivals.find((r) => r.state !== 'dead');
      const target = alive || { x: PLACES.warehouse.x, y: PLACES.warehouse.y };
      const dist = Math.hypot(target.x - player.x, target.y - player.y);
      input.move = dist > 320
        ? () => walkToward(state, PLACES.warehouse.x, PLACES.warehouse.y)
        : () => ({ x: 0, y: 0 });
      stepWorld(state, STEP, input, aimAt(state, target.x, target.y));
    }
    return { screen: SCREEN_PLAY, best: 0 };
  }
  // start: the title screen over a living downtown, traffic rolling by.
  const input = scriptedInput(() => ({ x: 0, y: 0 }));
  for (let i = 0; i < START_SECONDS / STEP; i += 1) {
    stepWorld(state, STEP, input, 0);
  }
  return { screen: SCREEN_TITLE, best: 0 };
}

export { exitCar };
