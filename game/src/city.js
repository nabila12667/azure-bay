// Azure Bay itself: the road grid, the blocks between the roads, the
// buildings that fill them, the beach and harbour at the edges, and the
// collision and road helpers every moving thing uses. The layout is fixed
// (roads on a grid, landmarks at named corners); only the buildings' sizes
// and colours come from the seeded random, so the city is the same every run.
//
// The city has five districts — Old Town in the west, Downtown in the
// middle, the Harbor in the east, the Marina on the southern beach, and
// the Airfield in the north-west corner — plus a park, a plaza with a
// fountain, the Meridian Casino south of the plaza, and two mansions with
// pools in the North Hills.

import { WORLD } from './config.js';

export const ROAD_WIDTH = 110;

/** Vertical and horizontal road centrelines. */
export const ROADS_X = [320, 960, 1600, 2240, 2880, 3520];
export const ROADS_Y = [320, 800, 1280, 1760, 2240];

const ROOF_COLOURS = ['#c96f4a', '#d9a05b', '#7fb3a3', '#b08968', '#e07a5f', '#8fa8c8', '#c9b458'];
const WALL_COLOURS = ['#e8dcc8', '#f2e6d0', '#dfe8dd', '#ead9c2', '#e3d3e0'];

/** The district a point in the city belongs to, for the HUD and minimap. */
export function districtOf(x, y) {
  if (y >= 2400) return 'Beach';
  if (x >= 3200 && y >= 2000) return 'Marina';
  if (x < 960 && y < 800) return 'Airfield';
  if (x < 1280) return 'Old Town';
  if (x < 2560) return 'Downtown';
  return 'Harbor';
}

function overlapsRoad(x, y, w, h) {
  const half = ROAD_WIDTH / 2 + 8;
  for (const rx of ROADS_X) {
    if (x < rx + half && x + w > rx - half) return true;
  }
  for (const ry of ROADS_Y) {
    if (y < ry + half && y + h > ry - half) return true;
  }
  return false;
}

