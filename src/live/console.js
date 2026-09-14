import { site } from '../content/index.js';
import { film } from '../film/store.js';
import { addPet } from './visitor.js';

/**
 * The console (living layer). On load, an orange ASCII fox and three lines; `fox.run()` lets the
 * fox loose across the whole page (an overlay canvas over the DOM, loaded on first use),
 * `fox.pet()` pets it and counts, `join()` opens recruitment. This is the only console output the
 * site makes in production.
 */

const FOX = [
  '          /\\       /\\',
  '         /  \\_____/  \\',
  '        /             \\',
  '       |   ●       ●   |',
  '        \\      ▼      /',
  '         \\___________/',
  '          /         \\',
  '         /  |     |  \\  ~~~~',
].join('\n');

let running = null;

function run() {
  if (running) return 'the fox is already out.';
  running = import('../film/fox/RunOverlay.jsx')
    .then(({ mountRunOverlay }) => mountRunOverlay())
    .then(() => {
      running = null;
    })
    .catch(() => {
      running = null;
    });
  return 'there it goes.';
}

function pet() {
  // Held like a real press: the fox leans in, then swishes its tail when you let go.
  film.getState().petFox(performance.now() + 1400);
  const pets = addPet();
  console.log(`pets today: ${pets}`);
  return undefined;
}

function join() {
  window.open(site.recruitmentUrl, '_blank', 'noopener');
  return 'see you there.';
}

let printed = false;

export function initConsole() {
  if (typeof window === 'undefined') return;
  window.fox = Object.freeze({ run, pet });
  window.join = join;
  if (printed) return;
  printed = true;
  console.log(
    `%c${FOX}\n\n%cyou opened the console. you're our kind of people.\ntype fox.run() to let it loose.\ntype join() to apply.`,
    'color:#ff6d00;font-family:monospace;font-size:12px;line-height:1.1',
    'color:#e8ded5;font-family:monospace;font-size:12px;line-height:1.6',
  );
}
