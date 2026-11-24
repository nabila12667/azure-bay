// Boats: the speedboats Leo sails from the Marina, and the ABPD boats
// that chase him on the water. One arcade model drives them all — a
// heading, a speed, throttle and steering, with the velocity kept along
// the heading so a boat grips the water instead of sliding, and a longer
// glide than a car when the throttle lifts. Boats live in the bay: the
// strip of water along the south edge (y 2470-2540), from the Marina in
// the east to Smuggler's Cove in the west. A boat that loses all its
// health sinks; Leo swims out and takes the hit.

import { WORLD } from './config.js';

/** Per-kind sailing character: top speed, acceleration, hull length. */
export const BOAT_KINDS = {
  speedboat: { maxSpeed: 640, accel: 380, length: 76 },
  police: { maxSpeed: 600, accel: 460, length: 72 },
};

export const BOAT = {
  length: 76,
  width: 26,
  steer: 2.0,
  reverseMax: 150,
  health: 100,
  enterRadius: 70,
  // The bay the boats sail in: water along the south edge of the world.
  minY: 2470,
  maxY: 2540,
};

let nextId = 1;

export function createBoat(x, y, angle, kind) {
  return {
    id: nextId,
    x, y, angle,
    speed: 0,
    kind,
    hull: kind === 'police' ? '#1f3a6e' : '#e8e4da',
    r: 30,
    hp: BOAT.health,
    sunk: false,
    wakeTimer: 0,
  };
}

/** Sail a boat one step with throttle (-1..1), steering (-1..1) and a brake
 * flag. The boat glides further than a car when the throttle lifts, and
 * stays in the bay: it never beaches itself on the sand. */
export function driveBoat(boat, dt, throttle, steer, brake) {
  const kind = BOAT_KINDS[boat.kind] || BOAT_KINDS.speedboat;
  if (brake) {
    boat.speed -= Math.sign(boat.speed) * 500 * dt;
    if (Math.abs(boat.speed) < 20) boat.speed = 0;
  } else if (throttle > 0) {
    boat.speed += kind.accel * throttle * dt;
  } else if (throttle < 0) {
    if (boat.speed > 5) boat.speed -= 500 * dt;
    else boat.speed += kind.accel * 0.6 * throttle * dt;
  } else {
    boat.speed -= Math.sign(boat.speed) * 60 * dt;
    if (Math.abs(boat.speed) < 10) boat.speed = 0;
  }
  boat.speed = Math.max(-BOAT.reverseMax, Math.min(kind.maxSpeed, boat.speed));
  const turn = steer * BOAT.steer * dt * Math.min(1, Math.abs(boat.speed) / 140) * Math.sign(boat.speed || 1);
  boat.angle += turn;
  boat.x += Math.cos(boat.angle) * boat.speed * dt;
  boat.y += Math.sin(boat.angle) * boat.speed * dt;
  // The bay: clamp to the water strip, never onto the beach or the land.
  boat.x = Math.max(40, Math.min(WORLD.width - 40, boat.x));
  boat.y = Math.max(BOAT.minY, Math.min(BOAT.maxY, boat.y));
}

/** The nearest boat Leo can board, or null. */
export function nearestEnterableBoat(player, boats) {
  let best = null;
  let bestD = Infinity;
  for (const boat of boats) {
    if (boat.sunk) continue;
    const d = Math.hypot(boat.x - player.x, boat.y - player.y);
    if (d < BOAT.enterRadius && d < bestD) {
      best = boat;
      bestD = d;
    }
  }
  return best;
}

/** Leo boards `boat`: from here the boat drives him, like a car does. */
export function enterBoat(player, boat) {
  player.inBoat = boat;
  player.x = boat.x;
  player.y = boat.y;
}

/** Leo docks and steps out onto the beach, just north of the water. */
export function exitBoat(player) {
  const boat = player.inBoat;
  if (!boat) return;
  player.inBoat = null;
  boat.speed *= 0.3;
  player.x = boat.x;
  player.y = Math.min(boat.y - 90, 2390);
  if (player.y < 20) player.y = 20;
}
