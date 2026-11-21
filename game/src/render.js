// The renderer: it paints the city, everything in it, and the screens
// around it. The camera follows Leo (or his car) with a soft lag and zooms
// out a little while he drives. The world is drawn in world coordinates
// through the camera; the HUD and the menu screens are drawn in the fixed
// 1280x720 logical view, scaled to fit the window. Nothing here changes
// the world — it only reads it, so a frame can never corrupt a step.

import { FONT, PALETTE, VIEW, WORLD } from './config.js';
import { ROADS_X, ROADS_Y, ROAD_WIDTH } from './city.js';
import { drawHud } from './hud.js';

export const SCREEN_TITLE = 0;
export const SCREEN_PLAY = 1;
export const SCREEN_PAUSED = 2;
export const SCREEN_OVER = 3;
export const SCREEN_COMPLETE = 4;

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  // camera.x/y is the world point at the centre of the logical view.
  const camera = { x: 1600, y: 1280, zoom: 1 };

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
  }
  resize();
  window.addEventListener('resize', resize);

  function viewMetrics() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = canvas.width / dpr;
    const ch = canvas.height / dpr;
    const scale = Math.min(cw / VIEW.width, ch / VIEW.height);
    return { dpr, cw, ch, scale, ox: (cw - VIEW.width * scale) / 2, oy: (ch - VIEW.height * scale) / 2 };
  }

  function updateCamera(state, dt) {
    const focus = state.player;
    const zoom = focus.inCar ? 0.82 : 1;
    camera.zoom += (zoom - camera.zoom) * Math.min(1, dt * 2);
    camera.x += (focus.x - camera.x) * Math.min(1, dt * 5);
    camera.y += (focus.y - camera.y) * Math.min(1, dt * 5);
  }

  /** The world rectangle the camera currently shows, for culling. */
  function visibleRect() {
    return {
      x: camera.x - VIEW.width / 2 / camera.zoom,
      y: camera.y - VIEW.height / 2 / camera.zoom,
      w: VIEW.width / camera.zoom,
      h: VIEW.height / camera.zoom,
    };
  }

  function drawWorld(state) {
    const m = viewMetrics();
    ctx.setTransform(m.dpr, 0, 0, m.dpr, 0, 0);
    ctx.fillStyle = '#20242c';
    ctx.fillRect(0, 0, m.cw, m.ch);
    ctx.save();
    ctx.translate(m.ox + (VIEW.width / 2) * m.scale, m.oy + (VIEW.height / 2) * m.scale);
    ctx.scale(m.scale * camera.zoom, m.scale * camera.zoom);
    ctx.translate(-camera.x, -camera.y);
    const v = visibleRect();
    drawGround(state, v);
    drawBuildings(state, v);
    drawPickups(state);
    drawPeds(state);
    drawRivals(state);
    drawCops(state);
    drawCars(state);
    drawPlayer(state);
    drawBullets(state);
    drawParticles(state);
    drawMarker(state);
    ctx.restore();
  }

  /** Paint in the 1280x720 logical view over the world. */
  function withView(fn) {
    const m = viewMetrics();
    ctx.setTransform(m.dpr, 0, 0, m.dpr, 0, 0);
    ctx.save();
    ctx.translate(m.ox, m.oy);
    ctx.scale(m.scale, m.scale);
    fn();
    ctx.restore();
  }

  function drawGround(state, v) {
    const city = state.city;
    ctx.fillStyle = PALETTE.grass;
    ctx.fillRect(v.x - 20, v.y - 20, v.w + 40, v.h + 40);
    // Beach and water along the south edge.
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(v.x - 20, city.beachY, v.w + 40, WORLD.height - city.beachY + 20);
    ctx.fillStyle = PALETTE.water;
    ctx.fillRect(v.x - 20, 2500, v.w + 40, WORLD.height - 2500 + 20);
    ctx.fillStyle = PALETTE.waterDeep;
    for (let x = Math.floor((v.x - 20) / 260) * 260; x < v.x + v.w + 20; x += 260) {
      ctx.beginPath();
      ctx.arc(x + 60 + Math.sin(state.time * 1.2 + x) * 20, 2520, 26, 0, Math.PI);
      ctx.fill();
    }
    // Park and plaza.
    ctx.fillStyle = PALETTE.park;
    ctx.fillRect(city.park.x, city.park.y, city.park.w, city.park.h);
    ctx.fillStyle = '#d9cba8';
    ctx.fillRect(city.plaza.x, city.plaza.y, city.plaza.w, city.plaza.h);
    // Trees.
    for (const tree of city.trees) {
      if (tree.x < v.x - 40 || tree.x > v.x + v.w + 40 || tree.y < v.y - 40 || tree.y > v.y + v.h + 40) continue;
      ctx.fillStyle = '#4d7a3d';
      ctx.beginPath();
      ctx.arc(tree.x, tree.y, tree.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#6aa84f';
      ctx.beginPath();
      ctx.arc(tree.x - 3, tree.y - 3, tree.r * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    // Roads: sidewalks, asphalt, centre dashes.
    for (const rx of ROADS_X) {
      ctx.fillStyle = PALETTE.sidewalk;
      ctx.fillRect(rx - ROAD_WIDTH / 2 - 12, v.y - 20, ROAD_WIDTH + 24, v.h + 40);
      ctx.fillStyle = PALETTE.asphalt;
      ctx.fillRect(rx - ROAD_WIDTH / 2, v.y - 20, ROAD_WIDTH, v.h + 40);
    }
    for (const ry of ROADS_Y) {
      ctx.fillStyle = PALETTE.sidewalk;
      ctx.fillRect(v.x - 20, ry - ROAD_WIDTH / 2 - 12, v.w + 40, ROAD_WIDTH + 24);
      ctx.fillStyle = PALETTE.asphalt;
      ctx.fillRect(v.x - 20, ry - ROAD_WIDTH / 2, v.w + 40, ROAD_WIDTH);
    }
    ctx.fillStyle = PALETTE.lane;
    for (const rx of ROADS_X) {
      for (let y = Math.floor(v.y / 64) * 64; y < v.y + v.h; y += 64) {
        ctx.fillRect(rx - 3, y, 6, 30);
      }
    }
    for (const ry of ROADS_Y) {
      for (let x = Math.floor(v.x / 64) * 64; x < v.x + v.w; x += 64) {
        ctx.fillRect(x, ry - 3, 30, 6);
      }
    }
    // Crosswalks at every intersection.
    ctx.fillStyle = 'rgba(232, 228, 210, 0.85)';
    for (const rx of ROADS_X) {
      for (const ry of ROADS_Y) {
        for (let i = -2; i <= 2; i += 1) {
          ctx.fillRect(rx + i * 16 - 5, ry - ROAD_WIDTH / 2 - 2, 10, 8);
          ctx.fillRect(rx + i * 16 - 5, ry + ROAD_WIDTH / 2 - 6, 10, 8);
        }
      }
    }
  }

  function drawBuildings(state, v) {
    for (const b of state.city.buildings) {
      if (b.x > v.x + v.w + 40 || b.x + b.w < v.x - 40 || b.y > v.y + v.h + 40 || b.y + b.h < v.y - 40) continue;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.fillRect(b.x + 6, b.y + 8, b.w, b.h);
      ctx.fillStyle = b.wall;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = b.roof;
      ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
      ctx.strokeStyle = 'rgba(0,0,0,0.18)';
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(b.x + b.w * 0.2, b.y + b.h * 0.25, 14, 10);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(b.x + b.w * 0.6, b.y + b.h * 0.55, 18, 12);
    }
  }

  function drawCarShape(car) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    const len = car.kind === 'truck' ? 78 : 64;
    const wid = car.kind === 'truck' ? 34 : 30;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.roundRect(-len / 2 + 3, -wid / 2 + 4, len, wid, 8);
    ctx.fill();
    ctx.fillStyle = '#14161a';
    ctx.fillRect(-len / 2 + 6, -wid / 2 - 4, 14, 7);
    ctx.fillRect(len / 2 - 20, -wid / 2 - 4, 14, 7);
    ctx.fillRect(-len / 2 + 6, wid / 2 - 3, 14, 7);
    ctx.fillRect(len / 2 - 20, wid / 2 - 3, 14, 7);
    ctx.fillStyle = car.paint;
    ctx.beginPath();
    ctx.roundRect(-len / 2, -wid / 2, len, wid, 9);
    ctx.fill();
    ctx.fillStyle = '#202a36';
    ctx.beginPath();
    ctx.roundRect(len / 2 - 22, -wid / 2 + 5, 12, wid - 10, 4);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(-len / 2 + 8, -wid / 2 + 5, 10, wid - 10, 4);
    ctx.fill();
    if (car.kind === 'taxi') {
      ctx.fillStyle = '#20242c';
      ctx.font = '700 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('TAXI', 0, 4);
      ctx.textAlign = 'left';
    }
    if (car.kind === 'police') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-6, -wid / 2 + 3, 12, 5);
      ctx.fillStyle = '#3a6fd8';
      ctx.fillRect(-6, wid / 2 - 8, 12, 5);
      ctx.fillStyle = '#20242c';
      ctx.font = '700 10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('ABPD', 2, 4);
      ctx.textAlign = 'left';
      const phase = Math.floor(performance.now() / 180) % 2 === 0;
      ctx.fillStyle = phase ? '#ff3b30' : '#3a6fd8';
      ctx.beginPath();
      ctx.arc(-2, -wid / 2 + 2, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = phase ? '#3a6fd8' : '#ff3b30';
      ctx.beginPath();
      ctx.arc(-2, wid / 2 - 2, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    if (car.brakeLight) {
      ctx.fillStyle = '#ff2d20';
      ctx.fillRect(-len / 2 - 2, -wid / 2 + 4, 4, 8);
      ctx.fillRect(-len / 2 - 2, wid / 2 - 12, 4, 8);
    }
    if (car.burning > 0) {
      ctx.fillStyle = `rgba(255, ${120 + Math.floor(Math.random() * 80)}, 40, ${0.5 + Math.random() * 0.4})`;
      ctx.beginPath();
      ctx.arc(0, 0, 18 + Math.random() * 10, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawCars(state) {
    for (const car of state.cars) {
      if (car.exploded) continue;
      drawCarShape(car);
    }
    for (const car of state.police.cars) drawCarShape(car);
  }

  function drawPlayer(state) {
    const player = state.player;
    if (player.inCar) return;
    ctx.save();
    ctx.translate(player.x, player.y);
    if (player.invulnerable > 0 && Math.floor(player.invulnerable * 12) % 2 === 0) ctx.globalAlpha = 0.45;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(0, 4, 13, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(player.angle);
    ctx.fillStyle = '#2f6fb2';
    ctx.beginPath();
    ctx.arc(0, 0, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8b98a';
    ctx.beginPath();
    ctx.arc(4, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#20242c';
    ctx.fillRect(8, -2, 12, 4);
    if (player.hasPistol) {
      ctx.fillStyle = '#14161a';
      ctx.fillRect(10, -1.5, 12, 3);
    }
    ctx.restore();
    if (player.muzzle > 0) {
      ctx.fillStyle = '#ffd23a';
      ctx.beginPath();
      ctx.arc(player.x + Math.cos(player.angle) * 26, player.y + Math.sin(player.angle) * 26, 7, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawPeds(state) {
    for (const ped of state.peds) {
      ctx.save();
      ctx.translate(ped.x, ped.y);
      if (ped.state === 'down') {
        ctx.rotate(1.4);
        ctx.globalAlpha = 0.8;
      } else {
        ctx.rotate(ped.angle);
      }
      ctx.fillStyle = ped.shirt;
      ctx.beginPath();
      ctx.arc(0, 0, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = ped.skin;
      ctx.beginPath();
      ctx.arc(3, 0, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawRivals(state) {
    for (const rival of state.rivals) {
      if (rival.state === 'dead') continue;
      ctx.save();
      ctx.translate(rival.x, rival.y);
      ctx.rotate(rival.angle);
      ctx.fillStyle = '#7a1f1f';
      ctx.beginPath();
      ctx.arc(0, 0, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e8b98a';
      ctx.beginPath();
      ctx.arc(4, 0, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#14161a';
      ctx.fillRect(10, -1.5, 12, 3);
      ctx.restore();
      ctx.fillStyle = '#20242c';
      ctx.fillRect(rival.x - 14, rival.y - 24, 28, 5);
      ctx.fillStyle = '#ff5a4e';
      ctx.fillRect(rival.x - 14, rival.y - 24, 28 * Math.max(0, rival.hp / 50), 5);
    }
  }

  function drawCops(state) {
    for (const cop of state.police.cops) {
      ctx.save();
      ctx.translate(cop.x, cop.y);
      ctx.rotate(cop.angle);
      ctx.fillStyle = '#1f3a6e';
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e8b98a';
      ctx.beginPath();
      ctx.arc(4, 0, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3a6fd8';
      ctx.fillRect(-8, -8, 6, 16);
      ctx.restore();
    }
  }

  function drawBullets(state) {
    ctx.fillStyle = '#ffe9a8';
    for (const b of state.combat.bullets) {
      if (!b.active) continue;
      ctx.fillRect(b.x - 3, b.y - 1.5, 6, 3);
    }
  }

  function drawParticles(state) {
    for (const p of state.combat.particles) {
      if (!p.active) continue;
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawPickups(state) {
    for (const p of state.combat.pickups) {
      if (p.taken) continue;
      const bob = Math.sin(p.bob) * 3;
      ctx.save();
      ctx.translate(p.x, p.y + bob);
      if (p.kind === 'health') {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(0, 0, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#e5534b';
        ctx.fillRect(-2.5, -8, 5, 16);
        ctx.fillRect(-8, -2.5, 16, 5);
      } else if (p.kind === 'ammo') {
        ctx.fillStyle = '#20242c';
        ctx.beginPath();
        ctx.arc(0, 0, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffd23a';
        ctx.fillRect(-6, -3, 12, 6);
      } else {
        ctx.fillStyle = '#ffd23a';
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#8a6d1f';
        ctx.font = '700 12px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('$', 0, 4);
        ctx.textAlign = 'left';
      }
      ctx.restore();
    }
    if (state.crateAt) {
      ctx.save();
      ctx.translate(state.crateAt.x, state.crateAt.y + Math.sin(state.time * 3) * 3);
      ctx.fillStyle = '#8a6d3b';
      ctx.fillRect(-12, -12, 24, 24);
      ctx.strokeStyle = '#5a451f';
      ctx.lineWidth = 2;
      ctx.strokeRect(-12, -12, 24, 24);
      ctx.restore();
    }
  }

  function drawMarker(state) {
    if (!state.marker) return;
    const pulse = 1 + Math.sin(state.time * 4) * 0.15;
    ctx.save();
    ctx.translate(state.marker.x, state.marker.y);
    ctx.strokeStyle = '#ffd23a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 34 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffd23a';
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 210, 58, 0.18)';
    ctx.fillRect(-8, -220, 16, 220);
    ctx.restore();
    const px = state.player.x;
    const py = state.player.y;
    const dx = state.marker.x - px;
    const dy = state.marker.y - py;
    const dist = Math.hypot(dx, dy);
    const viewR = 560;
    if (dist > viewR) {
      const ax = px + (dx / dist) * (viewR - 60);
      const ay = py + (dy / dist) * (viewR - 60);
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(Math.atan2(dy, dx));
      ctx.fillStyle = '#ffd23a';
      ctx.beginPath();
      ctx.moveTo(18, 0);
      ctx.lineTo(-10, -12);
      ctx.lineTo(-10, 12);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  function drawTitle(state, best) {
    drawWorld(state);
    withView(() => {
      ctx.fillStyle = 'rgba(10, 14, 22, 0.62)';
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffb03a';
      ctx.font = `800 64px ${FONT}`;
      ctx.fillText('AZURE BAY', VIEW.width / 2, 210);
      ctx.fillStyle = PALETTE.text;
      ctx.font = `300 26px ${FONT}`;
      ctx.fillText('an open-world crime story', VIEW.width / 2, 252);
      ctx.font = `15px ${FONT}`;
      ctx.fillStyle = PALETTE.muted;
      ctx.fillText('A city to take, one job at a time.', VIEW.width / 2, 282);
      ctx.fillStyle = '#ffd23a';
      ctx.font = `700 20px ${FONT}`;
      ctx.fillText(state.hasSave ? 'ENTER — Continue' : 'ENTER — New game', VIEW.width / 2, 360);
      ctx.fillStyle = PALETTE.text;
      ctx.font = `15px ${FONT}`;
      ctx.fillText('WASD drive & walk · Mouse aim · Click shoot · E steal a car · SPACE punch · P pause', VIEW.width / 2, 420);
      ctx.fillText('Steal cars. Lose the cops. Run the five jobs for Mara Voss.', VIEW.width / 2, 448);
      if (best > 0) {
        ctx.fillStyle = PALETTE.muted;
        ctx.fillText(`Best haul: $${best.toLocaleString('en-US')}`, VIEW.width / 2, 486);
      }
      ctx.textAlign = 'left';
    });
  }

  function drawPaused() {
    drawWorld(stateRef);
    withView(() => {
      ctx.fillStyle = 'rgba(10, 14, 22, 0.6)';
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
      ctx.textAlign = 'center';
      ctx.fillStyle = PALETTE.text;
      ctx.font = `800 44px ${FONT}`;
      ctx.fillText('PAUSED', VIEW.width / 2, 320);
      ctx.font = `16px ${FONT}`;
      ctx.fillStyle = PALETTE.muted;
      ctx.fillText('P or ESC to keep playing · M to mute · your progress saves itself', VIEW.width / 2, 360);
      ctx.textAlign = 'left';
    });
  }

  function drawOver(state, title, subtitle) {
    drawWorld(state);
    withView(() => {
      ctx.fillStyle = 'rgba(10, 14, 22, 0.72)';
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ff5a4e';
      ctx.font = `800 56px ${FONT}`;
      ctx.fillText(title, VIEW.width / 2, 300);
      ctx.fillStyle = PALETTE.text;
      ctx.font = `18px ${FONT}`;
      ctx.fillText(subtitle, VIEW.width / 2, 344);
      ctx.fillStyle = '#ffd23a';
      ctx.font = `700 20px ${FONT}`;
      ctx.fillText('ENTER — back on the streets', VIEW.width / 2, 410);
      ctx.textAlign = 'left';
    });
  }

  function drawComplete(state) {
    drawWorld(state);
    withView(() => {
      ctx.fillStyle = 'rgba(10, 14, 22, 0.66)';
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffd23a';
      ctx.font = `800 52px ${FONT}`;
      ctx.fillText('THE AZURE SCORE', VIEW.width / 2, 280);
      ctx.fillStyle = PALETTE.text;
      ctx.font = `18px ${FONT}`;
      ctx.fillText('Leo pulled it off. Five jobs, one city, his name on every corner.', VIEW.width / 2, 322);
      ctx.fillText(`Total haul: $${Math.floor(state.player.cash).toLocaleString('en-US')}`, VIEW.width / 2, 352);
      ctx.fillStyle = '#ffd23a';
      ctx.font = `700 20px ${FONT}`;
      ctx.fillText('ENTER — keep roaming Azure Bay', VIEW.width / 2, 410);
      ctx.textAlign = 'left';
    });
  }

  let stateRef = null;

  function draw(state, screen, best) {
    stateRef = state;
    if (screen === SCREEN_TITLE) {
      drawTitle(state, best);
      return;
    }
    if (screen === SCREEN_PAUSED) {
      drawPaused();
      return;
    }
    if (screen === SCREEN_OVER) {
      drawOver(state, state.overTitle || 'BUSTED', state.overSubtitle || 'The ABPD took you in.');
      return;
    }
    if (screen === SCREEN_COMPLETE) {
      drawComplete(state);
      return;
    }
    drawWorld(state);
    withView(() => {
      drawHud(ctx, state, screen);
    });
    // Damage flash over everything.
    if (state.damageFlash > 0) {
      const m = viewMetrics();
      ctx.setTransform(m.dpr, 0, 0, m.dpr, 0, 0);
      ctx.fillStyle = `rgba(255, 40, 30, ${Math.min(0.35, state.damageFlash)})`;
      ctx.fillRect(0, 0, m.cw, m.ch);
    }
  }

  return { draw, updateCamera, camera };
}
