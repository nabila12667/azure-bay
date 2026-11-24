// The screenshot scenes behind ?shot=boat|meridian|rally|heli|airfield. Each
// one plays the real rules forward from a fresh world for a fixed number
// of steps, steered by a simple autopilot, so the frame is what a short
// game really looks like and the same seed always gives the same frame.
// The cover is the Smuggler's Run: Leo at the helm of the speedboat at
// dusk, the wake behind him, an ABPD boat in pursuit and the Marina on
// the minimap.

import { STEP, PLACES } from './config.js';
import { stepWorld, resetWorld } from './world.js';
import { enterCar, exitCar } from './player.js';
import { enterBoat } from './boats.js';
import { setWanted } from './police.js';
import { startMission } from './missions.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { planRoute, followRoute, createCar } from './vehicles.js';

const MERIDIAN_SECONDS = 5;
const RALLY_SECONDS = 7;
const HELI_SECONDS = 5;
const AIRFIELD_SECONDS = 5;
const BOAT_SECONDS = 6;

/** A scripted input for the autopilot: it answers move() from a function. */
function scriptedInput(moveFn) {
  return {
    keys: { run: false },
    mouse: { down: false },
    move: moveFn,
    takeActions() { return 0; },
  };
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
  if (name === 'meridian') {
    // The Meridian Job: Leo walks in on the casino from the west, shotgun
    // in hand, five guards ahead and five stars already on him — the
    // helicopter is overhead with its searchlight on him. The shot catches
    // the firefight in progress: muzzle flashes, guards standing, the
    // vault marker and the wanted stars all on screen.
    state.missions.index = 11;
    startMission(state.missions, state);
    // Skip the mission banner for the shot: it would cover the top of
    // the frame for the first five seconds, and the objective bar already
    // names the job.
    state.missions.bannerTimer = 0;
    player.x = PLACES.casino.x;
    player.y = PLACES.casino.y + 110;
    player.hasPistol = true;
    player.hasShotgun = true;
    player.weapon = 'shotgun';
    player.shells = 12;
    player.cash = 2800;
    setWanted(state.police, 5);
    const input = scriptedInput(() => ({ x: 0, y: 0 }));
    input.mouse.down = true;
    for (let i = 0; i < MERIDIAN_SECONDS / STEP; i += 1) {
      const alive = state.rivals.find((r) => r.state !== 'dead');
      const target = alive || { x: PLACES.casino.x, y: PLACES.casino.y };
      const dist = Math.hypot(target.x - player.x, target.y - player.y);
      input.move = dist > 320
        ? () => walkToward(state, PLACES.casino.x, PLACES.casino.y)
        : () => ({ x: 0, y: 0 });
      stepWorld(state, STEP, input, aimAt(state, target.x, target.y));
    }
    return { screen: SCREEN_PLAY, best: 0 };
  }
  if (name === 'rally') {
    // Midnight Rally: a sports car at night in the rain, racing eight
    // gates around the whole city with the timer running and the
    // headlights cutting through the dark. Leo starts at the first gate
    // already moving.
    state.dayTime = 0.62;
    state.rainTarget = 1;
    state.rain = 0.9;
    const car = createCar(900, 320, 0, 'sports', state.random);
    car.speed = 380;
    state.cars.push(car);
    player.x = car.x;
    player.y = car.y;
    enterCar(player, car, state);
    state.missions.index = 10;
    startMission(state.missions, state);
    const gates = [
      { x: 1600, y: 800 }, { x: 2880, y: 320 }, { x: 3520, y: 1280 },
      { x: 3520, y: 2240 }, { x: 2240, y: 2240 }, { x: 960, y: 2240 },
      { x: 320, y: 1280 },
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
    for (let i = 0; i < RALLY_SECONDS / STEP; i += 1) {
      stepWorld(state, STEP, input, player.angle);
    }
    return { screen: SCREEN_PLAY, best: 0 };
  }
  if (name === 'heli') {
    // Five stars at dusk, on foot: Leo walks the Downtown road with the
    // ABPD closing in — foot cops running him down, cruisers blocking the
    // street, and the helicopter overhead with its searchlight pinned on
    // him. The shot catches the heat at its worst, before the bust.
    state.dayTime = 0.45;
    state.missions.index = 2;
    startMission(state.missions, state);
    state.missions.bannerTimer = 0;
    player.x = 2240;
    player.y = 1280;
    player.hasPistol = true;
    player.weapon = 'pistol';
    player.ammo = 24;
    setWanted(state.police, 5);
    const input = scriptedInput(() => walkToward(state, 2880, 1280));
    for (let i = 0; i < HELI_SECONDS / STEP; i += 1) {
      stepWorld(state, STEP, input, player.angle);
    }
    return { screen: SCREEN_PLAY, best: 0 };
  }
  if (name === 'boat') {
    // The Smuggler's Run: Leo boards the speedboat at the Marina at dusk
    // and sails west down the bay toward Smuggler's Cove, three stars on
    // him, an ABPD boat in pursuit behind the wake — the Marina, the
    // beach and the whole southern shore in frame.
    state.dayTime = 0.45;
    state.missions.index = 12;
    startMission(state.missions, state);
    state.missions.bannerTimer = 0;
    const boat = state.boats[0];
    player.x = boat.x;
    player.y = boat.y;
    enterBoat(player, boat);
    player.cash = 1600;
    setWanted(state.police, 3);
    const target = { x: 700, y: 2510 };
    const input = scriptedInput(() => {
      const b = state.player.inBoat;
      if (!b) return { x: 0, y: 0 };
      const targetAngle = Math.atan2(target.y - b.y, target.x - b.x);
      let diff = targetAngle - b.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      return { x: Math.max(-1, Math.min(1, diff * 2.2)), y: -1 };
    });
    for (let i = 0; i < BOAT_SECONDS / STEP; i += 1) {
      stepWorld(state, STEP, input, player.angle);
    }
    return { screen: SCREEN_PLAY, best: 0 };
  }
  // airfield: Leo picks up the hot cargo at the Azure Field hangar at
  // dusk, two stars on him, then walks south toward the parked plane on
  // the runway — the hangar, the windsock, the runway and the plane all
  // in frame, with the minimap showing the new district.
  state.dayTime = 0.45;
  state.missions.index = 9;
  startMission(state.missions, state);
  player.x = 520;
  player.y = 640;
  player.cash = 1100;
  player.hasPistol = true;
  player.weapon = 'pistol';
  player.ammo = 24;
  const input = scriptedInput(() => ({ x: 0, y: 0 }));
  for (let i = 0; i < AIRFIELD_SECONDS / STEP; i += 1) {
    const picked = state.missions.hasCrate;
    input.move = picked
      ? () => walkToward(state, 560, 640)
      : () => walkToward(state, PLACES.airfield.x, PLACES.airfield.y);
    stepWorld(state, STEP, input, player.angle);
  }
  return { screen: SCREEN_PLAY, best: 0 };
}

export { exitCar };
