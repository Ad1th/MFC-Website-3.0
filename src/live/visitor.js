import { flags } from './flags.js';

/**
 * Visit memory in localStorage: visits, firstCompletion and pets. Every access is wrapped,
 * so the site works the same when storage throws. A visit counts once per browser
 * session. `?visits=N` pretends a count for testing the returning-visitor branches.
 */

const KEY = 'mfc.visitor';
const SESSION_KEY = 'mfc.visit-counted';

function read() {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return {
      visits: Number.isFinite(value.visits) ? value.visits : 0,
      firstCompletion: typeof value.firstCompletion === 'string' ? value.firstCompletion : null,
      pets: Number.isFinite(value.pets) ? value.pets : 0,
    };
  } catch {
    return { visits: 0, firstCompletion: null, pets: 0 };
  }
}

function write(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Storage unavailable; memory just does not persist.
  }
}

let state = read();

/** Count this visit once per session. Returns the visit number, 1 for a first visit. */
export function countVisit() {
  if (flags.visits !== null) return flags.visits;
  let counted = false;
  try {
    counted = sessionStorage.getItem(SESSION_KEY) === '1';
    sessionStorage.setItem(SESSION_KEY, '1');
  } catch {
    // No session storage: count the visit; at worst a reload counts twice.
  }
  if (!counted) {
    state = { ...state, visits: state.visits + 1 };
    write(state);
  }
  return Math.max(1, state.visits);
}

export function visits() {
  return flags.visits ?? Math.max(1, state.visits);
}

export function markCompleted() {
  if (state.firstCompletion) return;
  state = { ...state, firstCompletion: new Date().toISOString() };
  write(state);
}

/** @returns {number} pets so far, including this one */
export function addPet() {
  state = { ...state, pets: state.pets + 1 };
  write(state);
  return state.pets;
}
