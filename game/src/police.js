// The Azure Bay Police Department: the wanted level, the cruisers and foot
// cops it sends after Leo, the chase, and the bust. Stars rise with crime
// and fall when Leo stays out of sight; at five stars the roads ahead are
// blocked. A bust costs cash and a trip to Police HQ.

import { COP, WANTED } from './config.js';
import { createCar, driveCar, KIND_POLICE, nearestIntersection } from './vehicles.js';
import { randomIntersection, nearestRoadPoint, resolveBuildings, clampToWorld } from './city.js';

export function createPolice(random) {
  return {
    wanted: 0,
    decayTimer: 0,
    bustTimer: 0,
    roadblockTimer: 0,
    roadblockAt: null,
    cars: [],
    cops: [],
    random,
  };
}

export function addWanted(police, stars) {
  const before = police.wanted;
  police.wanted = Math.max(0, Math.min(WANTED.max, police.wanted + stars));
  police.decayTimer = 0;
  return police.wanted > before;
}

export function setWanted(police, stars) {
  const before = police.wanted;
  police.wanted = Math.max(0, Math.min(WANTED.max, stars));
  police.decayTimer = 0;
  return police.wanted !== before;
}

function wantedCarCount(wanted) {
  return Math.min(wanted, 5);
}

function wantedCopCount(wanted, playerInCar) {
  if (playerInCar) return 0;
  return Math.min(wanted, 3);
}

function spawnPoliceCar(police, player) {
  const spot = randomIntersection(police.random, player.x, player.y, WANTED.spawnDistance);
  const car = createCar(spot.x, spot.y, Math.atan2(player.y - spot.y, player.x - spot.x), KIND_POLICE, police.random);
  car.speed = 200;
  car.driver = false;
  police.cars.push(car);
  return car;
}

function spawnFootCop(police, player) {
  const spot = nearestRoadPoint(player.x + (police.random() - 0.5) * 900, player.y + (police.random() - 0.5) * 900);
  police.cops.push({
    x: spot.x, y: spot.y, angle: 0, r: COP.radius,
    hp: 100, state: 'chase', bust: 0,
  });
}

/**
 * Keep the police presence at the wanted level, steer the chase, and report
 * what happened as events: { busted: bool }. `onSeen` is called with the
 * nearest police distance, for the wanted decay.
 */
export function updatePolice(police, dt, player, city) {
  const events = { busted: false };
  // Reinforce to the wanted level.
  while (police.cars.length < wantedCarCount(police.wanted)) spawnPoliceCar(police, player);
  while (police.cops.length < wantedCopCount(police.wanted, !!player.inCar)) spawnFootCop(police, player);

  // Wanted decays when no police can see Leo.
  let nearest = Infinity;
  for (const car of police.cars) nearest = Math.min(nearest, Math.hypot(car.x - player.x, car.y - player.y));
  for (const cop of police.cops) nearest = Math.min(nearest, Math.hypot(cop.x - player.x, cop.y - player.y));
  if (police.wanted > 0 && nearest > WANTED.decayDistance) {
    police.decayTimer += dt;
    if (police.decayTimer >= WANTED.decaySeconds) {
      police.wanted -= 1;
      police.decayTimer = 0;
    }
  } else {
    police.decayTimer = 0;
  }

  // Cruisers chase: steer at Leo, ram him, and cut him off. Roadblock
  // cruisers stay parked where the block was set.
  for (const car of police.cars) {
    if (car.roadblock) continue;
    const dx = player.x - car.x;
    const dy = player.y - car.y;
    const dist = Math.hypot(dx, dy);
    const targetAngle = Math.atan2(dy, dx);
    let diff = targetAngle - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const steer = Math.max(-1, Math.min(1, diff * 2.4));
    const throttle = dist > 90 ? 1 : 0.4;
    driveCar(car, dt, throttle, steer, false);
    car.siren += dt;
    if (dist > WANTED.despawnDistance) {
      const spot = randomIntersection(police.random, player.x, player.y, WANTED.spawnDistance);
      car.x = spot.x;
      car.y = spot.y;
      car.speed = 200;
    }
  }

  // Foot cops run Leo down; standing next to him starts the bust.
  for (const cop of police.cops) {
    const dx = player.x - cop.x;
    const dy = player.y - cop.y;
    const dist = Math.hypot(dx, dy);
    cop.angle = Math.atan2(dy, dx);
    if (dist > 26) {
      cop.x += Math.cos(cop.angle) * COP.runSpeed * dt;
      cop.y += Math.sin(cop.angle) * COP.runSpeed * dt;
    }
    resolveBuildings(city, cop);
    clampToWorld(cop, 30);
    if (!player.inCar && dist < 46) {
      cop.bust += dt;
      if (cop.bust >= COP.bustTime) {
        events.busted = true;
        return events;
      }
    } else {
      cop.bust = 0;
    }
  }

  // A cruiser parked on Leo while he is on foot busts him too.
  if (!player.inCar && police.wanted > 0) {
    for (const car of police.cars) {
      const dist = Math.hypot(car.x - player.x, car.y - player.y);
      if (dist < 50 && Math.abs(car.speed) < 60) {
        police.bustTimer += dt;
        if (police.bustTimer >= COP.bustTime) {
          events.busted = true;
          return events;
        }
      }
    }
    if (nearest > 60) police.bustTimer = 0;
  } else {
    police.bustTimer = 0;
  }

  // At five stars, block the road ahead of Leo with parked cruisers.
  if (police.wanted >= 5) {
    police.roadblockTimer -= dt;
    if (police.roadblockTimer <= 0) {
      police.roadblockTimer = 14;
      // Clear the previous block first: parked cruisers otherwise pile up
      // forever and the whole department ends up on one street.
      for (let i = police.cars.length - 1; i >= 0; i -= 1) {
        if (police.cars[i].roadblock) police.cars.splice(i, 1);
      }
      const ahead = nearestIntersection(player.x + (player.inCar ? Math.cos(player.inCar.angle) * 700 : 500), player.y + (player.inCar ? Math.sin(player.inCar.angle) * 700 : 0));
      police.roadblockAt = ahead;
      for (let i = 0; i < 2; i += 1) {
        const car = createCar(ahead.x - 40 + i * 80, ahead.y, Math.PI / 2, KIND_POLICE, police.random);
        car.speed = 0;
        car.driver = false;
        car.roadblock = true;
        police.cars.push(car);
      }
    }
  }

  // Drop police far behind when the heat is gone.
  if (police.wanted === 0) {
    police.cars.length = 0;
    police.cops.length = 0;
  }
  return events;
}

export function clearPolice(police) {
  police.wanted = 0;
  police.decayTimer = 0;
  police.bustTimer = 0;
  police.cars.length = 0;
  police.cops.length = 0;
}
