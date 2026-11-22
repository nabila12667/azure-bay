// The world: everything that lives in Azure Bay and the one step that
// moves it all — Leo on foot or in a car, the traffic, the pedestrians,
// the police, the rivals, the bullets and the missions. step() takes the
// input and returns what happened as bit flags, so the caller can react
// (sounds, screens, saves) without the world knowing about them.
//
// The world also runs the clock: a four-minute day that slides from day
// through dusk into night and back to dawn, and rain that comes and goes.
// Night brings headlights and lit windows; rain brings umbrellas out and
// streaks across the screen.

import { CAR, PLACES, STEP, WORLD, GARAGE, STASH_TOTAL, STASH_BONUS, DAY_LENGTH } from './config.js';
import { createCity, nearestRoadPoint, randomIntersection, resolveBuildings, districtOf } from './city.js';
import { createRandom } from './random.js';
import { createPlayer, updatePlayer, nearestEnterableCar, enterCar, exitCar, hurtPlayer, switchWeapon } from './player.js';
import { createCar, driveCar, updateTraffic, collideCars, collideWorld, spawnTrafficCar, KIND_POLICE } from './vehicles.js';
import { createPedestrian, updatePedestrians, frighten, hitByCar } from './pedestrians.js';
import { createPolice, addWanted, setWanted, updatePolice, clearPolice } from './police.js';
import { createCombat, updateBullets, updateParticles, updatePickups, addPickup, explode, spawnParticles, spawnSkid, PICKUP_HEALTH, PICKUP_AMMO, PICKUP_CASH, PICKUP_SHELLS, PICKUP_STASH } from './combat.js';
import { updateRivals, aliveRivals } from './rivals.js';
import { ACTION_ENTER, ACTION_PUNCH, ACTION_REPAIR, ACTION_SWITCH } from './input.js';
import { createMissions, currentMission, startMission, updateMissions, objectiveText, missionMarker, retryMission, showBanner, MISSION_COUNT } from './missions.js';
import { loadSave, saveGame } from './save.js';

export const EVENT_BUSTED = 1;
export const EVENT_WASTED = 2;
export const EVENT_MISSION_DONE = 4;
export const EVENT_MISSION_FAILED = 8;
export const EVENT_WANTED_UP = 16;
export const EVENT_SHOT = 32;
export const EVENT_PUNCH = 64;
export const EVENT_PICKUP = 128;
export const EVENT_EXPLOSION = 256;
export const EVENT_HIT = 512;
export const EVENT_REPAIR = 1024;

const TRAFFIC_TARGET = 18;
const PED_TARGET = 30;

const STASH_SPOTS = [
  { x: 420, y: 900 }, { x: 1060, y: 1400 }, { x: 1700, y: 420 },
  { x: 2340, y: 900 }, { x: 2980, y: 1400 }, { x: 3620, y: 1900 },
  { x: 420, y: 1900 }, { x: 1700, y: 1900 },
  { x: 1060, y: 420 }, { x: 2980, y: 420 }, { x: 2340, y: 1900 }, { x: 3620, y: 420 },
];

/** How dark the city is, 0 (day) to 1 (night), from the time of day. */
export function nightFactor(dayTime) {
  if (dayTime < 0.4 || dayTime >= 0.9) return 0;
  if (dayTime < 0.5) return (dayTime - 0.4) / 0.1;
  if (dayTime < 0.8) return 1;
  return 1 - (dayTime - 0.8) / 0.1;
}

export function timeOfDayLabel(dayTime) {
  if (dayTime < 0.4) return 'DAY';
  if (dayTime < 0.5) return 'DUSK';
  if (dayTime < 0.8) return 'NIGHT';
  if (dayTime < 0.9) return 'DAWN';
  return 'DAY';
}

