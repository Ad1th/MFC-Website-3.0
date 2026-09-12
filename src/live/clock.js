import { flags } from './flags.js';
import { FILM_FREEZE } from '../film/testHooks.js';

/**
 * The film's idea of "now". Real time, unless `?at=<ISO date>` pins a moment so the
 * terminator and clocks can be checked against a known day and night map. With
 * `?freeze=1` time also stops, so two screenshots of the same frame are identical.
 */

const loadedAt = Date.now();
const pinned = flags.at ? new Date(flags.at) : null;
const offset = pinned && !Number.isNaN(pinned.getTime()) ? pinned.getTime() - loadedAt : 0;

/** @returns {Date} */
export function filmNow() {
  return new Date((FILM_FREEZE ? loadedAt : Date.now()) + offset);
}
