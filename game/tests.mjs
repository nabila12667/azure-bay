// Headless logic tests for Azure Bay: `node game/tests.mjs` from the repo
// root. The world is pure logic over a stubbed window (localStorage only),
// so every system can be stepped without a browser: missions, the garage,
// the shotgun, the stashes, the wanted level, the day/night cycle, the
// save, and determinism.

globalThis.window = {
  localStorage: {
    _data: {},
    getItem(key) { return this._data[key] ?? null; },
    setItem(key, value) { this._data[key] = String(value); },
    removeItem(key) { delete this._data[key]; },
  },
};

import { STEP, PLACES, STASH_TOTAL, STASH_BONUS, GARAGE } from './src/config.js';
import { createWorld, stepWorld, applyBusted, applyWasted, applySave, nightFactor, timeOfDayLabel, EVENT_MISSION_DONE, EVENT_MISSION_FAILED, EVENT_EXPLOSION } from './src/world.js';
import { createCar, driveCar } from './src/vehicles.js';
import { enterCar } from './src/player.js';
import { addWanted, setWanted } from './src/police.js';
import { districtOf } from './src/city.js';
import { MISSIONS, MISSION_COUNT, currentMission, startMission } from './src/missions.js';
import { fireBullet, updateBullets } from './src/combat.js';
import { saveGame, loadSave } from './src/save.js';
import { ACTION_ENTER, ACTION_REPAIR } from './src/input.js';

