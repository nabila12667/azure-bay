// The story of Azure Bay: twelve jobs for Leo Marlow, from Mara Voss and
// Rosa, each one a small state machine of steps — steal a car, fetch a
// crate, lose the heat, clear a warehouse, run five drops, then a night
// courier run that earns the shotgun, an illegal street race, and the
// finale at the Azure Bank. Round 5 adds four more: a cab shift for Rosa,
// a hot cargo pickup at the airfield, a midnight rally through eight
// gates, and the second heist — the Meridian Job at the casino, five
// guards, a vault and a helicopter overhead. A step is one verb: enter a
// car, reach a place, pick something up, lose the wanted level, clear the
// rivals, hit the checkpoints in order, or run a chain of taxi fares. The
// mission hands the HUD its objective text and its marker, and pays out
// when the last step lands.

import { PLACES } from './config.js';
import { createRival, aliveRivals } from './rivals.js';
import { setWanted } from './police.js';
import { createPedestrian } from './pedestrians.js';

export const MISSION_COUNT = 12;

const CHECKPOINTS = [
  { x: 960, y: 800, name: 'Old Town' },
  { x: 2880, y: 320, name: 'North Hills' },
  { x: 3520, y: 1760, name: 'Marina' },
  { x: 320, y: 1760, name: 'West End' },
  { x: 3520, y: 2450, name: 'Lighthouse' },
];

const COURIER_DROPS = [
  { x: 960, y: 800, name: 'Old Town' },
  { x: 2880, y: 320, name: 'North Hills' },
  { x: 320, y: 1760, name: 'West End' },
];

const RACE_GATES = [
  { x: 960, y: 320, name: 'Gate 1' },
  { x: 2880, y: 320, name: 'Gate 2' },
  { x: 3520, y: 1280, name: 'Gate 3' },
  { x: 2880, y: 2240, name: 'Gate 4' },
  { x: 960, y: 2240, name: 'Gate 5' },
  { x: 320, y: 1280, name: 'Gate 6' },
];

// The midnight rally: eight gates, a full lap of the city at night.
const RALLY_GATES = [
  { x: 960, y: 320, name: 'Gate 1' },
  { x: 1600, y: 800, name: 'Gate 2' },
  { x: 2880, y: 320, name: 'Gate 3' },
  { x: 3520, y: 1280, name: 'Gate 4' },
  { x: 3520, y: 2240, name: 'Gate 5' },
  { x: 2240, y: 2240, name: 'Gate 6' },
  { x: 960, y: 2240, name: 'Gate 7' },
  { x: 320, y: 1280, name: 'Gate 8' },
];

// Rosa's cab shift: three fares, each a pickup on the road and a drop
// across town, all in a car. Every drop pays $150 on the spot.
const CAB_FARES = [
  { px: 2240, py: 1820, dx: 1600, dy: 2200, from: 'Club Lumen', to: 'St. Aurelia Hospital' },
  { px: 2880, py: 1500, dx: 3520, dy: 1280, from: 'Downtown Plaza', to: 'Pier 4' },
  { px: 2240, py: 380, dx: 3360, dy: 2240, from: 'Police HQ', to: 'Marina' },
];

// The five guards holding the Meridian Casino floor.
const CASINO_GUARDS = [
  { x: 2420, y: 2140 }, { x: 2560, y: 2140 }, { x: 2700, y: 2140 },
  { x: 2360, y: 2000 }, { x: 2760, y: 2000 },
];