export function createCity(random) {
  const buildings = [];
  const trees = [];
  // The park block (between 1600-2240 x 800-1280) and the downtown plaza
  // (2240-2880 x 1280-1760) stay open; the beach is the southern strip.
  const park = { x: 1650, y: 850, w: 540, h: 380 };
  const plaza = { x: 2290, y: 1330, w: 540, h: 380 };
  const fountain = { x: 2560, y: 1520, r: 42 };
  const beachY = 2400;
  // Azure Field, the airfield in the north-west corner (the 320-960 x
  // 320-800 block): tarmac, a runway, a hangar and a parked plane.
  const airfield = {
    x: 389, y: 389, w: 502, h: 356,
    runway: { x: 400, y: 555, w: 480, h: 90 },
    windsock: { x: 850, y: 430 },
  };
  // The Meridian Casino, the block south of the plaza (2240-2880 x
  // 1760-2240): one big purple building with a neon sign, no small blocks.
  const casino = { x: 2400, y: 1900, w: 320, h: 180 };

  for (let gx = 0; gx < ROADS_X.length - 1; gx += 1) {
    for (let gy = 0; gy < ROADS_Y.length - 1; gy += 1) {
      const bx0 = ROADS_X[gx] + ROAD_WIDTH / 2 + 14;
      const by0 = ROADS_Y[gy] + ROAD_WIDTH / 2 + 14;
      const bx1 = ROADS_X[gx + 1] - ROAD_WIDTH / 2 - 14;
      const by1 = ROADS_Y[gy + 1] - ROAD_WIDTH / 2 - 14;
      const block = { x: bx0, y: by0, w: bx1 - bx0, h: by1 - by0 };
      const inPark = block.x < park.x + park.w && block.x + block.w > park.x && block.y < park.y + park.h && block.y + block.h > park.y;
      const inPlaza = block.x < plaza.x + plaza.w && block.x + block.w > plaza.x && block.y < plaza.y + plaza.h && block.y + block.h > plaza.y;
      const inAirfield = block.x < airfield.x + airfield.w && block.x + block.w > airfield.x && block.y < airfield.y + airfield.h && block.y + block.h > airfield.y;
      const inCasino = block.x < casino.x + casino.w && block.x + block.w > casino.x && block.y < casino.y + casino.h && block.y + block.h > casino.y;
      if (inPark) {
        for (let i = 0; i < 26; i += 1) {
          trees.push({ x: block.x + 20 + random() * (block.w - 40), y: block.y + 20 + random() * (block.h - 40), r: 12 + random() * 10 });
        }
        continue;
      }
      if (inPlaza) continue;
      if (inAirfield || inCasino) continue;
      // One to four buildings per block, with a margin between them.
      const cols = random() < 0.5 ? 2 : 1;
      const rows = random() < 0.5 ? 2 : 1;
      const cellW = block.w / cols;
      const cellH = block.h / rows;
      for (let cx = 0; cx < cols; cx += 1) {
        for (let cy = 0; cy < rows; cy += 1) {
          const w = cellW * (0.55 + random() * 0.3);
          const h = cellH * (0.55 + random() * 0.3);
          const x = block.x + cx * cellW + (cellW - w) / 2;
          const y = block.y + cy * cellH + (cellH - h) / 2;
          if (w < 60 || h < 60) continue;
          buildings.push({
            x, y, w, h,
            wall: WALL_COLOURS[Math.floor(random() * WALL_COLOURS.length)],
            roof: ROOF_COLOURS[Math.floor(random() * ROOF_COLOURS.length)],
            district: gx < 2 ? 'Old Town' : gx < 4 ? 'Downtown' : 'Harbor',
            floors: 1 + Math.floor(random() * 3),
            seed: random(),
          });
        }
      }
    }
  }

  // Azure Field's hangar and parked plane, and the Meridian Casino: fixed
  // buildings with flags the renderer draws specially. They collide like
  // any building, so Leo walks around them, never through them.
  buildings.push(
    { x: 430, y: 400, w: 180, h: 90, wall: '#6b7280', roof: '#4b5563', district: 'Airfield', floors: 1, seed: 0.42, hangar: true },
    { x: 600, y: 570, w: 200, h: 60, wall: '#e8e4da', roof: '#3d7dd9', district: 'Airfield', floors: 1, seed: 0.17, plane: true },
    { x: casino.x, y: casino.y, w: casino.w, h: casino.h, wall: '#3b2d5e', roof: '#241a3d', district: 'Downtown', floors: 2, seed: 0.63, casino: true },
  );

  // Two mansions with pools in the North Hills (the north-east blocks).
  const mansions = [
    { x: 3050, y: 430, w: 240, h: 170, wall: '#f2e6d0', roof: '#8fa8c8', district: 'Harbor', floors: 2, seed: 0.31, pool: { x: 3070, y: 620, w: 120, h: 46 } },
    { x: 3050, y: 910, w: 220, h: 160, wall: '#e8dcc8', roof: '#c96f4a', district: 'Harbor', floors: 2, seed: 0.77, pool: { x: 3070, y: 1090, w: 110, h: 42 } },
  ];
  for (const m of mansions) {
    if (!overlapsRoad(m.x, m.y, m.w, m.h)) buildings.push(m);
  }

  // Palm trees along the beach and a few on the plaza.
  for (let x = 200; x < WORLD.width; x += 170) {
    trees.push({ x: x + random() * 60, y: beachY + 30 + random() * 90, r: 13 });
  }
  for (let i = 0; i < 8; i += 1) {
    trees.push({ x: plaza.x + 30 + random() * (plaza.w - 60), y: plaza.y + 30 + random() * (plaza.h - 60), r: 11 });
  }

  // The Marina: wooden docks reaching into the water off the south-east
  // beach, with boats moored alongside them.
  const docks = [];
  const boats = [];
  for (let i = 0; i < 3; i += 1) {
    const dx = 3180 + i * 260;
    docks.push({ x: dx, y: 2420, w: 26, h: 120 });
    boats.push({ x: dx + 60, y: 2500, angle: Math.PI / 2 + (random() - 0.5) * 0.2, hull: ['#e8e4da', '#d94f3d', '#3d7dd9'][i] });
    boats.push({ x: dx - 40, y: 2520, angle: -Math.PI / 2 + (random() - 0.5) * 0.2, hull: '#7fbf5a' });
  }

  return { buildings, trees, park, plaza, fountain, beachY, docks, boats, airfield, casino };
}