export function createWorld(seed) {
  const random = createRandom(seed);
  const city = createCity(random);
  const player = createPlayer(PLACES.playerStart.x, PLACES.playerStart.y);
  const police = createPolice(random);
  const combat = createCombat();
  const missions = createMissions();
  const state = {
    city, random, player, police, combat, missions,
    cars: [],
    peds: [],
    rivals: [],
    time: 0,
    dayTime: 0.08,
    rain: 0,
    rainTarget: 0,
    rainTimer: 40,
    district: 'Downtown',
    messages: [],
    bannerTitle: '',
    bannerText: '',
    bannerTimer: 0,
    objectiveText: 'Job 1/8 — First Wheels: Steal any car',
    missionTimer: 0,
    marker: null,
    crateAt: null,
    hint: '',
    garagePrompt: '',
    hasSave: false,
    damageFlash: 0,
    overTitle: 'BUSTED',
    overSubtitle: 'The ABPD took you in.',
    pulledDriver: null,
    saveTimer: 0,
    pickupTimer: 0,
    stats: { carsStolen: 0, pedsDown: 0, shotsFired: 0, stashesFound: 0 },
  };
  seedTraffic(state);
  seedPeds(state);
  seedStashes(state);
  addPickup(combat, PICKUP_HEALTH, PLACES.hospital.x + 40, PLACES.hospital.y, 40);
  addPickup(combat, PICKUP_AMMO, PLACES.garage.x + 40, PLACES.garage.y, 24);
  addPickup(combat, PICKUP_SHELLS, PLACES.garage.x + 80, PLACES.garage.y, 12);
  return state;
}

function seedTraffic(state) {
  for (let i = 0; i < TRAFFIC_TARGET; i += 1) {
    const spot = randomIntersection(state.random, state.player.x, state.player.y, 500);
    const car = spawnTrafficCar(state.random, spot.x, spot.y);
    state.cars.push(car);
  }
  // A few parked cars near the start, ready to steal.
  const parked = [
    { x: 1660, y: 1340, angle: 0 },
    { x: 1540, y: 1220, angle: Math.PI },
    { x: 2300, y: 1340, angle: Math.PI / 2 },
  ];
  for (const spot of parked) {
    const car = createCar(spot.x, spot.y, spot.angle, 'sedan', state.random);
    car.speed = 0;
    state.cars.push(car);
  }
}

function seedPeds(state) {
  for (let i = 0; i < PED_TARGET; i += 1) {
    const spot = randomIntersection(state.random, state.player.x, state.player.y, 200);
    state.peds.push(createPedestrian(spot.x + (state.random() - 0.5) * 200, spot.y + (state.random() - 0.5) * 200, state.random));
  }
}

function seedStashes(state) {
  for (const spot of STASH_SPOTS) {
    addPickup(state.combat, PICKUP_STASH, spot.x, spot.y, 100);
  }
}

export function addMessage(state, text, color) {
  state.messages.push({ text, color: color || '#f2ede0', life: 5 });
  if (state.messages.length > 4) state.messages.shift();
}

function maintainTraffic(state) {
  // Keep the streets busy near Leo; drop cars that wandered far away.
  state.cars = state.cars.filter((car) => {
    if (car.exploded) return false;
    if (car === state.player.inCar) return true;
    return Math.hypot(car.x - state.player.x, car.y - state.player.y) < 1500;
  });
  let roaming = 0;
  for (const car of state.cars) if (car !== state.player.inCar) roaming += 1;
  while (roaming < TRAFFIC_TARGET) {
    const spot = randomIntersection(state.random, state.player.x, state.player.y, 700);
    state.cars.push(spawnTrafficCar(state.random, spot.x, spot.y));
    roaming += 1;
  }
}

function maintainPeds(state) {
  state.peds = state.peds.filter((ped) => Math.hypot(ped.x - state.player.x, ped.y - state.player.y) < 1300);
  while (state.peds.length < PED_TARGET) {
    const spot = randomIntersection(state.random, state.player.x, state.player.y, 400);
    state.peds.push(createPedestrian(spot.x, spot.y, state.random));
  }
}

function collectPickups(state) {
  const player = state.player;
  let got = null;
  for (const p of state.combat.pickups) {
    if (p.taken) continue;
    if (Math.hypot(p.x - player.x, p.y - player.y) < 34) {
      p.taken = true;
      got = p;
      if (p.kind === PICKUP_HEALTH) {
        player.health = Math.min(100, player.health + p.value);
        addMessage(state, `+${p.value} health`, '#58d68d');
      } else if (p.kind === PICKUP_AMMO) {
        player.ammo += p.value;
        addMessage(state, `+${p.value} pistol ammo`, '#ffd23a');
      } else if (p.kind === PICKUP_SHELLS) {
        player.shells += p.value;
        addMessage(state, `+${p.value} shotgun shells`, '#ffd23a');
      } else if (p.kind === PICKUP_STASH) {
        player.cash += p.value;
        state.stats.stashesFound += 1;
        addMessage(state, `Stash ${state.stats.stashesFound}/${STASH_TOTAL} — +$${p.value}`, '#ffd23a');
        if (state.stats.stashesFound >= STASH_TOTAL) {
          player.cash += STASH_BONUS;
          addMessage(state, `All ${STASH_TOTAL} stashes — bonus $${STASH_BONUS}!`, '#58d68d');
        }
      } else {
        player.cash += p.value;
        addMessage(state, `+$${p.value} stash`, '#ffd23a');
      }
    }
  }
  return got;
}