export const MISSIONS = [
  {
    id: 'first-wheels',
    title: 'First Wheels',
    giver: 'Mara Voss',
    brief: 'Leo, I need wheels and I need them now. Any car on the street will do — bring it to Rosa\u2019s Garage.',
    reward: 300,
    steps: [
      { type: 'enter-car', text: 'Steal any car' },
      { type: 'goto', x: PLACES.garage.x, y: PLACES.garage.y, radius: 90, inCar: true, text: 'Bring the car to Rosa\u2019s Garage' },
    ],
  },
  {
    id: 'harbor-pickup',
    title: 'Harbor Pickup',
    giver: 'Mara Voss',
    brief: 'A crate came in on the night boat at Pier 4. Fetch it and bring it to Club Lumen. You have 150 seconds before the buyer walks.',
    reward: 500,
    timer: 150,
    steps: [
      { type: 'pickup', x: PLACES.pier.x, y: PLACES.pier.y, radius: 70, text: 'Pick up the crate at Pier 4' },
      { type: 'goto', x: PLACES.club.x, y: PLACES.club.y, radius: 90, text: 'Deliver the crate to Club Lumen' },
    ],
  },
  {
    id: 'hot-pursuit',
    title: 'Hot Pursuit',
    giver: 'Mara Voss',
    brief: 'The cops made you at the harbor, Leo. Three stars. Lose them, then get to the safehouse — don\u2019t let them take you in.',
    reward: 600,
    onStart: 'heat',
    steps: [
      { type: 'lose-wanted', text: 'Lose the wanted level' },
      { type: 'goto', x: PLACES.safehouse.x, y: PLACES.safehouse.y, radius: 100, text: 'Reach the safehouse' },
    ],
  },
  {
    id: 'dockside-trouble',
    title: 'Dockside Trouble',
    giver: 'Mara Voss',
    brief: 'The Gulls are holding our warehouse at the docks. Five of them, armed. Clear them out, Leo.',
    reward: 800,
    onStart: 'rivals',
    steps: [
      { type: 'eliminate', count: 5, x: PLACES.warehouse.x, y: PLACES.warehouse.y, text: 'Clear the warehouse of the Gulls' },
    ],
  },
  {
    id: 'azure-score',
    title: 'The Azure Score',
    giver: 'Mara Voss',
    brief: 'Five drops across the city, then vanish at the lighthouse. 150 seconds. Make it count.',
    reward: 1500,
    timer: 150,
    steps: [
      { type: 'checkpoints', points: CHECKPOINTS, radius: 90, text: 'Hit the five drops in order' },
    ],
  },
  {
    id: 'night-courier',
    title: 'Night Courier',
    giver: 'Mara Voss',
    brief: 'Mara needs a package moved after dark. Pick it up at the Marina, then three drops before the clock runs out. Do this and the shotgun is yours.',
    reward: 900,
    timer: 120,
    steps: [
      { type: 'pickup', x: PLACES.marina.x, y: PLACES.marina.y, radius: 70, text: 'Pick up the package at the Marina' },
      { type: 'checkpoints', points: COURIER_DROPS, radius: 90, text: 'Make the three drops in order' },
    ],
  },
  {
    id: 'bay-grand-prix',
    title: 'Bay Street Grand Prix',
    giver: 'Rosa',
    brief: 'My cousin runs an illegal street race, Leo. Six gates, ninety seconds, and you need wheels. Win it and the city talks about you.',
    reward: 1200,
    timer: 90,
    steps: [
      { type: 'enter-car', text: 'Get in a car for the race' },
      { type: 'checkpoints', points: RACE_GATES, radius: 100, inCar: true, text: 'Hit the six race gates in order' },
    ],
  },
  {
    id: 'azure-heist',
    title: 'The Azure Heist',
    giver: 'Mara Voss',
    brief: 'The big one, Leo. The Azure Bank vault, six guards, and the whole ABPD on your tail. Grab the loot and vanish at the lighthouse.',
    reward: 2500,
    onStart: 'heist',
    steps: [
      { type: 'eliminate', count: 6, x: PLACES.bank.x, y: PLACES.bank.y, kind: 'guard', text: 'Take down the six bank guards' },
      { type: 'pickup', x: PLACES.bank.x, y: PLACES.bank.y, radius: 80, text: 'Grab the loot from the vault' },
      { type: 'goto', x: PLACES.lighthouse.x, y: PLACES.lighthouse.y, radius: 110, text: 'Escape to the lighthouse' },
    ],
  },
  {
    id: 'cab-for-hire',
    title: 'Cab for Hire',
    giver: 'Rosa',
    brief: 'My taxi is sitting idle and the fares are out there, Leo. Three pickups across town, $150 a drop — drive like the meter is running, because it is. 150 seconds.',
    reward: 250,
    timer: 150,
    steps: [
      { type: 'fare', fares: CAB_FARES, farePay: 150, text: 'Run the three cab fares' },
    ],
  },
  {
    id: 'airfield-cargo',
    title: 'Airfield Cargo',
    giver: 'Mara Voss',
    brief: 'A crate landed at Azure Field and the ABPD knows it is ours. Grab it at the hangar — the heat comes with it — and get it to the Dock Warehouse. 150 seconds.',
    reward: 1100,
    timer: 150,
    steps: [
      { type: 'pickup', x: PLACES.airfield.x, y: PLACES.airfield.y, radius: 70, heat: 2, text: 'Pick up the crate at the airfield hangar' },
      { type: 'goto', x: PLACES.warehouse.x, y: PLACES.warehouse.y, radius: 90, text: 'Deliver the crate to the Dock Warehouse' },
    ],
  },
  {
    id: 'midnight-rally',
    title: 'Midnight Rally',
    giver: 'Rosa',
    brief: 'The real race, Leo — eight gates, a full lap of Azure Bay after dark, and the whole city watching. 110 seconds, no excuses.',
    reward: 1800,
    timer: 110,
    steps: [
      { type: 'enter-car', text: 'Get in a car for the rally' },
      { type: 'checkpoints', points: RALLY_GATES, radius: 100, inCar: true, text: 'Hit the eight rally gates in order' },
    ],
  },
  {
    id: 'meridian-job',
    title: 'The Meridian Job',
    giver: 'Mara Voss',
    brief: 'One last score, Leo. The Meridian Casino vault, five guards on the floor, and the ABPD helicopter already in the air. Take the vault and vanish at the safehouse.',
    reward: 3000,
    onStart: 'meridian',
    steps: [
      { type: 'eliminate', count: 5, x: PLACES.casino.x, y: PLACES.casino.y, kind: 'guard', spots: CASINO_GUARDS, text: 'Take down the five casino guards' },
      { type: 'pickup', x: PLACES.casino.x, y: PLACES.casino.y, radius: 80, text: 'Grab the loot from the vault' },
      { type: 'goto', x: PLACES.safehouse.x, y: PLACES.safehouse.y, radius: 100, text: 'Escape to the safehouse' },
    ],
  },
];

