// The renderer: it paints the city, everything in it, and the screens
// around it. The camera follows Leo (or his car) with a soft lag and zooms
// out a little while he drives. The world is drawn in world coordinates
// through the camera; the HUD and the menu screens are drawn in the fixed
// 1280x720 logical view, scaled to fit the window. Nothing here changes
// the world — it only reads it, so a frame can never corrupt a step.
//
// Light and weather are painted here too: as the day slides into night the
// city darkens, windows light up, streetlights glow and headlights cut
// through the dark; when the rain comes, streaks cross the screen and the
// umbrellas come out. The airfield, the casino and the police helicopter
// are painted here as well — the helicopter with a searchlight that
// follows Leo while the heat is at five stars.

import { FONT, PALETTE, VIEW, WORLD, CAR_KINDS } from './config.js';
import { ROADS_X, ROADS_Y, ROAD_WIDTH } from './city.js';
import { drawHud } from './hud.js';
import { nightFactor } from './world.js';
import { hash2 } from './random.js';

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
    drawHelicopter(state);
    ctx.restore();
  }

  /** The police helicopter: a shadow on the ground, a body above it, a
   * spinning rotor, and a searchlight cone that follows Leo. */
  function drawHelicopter(state) {
    const heli = state.police.heli;
    if (!heli) return;
    const night = nightFactor(state.dayTime);
    const player = state.player;
    const hx = heli.x;
    const hy = heli.y - 52;
    ctx.save();
    // Searchlight: a cone from the helicopter to Leo, and a bright pool
    // of light on the ground where he stands.
    const dx = player.x - hx;
    const dy = player.y - hy;
    const d = Math.hypot(dx, dy) || 1;
    const nx = -dy / d;
    const ny = dx / d;
    ctx.fillStyle = `rgba(255, 240, 180, ${(0.08 + 0.10 * night).toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(player.x + nx * 90, player.y + ny * 90);
    ctx.lineTo(player.x - nx * 90, player.y - ny * 90);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = `rgba(255, 240, 180, ${(0.12 + 0.10 * night).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(player.x, player.y, 95, 0, Math.PI * 2);
    ctx.fill();
    // Shadow on the ground, then the body above it.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.beginPath();
    ctx.ellipse(heli.x, heli.y, 26, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.translate(hx, hy);
    ctx.fillStyle = '#1f3a6e';
    ctx.fillRect(-52, -3, 28, 6);
    ctx.fillStyle = '#ff3b30';
    ctx.fillRect(-54, -6, 6, 12);
    ctx.fillStyle = '#1f3a6e';
    ctx.beginPath();
    ctx.roundRect(-26, -10, 52, 20, 9);
    ctx.fill();
    ctx.fillStyle = '#3a6fd8';
    ctx.fillRect(-26, -4, 12, 8);
    ctx.fillStyle = '#e8e4da';
    ctx.beginPath();
    ctx.roundRect(6, -6, 12, 12, 5);
    ctx.fill();
    const rotor = state.time * 18;
    ctx.strokeStyle = 'rgba(20, 22, 26, 0.85)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-Math.cos(rotor) * 34, -Math.sin(rotor) * 34);
    ctx.lineTo(Math.cos(rotor) * 34, Math.sin(rotor) * 34);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ABPD', 0, 3);
    ctx.textAlign = 'left';
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

  /** World point -> logical view point, for overlays that follow the camera. */
  function worldToView(x, y) {
    return { x: VIEW.width / 2 + (x - camera.x) * camera.zoom, y: VIEW.height / 2 + (y - camera.y) * camera.zoom };
  }

  /** Night darkness, headlight cones, streetlight glow, and rain streaks. */
  function drawNightAndRain(state) {
    const night = nightFactor(state.dayTime);
    withView(() => {
      if (night > 0.02) {
        ctx.fillStyle = `rgba(8, 12, 30, ${(0.48 * night).toFixed(3)})`;
        ctx.fillRect(0, 0, VIEW.width, VIEW.height);
        // Headlights: pale cones ahead of Leo's car and the cruisers.
        ctx.globalCompositeOperation = 'lighter';
        const cars = [state.player.inCar, ...state.police.cars].filter(Boolean);
        for (const car of cars) {
          const p = worldToView(car.x, car.y);
          if (p.x < -200 || p.x > VIEW.width + 200 || p.y < -200 || p.y > VIEW.height + 200) continue;
          const fx = Math.cos(car.angle);
          const fy = Math.sin(car.angle);
          const reach = 220 * camera.zoom;
          const spread = 0.26;
          ctx.fillStyle = `rgba(255, 230, 150, ${(0.06 * night).toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(p.x + fx * 30 * camera.zoom, p.y + fy * 30 * camera.zoom);
          const left = Math.atan2(fy, fx) - spread;
          const right = Math.atan2(fy, fx) + spread;
          ctx.lineTo(p.x + Math.cos(left) * reach, p.y + Math.sin(left) * reach);
          ctx.lineTo(p.x + Math.cos(right) * reach, p.y + Math.sin(right) * reach);
          ctx.closePath();
          ctx.fill();
        }
        // Streetlights glow at every intersection.
        for (const rx of ROADS_X) {
          for (const ry of ROADS_Y) {
            const p = worldToView(rx, ry);
            if (p.x < -40 || p.x > VIEW.width + 40 || p.y < -40 || p.y > VIEW.height + 40) continue;
            ctx.fillStyle = `rgba(255, 220, 130, ${(0.10 * night).toFixed(3)})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 18 * camera.zoom, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.globalCompositeOperation = 'source-over';
      }
      if (state.rain > 0.05) {
        ctx.strokeStyle = `rgba(180, 200, 220, ${(0.28 * state.rain).toFixed(3)})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < 90; i += 1) {
          const x = (i * 137.5 + state.time * 120) % 1360 - 40;
          const y = (i * 89.3 + state.time * 900) % 800 - 40;
          ctx.moveTo(x, y);
          ctx.lineTo(x - 6, y + 18);
        }
        ctx.stroke();
      }
    });
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
    // Sunlight shimmering on the water: short pale streaks that drift
    // with the time, so the bay never sits still.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    for (let x = Math.floor((v.x - 20) / 180) * 180; x < v.x + v.w + 20; x += 180) {
      const driftA = (state.time * 24 + x) % 180;
      const driftB = (state.time * 14 + x * 2) % 180;
      ctx.fillRect(x + driftA - 90, 2512, 56, 3);
      ctx.fillRect(x + driftB - 90, 2532, 40, 3);
    }
    // Marina docks and moored boats.
    for (const dock of city.docks) {
      ctx.fillStyle = '#8a6d3b';
      ctx.fillRect(dock.x, dock.y, dock.w, dock.h);
      ctx.fillStyle = '#6b5227';
      for (let y = dock.y + 8; y < dock.y + dock.h; y += 16) ctx.fillRect(dock.x, y, dock.w, 3);
    }
    for (const boat of city.boats) {
      ctx.save();
      ctx.translate(boat.x, boat.y);
      ctx.rotate(boat.angle);
      ctx.fillStyle = boat.hull;
      ctx.beginPath();
      ctx.roundRect(-26, -9, 52, 18, 8);
      ctx.fill();
      ctx.fillStyle = '#202a36';
      ctx.fillRect(-4, -3, 12, 6);
      ctx.strokeStyle = '#5a451f';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(0, -26);
      ctx.stroke();
      ctx.fillStyle = '#f2ede0';
      ctx.beginPath();
      ctx.moveTo(0, -26);
      ctx.lineTo(0, -6);
      ctx.lineTo(14, -6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    // Park and plaza, with the fountain in the plaza.
    ctx.fillStyle = PALETTE.park;
    ctx.fillRect(city.park.x, city.park.y, city.park.w, city.park.h);
    ctx.fillStyle = '#d9cba8';
    ctx.fillRect(city.plaza.x, city.plaza.y, city.plaza.w, city.plaza.h);
    const f = city.fountain;
    ctx.fillStyle = '#b9c4c9';
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3aa7c9';
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.r - 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8fd4e8';
    for (let i = 0; i < 6; i += 1) {
      const a = state.time * 1.5 + (i * Math.PI) / 3;
      ctx.beginPath();
      ctx.arc(f.x + Math.cos(a) * 16, f.y + Math.sin(a) * 16, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Azure Field: grey tarmac over the whole north-west block, a runway
    // with dashes and threshold bars, and a windsock by the hangar.
    const af = city.airfield;
    ctx.fillStyle = '#8a8f98';
    ctx.fillRect(af.x, af.y, af.w, af.h);
    ctx.fillStyle = '#3d4450';
    ctx.fillRect(af.runway.x, af.runway.y, af.runway.w, af.runway.h);
    ctx.fillStyle = '#e8e4d2';
    for (let x = af.runway.x + 24; x < af.runway.x + af.runway.w - 20; x += 64) {
      ctx.fillRect(x, af.runway.y + af.runway.h / 2 - 3, 30, 6);
    }
    for (let i = 0; i < 4; i += 1) {
      ctx.fillRect(af.runway.x + 8, af.runway.y + 10 + i * 20, 10, 12);
      ctx.fillRect(af.runway.x + af.runway.w - 18, af.runway.y + 10 + i * 20, 10, 12);
    }
    const ws = af.windsock;
    ctx.strokeStyle = '#20242c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(ws.x, ws.y);
    ctx.lineTo(ws.x, ws.y - 34);
    ctx.stroke();
    ctx.fillStyle = '#e07856';
    ctx.save();
    ctx.translate(ws.x, ws.y - 34);
    ctx.rotate(Math.sin(state.time * 1.6) * 0.25 + 0.35);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(26, -5);
    ctx.lineTo(26, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
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
    const night = nightFactor(state.dayTime);
    for (const b of state.city.buildings) {
      if (b.x > v.x + v.w + 40 || b.x + b.w < v.x - 40 || b.y > v.y + v.h + 40 || b.y + b.h < v.y - 40) continue;
      if (b.hangar) {
        // The Azure Field hangar: dark steel walls and a big ribbed door.
        ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
        ctx.fillRect(b.x + 6, b.y + 8, b.w, b.h);
        ctx.fillStyle = '#6b7280';
        ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.fillStyle = '#4b5563';
        ctx.fillRect(b.x + 14, b.y + 12, b.w - 28, b.h - 24);
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 2;
        for (let x = b.x + 34; x < b.x + b.w - 14; x += 24) {
          ctx.beginPath();
          ctx.moveTo(x, b.y + 12);
          ctx.lineTo(x, b.y + b.h - 12);
          ctx.stroke();
        }
        ctx.fillStyle = '#ffd23a';
        ctx.font = '700 13px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('AZURE FIELD', b.x + b.w / 2, b.y - 8);
        ctx.textAlign = 'left';
        continue;
      }
      if (b.plane) {
        // The parked plane on the runway: white fuselage, blue stripe,
        // wings and tail, all inside its own footprint.
        ctx.save();
        ctx.translate(b.x + b.w / 2, b.y + b.h / 2);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath();
        ctx.ellipse(3, 5, b.w / 2, b.h / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#d9d4c8';
        ctx.fillRect(-30, -b.h / 2 + 2, 40, b.h - 4);
        ctx.fillRect(-30, -b.h / 2 + 2, 40, 8);
        ctx.fillRect(-30, b.h / 2 - 10, 40, 8);
        ctx.fillStyle = '#e8e4da';
        ctx.beginPath();
        ctx.roundRect(-b.w / 2, -b.h / 2 + 8, b.w, b.h - 16, 14);
        ctx.fill();
        ctx.fillStyle = '#3d7dd9';
        ctx.fillRect(-b.w / 2 + 10, -2, b.w - 20, 5);
        ctx.fillStyle = '#202a36';
        ctx.beginPath();
        ctx.roundRect(b.w / 2 - 24, -b.h / 2 + 14, 12, b.h - 28, 4);
        ctx.fill();
        ctx.fillStyle = '#d9d4c8';
        ctx.fillRect(-b.w / 2 + 2, -b.h / 2 + 2, 10, 12);
        ctx.fillRect(-b.w / 2 + 2, b.h / 2 - 14, 10, 12);
        ctx.restore();
        continue;
      }
      if (b.casino) {
        // The Meridian Casino: deep purple walls, gold trim, and a neon
        // sign that glows harder after dark.
        const glow = 0.55 + 0.45 * night;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(b.x + 8, b.y + 10, b.w, b.h);
        ctx.fillStyle = '#3b2d5e';
        ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.strokeStyle = '#c9a227';
        ctx.lineWidth = 4;
        ctx.strokeRect(b.x + 4, b.y + 4, b.w - 8, b.h - 8);
        ctx.fillStyle = '#241a3d';
        ctx.fillRect(b.x + 16, b.y + 16, b.w - 32, b.h - 32);
        ctx.fillStyle = `rgba(255, 210, 58, ${glow.toFixed(2)})`;
        ctx.font = '800 30px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('MERIDIAN', b.x + b.w / 2, b.y + b.h / 2 - 6);
        ctx.font = '700 13px system-ui, sans-serif';
        ctx.fillStyle = `rgba(255, 255, 255, ${(0.25 + 0.75 * glow).toFixed(2)})`;
        ctx.fillText('C A S I N O', b.x + b.w / 2, b.y + b.h / 2 + 22);
        ctx.textAlign = 'left';
        for (let x = b.x + 20; x < b.x + b.w - 10; x += 24) {
          ctx.fillStyle = `rgba(255, 210, 58, ${glow.toFixed(2)})`;
          ctx.beginPath();
          ctx.arc(x, b.y + b.h - 12, 3, 0, Math.PI * 2);
          ctx.fill();
        }
        continue;
      }
      ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.fillRect(b.x + 6, b.y + 8, b.w, b.h);
      ctx.fillStyle = b.wall;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = b.roof;
      ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
      ctx.strokeStyle = 'rgba(0,0,0,0.18)';
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
      // Windows: a stable grid per building; at night some of them glow.
      const cols = Math.max(1, Math.floor((b.w - 16) / 36));
      const rows = Math.max(1, Math.floor((b.h - 16) / 36));
      for (let cx = 0; cx < cols; cx += 1) {
        for (let cy = 0; cy < rows; cy += 1) {
          const wx = b.x + 14 + cx * 36;
          const wy = b.y + 14 + cy * 36;
          const lit = hash2(b.x + cx * 7 + (b.seed || 0) * 100, b.y + cy * 13) < 0.4;
          ctx.fillStyle = lit && night > 0.05
            ? `rgba(255, 217, 122, ${(0.35 + 0.65 * night).toFixed(3)})`
            : 'rgba(0,0,0,0.14)';
          ctx.fillRect(wx, wy, 11, 8);
        }
      }
      // Mansion pools.
      if (b.pool) {
        ctx.fillStyle = '#3aa7c9';
        ctx.fillRect(b.pool.x, b.pool.y, b.pool.w, b.pool.h);
        ctx.strokeStyle = '#e8dcc8';
        ctx.lineWidth = 3;
        ctx.strokeRect(b.pool.x, b.pool.y, b.pool.w, b.pool.h);
      }
    }
  }

  function drawCarShape(car) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    const kind = CAR_KINDS[car.kind] || CAR_KINDS.sedan;
    const len = kind.length;
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
    if (car.kind === 'muscle') {
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillRect(-len / 2 + 4, -3, len - 8, 6);
    }
    if (car.kind === 'limo') {
      ctx.fillStyle = '#202a36';
      ctx.fillRect(-6, -wid / 2 + 5, 12, wid - 10);
    }
    if (car.kind === 'armored') {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(-len / 2 + 4, -wid / 2 + 3, len - 8, 5);
      ctx.fillRect(-len / 2 + 4, wid / 2 - 8, len - 8, 5);
      ctx.fillStyle = '#ffd23a';
      ctx.font = '700 9px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('VAULT', 0, 3);
      ctx.textAlign = 'left';
    }
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
    if (player.weapon === 'pistol') {
      ctx.fillStyle = '#14161a';
      ctx.fillRect(10, -1.5, 12, 3);
    } else if (player.weapon === 'shotgun') {
      ctx.fillStyle = '#14161a';
      ctx.fillRect(10, -2, 20, 4);
      ctx.fillStyle = '#5a451f';
      ctx.fillRect(12, -2, 8, 4);
    }
    ctx.restore();
    if (player.muzzle > 0) {
      ctx.fillStyle = '#ffd23a';
      ctx.beginPath();
      ctx.arc(player.x + Math.cos(player.angle) * 26, player.y + Math.sin(player.angle) * 26, player.weapon === 'shotgun' ? 11 : 7, 0, Math.PI * 2);
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
      // Umbrellas come out in the rain.
      if (ped.umbrella && state.rain > 0.4 && ped.state !== 'down') {
        ctx.save();
        ctx.translate(ped.x, ped.y - 2);
        ctx.fillStyle = '#d94f3d';
        ctx.beginPath();
        ctx.arc(0, 0, 13, Math.PI, 0);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#20242c';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, 10);
        ctx.stroke();
        ctx.restore();
      }
      // A waiting fare customer gets a gold ring, so the cab knows them.
      if (ped.fare) {
        ctx.strokeStyle = '#ffd23a';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(ped.x, ped.y, 17, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  function drawRivals(state) {
    for (const rival of state.rivals) {
      if (rival.state === 'dead') continue;
      ctx.save();
      ctx.translate(rival.x, rival.y);
      ctx.rotate(rival.angle);
      ctx.fillStyle = rival.kind === 'guard' ? '#2b3a55' : '#7a1f1f';
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
      const maxHp = rival.maxHp || 50;
      ctx.fillStyle = '#20242c';
      ctx.fillRect(rival.x - 14, rival.y - 24, 28, 5);
      ctx.fillStyle = '#ff5a4e';
      ctx.fillRect(rival.x - 14, rival.y - 24, 28 * Math.max(0, rival.hp / maxHp), 5);
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
      } else if (p.kind === 'shells') {
        ctx.fillStyle = '#7a1f1f';
        ctx.beginPath();
        ctx.arc(0, 0, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffd23a';
        ctx.fillRect(-7, -2, 5, 8);
        ctx.fillRect(2, -2, 5, 8);
      } else if (p.kind === 'stash') {
        ctx.fillStyle = '#ffcf3d';
        ctx.beginPath();
        ctx.arc(0, 0, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#8a6d1f';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#8a6d1f';
        ctx.font = '700 12px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('★', 0, 4);
        ctx.textAlign = 'left';
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
    drawNightAndRain(state);
    withView(() => {
      ctx.fillStyle = 'rgba(10, 14, 22, 0.62)';
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffb03a';
      ctx.font = `800 64px ${FONT}`;
      ctx.fillText('AZURE BAY', VIEW.width / 2, 200);
      ctx.fillStyle = PALETTE.text;
      ctx.font = `300 26px ${FONT}`;
      ctx.fillText('an open-world crime story', VIEW.width / 2, 242);
      ctx.font = `15px ${FONT}`;
      ctx.fillStyle = PALETTE.muted;
      ctx.fillText('A city to take, one job at a time — day, dusk, night and rain.', VIEW.width / 2, 272);
      ctx.fillStyle = '#ffd23a';
      ctx.font = `700 20px ${FONT}`;
      ctx.fillText(state.hasSave ? 'ENTER — Continue' : 'ENTER — New game', VIEW.width / 2, 350);
      ctx.fillStyle = PALETTE.text;
      ctx.font = `15px ${FONT}`;
      ctx.fillText('WASD drive & walk · Mouse aim · Click shoot · E steal a car · SPACE punch', VIEW.width / 2, 410);
      ctx.fillText('R repair & tune at Rosa\u2019s Garage · Q switch weapon · P pause', VIEW.width / 2, 436);
      ctx.fillText('Steal cars. Lose the cops. Run the twelve jobs for Mara Voss.', VIEW.width / 2, 466);
      if (best > 0) {
        ctx.fillStyle = PALETTE.muted;
        ctx.fillText(`Best haul: $${best.toLocaleString('en-US')}`, VIEW.width / 2, 504);
      }
      ctx.textAlign = 'left';
    });
  }

  function drawPaused() {
    drawWorld(stateRef);
    drawNightAndRain(stateRef);
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
    drawNightAndRain(state);
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
    drawNightAndRain(state);
    withView(() => {
      ctx.fillStyle = 'rgba(10, 14, 22, 0.66)';
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffd23a';
      ctx.font = `800 52px ${FONT}`;
      ctx.fillText('THE MERIDIAN JOB', VIEW.width / 2, 260);
      ctx.fillStyle = PALETTE.text;
      ctx.font = `18px ${FONT}`;
      ctx.fillText('Leo pulled it off. Twelve jobs, one city, his name on every corner.', VIEW.width / 2, 302);
      ctx.fillText(`Total haul: $${Math.floor(state.player.cash).toLocaleString('en-US')}`, VIEW.width / 2, 332);
      ctx.fillStyle = PALETTE.muted;
      ctx.font = `15px ${FONT}`;
      ctx.fillText(`Cars stolen ${state.stats.carsStolen} · Stashes ${state.stats.stashesFound}/12 · Shots fired ${state.stats.shotsFired}`, VIEW.width / 2, 364);
      ctx.fillStyle = '#ffd23a';
      ctx.font = `700 20px ${FONT}`;
      ctx.fillText('ENTER — keep roaming Azure Bay', VIEW.width / 2, 420);
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
    drawNightAndRain(state);
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
