// Saving: Leo's cash, health, weapons, tuning, stashes, position and
// mission progress, in this browser's localStorage. Nothing leaves the
// machine. A save is read once at boot (the title screen offers to
// continue) and written every ten seconds of play and on every mission
// payout.

import { SAVE_KEY } from './config.js';

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const save = JSON.parse(raw);
    if (typeof save !== 'object' || save === null) return null;
    return save;
  } catch {
    return null;
  }
}

export function saveGame(state) {
  try {
    const player = state.player;
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: Math.floor(player.cash),
      health: Math.max(1, Math.floor(player.health)),
      hasPistol: player.hasPistol,
      hasShotgun: player.hasShotgun,
      weapon: player.weapon,
      ammo: player.ammo,
      shells: player.shells,
      tuning: player.tuning || 0,
      stashesFound: state.stats.stashesFound || 0,
      x: Math.floor(player.x),
      y: Math.floor(player.y),
      missionIndex: state.missions.index,
      storyComplete: state.missions.storyComplete,
      savedAt: Date.now(),
    }));
  } catch {
    // Storage can be off (private windows): the run then lasts this visit only.
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // See above.
  }
}