function explodeCar(state, car) {
  car.exploded = true;
  explode(state.combat, car.x, car.y);
  frighten(state.peds, car.x, car.y, 500);
  if (state.player.inCar === car) {
    exitCar(state.player, state);
    hurtPlayer(state.player, 25);
    state.damageFlash = 1;
  }
  return true;
}

export function resetWorld(state, keepProgress) {
  const player = state.player;
  player.x = PLACES.playerStart.x;
  player.y = PLACES.playerStart.y;
  player.angle = 0;
  player.health = 100;
  player.inCar = null;
  player.invulnerable = 0;
  player.ammo = keepProgress && player.hasPistol ? player.ammo : 0;
  player.shells = keepProgress && player.hasShotgun ? player.shells : 0;
  if (!keepProgress) {
    player.cash = 0;
    player.hasPistol = false;
    player.hasShotgun = false;
    player.weapon = null;
    player.tuning = 0;
    state.stats.stashesFound = 0;
    state.missions = createMissions();
  }
  clearPolice(state.police);
  state.rivals.length = 0;
  state.cars.length = 0;
  state.peds.length = 0;
  state.messages.length = 0;
  seedTraffic(state);
  seedPeds(state);
  state.time = 0;
}

export function applySave(state, save) {
  const player = state.player;
  player.cash = save.cash || 0;
  player.health = save.health || 100;
  player.hasPistol = !!save.hasPistol;
  player.hasShotgun = !!save.hasShotgun;
  player.weapon = save.weapon || (player.hasPistol ? 'pistol' : null);
  player.ammo = save.ammo || 0;
  player.shells = save.shells || 0;
  player.tuning = save.tuning || 0;
  state.stats.stashesFound = save.stashesFound || 0;
  player.x = save.x || PLACES.playerStart.x;
  player.y = save.y || PLACES.playerStart.y;
  state.missions.index = save.missionIndex || 0;
  state.missions.storyComplete = state.missions.index >= MISSION_COUNT;
  state.hasSave = true;
}

/** One fixed step. `actionBits` carries the one-shot presses for this step
 * (ENTER / PUNCH / REPAIR / SWITCH), taken once by the caller — the loop takes the input's
 * actions a single time per frame and hands them to the first step, so a
 * press is never lost and never counted twice. Returns events as bit flags. */