export function createMissions() {
  return {
    index: 0,
    step: 0,
    state: 'idle', // idle | active | failed | done
    timer: 0,
    hasCrate: false,
    checkpoint: 0,
    storyComplete: false,
    banner: '',
    bannerTimer: 0,
    // Cab for Hire: which fare is next, which leg, and the waiting
    // customer. fareEvent is read and cleared by the world after each
    // step, so the messages land with the fare, not a frame later.
    fare: 0,
    fareLeg: 'pickup', // pickup | drop
    farePed: null,
    fareEvent: null,
    fareEventText: '',
  };
}

export function currentMission(missions) {
  return missions.index < MISSIONS.length ? MISSIONS[missions.index] : null;
}

/** Put a waiting fare customer beside the road at a pickup spot. */
function spawnFarePed(missions, world, fare) {
  const ped = createPedestrian(fare.px + 45, fare.py + 10, world.random);
  ped.state = 'wait';
  ped.fare = true;
  world.peds.push(ped);
  missions.farePed = ped;
}

function removeFarePed(missions, world) {
  if (!missions.farePed) return;
  const i = world.peds.indexOf(missions.farePed);
  if (i >= 0) world.peds.splice(i, 1);
  missions.farePed = null;
}

function clearFarePeds(world) {
  world.peds = world.peds.filter((p) => !p.fare);
}

