// Pedestrians: the people who make Azure Bay feel alive. They stroll along
// the sidewalks, cross at intersections, and run away from gunfire, speeding
// cars and police chases. A pedestrian hit by a fast car is knocked down and
// the driver's wanted level rises.

import { PED } from './config.js';
import { ROADS_X, ROADS_Y, randomIntersection, resolveBuildings, clampToWorld } from './city.js';

const SHIRTS = ['#e07856', '#5b8dd9', '#e8b93c', '#7fbf5a', '#c96f9a', '#8a6fd6', '#e8e4da', '#3aa7a0'];
const SKINS = ['#e8b98a', '#c98d5f', '#8a5a3b', '#f0c8a0'];

let nextId = 1;

export function createPedestrian(x, y, random) {
  return {
    id: nextId,
    x, y,
    angle: random() * Math.PI * 2,
    speed: 0,
    target: randomIntersection(random, x, y, 300),
    shirt: SHIRTS[Math.floor(random() * SHIRTS.length)],
    skin: SKINS[Math.floor(random() * SKINS.length)],
    r: PED.radius,
    state: 'walk', // walk | flee | down
    downTimer: 0,
    fleeTimer: 0,
    fleeX: 0,
    fleeY: 0,
    bob: random() * Math.PI * 2,
  };
}

/** Frighten every pedestrian near (x, y): they run away from it. */
export function frighten(peds, x, y, radius) {
  for (const ped of peds) {
    if (ped.state === 'down') continue;
    const d = Math.hypot(ped.x - x, ped.y - y);
    if (d < radius) {
      ped.state = 'flee';
      ped.fleeTimer = 2.5;
      const away = Math.atan2(ped.y - y, ped.x - x);
      ped.fleeX = ped.x + Math.cos(away) * 300;
      ped.fleeY = ped.y + Math.sin(away) * 300;
    }
  }
}

export function updatePedestrians(peds, dt, random, city) {
  for (const ped of peds) {
    ped.bob += dt * 6;
    if (ped.state === 'down') {
      ped.downTimer -= dt;
      if (ped.downTimer <= 0) ped.state = 'walk';
      continue;
    }
    if (ped.state === 'flee') {
      ped.fleeTimer -= dt;
      const dx = ped.fleeX - ped.x;
      const dy = ped.fleeY - ped.y;
      const d = Math.hypot(dx, dy);
      if (d < 30 || ped.fleeTimer <= 0) {
        ped.state = 'walk';
        ped.target = randomIntersection(random, ped.x, ped.y, 300);
      } else {
        ped.angle = Math.atan2(dy, dx);
        ped.speed = PED.runSpeed;
        ped.x += Math.cos(ped.angle) * ped.speed * dt;
        ped.y += Math.sin(ped.angle) * ped.speed * dt;
      }
    } else {
      const dx = ped.target.x - ped.x;
      const dy = ped.target.y - ped.y;
      const d = Math.hypot(dx, dy);
      if (d < 30) {
        ped.target = randomIntersection(random, ped.x, ped.y, 300);
      } else {
        ped.angle = Math.atan2(dy, dx);
        ped.speed = PED.walkSpeed;
        ped.x += Math.cos(ped.angle) * ped.speed * dt;
        ped.y += Math.sin(ped.angle) * ped.speed * dt;
      }
    }
    resolveBuildings(city, ped);
    clampToWorld(ped, 30);
  }
}

/**
 * A car running into a pedestrian: at speed the pedestrian is knocked down
 * and the hit is reported; at a crawl they just stumble aside.
 * Returns the pedestrian hit, or null.
 */
export function hitByCar(peds, car) {
  if (Math.abs(car.speed) < 60) return null;
  for (const ped of peds) {
    if (ped.state === 'down') continue;
    const d = Math.hypot(ped.x - car.x, ped.y - car.y);
    if (d < 34) {
      ped.state = 'down';
      ped.downTimer = 6;
      return ped;
    }
  }
  return null;
}