export function stepWorld(state, dt, input, aimAngle, actionBits) {
  let events = 0;
  const player = state.player;
  const pressed = actionBits || 0;
  state.time += dt;
  state.damageFlash = Math.max(0, state.damageFlash - dt * 2);

  // The clock: day slides into night, and the rain comes and goes.
  state.dayTime = (state.dayTime + dt / DAY_LENGTH) % 1;
  state.rainTimer -= dt;
  if (state.rainTimer <= 0) {
    state.rainTimer = 30 + state.random() * 40;
    state.rainTarget = state.rainTarget > 0.5 ? 0 : 1;
  }
  state.rain += (state.rainTarget - state.rain) * Math.min(1, dt * 0.5);
  state.district = districtOf(player.x, player.y);

  // Messages age out.
  for (const msg of state.messages) msg.life -= dt;
  state.messages = state.messages.filter((msg) => msg.life > 0);
  if (state.bannerTimer > 0) state.bannerTimer -= dt;

  // --- Leo: on foot or behind the wheel.
  const move = input.move();
  if (player.inCar) {
    const car = player.inCar;
    const throttle = move.y < 0 ? 1 : move.y > 0 ? -1 : 0;
    const steer = move.x;
    const brake = move.y > 0 && car.speed > 5;
    const wasSpeed = car.speed;
    driveCar(car, dt, throttle, steer, brake, player.tuning);
    // Hard braking at speed leaves skid marks on the asphalt.
    if (brake && Math.abs(wasSpeed) > 300 && state.random() < 0.6) {
      spawnSkid(state.combat, car.x - Math.cos(car.angle) * 20, car.y - Math.sin(car.angle) * 20);
    }
    collideWorld(car, state.city);
    player.x = car.x;
    player.y = car.y;
    player.angle = car.angle;
    // Running over a pedestrian while speeding raises the heat.
    const hit = hitByCar(state.peds, car);
    if (hit) {
      state.stats.pedsDown += 1;
      if (addWanted(state.police, 1)) {
        events |= EVENT_WANTED_UP;
        addMessage(state, 'Wanted level up — the ABPD saw that', '#ff5a4e');
      }
      spawnParticles(state.combat, hit.x, hit.y, 8, '#e5534b', 120, 0.5);
    }
  } else {
    const actions = { run: input.keys.run, punch: !!(pressed & ACTION_PUNCH) };
    const acted = updatePlayer(player, dt, move, aimAngle, input.mouse.down, actions, state, state.combat);
    if (acted.shot) {
      events |= EVENT_SHOT;
      state.stats.shotsFired += 1;
      frighten(state.peds, player.x, player.y, 420);
    }
    if (acted.punched) events |= EVENT_PUNCH;
  }

  // --- Switch weapon (Q) while on foot.
  if ((pressed & ACTION_SWITCH) && !player.inCar) {
    const next = switchWeapon(player);
    if (next) addMessage(state, next === 'shotgun' ? 'Shotgun ready' : 'Pistol ready', '#ffd23a');
  }

  // --- Rosa's Garage (R): repair the car, or tune it when it is whole.
  state.garagePrompt = '';
  if (player.inCar) {
    const gd = Math.hypot(player.x - PLACES.garage.x, player.y - PLACES.garage.y);
    if (gd < 140) {
      const car = player.inCar;
      if (car.hp < 100) {
        state.garagePrompt = `R — repair $${GARAGE.repairCost}`;
        if (pressed & ACTION_REPAIR) {
          if (player.cash >= GARAGE.repairCost) {
            player.cash -= GARAGE.repairCost;
            car.hp = 100;
            car.burning = 0;
            events |= EVENT_REPAIR;
            addMessage(state, 'Rosa fixed the car — good as new', '#58d68d');
          } else {
            addMessage(state, `Need $${GARAGE.repairCost} for a repair`, '#ff5a4e');
          }
        }
      } else if (player.tuning < GARAGE.maxTune) {
        state.garagePrompt = `R — tune Lv${player.tuning + 1} $${GARAGE.tuneCost}`;
        if (pressed & ACTION_REPAIR) {
          if (player.cash >= GARAGE.tuneCost) {
            player.cash -= GARAGE.tuneCost;
            player.tuning += 1;
            events |= EVENT_REPAIR;
            addMessage(state, `Rosa tuned the ride — Lv${player.tuning}`, '#58d68d');
          } else {
            addMessage(state, `Need $${GARAGE.tuneCost} for tuning`, '#ff5a4e');
          }
        }
      } else {
        state.garagePrompt = 'Rosa\u2019s Garage — fully tuned';
      }
    }
  }

  // --- Enter or exit a car (the one-shot press, handed in by the loop).
  if (pressed & ACTION_ENTER) {
    if (player.inCar) {
      exitCar(player, state);
    } else {
      const car = nearestEnterableCar(player, state.cars);
      if (car) {
        const hadDriver = car.driver;
        enterCar(player, car, state);
        state.stats.carsStolen += 1;
        if (hadDriver) {
          if (state.pulledDriver) {
            const ped = createPedestrian(state.pulledDriver.x, state.pulledDriver.y, state.random);
            ped.state = 'flee';
            ped.fleeTimer = 3;
            ped.fleeX = ped.x + (state.random() - 0.5) * 400;
            ped.fleeY = ped.y + (state.random() - 0.5) * 400;
            state.peds.push(ped);
            state.pulledDriver = null;
          }
          if (addWanted(state.police, 1)) {
            events |= EVENT_WANTED_UP;
            addMessage(state, 'Grand theft auto — wanted level up', '#ff5a4e');
          }
          addMessage(state, 'You stole the car', '#ffd23a');
        }
      }
    }
  }

  // --- Traffic, police, pedestrians, rivals.
  for (const car of state.cars) {
    if (car.exploded || car === player.inCar) continue;
    updateTraffic(car, dt, state.random, state.cars);
    collideWorld(car, state.city);
  }
  for (let i = 0; i < state.cars.length; i += 1) {
    for (let j = i + 1; j < state.cars.length; j += 1) {
      collideCars(state.cars[i], state.cars[j]);
    }
  }
  // Police cars collide with the world and with traffic.
  for (const car of state.police.cars) {
    collideWorld(car, state.city);
    for (const other of state.cars) collideCars(car, other);
    if (player.inCar && car !== player.inCar) {
      const d = Math.hypot(car.x - player.inCar.x, car.y - player.inCar.y);
      if (d < 46 && Math.abs(car.speed - player.inCar.speed) > 120) {
        player.inCar.hp -= 4;
      }
    }
  }
  const policeEvents = updatePolice(state.police, dt, player, state.city);
  if (policeEvents.busted) events |= EVENT_BUSTED;

  updatePedestrians(state.peds, dt, state.random, state.city);
  updateRivals(state.rivals, dt, state.combat, player, state.city);

  // --- Bullets and their consequences.
  const hits = updateBullets(state.combat, dt, state.city, {
    player, cars: [...state.cars, ...state.police.cars], peds: state.peds, rivals: state.rivals, cops: state.police.cops,
  });
  for (const hit of hits) {
    if (hit.kind === 'player') {
      if (hurtPlayer(player, hit.damage)) {
        events |= EVENT_HIT;
        state.damageFlash = 1;
      }
    } else if (hit.kind === 'rival') {
      hit.target.hp -= hit.damage;
      spawnParticles(state.combat, hit.x, hit.y, 4, '#e5534b', 100, 0.4);
      if (hit.target.hp <= 0) {
        hit.target.state = 'dead';
        addPickup(state.combat, PICKUP_CASH, hit.target.x, hit.target.y, 50);
        addMessage(state, hit.target.kind === 'guard' ? 'Guard down' : 'Gull down', '#ffd23a');
      }
    } else if (hit.kind === 'cop') {
      hit.target.hp -= hit.damage;
      if (hit.target.hp <= 0) {
        state.police.cops = state.police.cops.filter((c) => c !== hit.target);
        if (addWanted(state.police, 1)) events |= EVENT_WANTED_UP;
      }
    } else if (hit.kind === 'ped') {
      hit.target.state = 'down';
      hit.target.downTimer = 6;
      if (addWanted(state.police, 1)) {
        events |= EVENT_WANTED_UP;
        addMessage(state, 'Wanted level up', '#ff5a4e');
      }
    } else if (hit.kind === 'car') {
      spawnParticles(state.combat, hit.x, hit.y, 3, '#ffd23a', 90, 0.3);
    }
  }
  updateParticles(state.combat, dt);
  updatePickups(state.combat, dt);

  // --- Burning and exploding cars.
  for (const car of [...state.cars, ...state.police.cars]) {
    if (car.exploded) continue;
    if (car.hp <= 0) {
      explodeCar(state, car);
      events |= EVENT_EXPLOSION;
      addMessage(state, 'Car exploded', '#ff5a4e');
    } else if (car.hp < 30) {
      car.burning = 1;
      if (Math.random() < dt * 0.5) spawnParticles(state.combat, car.x, car.y, 2, '#5a5f6b', 60, 0.8);
    }
  }
  state.cars = state.cars.filter((car) => !car.exploded);
  state.police.cars = state.police.cars.filter((car) => !car.exploded);

  // --- Pickups, stashes and respawning supplies.
  if (collectPickups(state)) events |= EVENT_PICKUP;
  state.pickupTimer -= dt;
  if (state.pickupTimer <= 0) {
    state.pickupTimer = 30;
    const hasHealth = state.combat.pickups.some((p) => p.kind === PICKUP_HEALTH && !p.taken);
    const hasAmmo = state.combat.pickups.some((p) => p.kind === PICKUP_AMMO && !p.taken);
    const hasShells = state.combat.pickups.some((p) => p.kind === PICKUP_SHELLS && !p.taken);
    if (!hasHealth) addPickup(state.combat, PICKUP_HEALTH, PLACES.hospital.x + 40, PLACES.hospital.y, 40);
    if (!hasAmmo) addPickup(state.combat, PICKUP_AMMO, PLACES.garage.x + 40, PLACES.garage.y, 24);
    if (!hasShells) addPickup(state.combat, PICKUP_SHELLS, PLACES.garage.x + 80, PLACES.garage.y, 12);
  }

  // --- The safehouse clears the heat fast.
  const safeD = Math.hypot(player.x - PLACES.safehouse.x, player.y - PLACES.safehouse.y);
  if (safeD < 130 && state.police.wanted > 0) {
    state.police.wanted = Math.max(0, state.police.wanted - dt * 0.5);
    if (state.police.wanted === 0) addMessage(state, 'Heat lost — the safehouse hid you', '#58d68d');
  }

  // --- Missions.
  const mission = currentMission(state.missions);
  if (mission && state.missions.state === 'idle') startMission(state.missions, state);
  state.crateAt = null;
  if (mission && state.missions.state === 'active') {
    const step = mission.steps[state.missions.step];
    if (step && step.type === 'pickup' && !state.missions.hasCrate) {
      state.crateAt = { x: step.x, y: step.y };
    }
  }
  const missionEvents = updateMissions(state.missions, dt, state);
  if (missionEvents.failed) {
    events |= EVENT_MISSION_FAILED;
    addMessage(state, 'Mission failed — try again', '#ff5a4e');
    retryMission(state.missions, state);
  } else if (missionEvents.completed) {
    events |= EVENT_MISSION_DONE;
    addMessage(state, `Mission complete — $${missionEvents.reward}`, '#ffd23a');
    if (mission.id === 'night-courier') {
      addMessage(state, 'Mara gave you the shotgun — Q to switch', '#58d68d');
    }
    const next = currentMission(state.missions);
    if (next) {
      state.missions.state = 'idle';
    }
  }

  // --- HUD values the renderer reads.
  state.objectiveText = objectiveText(state.missions);
  state.missionTimer = state.missions.state === 'active' && currentMission(state.missions)?.timer ? state.missions.timer : 0;
  state.marker = missionMarker(state.missions);
  state.bannerTitle = state.missions.banner || '';
  state.bannerText = state.missions.bannerText || '';
  state.bannerTimer = state.missions.bannerTimer || 0;

  // --- Context hint.
  state.hint = '';
  if (state.garagePrompt) {
    state.hint = state.garagePrompt;
  } else if (!player.inCar) {
    const car = nearestEnterableCar(player, state.cars);
    if (state.crateAt && Math.hypot(player.x - state.crateAt.x, player.y - state.crateAt.y) < 80) state.hint = 'Walk over the crate to pick it up';
    else if (car) state.hint = car.driver ? 'E — steal the car' : 'E — get in the car';
    else if (player.weapon) state.hint = 'Click — shoot · Q — switch weapon · SPACE — punch · SHIFT — sprint';
    else state.hint = 'WASD — walk · SPACE — punch · E — get in a car';
  } else {
    state.hint = 'WASD — drive · S — brake/reverse · E — get out';
  }

  // --- Wasted: Leo's health ran out.
  if (player.health <= 0) events |= EVENT_WASTED;

  maintainTraffic(state);
  maintainPeds(state);

  // --- Autosave every ten seconds.
  state.saveTimer += dt;
  if (state.saveTimer >= 10) {
    state.saveTimer = 0;
    saveGame(state);
  }
  return events;
}

/** Apply the busted penalty and put Leo back on the street. */
export function applyBusted(state) {
  const player = state.player;
  const lost = Math.floor(player.cash * 0.1);
  player.cash -= lost;
  player.health = 100;
  player.inCar = null;
  player.x = PLACES.policeHQ.x;
  player.y = PLACES.policeHQ.y + 80;
  clearPolice(state.police);
  state.overTitle = 'BUSTED';
  state.overSubtitle = `The ABPD took you in. You lost $${lost.toLocaleString('en-US')}.`;
}

/** Apply the wasted penalty and put Leo back on the street. */
export function applyWasted(state) {
  const player = state.player;
  const lost = Math.floor(player.cash * 0.1);
  player.cash -= lost;
  player.health = 100;
  player.inCar = null;
  player.x = PLACES.hospital.x;
  player.y = PLACES.hospital.y + 80;
  state.police.wanted = Math.max(0, Math.floor(state.police.wanted / 2));
  state.overTitle = 'WASTED';
  state.overSubtitle = `You woke up at St. Aurelia. You lost $${lost.toLocaleString('en-US')}.`;
}

export { loadSave, saveGame };