export function startMission(missions, world) {
  const mission = currentMission(missions);
  if (!mission) return;
  missions.state = 'active';
  missions.step = 0;
  missions.timer = mission.timer || 0;
  missions.hasCrate = false;
  missions.checkpoint = 0;
  missions.fare = 0;
  missions.fareLeg = 'pickup';
  missions.fareEvent = null;
  if (mission.onStart === 'heat') {
    setWanted(world.police, 3);
  }
  if (mission.onStart === 'rivals' || mission.onStart === 'heist' || mission.onStart === 'meridian') {
    const step = mission.steps.find((s) => s.type === 'eliminate');
    const spots = (step && step.spots) || (step && step.kind === 'guard'
      ? [
          { x: 2180, y: 1440 }, { x: 2300, y: 1440 }, { x: 2240, y: 1560 },
          { x: 2180, y: 1580 }, { x: 2320, y: 1560 }, { x: 2240, y: 1420 },
        ]
      : [
          { x: 2860, y: 820 }, { x: 2980, y: 820 }, { x: 2920, y: 900 },
          { x: 2840, y: 920 }, { x: 3000, y: 900 },
        ]);
    const kind = step && step.kind === 'guard' ? 'guard' : undefined;
    for (const spot of spots) world.rivals.push(createRival(spot.x, spot.y, kind));
    if (mission.onStart === 'heist') setWanted(world.police, 3);
    if (mission.onStart === 'meridian') setWanted(world.police, 2);
  }
  if (mission.steps[0] && mission.steps[0].type === 'fare') {
    clearFarePeds(world);
    spawnFarePed(missions, world, mission.steps[0].fares[0]);
  }
  showBanner(missions, `${mission.title} — ${mission.giver}`, mission.brief);
}

export function showBanner(missions, title, text) {
  missions.banner = title;
  missions.bannerText = text;
  missions.bannerTimer = 5;
}

function stepText(missions) {
  const mission = currentMission(missions);
  if (!mission) return 'Free roam — explore Azure Bay';
  const step = mission.steps[missions.step];
  if (!step) return mission.title;
  if (step.type === 'checkpoints') {
    return `${step.text} (${missions.checkpoint}/${step.points.length})`;
  }
  if (step.type === 'eliminate') {
    return `${step.text} (${aliveRivalsCount(missions)} left)`;
  }
  if (step.type === 'fare') {
    const fare = step.fares[missions.fare];
    if (!fare) return step.text;
    const n = `${missions.fare + 1}/${step.fares.length}`;
    return missions.fareLeg === 'pickup'
      ? `Pick up the fare at ${fare.from} (${n}) — in a car`
      : `Drop the fare at ${fare.to} (${n})`;
  }
  return step.text;
}

let worldRivalsRef = null;
function aliveRivalsCount(missions) {
  return worldRivalsRef ? aliveRivals(worldRivalsRef) : 0;
}

export function objectiveText(missions) {
  const mission = currentMission(missions);
  if (!mission) return 'Story complete — free roam';
  return `Job ${missions.index + 1}/${MISSIONS.length} — ${mission.title}: ${stepText(missions)}`;
}

/** Where the HUD marker points, or null when the step has no place. */
export function missionMarker(missions) {
  const mission = currentMission(missions);
  if (!mission || missions.state !== 'active') return null;
  const step = mission.steps[missions.step];
  if (!step) return null;
  if (step.type === 'goto' || step.type === 'pickup') return { x: step.x, y: step.y };
  if (step.type === 'checkpoints') return step.points[missions.checkpoint] || null;
  if (step.type === 'eliminate') return { x: step.x || PLACES.warehouse.x, y: step.y || PLACES.warehouse.y };
  if (step.type === 'fare') {
    const fare = step.fares[missions.fare];
    if (!fare) return null;
    return missions.fareLeg === 'pickup' ? { x: fare.px, y: fare.py } : { x: fare.dx, y: fare.dy };
  }
  return null;
}

/**
 * Advance the active mission one step. `world` carries the player, the
 * wanted level and the rivals. Returns { completed, failed } for the step.
 */
