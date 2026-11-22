// Cars: the player's ride, the traffic that fills the roads, and the police
// cruisers. One arcade model drives them all: a heading, a speed, throttle
// and steering, with the velocity kept along the heading so a car grips the
// road instead of sliding. Traffic follows the road grid from intersection
// to intersection; police cars steer straight at their target.
//
// Every kind drives differently — a sports car is fast and twitchy, a truck
// is slow and heavy, a limo is long — and Rosa's tuning (bought at the
// garage) makes whatever Leo drives a little faster.

import { CAR, CAR_KINDS, GARAGE } from './config.js';
import { ROADS_X, ROADS_Y, ROAD_WIDTH, randomIntersection, nearestRoadPoint, resolveBuildings, clampToWorld } from './city.js';

export const KIND_SEDAN = 'sedan';
export const KIND_TAXI = 'taxi';
export const KIND_TRUCK = 'truck';
export const KIND_SPORTS = 'sports';
export const KIND_POLICE = 'police';
export const KIND_VAN = 'van';
export const KIND_MUSCLE = 'muscle';
export const KIND_LIMO = 'limo';
export const KIND_ARMORED = 'armored';

const PAINTS = ['#d94f3d', '#3d7dd9', '#e8b93c', '#7fbf5a', '#9b59b6', '#e8e4da', '#2b2f36', '#d97b2f'];
const TAXI_PAINT = '#f2c531';

let nextId = 1;

export function createCar(x, y, angle, kind, random) {
  const paint = kind === KIND_TAXI ? TAXI_PAINT : kind === KIND_POLICE ? '#20242c'
    : kind === KIND_ARMORED ? '#5a5f6b'
    : PAINTS[Math.floor((random ? random() : Math.random()) * PAINTS.length)];
  return {
    id: nextId,
    x, y, angle,
    speed: 0,
    kind,
    paint,
    // Traffic state: the intersection it is driving toward, and the road it is on.
    target: null,
    r: 26,
    hp: kind === KIND_ARMORED ? CAR.health * 2 : CAR.health,
    burning: 0,
    exploded: false,
    siren: 0,
    brakeLight: false,
    driver: kind !== KIND_POLICE,
  };
}

/** Drive a car one step with throttle (-1..1), steering (-1..1) and a brake
 * flag. `tuning` is Rosa's garage level (0-3) and only ever applies to
 * Leo's car: each level adds speed and acceleration. */
export function driveCar(car, dt, throttle, steer, brake, tuning) {
  const kind = CAR_KINDS[car.kind] || CAR_KINDS.sedan;
  const tune = tuning || 0;
  const max = kind.maxSpeed * (1 + GARAGE.tuneSpeedBonus * tune);
  const accel = kind.accel * (1 + GARAGE.tuneAccelBonus * tune);
  if (brake) {
    car.speed -= Math.sign(car.speed) * CAR.brake * dt;
    if (Math.abs(car.speed) < 20) car.speed = 0;
  } else if (throttle > 0) {
    car.speed += accel * throttle * dt;
  } else if (throttle < 0) {
    if (car.speed > 5) car.speed -= CAR.brake * dt;
    else car.speed += accel * 0.6 * throttle * dt;
  } else {
    car.speed -= Math.sign(car.speed) * 140 * dt;
    if (Math.abs(car.speed) < 10) car.speed = 0;
  }
  car.speed = Math.max(-CAR.reverseMax, Math.min(max, car.speed));
  const turn = steer * CAR.steer * dt * Math.min(1, Math.abs(car.speed) / 120) * Math.sign(car.speed || 1);
  car.angle += turn;
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  car.brakeLight = brake || throttle < 0;
}

/** A traffic car picks a new intersection to drive toward. */
export function retargetTraffic(car, random) {
  car.target = randomIntersection(random, car.x, car.y, 400);
}

/**
 * Steer a traffic car toward its target intersection, keeping to the road:
 * it drives along its current road until it reaches the target's line, then
 * turns onto the crossing road. Returns false when it needs a new target.
 */
export function updateTraffic(car, dt, random, cars) {
  if (!car.target) retargetTraffic(car, random);
  const dx = car.target.x - car.x;
  const dy = car.target.y - car.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 40) {
    retargetTraffic(car, random);
    return true;
  }
  // Slow for the car ahead on the same heading.
  let want = CAR.trafficSpeed * (0.75 + ((car.id * 37) % 10) / 40);
  const ahead = carAhead(car, cars);
  if (ahead !== null && ahead < 110) want = Math.min(want, 60);
  const targetAngle = Math.atan2(dy, dx);
  let diff = targetAngle - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const steer = Math.max(-1, Math.min(1, diff * 2.2));
  const throttle = car.speed < want ? 1 : 0;
  driveCar(car, dt, throttle, steer, false);
  return true;
}

