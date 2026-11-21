// The Gulls: the rival crew holding the Dock Warehouse. They stand their
// ground, take cover behind the crates, and shoot at Leo when he comes
// close. One clear job: a simple guard AI — idle, aim, fire, fall.

import { PLAYER } from './config.js';
import { fireBullet } from './combat.js';

const RIVAL_HP = 50;
const RIVAL_RANGE = 420;
const RIVAL_SHOT_COOLDOWN = 0.9;
const RIVAL_DAMAGE = 8;

export function createRival(x, y) {
  return {
    x, y,
    angle: 0,
    hp: RIVAL_HP,
    state: 'guard', // guard | dead
    shootCooldown: 0.5 + Math.random() * 0.8,
    r: 14,
  };
}

export function updateRivals(rivals, dt, combat, player, city) {
  for (const rival of rivals) {
    if (rival.state === 'dead') continue;
    const dx = player.x - rival.x;
    const dy = player.y - rival.y;
    const dist = Math.hypot(dx, dy);
    if (player.inCar || dist > RIVAL_RANGE) {
      rival.shootCooldown = Math.max(0.3, rival.shootCooldown - dt);
      continue;
    }
    rival.angle = Math.atan2(dy, dx);
    rival.shootCooldown -= dt;
    if (rival.shootCooldown <= 0) {
      const spread = (Math.random() - 0.5) * 0.22;
      if (fireBullet(combat, rival.x, rival.y, rival.angle + spread, RIVAL_DAMAGE, false)) {
        rival.shootCooldown = RIVAL_SHOT_COOLDOWN * (0.8 + Math.random() * 0.5);
      }
    }
  }
}

export function aliveRivals(rivals) {
  let count = 0;
  for (const rival of rivals) if (rival.state !== 'dead') count += 1;
  return count;
}
