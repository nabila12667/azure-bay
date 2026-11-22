// The screenshot scenes behind ?shot=heist|race|chase|night. Each one plays
// the real rules forward from a fresh world for a fixed number of steps,
// steered by a simple autopilot, so the frame is what a short game really
// looks like and the same seed always gives the same frame. The cover is
// the heist: six bank guards, the shotgun, three wanted stars, the vault
// loot and the minimap all on screen at once.

import { STEP, PLACES } from './config.js';
import { stepWorld, resetWorld } from './world.js';
import { enterCar, exitCar } from './player.js';
import { setWanted } from './police.js';
import { startMission } from './missions.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { planRoute, followRoute, createCar } from './vehicles.js';
import { randomIntersection } from './city.js';

const HEIST_SECONDS = 6;
const RACE_SECONDS = 9;
const CHASE_SECONDS = 7;
const NIGHT_SECONDS = 4;

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
  if (name === 'heist') {
    // The Azure Heist: Leo walks in on the bank from the west, shotgun in
    // hand, six guards ahead and three stars already on him. The shot
    // catches the firefight in progress — muzzle flashes, guards standing,
    // the vault marker and the wanted stars all on screen.
    state.missions.index = 7;
    startMission(state.missions, state);
    player.x = PLACES.bank.x - 700;
    player.y = PLACES.bank.y + 320;
    player.hasPistol = true;
    player.hasShotgun = true;
    player.weapon = 'shotgun';
    player.shells = 12;
    player.cash = 2400;
    const input = scriptedInput(() => ({ x: 0, y: 0 }));
    input.mouse.down = true;
    for (let i = 0; i < HEIST_SECONDS / STEP; i += 1) {
      const alive = state.rivals.find((r) => r.state !== 'dead');
      const target = alive || { x: PLACES.bank.x, y: PLACES.bank.y };
      const dist = Math.hypot(target.x - player.x, target.y - player.y);
      input.move = dist > 320
        ? () => walkToward(state, PLACES.bank.x, PLACES.bank.y)
        : () => ({ x: 0, y: 0 });
      stepWorld(state, STEP, input, aimAt(state, target.x, target.y));
    }
    return { screen: SCREEN_PLAY, best: 0 };
  }
  if (name === 'race') {
    // Bay Street Grand Prix: a sports car at night in the rain, racing the
    // gates with the timer running and the headlights cutting through the
    // dark. Leo starts at the first gate already moving.
    state.dayTime = 0.62;
    state.rainTarget = 1;
    state.rain = 0.9;
    const car = createCar(900, 320, 0, 'sports', state.random);
    car.speed = 380;
    state.cars.push(car);
    player.x = car.x;
    player.y = car.y;
    enterCar(player, car, state);
    state.missions.index = 6;
    startMission(state.missions, state);
    const gates = [
      { x: 2880, y: 320 }, { x: 3520, y: 1280 }, { x: 2880, y: 2240 },
      { x: 960, y: 2240 }, { x: 320, y: 1280 },
    ];
    // Persistent waypoints to the current gate: re-planning from scratch
    // every frame made the car dither near the start line instead of racing.
    let gate = 0;
    let waypoints = planRoute(car.x, car.y, gates[0].x, gates[0].y);
    const input = scriptedInput(() => {
      const carNow = state.player.inCar;
      if (!carNow) return { x: 0, y: 0 };
      const target = gates[Math.min(gate, gates.length - 1)];
      if (Math.hypot(target.x - carNow.x, target.y - carNow.y) < 130) {
        gate += 1;
        waypoints = gate < gates.length
          ? planRoute(carNow.x, carNow.y, gates[gate].x, gates[gate].y)
          : [];
      }
      return followRoute(carNow, waypoints);
    });
    for (let i = 0; i < RACE_SECONDS / STEP; i += 1) {
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
  // night: Leo drives the marina road after dark in the rain, headlights
  // on, the docks and boats and the lighthouse beside him, the city glowing.
  state.dayTime = 0.65;
  state.rainTarget = 1;
  state.rain = 0.85;
  const car = createCar(3100, 2240, 0, 'muscle', state.random);
  car.speed = 200;
  state.cars.push(car);
  player.x = car.x;
  player.y = car.y;
  enterCar(player, car, state);
  player.cash = 1250;
  player.hasPistol = true;
  player.weapon = 'pistol';
  player.ammo = 24;
  state.missions.index = 4;
  startMission(state.missions, state);
  const far = { x: 3500, y: 2240 };
  const input = makeRouteInput(state, far, true);
  for (let i = 0; i < NIGHT_SECONDS / STEP; i += 1) {
    stepWorld(state, STEP, input, player.angle);
  }
  return { screen: SCREEN_PLAY, best: 0 };
}

export { exitCar };
