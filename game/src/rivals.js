// The Gulls: the rival crew holding the Dock Warehouse — and the Azure
// Bank guards who hold the vault in the finale. They stand their ground,
// take cover behind the crates, and shoot at Leo when he comes close. One
// clear job: a simple guard AI — idle, aim, fire, fall. Guards are tougher
// and shoot faster than street Gulls, and sidestep while they aim.

import { PLAYER } from './config.js';
import { fireBullet } from './combat.js';

const RIVAL_HP = 50;
const GUARD_HP = 80;
const RIVAL_RANGE = 420;
const RIVAL_SHOT_COOLDOWN = 0.9;
const GUARD_SHOT_COOLDOWN = 0.7;
const RIVAL_DAMAGE = 8;
const GUARD_DAMAGE = 10;

export function createRival(x, y, kind) {
  const guard = kind === 'guard';
  return {
    x, y,
    angle: 0,
    hp: guard ? GUARD_HP : RIVAL_HP,
    maxHp: guard ? GUARD_HP : RIVAL_HP,
    kind: guard ? 'guard' : 'gull',
    state: 'guard', // guard | dead
    shootCooldown: 0.5 + Math.random() * 0.8,
    strafeTimer: 1 + Math.random() * 2,
    strafeDir: Math.random() < 0.5 ? 1 : -1,
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
    // Guards sidestep while they aim, so they are not standing targets.
    if (rival.kind === 'guard') {
      rival.strafeTimer -= dt;
      if (rival.strafeTimer <= 0) {
        rival.strafeTimer = 0.8 + Math.random() * 1.2;
        rival.strafeDir = -rival.strafeDir;
      }
      rival.x += -Math.sin(rival.angle) * rival.strafeDir * 40 * dt;
      rival.y += Math.cos(rival.angle) * rival.strafeDir * 40 * dt;
    }
    rival.shootCooldown -= dt;
    if (rival.shootCooldown <= 0) {
      const spread = (Math.random() - 0.5) * 0.22;
      const damage = rival.kind === 'guard' ? GUARD_DAMAGE : RIVAL_DAMAGE;
      const cooldown = rival.kind === 'guard' ? GUARD_SHOT_COOLDOWN : RIVAL_SHOT_COOLDOWN;
      if (fireBullet(combat, rival.x, rival.y, rival.angle + spread, damage, false)) {
        rival.shootCooldown = cooldown * (0.8 + Math.random() * 0.5);
      }
    }
  }
}

export function aliveRivals(rivals) {
  let count = 0;
  for (const rival of rivals) if (rival.state !== 'dead') count += 1;
  return count;
}
