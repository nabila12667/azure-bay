// Leo Marlow on foot: walking and sprinting, aiming with the mouse,
// punching and shooting, and getting in and out of cars. When he is in a
// car the car drives him; this file only moves him while he walks.
//
// Leo carries up to two guns — the pistol Mara gives him after the Harbor
// Pickup, and the shotgun she gives him after the Night Courier — and Q
// switches between the ones he owns. Rosa's garage tuning (bought with R
// at the garage) lives on Leo, so whatever he drives next is faster too.

import { PLAYER } from './config.js';
import { resolveBuildings, clampToWorld } from './city.js';
import { fireBullet, fireShotgun, spawnParticles } from './combat.js';

export function createPlayer(x, y) {
  return {
    x, y,
    angle: 0,
    r: PLAYER.radius,
    health: PLAYER.health,
    cash: 0,
    ammo: 0,
    shells: 0,
    hasPistol: false,
    hasShotgun: false,
    weapon: null, // 'pistol' | 'shotgun' | null (fists)
    tuning: 0,
    inCar: null,
    inBoat: null,
    punchCooldown: 0,
    shootCooldown: 0,
    invulnerable: 0,
    speed: 0,
    moving: false,
    muzzle: 0,
  };
}

/** Switch to the other gun Leo owns, or back to fists when he has none. */
export function switchWeapon(player) {
  if (player.hasShotgun && player.weapon !== 'shotgun') {
    player.weapon = 'shotgun';
    return 'shotgun';
  }
  if (player.hasPistol && player.weapon !== 'pistol') {
    player.weapon = 'pistol';
    return 'pistol';
  }
  return player.weapon;
}

/**
 * Move Leo one step. `move` is the normalised WASD vector, `aimAngle` is
 * where the mouse points in world space, `firing` is the held mouse button.
 * Returns events: { shot, punched, entered, exited }.
 */
export function updatePlayer(player, dt, move, aimAngle, firing, actions, world, combat) {
  const events = { shot: false, punched: false, entered: false, exited: false };
  if (player.inCar) return events;
  player.angle = aimAngle;
  player.punchCooldown = Math.max(0, player.punchCooldown - dt);
  player.shootCooldown = Math.max(0, player.shootCooldown - dt);
  player.invulnerable = Math.max(0, player.invulnerable - dt);
  player.muzzle = Math.max(0, player.muzzle - dt);

  const speed = actions.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
  player.moving = move.x !== 0 || move.y !== 0;
  player.speed = player.moving ? speed : 0;
  player.x += move.x * speed * dt;
  player.y += move.y * speed * dt;
  resolveBuildings(world.city, player);
  clampToWorld(player, 20);

  // Punch: Space, or a click with no gun.
  const wantsPunch = actions.punch || (firing && !player.weapon);
  if (wantsPunch && player.punchCooldown <= 0) {
    player.punchCooldown = PLAYER.punchCooldown;
    events.punched = true;
    punchHit(player, world);
  }

  // Shoot: a click with a gun, while its ammo lasts.
  if (firing && player.weapon && player.shootCooldown <= 0) {
    if (player.weapon === 'shotgun' && player.shells > 0) {
      player.shootCooldown = PLAYER.shotgunCooldown;
      player.shells -= 1;
      player.muzzle = 0.09;
      fireShotgun(combat, player.x, player.y, player.angle);
      spawnParticles(combat, player.x + Math.cos(player.angle) * 26, player.y + Math.sin(player.angle) * 26, 4, '#ffd23a', 140, 0.2);
      events.shot = true;
    } else if (player.weapon === 'pistol' && player.ammo > 0) {
      player.shootCooldown = PLAYER.pistolCooldown;
      player.ammo -= 1;
      player.muzzle = 0.06;
      fireBullet(combat, player.x, player.y, player.angle, PLAYER.pistolDamage, true);
      events.shot = true;
    }
  }
  return events;
}

/** A punch lands on whatever is in front of Leo: a rival, a cop, a ped, a car. */
function punchHit(player, world) {
  const px = player.x + Math.cos(player.angle) * PLAYER.punchRange;
  const py = player.y + Math.sin(player.angle) * PLAYER.punchRange;
  for (const rival of world.rivals) {
    if (rival.state === 'dead') continue;
    if (Math.hypot(rival.x - px, rival.y - py) < 30) {
      rival.hp -= PLAYER.punchDamage;
      if (rival.hp <= 0) rival.state = 'dead';
      return;
    }
  }
  for (const cop of world.police.cops) {
    if (Math.hypot(cop.x - px, cop.y - py) < 28) {
      cop.hp -= PLAYER.punchDamage;
      return;
    }
  }
  for (const ped of world.peds) {
    if (ped.state === 'down') continue;
    if (Math.hypot(ped.x - px, ped.y - py) < 26) {
      ped.state = 'down';
      ped.downTimer = 4;
      return;
    }
  }
  for (const car of world.cars) {
    if (car.exploded) continue;
    if (Math.hypot(car.x - px, car.y - py) < 40) {
      car.hp -= PLAYER.punchDamage;
      return;
    }
  }
}

/** The nearest car Leo can get into, or null. */
export function nearestEnterableCar(player, cars) {
  let best = null;
  let bestD = Infinity;
  for (const car of cars) {
    if (car.exploded) continue;
    const d = Math.hypot(car.x - player.x, player.y - player.y);
    if (d < 70 && d < bestD) {
      best = car;
      bestD = d;
    }
  }
  return best;
}

/** Leo gets into `car`: the driver, if any, is pulled out onto the street. */
export function enterCar(player, car, world) {
  if (car.driver) {
    car.driver = false;
    const out = { x: car.x - Math.cos(car.angle) * 40, y: car.y - Math.sin(car.angle) * 40 };
    world.pulledDriver = out;
  }
  player.inCar = car;
  player.x = car.x;
  player.y = car.y;
}

/** Leo steps out beside the car, on the side away from traffic. */
export function exitCar(player, world) {
  const car = player.inCar;
  if (!car) return;
  player.inCar = null;
  car.speed *= 0.3;
  player.x = car.x - Math.cos(car.angle + Math.PI / 2) * 44;
  player.y = car.y - Math.sin(car.angle + Math.PI / 2) * 44;
  resolveBuildings(world.city, player);
  clampToWorld(player, 20);
}

export function hurtPlayer(player, damage) {
  if (player.invulnerable > 0) return false;
  player.health -= damage;
  player.invulnerable = 0.5;
  return true;
}
