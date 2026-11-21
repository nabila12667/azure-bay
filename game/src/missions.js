// The story of Azure Bay: five jobs for Leo Marlow, from Mara Voss, each
// one a small state machine of steps — steal a car, fetch a crate, lose the
// heat, clear a warehouse, run five drops. A step is one verb: enter a car,
// reach a place, pick something up, lose the wanted level, clear the
// rivals, hit the checkpoints in order. The mission hands the HUD its
// objective text and its marker, and pays out when the last step lands.

import { PLACES } from './config.js';
import { createRival, aliveRivals } from './rivals.js';
import { setWanted } from './police.js';

export const MISSION_COUNT = 5;

const CHECKPOINTS = [
  { x: 960, y: 800, name: 'Old Town' },
  { x: 2880, y: 320, name: 'North Hills' },
  { x: 3520, y: 1760, name: 'Marina' },
  { x: 320, y: 1760, name: 'West End' },
  { x: 3520, y: 2450, name: 'Lighthouse' },
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
      { type: 'eliminate', count: 5, text: 'Clear the warehouse of the Gulls' },
    ],
  },
  {
    id: 'azure-score',
    title: 'The Azure Score',
    giver: 'Mara Voss',
    brief: 'One last job, Leo. Five drops across the city, then vanish at the lighthouse. 150 seconds. Make it count.',
    reward: 1500,
    timer: 150,
    steps: [
      { type: 'checkpoints', points: CHECKPOINTS, radius: 90, text: 'Hit the five drops in order' },
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
  };
}

export function currentMission(missions) {
  return missions.index < MISSIONS.length ? MISSIONS[missions.index] : null;
}

export function startMission(missions, world) {
  const mission = currentMission(missions);
  if (!mission) return;
  missions.state = 'active';
  missions.step = 0;
  missions.timer = mission.timer || 0;
  missions.hasCrate = false;
  missions.checkpoint = 0;
  if (mission.onStart === 'heat') {
    setWanted(world.police, 3);
  }
  if (mission.onStart === 'rivals') {
    const spots = [
      { x: 2860, y: 820 }, { x: 2980, y: 820 }, { x: 2920, y: 900 },
      { x: 2840, y: 920 }, { x: 3000, y: 900 },
    ];
    for (const spot of spots) world.rivals.push(createRival(spot.x, spot.y));
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
  return step.text;
}

let worldRivalsRef = null;
function aliveRivalsCount(missions) {
  return worldRivalsRef ? aliveRivals(worldRivalsRef) : 0;
}

export function objectiveText(missions) {
  const mission = currentMission(missions);
  if (!mission) return 'Story complete — free roam';
  return `${mission.title}: ${stepText(missions)}`;
}

/** Where the HUD marker points, or null when the step has no place. */
export function missionMarker(missions) {
  const mission = currentMission(missions);
  if (!mission || missions.state !== 'active') return null;
  const step = mission.steps[missions.step];
  if (!step) return null;
  if (step.type === 'goto' || step.type === 'pickup') return { x: step.x, y: step.y };
  if (step.type === 'checkpoints') return step.points[missions.checkpoint] || null;
  if (step.type === 'eliminate') return { x: PLACES.warehouse.x, y: PLACES.warehouse.y };
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
      if (point && Math.hypot(player.x - point.x, player.y - point.y) < step.radius) {
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
    player.ammo += 48;
  }
  missions.index += 1;
  if (missions.index >= MISSIONS.length) {
    missions.storyComplete = true;
    showBanner(missions, 'Story complete', 'Leo did it — the Azure Score is his. Azure Bay is yours now.');
  }
  return { completed: true, failed: false, reward };
}

export function retryMission(missions, world) {
  world.rivals.length = 0;
  missions.hasCrate = false;
  missions.checkpoint = 0;
  startMission(missions, world);
}
