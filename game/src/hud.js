// The HUD: health and cash, wanted stars, the mission objective and timer,
// the minimap, the message feed, and the banners. Everything is drawn in
// screen space over the world, in the same warm palette as the city.
//
// The top-left panel now carries the whole run at a glance: Leo's health
// and cash, his current gun and ammo, the hidden stashes found, Rosa's
// tuning level, the district and time of day, and the car's health while
// he drives. The minimap shows the park, the plaza, the marina, district
// names, stash dots and the rivals as red dots.

import { FONT, PALETTE, VIEW, PLACES, STASH_TOTAL } from './config.js';
import { ROADS_X, ROADS_Y } from './city.js';
import { timeOfDayLabel } from './world.js';

const MINIMAP_W = 210;
const MINIMAP_H = 140;

function star(cx, cy, r, filled, ctx) {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? r : r * 0.45;
    const x = cx + Math.cos(angle) * rad;
    const y = cy + Math.sin(angle) * rad;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = filled ? '#ffd23a' : 'rgba(255,255,255,0.22)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

export function drawHud(ctx, state, screen, viewScale) {
  const player = state.player;
  const w = VIEW.width;
  const h = VIEW.height;
  ctx.save();
  ctx.textBaseline = 'alphabetic';

  // Top-left: Leo, his health and cash, his gun, the stashes, the tuning,
  // the district and the time of day, and the car's health while driving.
  ctx.fillStyle = PALETTE.panel;
  roundRect(ctx, 14, 12, 262, 108, 10);
  ctx.fill();
  ctx.fillStyle = PALETTE.text;
  ctx.font = `700 15px ${FONT}`;
  ctx.fillText('LEO MARLOW', 26, 34);
  ctx.fillStyle = PALETTE.muted;
  ctx.font = `11px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText(`${state.district.toUpperCase()} · ${timeOfDayLabel(state.dayTime)}`, 264, 33);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#20242c';
  roundRect(ctx, 26, 42, 150, 12, 6);
  ctx.fill();
  ctx.fillStyle = player.health > 30 ? PALETTE.health : PALETTE.danger;
  roundRect(ctx, 26, 42, Math.max(0, 150 * (player.health / 100)), 12, 6);
  ctx.fill();
  ctx.fillStyle = '#ffd23a';
  ctx.font = `700 17px ${FONT}`;
  ctx.fillText(`$${Math.floor(player.cash).toLocaleString('en-US')}`, 186, 55);
  ctx.fillStyle = PALETTE.muted;
  ctx.font = `12px ${FONT}`;
  const weaponText = player.weapon === 'shotgun'
    ? `SHOTGUN  ${player.shells} shells`
    : player.weapon === 'pistol'
      ? `PISTOL  ${player.ammo} ammo`
      : 'NO WEAPON — fists only';
  ctx.fillText(weaponText, 26, 72);
  ctx.fillStyle = '#ffd23a';
  ctx.fillText(`STASHES ${state.stats.stashesFound}/${STASH_TOTAL}`, 26, 88);
  ctx.fillStyle = PALETTE.muted;
  ctx.textAlign = 'right';
  ctx.fillText(player.tuning > 0 ? `TUNING Lv${player.tuning}` : 'TUNING Lv0', 264, 88);
  ctx.textAlign = 'left';
  if (player.inCar) {
    const car = player.inCar;
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `11px ${FONT}`;
    ctx.fillText('CAR', 26, 104);
    ctx.fillStyle = '#20242c';
    roundRect(ctx, 58, 95, 120, 9, 4);
    ctx.fill();
    ctx.fillStyle = car.hp > 30 ? '#58d68d' : PALETTE.danger;
    roundRect(ctx, 58, 95, Math.max(0, 120 * (car.hp / (car.kind === 'armored' ? 200 : 100))), 9, 4);
    ctx.fill();
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText(car.kind.toUpperCase(), 186, 104);
  }

  // Top-right: wanted stars.
  ctx.fillStyle = PALETTE.panel;
  roundRect(ctx, w - 208, 12, 194, 44, 10);
  ctx.fill();
  ctx.fillStyle = PALETTE.text;
  ctx.font = `700 13px ${FONT}`;
  ctx.fillText('WANTED', w - 196, 29);
  for (let i = 0; i < 5; i += 1) star(w - 118 + i * 22, 34, 10, i < state.police.wanted, ctx);

  // Top-centre: the mission objective, and the timer when one runs.
  const objective = state.objectiveText;
  ctx.font = `700 15px ${FONT}`;
  const ow = ctx.measureText(objective).width + 32;
  ctx.fillStyle = PALETTE.panel;
  roundRect(ctx, (w - ow) / 2, 12, ow, 34, 10);
  ctx.fill();
  ctx.fillStyle = '#ffd23a';
  ctx.textAlign = 'center';
  ctx.fillText(objective, w / 2, 35);
  ctx.textAlign = 'left';
  if (state.missionTimer > 0) {
    const t = Math.ceil(state.missionTimer);
    ctx.fillStyle = t <= 15 ? PALETTE.danger : PALETTE.text;
    ctx.font = `700 20px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`, w / 2, 68);
    ctx.textAlign = 'left';
  }

  // Mission banner, while it lasts.
  if (state.bannerTimer > 0) {
    const alpha = Math.min(1, state.bannerTimer);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(16, 20, 28, 0.88)';
    roundRect(ctx, w / 2 - 330, 96, 660, 74, 12);
    ctx.fill();
    ctx.fillStyle = '#ffb03a';
    ctx.font = `700 20px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(state.bannerTitle, w / 2, 124);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `14px ${FONT}`;
    wrapText(ctx, state.bannerText, w / 2, 148, 620, 18);
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
  }

  // Message feed, bottom-left.
  ctx.font = `14px ${FONT}`;
  let my = h - 24;
  for (let i = state.messages.length - 1; i >= 0; i -= 1) {
    const msg = state.messages[i];
    ctx.globalAlpha = Math.min(1, msg.life);
    ctx.fillStyle = PALETTE.panel;
    const mw = ctx.measureText(msg.text).width + 20;
    roundRect(ctx, 14, my - 16, mw, 22, 6);
    ctx.fill();
    ctx.fillStyle = msg.color || PALETTE.text;
    ctx.fillText(msg.text, 24, my);
    my -= 28;
  }
  ctx.globalAlpha = 1;

  // Context hint, bottom-centre.
  if (state.hint) {
    ctx.font = `13px ${FONT}`;
    const hw = ctx.measureText(state.hint).width + 20;
    ctx.fillStyle = PALETTE.panel;
    roundRect(ctx, (w - hw) / 2, h - 40, hw, 26, 8);
    ctx.fill();
    ctx.fillStyle = PALETTE.muted;
    ctx.textAlign = 'center';
    ctx.fillText(state.hint, w / 2, h - 22);
    ctx.textAlign = 'left';
  }

  drawMinimap(ctx, state, w, h);
  ctx.restore();
}

