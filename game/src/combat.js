// Combat: bullets, muzzle flashes, explosions and the pickups the street
// leaves behind. Everything here is a pooled, pre-allocated object — no
// allocation in the hot loop — and nothing here knows about screens or keys.

import { PLAYER } from './config.js';
import { hitsBuilding } from './city.js';

export const PICKUP_HEALTH = 'health';
export const PICKUP_AMMO = 'ammo';
export const PICKUP_CASH = 'cash';

const BULLET_SPEED = 900;
const BULLET_POOL = 48;
const PARTICLE_POOL = 160;

export function createCombat() {
  const bullets = [];
  for (let i = 0; i < BULLET_POOL; i += 1) {
    bullets.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, damage: 0, fromPlayer: false });
  }
  const particles = [];
  for (let i = 0; i < PARTICLE_POOL; i += 1) {
    particles.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 3, color: '#fff' });
  }
  const pickups = [];
  return { bullets, particles, pickups };
}

function freeBullet(combat) {
  for (const b of combat.bullets) if (!b.active) return b;
  return null;
}

function freeParticle(combat) {
  for (const p of combat.particles) if (!p.active) return p;
  return null;
}

export function fireBullet(combat, x, y, angle, damage, fromPlayer) {
  const b = freeBullet(combat);
  if (!b) return false;
  b.active = true;
  b.x = x + Math.cos(angle) * 22;
  b.y = y + Math.sin(angle) * 22;
  b.vx = Math.cos(angle) * BULLET_SPEED;
  b.vy = Math.sin(angle) * BULLET_SPEED;
  b.life = 0.9;
  b.damage = damage;
  b.fromPlayer = fromPlayer;
  return true;
}

export function spawnParticles(combat, x, y, count, color, speed, life) {
  for (let i = 0; i < count; i += 1) {
    const p = freeParticle(combat);
    if (!p) return;
    const a = Math.random() * Math.PI * 2;
    const s = speed * (0.4 + Math.random() * 0.8);
    p.active = true;
    p.x = x;
    p.y = y;
    p.vx = Math.cos(a) * s;
    p.vy = Math.sin(a) * s;
    p.life = life * (0.6 + Math.random() * 0.7);
    p.maxLife = p.life;
    p.size = 2 + Math.random() * 4;
    p.color = color;
  }
}

export function explode(combat, x, y) {
  spawnParticles(combat, x, y, 26, '#ff9a3c', 260, 0.7);
  spawnParticles(combat, x, y, 18, '#5a5f6b', 120, 1.2);
  spawnParticles(combat, x, y, 10, '#ffd23a', 320, 0.4);
}

export function addPickup(combat, kind, x, y, value) {
  combat.pickups.push({ kind, x, y, value, bob: Math.random() * Math.PI * 2, taken: false });
}

function circleHitsRect(x, y, r, rect) {
  const cx = Math.max(rect.x, Math.min(x, rect.x + rect.w));
  const cy = Math.max(rect.y, Math.min(y, rect.y + rect.h));
  return (x - cx) * (x - cx) + (y - cy) * (y - cy) < r * r;
}

/**
 * Move the bullets and resolve their hits. `targets` is the world the bullets
 * can strike: { player, cars, peds, rivals, cops }. Returns a list of hit
 * reports {kind, target, x, y} for the caller to react to.
 */
export function updateBullets(combat, dt, city, targets) {
  const hits = [];
  for (const b of combat.bullets) {
    if (!b.active) continue;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0) {
      b.active = false;
      continue;
    }
    if (hitsBuilding(city, b.x, b.y, 1)) {
      spawnParticles(combat, b.x, b.y, 3, '#c9c2ae', 90, 0.3);
      b.active = false;
      continue;
    }
    // Cars are the fattest targets: test them first.
    let struck = false;
    for (const car of targets.cars) {
      if (car.exploded) continue;
      const dx = b.x - car.x;
      const dy = b.y - car.y;
      const along = Math.abs(dx * Math.cos(car.angle) + dy * Math.sin(car.angle));
      const side = Math.abs(-dx * Math.sin(car.angle) + dy * Math.cos(car.angle));
      if (along < 34 && side < 20) {
        car.hp -= b.damage;
        hits.push({ kind: 'car', target: car, x: b.x, y: b.y });
        b.active = false;
        struck = true;
        break;
      }
    }
    if (struck) continue;
    if (!b.fromPlayer) {
      const p = targets.player;
      if (!p.inCar && Math.hypot(b.x - p.x, b.y - p.y) < 16) {
        hits.push({ kind: 'player', target: p, x: b.x, y: b.y, damage: b.damage });
        b.active = false;
        continue;
      }
    } else {
      for (const rival of targets.rivals) {
        if (rival.hp <= 0) continue;
        if (Math.hypot(b.x - rival.x, b.y - rival.y) < 16) {
          hits.push({ kind: 'rival', target: rival, x: b.x, y: b.y, damage: b.damage });
          b.active = false;
          struck = true;
          break;
        }
      }
      if (struck) continue;
      for (const cop of targets.cops) {
        if (Math.hypot(b.x - cop.x, b.y - cop.y) < 15) {
          hits.push({ kind: 'cop', target: cop, x: b.x, y: b.y, damage: b.damage });
          b.active = false;
          struck = true;
          break;
        }
      }
      if (struck) continue;
      for (const ped of targets.peds) {
        if (ped.state === 'down') continue;
        if (Math.hypot(b.x - ped.x, b.y - ped.y) < 13) {
          hits.push({ kind: 'ped', target: ped, x: b.x, y: b.y, damage: b.damage });
          b.active = false;
          break;
        }
      }
    }
  }
  return hits;
}

export function updateParticles(combat, dt) {
  for (const p of combat.particles) {
    if (!p.active) continue;
    p.life -= dt;
    if (p.life <= 0) {
      p.active = false;
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.96;
    p.vy *= 0.96;
  }
}

export function updatePickups(combat, dt) {
  for (const p of combat.pickups) {
    if (p.taken) continue;
    p.bob += dt * 4;
  }
  combat.pickups = combat.pickups.filter((p) => !p.taken);
}

export { circleHitsRect };