/** True when the circle at (x, y) with radius r touches a building. */
export function hitsBuilding(city, x, y, r) {
  for (const b of city.buildings) {
    if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return b;
  }
  return null;
}

/** Push a circle out of any building it overlaps; returns the building hit, if any. */
export function resolveBuildings(city, body) {
  let hit = null;
  for (const b of city.buildings) {
    const cx = Math.max(b.x, Math.min(body.x, b.x + b.w));
    const cy = Math.max(b.y, Math.min(body.y, b.y + b.h));
    const dx = body.x - cx;
    const dy = body.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= body.r * body.r) continue;
    hit = b;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      body.x = cx + (dx / d) * body.r;
      body.y = cy + (dy / d) * body.r;
    } else {
      // Centre inside the building: push out along the shortest side.
      const left = body.x - b.x;
      const right = b.x + b.w - body.x;
      const top = body.y - b.y;
      const bottom = b.y + b.h - body.y;
      const min = Math.min(left, right, top, bottom);
      if (min === left) body.x = b.x - body.r;
      else if (min === right) body.x = b.x + b.w + body.r;
      else if (min === top) body.y = b.y - body.r;
      else body.y = b.y + b.h + body.r;
    }
  }
  return hit;
}

export function clampToWorld(body, margin) {
  body.x = Math.max(margin, Math.min(WORLD.width - margin, body.x));
  body.y = Math.max(margin, Math.min(WORLD.height - margin, body.y));
}

/** True when (x, y) is on a road surface (not a sidewalk or a block). */
export function onRoad(x, y) {
  const half = ROAD_WIDTH / 2;
  for (const rx of ROADS_X) if (Math.abs(x - rx) < half) return true;
  for (const ry of ROADS_Y) if (Math.abs(y - ry) < half) return true;
  return false;
}

/** The nearest point on a road centreline to (x, y). */
export function nearestRoadPoint(x, y) {
  let best = { x: ROADS_X[0], y, d: Infinity };
  for (const rx of ROADS_X) {
    const d = Math.abs(x - rx);
    if (d < best.d) best = { x: rx, y, d };
  }
  for (const ry of ROADS_Y) {
    const d = Math.abs(y - ry);
    if (d < best.d) best = { x, y: ry, d };
  }
  return best;
}

/** A random intersection, optionally away from (x, y) by at least `minDist`. */
export function randomIntersection(random, x, y, minDist) {
  for (let tries = 0; tries < 20; tries += 1) {
    const ix = ROADS_X[Math.floor(random() * ROADS_X.length)];
    const iy = ROADS_Y[Math.floor(random() * ROADS_Y.length)];
    if (x === undefined || Math.hypot(ix - x, iy - y) >= (minDist || 0)) return { x: ix, y: iy };
  }
  return { x: ROADS_X[0], y: ROADS_Y[0] };
}

/** The road axes through an intersection: returns 'x' or 'y' roads meeting there. */
export function roadsAt(x, y) {
  const vertical = ROADS_X.some((rx) => Math.abs(x - rx) < 1);
  const horizontal = ROADS_Y.some((ry) => Math.abs(y - ry) < 1);
  return { vertical, horizontal };
}

export { overlapsRoad };