function drawMinimap(ctx, state, w, h) {
  const mx = w - MINIMAP_W - 14;
  const my = h - MINIMAP_H - 14;
  const scaleX = MINIMAP_W / 3840;
  const scaleY = MINIMAP_H / 2560;
  ctx.save();
  ctx.fillStyle = PALETTE.panel;
  roundRect(ctx, mx - 6, my - 6, MINIMAP_W + 12, MINIMAP_H + 12, 8);
  ctx.fill();
  ctx.beginPath();
  ctx.rect(mx, my, MINIMAP_W, MINIMAP_H);
  ctx.clip();
  // Ground: grass, then the beach and water at the bottom.
  ctx.fillStyle = '#6f9c55';
  ctx.fillRect(mx, my, MINIMAP_W, MINIMAP_H);
  ctx.fillStyle = '#5d9c4e';
  ctx.fillRect(mx + 1650 * scaleX, my + 850 * scaleY, 540 * scaleX, 380 * scaleY);
  ctx.fillStyle = '#d9cba8';
  ctx.fillRect(mx + 2290 * scaleX, my + 1330 * scaleY, 540 * scaleX, 380 * scaleY);
  ctx.fillStyle = '#e8d29a';
  ctx.fillRect(mx, my + 2400 * scaleY, MINIMAP_W, MINIMAP_H - 2400 * scaleY);
  ctx.fillStyle = '#3aa7c9';
  ctx.fillRect(mx, my + 2500 * scaleY, MINIMAP_W, MINIMAP_H - 2500 * scaleY);
  // Marina docks.
  ctx.fillStyle = '#8a6d3b';
  for (const dock of state.city.docks) {
    ctx.fillRect(mx + dock.x * scaleX, my + dock.y * scaleY, 4, dock.h * scaleY);
  }
  // Roads.
  ctx.strokeStyle = '#3d4450';
  ctx.lineWidth = 3;
  for (const rx of ROADS_X) {
    ctx.beginPath();
    ctx.moveTo(mx + rx * scaleX, my);
    ctx.lineTo(mx + rx * scaleX, my + MINIMAP_H);
    ctx.stroke();
  }
  for (const ry of ROADS_Y) {
    ctx.beginPath();
    ctx.moveTo(mx, my + ry * scaleY);
    ctx.lineTo(mx + MINIMAP_W, my + ry * scaleY);
    ctx.stroke();
  }
  // District names.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.font = `700 8px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('OLD TOWN', mx + 640 * scaleX, my + 1260 * scaleY);
  ctx.fillText('DOWNTOWN', mx + 1920 * scaleX, my + 1260 * scaleY);
  ctx.fillText('HARBOR', mx + 3200 * scaleX, my + 1260 * scaleY);
  ctx.fillText('MARINA', mx + 3360 * scaleX, my + 2340 * scaleY);
  ctx.textAlign = 'left';
  // Hidden stashes as gold dots.
  ctx.fillStyle = '#ffd23a';
  for (const p of state.combat.pickups) {
    if (p.kind !== 'stash' || p.taken) continue;
    ctx.beginPath();
    ctx.arc(mx + p.x * scaleX, my + p.y * scaleY, 2, 0, Math.PI * 2);
    ctx.fill();
  }
  // Rivals as red dots.
  ctx.fillStyle = '#ff5a4e';
  for (const rival of state.rivals) {
    if (rival.state === 'dead') continue;
    ctx.beginPath();
    ctx.arc(mx + rival.x * scaleX, my + rival.y * scaleY, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Mission marker.
  if (state.marker) {
    const pulse = 5 + Math.sin(performance.now() / 200) * 2;
    ctx.fillStyle = '#ffd23a';
    ctx.beginPath();
    ctx.arc(mx + state.marker.x * scaleX, my + state.marker.y * scaleY, pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#20242c';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  // Police, blue; player, white with a dark ring.
  ctx.fillStyle = '#3a6fd8';
  for (const car of state.police.cars) {
    ctx.beginPath();
    ctx.arc(mx + car.x * scaleX, my + car.y * scaleY, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  const player = state.player;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(mx + player.x * scaleX, my + player.y * scaleY, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#20242c';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // North arrow.
  ctx.fillStyle = PALETTE.text;
  ctx.font = `700 11px ${FONT}`;
  ctx.fillText('N', mx + 4, my + 13);
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(ctx, text, cx, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  let ly = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, cx, ly);
      line = word;
      ly += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, cx, ly);
}

export { MINIMAP_W, MINIMAP_H };