export function updateMissions(missions, dt, world) {
  worldRivalsRef = world.rivals;
  if (missions.bannerTimer > 0) missions.bannerTimer -= dt;
  if (missions.state !== 'active') return { completed: false, failed: false };
  const mission = currentMission(missions);
  if (!mission) return { completed: false, failed: false };

  if (mission.timer) {
    missions.timer -= dt;
    if (missions.timer <= 0) {
      missions.state = 'failed';
      return { completed: false, failed: true };
    }
  }

  const step = mission.steps[missions.step];
  const player = world.player;
  let done = false;
  switch (step.type) {
    case 'enter-car':
      done = !!player.inCar;
      break;
    case 'goto': {
      const d = Math.hypot(player.x - step.x, player.y - step.y);
      done = d < step.radius && (!step.inCar || !!player.inCar);
      break;
    }
    case 'pickup': {
      const d = Math.hypot(player.x - step.x, player.y - step.y);
      if (!player.inCar && d < step.radius) {
        missions.hasCrate = true;
        done = true;
        // Some pickups are hot: the ABPD is watching the spot.
        if (step.heat) setWanted(world.police, step.heat);
      }
      break;
    }
    case 'fare': {
      // A cab fare: drive to the waiting customer, then to their
      // destination. Each drop pays on the spot; the chain of three
      // finishes the step.
      const fare = step.fares[missions.fare];
      if (!fare) {
        done = true;
        break;
      }
      if (missions.fareLeg === 'pickup') {
        const d = Math.hypot(player.x - fare.px, player.y - fare.py);
        if (player.inCar && d < 70) {
          missions.fareLeg = 'drop';
          missions.fareEvent = 'pickup';
          missions.fareEventText = fare.to;
          removeFarePed(missions, world);
        }
      } else {
        const d = Math.hypot(player.x - fare.dx, player.y - fare.dy);
        if (player.inCar && d < 90) {
          player.cash += step.farePay || 150;
          missions.fare += 1;
          missions.fareLeg = 'pickup';
          missions.fareEvent = 'drop';
          missions.fareEventText = String(step.farePay || 150);
          if (missions.fare >= step.fares.length) {
            done = true;
          } else {
            spawnFarePed(missions, world, step.fares[missions.fare]);
          }
        }
      }
      break;
    }
    case 'lose-wanted':
      done = world.police.wanted === 0;
      break;
    case 'eliminate':
      done = aliveRivals(world.rivals) === 0;
      break;
    case 'checkpoints': {
      const point = step.points[missions.checkpoint];
      if (point && Math.hypot(player.x - point.x, player.y - point.y) < step.radius
        && (!step.inCar || !!player.inCar)) {
        missions.checkpoint += 1;
        if (missions.checkpoint >= step.points.length) done = true;
      }
      break;
    }
    default:
      break;
  }

  if (!done) return { completed: false, failed: false };
  missions.step += 1;
  if (missions.step < mission.steps.length) return { completed: false, failed: false };

  // The mission is done: pay out and move on.
  missions.state = 'done';
  const reward = mission.reward;
  player.cash += reward;
  if (mission.id === 'harbor-pickup') {
    player.hasPistol = true;
    player.weapon = 'pistol';
    player.ammo += 48;
  }
  if (mission.id === 'night-courier') {
    player.hasShotgun = true;
    player.weapon = 'shotgun';
    player.shells += 12;
  }
  missions.index += 1;
  if (missions.index >= MISSIONS.length) {
    missions.storyComplete = true;
    showBanner(missions, 'Story complete', 'Leo did it — the Meridian Job is his. Azure Bay is yours now.');
  }
  return { completed: true, failed: false, reward };
}

export function retryMission(missions, world) {
  world.rivals.length = 0;
  missions.hasCrate = false;
  missions.checkpoint = 0;
  missions.fare = 0;
  missions.fareLeg = 'pickup';
  missions.fareEvent = null;
  clearFarePeds(world);
  startMission(missions, world);
}