/** Distance to the nearest car ahead of `car` on roughly the same heading. */
function carAhead(car, cars) {
  let best = null;
  const hx = Math.cos(car.angle);
  const hy = Math.sin(car.angle);
  for (const other of cars) {
    if (other === car || other.exploded) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const along = dx * hx + dy * hy;
    if (along < 0 || along > 320) continue;
    const side = Math.abs(-dx * hy + dy * hx);
    if (side > 46) continue;
    if (best === null || along < best) best = along;
  }
  return best;
}

/** Push two cars apart when they overlap; the faster one keeps more speed. */
export function collideCars(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  const min = 44;
  if (dist >= min || dist === 0) return false;
  const nx = dx / dist;
  const ny = dy / dist;
  const push = (min - dist) / 2;
  a.x -= nx * push;
  a.y -= ny * push;
  b.x += nx * push;
  b.y += ny * push;
  const total = Math.abs(a.speed) + Math.abs(b.speed);
  if (total > 260) {
    a.hp -= 6;
    b.hp -= 6;
  }
  const avg = (a.speed + b.speed) / 2;
  a.speed = avg * 0.7;
  b.speed = avg * 0.7;
  return true;
}

/** Keep a car out of buildings and inside the world. */
export function collideWorld(car, city) {
  const body = { x: car.x, y: car.y, r: 26 };
  const hit = resolveBuildings(city, body);
  if (hit) {
    car.x = body.x;
    car.y = body.y;
    car.speed *= 0.4;
  }
  clampToWorld(car, 40);
  return hit !== null;
}

/** A parked or roaming car on a road near (x, y), for spawns. */
export function spawnTrafficCar(random, x, y) {
  const kinds = [KIND_SEDAN, KIND_SEDAN, KIND_TAXI, KIND_VAN, KIND_TRUCK, KIND_SPORTS, KIND_MUSCLE, KIND_LIMO];
  const kind = kinds[Math.floor(random() * kinds.length)];
  const onVertical = random() < 0.5;
  const angle = onVertical ? (random() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (random() < 0.5 ? 0 : Math.PI);
  const car = createCar(x, y, angle, kind, random);
  car.speed = 120 + random() * 90;
  return car;
}

/** The nearest road intersection to (x, y). */
export function nearestIntersection(x, y) {
  let best = { x: ROADS_X[0], y: ROADS_Y[0], d: Infinity };
  for (const rx of ROADS_X) {
    for (const ry of ROADS_Y) {
      const d = Math.hypot(rx - x, ry - y);
      if (d < best.d) best = { x: rx, y: ry, d };
    }
  }
  return best;
}

/**
 * A road-following route from (fromX, fromY) to (toX, toY): the nearest
 * intersection, a Manhattan corner along the grid, the nearest intersection
 * to the goal, then the goal itself. Cars that follow it stay on the roads
 * instead of wedging themselves against buildings.
 */
export function planRoute(fromX, fromY, toX, toY) {
  const start = nearestIntersection(fromX, fromY);
  const end = nearestIntersection(toX, toY);
  const corner = { x: end.x, y: start.y };
  return [start, corner, end, { x: toX, y: toY }];
}

/**
 * Steer `car` along `waypoints` (as planRoute makes them), dropping each
 * one as the car reaches it. Returns the { throttle, steer } a driver
 * should use this step, or zeros when the route is done.
 */
export function followRoute(car, waypoints) {
  if (!car || waypoints.length === 0) return { x: 0, y: 0 };
  while (waypoints.length > 0) {
    const next = waypoints[0];
    if (Math.hypot(next.x - car.x, next.y - car.y) < 90) waypoints.shift();
    else break;
  }
  if (waypoints.length === 0) return { x: 0, y: 0 };
  // A ram can push a car off the road into the narrow gutter between the
  // road edge and a building face, where aiming at the next waypoint just
  // grinds it along the wall. Get back onto the grid first.
  const half = ROAD_WIDTH / 2;
  const onRoad = ROADS_X.some((rx) => Math.abs(car.x - rx) <= half)
    || ROADS_Y.some((ry) => Math.abs(car.y - ry) <= half);
  const next = onRoad ? waypoints[0] : nearestRoadPoint(car.x, car.y);
  const dist = Math.hypot(next.x - car.x, next.y - car.y);
  const targetAngle = Math.atan2(next.y - car.y, next.x - car.x);
  let diff = targetAngle - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const absDiff = Math.abs(diff);
  // Slow down for sharp turns and for the final approach: at full speed a
  // car turns a 215-unit circle and can never make a 90-degree corner.
  const targetSpeed = Math.min(240, 60 + dist * 1.1, absDiff > 0.8 ? 150 : absDiff > 0.4 ? 230 : 420);
  const throttle = car.speed < targetSpeed ? 1 : -1;
  return { x: Math.max(-1, Math.min(1, diff * 2.2)), y: -throttle };
}