let passed = 0;
let failed = 0;
function check(name, ok, detail) {
  if (ok) {
    passed += 1;
    console.log(`ok   ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function idleInput(move, mouseDown) {
  return {
    keys: { run: false },
    mouse: { down: !!mouseDown },
    move: move || (() => ({ x: 0, y: 0 })),
    takeActions() { return 0; },
  };
}

function step(state, n, input, aim, bits) {
  let events = 0;
  for (let i = 0; i < (n || 1); i += 1) events |= stepWorld(state, STEP, input || idleInput(), aim || 0, bits || 0);
  return events;
}

function teleport(state, x, y) {
  state.player.x = x;
  state.player.y = y;
  if (state.player.inCar) {
    state.player.inCar.x = x;
    state.player.inCar.y = y;
  }
  if (state.player.inBoat) {
    state.player.inBoat.x = x;
    state.player.inBoat.y = y;
  }
}

function startAt(state, index) {
  state.missions.index = index;
  step(state, 1);
  return currentMission(state.missions);
}

// 1. The world seeds with traffic, pedestrians and twelve stashes.
{
  const s = createWorld(7);
  check('world seeds traffic and pedestrians', s.cars.length >= 14 && s.peds.length >= 24, `${s.cars.length} cars, ${s.peds.length} peds`);
  const stashes = s.combat.pickups.filter((p) => p.kind === 'stash');
  check('world seeds twelve stashes', stashes.length === STASH_TOTAL, `${stashes.length}`);
}

// 2. Mission 1: stealing a car, then driving to the garage, pays $300.
{
  const s = createWorld(7);
  const car = createCar(s.player.x + 10, s.player.y, 0, 'sedan', s.random);
  s.cars.push(car);
  step(s, 1);
  check('mission 1 starts idle then active', s.missions.state === 'active');
  enterCar(s.player, car, s);
  step(s, 1);
  check('mission 1 first step completes in a car', s.missions.step === 1, `step ${s.missions.step}`);
  teleport(s, PLACES.garage.x, PLACES.garage.y);
  const cashBefore = s.player.cash;
  const events = step(s, 1);
  check('mission 1 completes at the garage', (events & EVENT_MISSION_DONE) !== 0 && s.missions.index === 1, `index ${s.missions.index}`);
  check('mission 1 pays $300', s.player.cash === cashBefore + 300, `$${s.player.cash}`);
}

// 3. A timed mission fails when the clock runs out, then retries.
{
  const s = createWorld(7);
  startAt(s, 1);
  s.missions.timer = 0.01;
  const events = step(s, 5);
  check('timed mission fails on expiry', (events & EVENT_MISSION_FAILED) !== 0, `state ${s.missions.state}`);
  check('failed mission retries active', s.missions.state === 'active' && s.missions.step === 0);
}

// 4. Mission 5: the five checkpoints advance in order and pay $1,500.
{
  const s = createWorld(7);
  const m = startAt(s, 4);
  const points = m.steps[0].points;
  for (const p of points) {
    teleport(s, p.x, p.y);
    step(s, 1);
  }
  check('mission 5 completes all checkpoints', s.missions.index === 5, `index ${s.missions.index}`);
  check('mission 5 pays $1,500', s.player.cash === 1500, `$${s.player.cash}`);
}

// 5. Mission 6: the Night Courier awards the shotgun on completion.
{
  const s = createWorld(7);
  const m = startAt(s, 5);
  teleport(s, PLACES.marina.x, PLACES.marina.y);
  step(s, 1);
  check('courier pickup step completes', s.missions.step === 1, `step ${s.missions.step}`);
  for (const p of m.steps[1].points) {
    teleport(s, p.x, p.y);
    step(s, 1);
  }
  check('courier completes', s.missions.index === 6, `index ${s.missions.index}`);
  check('courier awards the shotgun', s.player.hasShotgun && s.player.weapon === 'shotgun' && s.player.shells >= 12, `shells ${s.player.shells}`);
}

// 6. Mission 7: the race gates only count while Leo is in a car.
{
  const s = createWorld(7);
  const m = startAt(s, 6);
  const gate = m.steps[1].points[0];
  teleport(s, gate.x, gate.y);
  step(s, 3);
  check('race gate does not count on foot', s.missions.checkpoint === 0, `checkpoint ${s.missions.checkpoint}`);
  const car = createCar(s.player.x + 10, s.player.y, 0, 'sports', s.random);
  s.cars.push(car);
  enterCar(s.player, car, s);
  step(s, 1);
  teleport(s, gate.x, gate.y);
  step(s, 1);
  check('race gate counts in a car', s.missions.checkpoint === 1, `checkpoint ${s.missions.checkpoint}`);
  for (const p of m.steps[1].points.slice(1)) {
    teleport(s, p.x, p.y);
    step(s, 1);
  }
  check('race completes', s.missions.index === 7, `index ${s.missions.index}`);
}

// 7. Mission 8: the heist spawns six guards and three stars.
{
  const s = createWorld(7);
  startAt(s, 7);
  check('heist spawns six guards', s.rivals.length === 6 && s.rivals.every((r) => r.kind === 'guard'), `${s.rivals.length} rivals`);
  check('heist sets three wanted stars', s.police.wanted === 3, `${s.police.wanted}`);
  for (const r of s.rivals) { r.hp = 0; r.state = 'dead'; }
  step(s, 1);
  check('heist eliminate step completes', s.missions.step === 1, `step ${s.missions.step}`);
  teleport(s, PLACES.bank.x, PLACES.bank.y);
  step(s, 1);
  check('heist loot step completes', s.missions.step === 2, `step ${s.missions.step}`);
  teleport(s, PLACES.lighthouse.x, PLACES.lighthouse.y);
  const events = step(s, 1);
  check('heist completes and moves on', (events & EVENT_MISSION_DONE) !== 0 && s.missions.index === 8, `index ${s.missions.index}`);
  check('heist does not end the story yet', !s.missions.storyComplete, `complete ${s.missions.storyComplete}`);
  check('heist pays $2,500', s.player.cash === 2500, `$${s.player.cash}`);
}

// 8. The shotgun fires five pellets and spends one shell per blast.
{
  const s = createWorld(7);
  s.player.hasShotgun = true;
  s.player.weapon = 'shotgun';
  s.player.shells = 5;
  const before = s.player.shells;
  step(s, 60, idleInput(null, true), 0);
  check('shotgun spends shells', s.player.shells < before, `${s.player.shells} left`);
  check('shotgun fired', s.stats.shotsFired > 0, `${s.stats.shotsFired} shots`);
}

// 9. The pistol still works, and the player starts with fists.
{
  const s = createWorld(7);
  check('player starts unarmed', s.player.weapon === null && !s.player.hasPistol);
  s.player.hasPistol = true;
  s.player.weapon = 'pistol';
  s.player.ammo = 12;
  step(s, 30, idleInput(null, true), 0);
  check('pistol spends ammo', s.player.ammo < 12, `${s.player.ammo} left`);
}

// 10. Rosa's Garage: repair restores the car and costs $150.
{
  const s = createWorld(7);
  const car = createCar(PLACES.garage.x, PLACES.garage.y, 0, 'sedan', s.random);
  car.hp = 40;
  s.cars.push(car);
  s.player.cash = 500;
  enterCar(s.player, car, s);
  teleport(s, PLACES.garage.x, PLACES.garage.y);
  step(s, 1, idleInput(), 0, ACTION_REPAIR);
  check('garage repair restores hp', car.hp === 100, `hp ${car.hp}`);
  check('garage repair costs $150', s.player.cash === 500 - GARAGE.repairCost, `$${s.player.cash}`);
}

// 11. Rosa's Garage: tuning levels up and makes the car faster.
{
  const s = createWorld(7);
  const car = createCar(PLACES.garage.x, PLACES.garage.y, 0, 'sedan', s.random);
  s.cars.push(car);
  s.player.cash = 900;
  enterCar(s.player, car, s);
  teleport(s, PLACES.garage.x, PLACES.garage.y);
  step(s, 1, idleInput(), 0, ACTION_REPAIR);
  check('garage tuning levels up', s.player.tuning === 1, `tuning ${s.player.tuning}`);
  check('garage tuning costs $300', s.player.cash === 900 - GARAGE.tuneCost, `$${s.player.cash}`);
  const plain = createCar(0, 0, 0, 'sedan', s.random);
  const tuned = createCar(0, 0, 0, 'sedan', s.random);
  for (let i = 0; i < 300; i += 1) {
    driveCar(plain, STEP, 1, 0, false, 0);
    driveCar(tuned, STEP, 1, 0, false, 3);
  }
  check('tuning raises top speed', tuned.speed > plain.speed, `${tuned.speed.toFixed(0)} vs ${plain.speed.toFixed(0)}`);
  const sports = createCar(0, 0, 0, 'sports', s.random);
  for (let i = 0; i < 300; i += 1) driveCar(sports, STEP, 1, 0, false, 0);
  check('sports car is faster than a sedan', sports.speed > plain.speed, `${sports.speed.toFixed(0)} vs ${plain.speed.toFixed(0)}`);
}

// 12. Stashes: collecting one counts, collecting all twelve pays the bonus.
{
  const s = createWorld(7);
  const stash = s.combat.pickups.find((p) => p.kind === 'stash');
  teleport(s, stash.x, stash.y);
  step(s, 1);
  check('stash counts when collected', s.stats.stashesFound === 1, `${s.stats.stashesFound}`);
  const rest = s.combat.pickups.filter((p) => p.kind === 'stash' && !p.taken);
  for (const p of rest) {
    teleport(s, p.x, p.y);
    step(s, 1);
  }
  check('all twelve stashes found', s.stats.stashesFound === STASH_TOTAL, `${s.stats.stashesFound}`);
  check('stash bonus pays $1,000 on top of $100 each', s.player.cash === STASH_TOTAL * 100 + STASH_BONUS, `$${s.player.cash}`);
}

// 13. Wanted: stars cap at five; the roadblock comes at four stars.
{
  const s = createWorld(7);
  addWanted(s.police, 10);
  check('wanted caps at five', s.police.wanted === 5, `${s.police.wanted}`);
  setWanted(s.police, 0);
  const s2 = createWorld(7);
  setWanted(s2.police, 4);
  s2.police.roadblockTimer = 0;
  step(s2, 5);
  check('roadblock spawns at four stars', s2.police.cars.some((c) => c.roadblock), `${s2.police.cars.length} cars`);
}

// 14. Day and night: the factor and the label follow the clock.
{
  check('night factor is 0 in the morning', nightFactor(0.1) === 0);
  check('night factor is 1 at midnight', nightFactor(0.65) === 1);
  check('night factor ramps at dusk', nightFactor(0.45) > 0.4 && nightFactor(0.45) < 0.6, `${nightFactor(0.45)}`);
  check('time label reads DAY then NIGHT', timeOfDayLabel(0.1) === 'DAY' && timeOfDayLabel(0.65) === 'NIGHT');
}

// 15. Rain fades in when the weather turns.
{
  const s = createWorld(7);
  s.rainTarget = 1;
  step(s, 120);
  check('rain rises toward its target', s.rain > 0.3, `${s.rain.toFixed(2)}`);
}

// 16. Districts: Old Town, Downtown, Harbor, Marina and the Beach.
{
  check('district Old Town', districtOf(500, 1000) === 'Old Town');
  check('district Downtown', districtOf(2000, 1000) === 'Downtown');
  check('district Harbor', districtOf(3200, 1000) === 'Harbor');
  check('district Marina', districtOf(3400, 2100) === 'Marina');
  check('district Beach', districtOf(1000, 2450) === 'Beach');
}

// 17. Save and load round-trip keeps weapons, tuning and stashes.
{
  const s = createWorld(7);
  s.player.cash = 1234;
  s.player.hasShotgun = true;
  s.player.weapon = 'shotgun';
  s.player.shells = 9;
  s.player.tuning = 2;
  s.stats.stashesFound = 5;
  s.missions.index = 6;
  saveGame(s);
  const raw = loadSave();
  const s2 = createWorld(9);
  s2.missions.index = 0;
  applySave(s2, raw);
  check('save keeps cash, shotgun and tuning', s2.player.cash === 1234 && s2.player.hasShotgun && s2.player.tuning === 2, `cash ${s2.player.cash}, tuning ${s2.player.tuning}`);
  check('save keeps stashes and mission', s2.stats.stashesFound === 5 && s2.missions.index === 6, `${s2.stats.stashesFound} stashes, mission ${s2.missions.index}`);
}

// 18. Busted and wasted move Leo and take 10% of his cash.
{
  const s = createWorld(7);
  s.player.cash = 1000;
  applyBusted(s);
  check('busted takes 10% and moves Leo to Police HQ', s.player.cash === 900 && Math.abs(s.player.x - PLACES.policeHQ.x) < 5, `$${s.player.cash} at ${s.player.x},${s.player.y}`);
  const s2 = createWorld(7);
  s2.player.cash = 1000;
  applyWasted(s2);
  check('wasted takes 10% and moves Leo to hospital', s2.player.cash === 900 && Math.abs(s2.player.x - PLACES.hospital.x) < 5, `$${s2.player.cash}`);
}

// 19. A car with no health explodes and leaves the street.
{
  const s = createWorld(7);
  const car = s.cars[0];
  car.hp = 0;
  const events = step(s, 1);
  check('dead car explodes', (events & EVENT_EXPLOSION) !== 0 && !s.cars.includes(car));
}

// 20. Bullets stop at buildings.
{
  const s = createWorld(7);
  const b = s.city.buildings[0];
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  fireBullet(s.combat, cx - 120, cy, 0, 10, true);
  for (let i = 0; i < 30; i += 1) updateBullets(s.combat, STEP, s.city, { player: s.player, cars: [], peds: [], rivals: [], cops: [] });
  check('bullet stops at a building', s.combat.bullets.every((x) => !x.active));
}

// 21. Hard braking at speed leaves skid marks.
{
  const s = createWorld(7);
  const car = createCar(1600, 1280, 0, 'sedan', s.random);
  s.cars.push(car);
  enterCar(s.player, car, s);
  car.speed = 420;
  step(s, 30, idleInput(() => ({ x: 0, y: 1 })), 0);
  const skids = s.combat.particles.filter((p) => p.active && p.color === '#1c1e24');
  check('skid marks appear under hard braking', skids.length > 0, `${skids.length} marks`);
}

// 22. Determinism: the same seed builds the same city.
{
  const a = createWorld(7);
  const b = createWorld(7);
  const sameBuildings = a.city.buildings.length === b.city.buildings.length
    && a.city.buildings.every((x, i) => x.x === b.city.buildings[i].x && x.y === b.city.buildings[i].y);
  const sameStashes = a.combat.pickups.every((p, i) => p.x === b.combat.pickups[i].x && p.y === b.combat.pickups[i].y);
  check('same seed builds the same city', sameBuildings && sameStashes, `${a.city.buildings.length} buildings`);
}

// 23. Thirteen missions, and the HUD names the job number.
{
  check('thirteen missions in the story', MISSION_COUNT === 13 && MISSIONS.length === 13, `${MISSIONS.length}`);
  const s = createWorld(7);
  check('objective names Job 1/13', s.objectiveText.startsWith('Job 1/13'), s.objectiveText);
}

// 24. Mission 9: the cab fares need a car, pay $150 a drop, and finish after three.
{
  const s = createWorld(7);
  const m = startAt(s, 8);
  check('cab spawns a waiting fare customer', s.peds.some((p) => p.fare && p.state === 'wait'), `${s.peds.filter((p) => p.fare).length} fare peds`);
  const fare = m.steps[0].fares[0];
  teleport(s, fare.px, fare.py);
  step(s, 3);
  check('cab pickup does not count on foot', s.missions.fareLeg === 'pickup', s.missions.fareLeg);
  const car = createCar(s.player.x + 10, s.player.y, 0, 'taxi', s.random);
  s.cars.push(car);
  enterCar(s.player, car, s);
  teleport(s, fare.px, fare.py);
  step(s, 1);
  check('cab pickup counts in a car', s.missions.fareLeg === 'drop', s.missions.fareLeg);
  check('cab pickup removes the waiting customer', !s.peds.some((p) => p.fare), 'fare ped still there');
  teleport(s, fare.dx, fare.dy);
  const cashBefore = s.player.cash;
  step(s, 1);
  check('cab drop pays $150', s.player.cash === cashBefore + 150, `$${s.player.cash}`);
  for (const f of m.steps[0].fares.slice(1)) {
    teleport(s, f.px, f.py);
    step(s, 1);
    check('next cab pickup counts in a car', s.missions.fareLeg === 'drop', s.missions.fareLeg);
    teleport(s, f.dx, f.dy);
    step(s, 1);
  }
  check('cab completes after three fares', s.missions.index === 9, `index ${s.missions.index}`);
  check('cab pays three drops plus its $250 reward', s.player.cash === 150 * 3 + 250, `$${s.player.cash}`);
}

// 25. Mission 10: the airfield pickup is hot, and the cargo pays $1,100.
{
  const s = createWorld(7);
  const m = startAt(s, 9);
  teleport(s, PLACES.airfield.x, PLACES.airfield.y);
  step(s, 1);
  check('airfield pickup sets two wanted stars', s.police.wanted === 2, `${s.police.wanted}`);
  check('airfield pickup step completes', s.missions.step === 1, `step ${s.missions.step}`);
  teleport(s, PLACES.warehouse.x, PLACES.warehouse.y);
  const events = step(s, 1);
  check('airfield cargo completes', (events & EVENT_MISSION_DONE) !== 0 && s.missions.index === 10, `index ${s.missions.index}`);
  check('airfield cargo pays $1,100', s.player.cash === 1100, `$${s.player.cash}`);
}

// 26. Mission 11: the midnight rally runs eight gates in a car.
{
  const s = createWorld(7);
  const m = startAt(s, 10);
  const gates = m.steps[1].points;
  check('rally has eight gates', gates.length === 8, `${gates.length}`);
  teleport(s, gates[0].x, gates[0].y);
  step(s, 3);
  check('rally gate does not count on foot', s.missions.checkpoint === 0, `checkpoint ${s.missions.checkpoint}`);
  const car = createCar(s.player.x + 10, s.player.y, 0, 'sports', s.random);
  s.cars.push(car);
  enterCar(s.player, car, s);
  step(s, 1);
  for (const p of gates) {
    teleport(s, p.x, p.y);
    step(s, 1);
  }
  check('rally completes', s.missions.index === 11, `index ${s.missions.index}`);
  check('rally pays $1,800', s.player.cash === 1800, `$${s.player.cash}`);
}

// 27. Mission 12: the Meridian Job spawns five casino guards and ends the story.
{
  const s = createWorld(7);
  startAt(s, 11);
  check('meridian spawns five casino guards', s.rivals.length === 5 && s.rivals.every((r) => r.kind === 'guard'), `${s.rivals.length} rivals`);
  check('meridian sets two wanted stars', s.police.wanted === 2, `${s.police.wanted}`);
  for (const r of s.rivals) { r.hp = 0; r.state = 'dead'; }
  step(s, 1);
  check('meridian eliminate step completes', s.missions.step === 1, `step ${s.missions.step}`);
  teleport(s, PLACES.casino.x, PLACES.casino.y);
  step(s, 1);
  check('meridian loot step completes', s.missions.step === 2, `step ${s.missions.step}`);
  teleport(s, PLACES.safehouse.x, PLACES.safehouse.y);
  const events = step(s, 1);
  check('meridian completes and moves on', (events & EVENT_MISSION_DONE) !== 0 && s.missions.index === 12, `index ${s.missions.index}`);
  check('meridian does not end the story yet', !s.missions.storyComplete, `complete ${s.missions.storyComplete}`);
  check('meridian pays $3,000', s.player.cash === 3000, `$${s.player.cash}`);
}

// 28. The helicopter arrives at five stars, blocks the wanted decay, and leaves below five.
{
  const s = createWorld(7);
  setWanted(s.police, 5);
  step(s, 1);
  check('helicopter spawns at five stars', !!s.police.heli, 'no heli');
  // Clear the cruisers every step so only the helicopter can hold the
  // heat: fresh cruisers always spawn at least 750 away, too far to see
  // Leo, so without the helicopter the level would decay in 12 seconds.
  for (let i = 0; i < 60 * 13; i += 1) {
    s.police.cars.length = 0;
    s.police.cops.length = 0;
    step(s, 1);
  }
  check('helicopter blocks wanted decay', s.police.wanted === 5 && s.police.decayTimer === 0, `${s.police.wanted} stars, timer ${s.police.decayTimer}`);
  setWanted(s.police, 4);
  step(s, 1);
  check('helicopter leaves below five stars', !s.police.heli, 'heli still there');
}

// 29. The Airfield district, the airfield buildings and the casino.
{
  const s = createWorld(7);
  check('district Airfield', districtOf(500, 500) === 'Airfield');
  check('district Old Town below the airfield', districtOf(500, 1000) === 'Old Town');
  const hangar = s.city.buildings.find((b) => b.hangar);
  const plane = s.city.buildings.find((b) => b.plane);
  const casino = s.city.buildings.find((b) => b.casino);
  check('airfield has a hangar and a plane', !!hangar && !!plane, `${hangar ? 'hangar' : 'no hangar'}, ${plane ? 'plane' : 'no plane'}`);
  check('casino building stands south of the plaza', !!casino && casino.x === 2400 && casino.y === 1900, casino ? `${casino.x},${casino.y}` : 'no casino');
  const ordinary = s.city.buildings.filter((b) => b.x >= 389 && b.x < 891 && b.y >= 389 && b.y < 745 && !b.hangar && !b.plane);
  check('no ordinary buildings in the airfield block', ordinary.length === 0, `${ordinary.length} buildings`);
  check('airfield and casino are on the city', !!s.city.airfield && !!s.city.casino, 'missing');
}

// 30. Boats: Leo boards a speedboat at the Marina and sails it down the bay.
{
  const s = createWorld(7);
  check('two speedboats moored at the Marina', s.boats.length === 2 && s.boats.every((b) => b.kind === 'speedboat'), `${s.boats.length} boats`);
  const boat = s.boats[0];
  teleport(s, boat.x, boat.y - 40);
  step(s, 1, idleInput(), 0, ACTION_ENTER);
  check('Leo boards the boat with E', s.player.inBoat === boat, 'not aboard');
  boat.angle = Math.PI;
  const x0 = boat.x;
  step(s, 300, idleInput(() => ({ x: 0, y: -1 })), 0);
  check('the boat sails west', boat.x < x0 - 1000, `x ${boat.x.toFixed(0)} from ${x0}`);
  check('the boat stays in the bay', boat.y >= 2470 && boat.y <= 2540, `y ${boat.y.toFixed(0)}`);
  step(s, 1, idleInput(), 0, ACTION_ENTER);
  check('Leo docks back on the beach', !s.player.inBoat && s.player.y < 2400, `y ${s.player.y.toFixed(0)}`);
}

// 31. Mission 13: the Smuggler's Run needs the boat, pays $1,600, ends the story.
{
  const s = createWorld(7);
  const m = startAt(s, 12);
  check('smugglers run is the thirteenth job', m.id === 'smugglers-run' && MISSION_COUNT === 13, m.id);
  const boat = s.boats[0];
  teleport(s, boat.x, boat.y - 40);
  step(s, 1, idleInput(), 0, ACTION_ENTER);
  check('smugglers run boards the boat', s.missions.step === 1, `step ${s.missions.step}`);
  teleport(s, PLACES.smugglerCove.x, PLACES.smugglerCove.y);
  step(s, 1);
  check('smugglers run pickup is hot', s.police.wanted === 2 && s.missions.step === 2, `${s.police.wanted} stars, step ${s.missions.step}`);
  teleport(s, PLACES.marina.x, 2520);
  const events = step(s, 1);
  check('smugglers run completes the story', (events & EVENT_MISSION_DONE) !== 0 && s.missions.storyComplete, `complete ${s.missions.storyComplete}`);
  check('smugglers run pays $1,600', s.player.cash === 1600, `$${s.player.cash}`);
}

// 32. ABPD boats chase Leo on the water at three stars, and leave when the heat drops.
{
  const s = createWorld(7);
  const boat = s.boats[0];
  teleport(s, boat.x, boat.y - 40);
  step(s, 1, idleInput(), 0, ACTION_ENTER);
  setWanted(s.police, 2);
  step(s, 5);
  check('no police boat at two stars', s.police.boats.length === 0, `${s.police.boats.length} boats`);
  setWanted(s.police, 3);
  step(s, 5);
  check('police boat launches at three stars', s.police.boats.length === 1, `${s.police.boats.length} boats`);
  const pb = s.police.boats[0];
  const d0 = Math.hypot(pb.x - s.player.x, pb.y - s.player.y);
  step(s, 180);
  const d1 = Math.hypot(pb.x - s.player.x, pb.y - s.player.y);
  check('police boat closes on Leo', d1 < d0, `${d0.toFixed(0)} -> ${d1.toFixed(0)}`);
  setWanted(s.police, 0);
  step(s, 1);
  check('police boats leave when the heat is gone', s.police.boats.length === 0, `${s.police.boats.length} boats`);
}

// 33. A boat at zero health sinks, and Leo swims out hurt.
{
  const s = createWorld(7);
  const boat = s.boats[0];
  teleport(s, boat.x, boat.y - 40);
  step(s, 1, idleInput(), 0, ACTION_ENTER);
  boat.hp = 0;
  const events = step(s, 1);
  check('sunk boat explodes and leaves the bay', (events & EVENT_EXPLOSION) !== 0 && !s.boats.includes(boat), 'boat still there');
  check('Leo swims out of a sunk boat', !s.player.inBoat && s.player.health < 100, `health ${s.player.health}`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
