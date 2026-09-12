import { timeZone } from '../../live/whereami.js';
import { filmNow } from '../../live/clock.js';

/**
 * The hero's layout for a viewport, as plain numbers. The canvas draws from it and the
 * transparent DOM text is positioned from it, so both agree on where everything is.
 * All values are CSS pixels.
 */

export const HERO_FONTS = {
  title: (size) => `600 ${size}px "Mozilla Headline", "Zilla Slab", Georgia, serif`,
  hud: '400 12px "Fira Code", ui-monospace, monospace',
};

export const HERO_COLORS = {
  title: '#e8ded5',
  hud: '#a39e9a',
  hudLive: '#e8ded5',
};

const clamp = (min, value, max) => Math.min(max, Math.max(min, value));

function clock(zone, now) {
  try {
    return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: zone }).format(now);
  } catch {
    return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
  }
}

/** `vellore: 01:42, clear, 26°C`, dropping whatever part of the weather is missing. */
export function velloreLine(time, weather) {
  const parts = [time];
  if (weather?.condition) parts.push(weather.condition);
  if (weather && typeof weather.temperature === 'number') parts.push(`${weather.temperature}°C`);
  return `vellore: ${parts.join(', ')}`;
}

/**
 * @param {number} width
 * @param {number} height
 * @param {(text: string, font: string) => number} measure text width in CSS px
 * @param {{ now?: Date, weather?: null|{ condition: string, temperature: number|null }, visits?: number }} [options]
 *   weather is real or null; with null the Vellore line carries the clock only
 */
export function heroLayout(width, height, measure, { now = filmNow(), weather = null, visits = 1 } = {}) {
  const gutter = clamp(16, 6.4 + 0.03 * width, 56);
  // The page headline is the HTML layer's title, set low and left; the film's giant lensed
  // title behind the planet is the big type in S01, so the two never compete.
  const titleSize = Math.round(clamp(40, 0.052 * width, 96));
  const lineHeight = titleSize * 0.9;
  const tracking = -0.03 * titleSize;

  const logo = { x: gutter, y: 22, size: 40 };

  const zone = timeZone();
  const hud = [
    { text: `you: ${zone.toLowerCase()} ${clock(zone, now)}`, x: gutter, y: 86, color: HERO_COLORS.hud },
    { text: velloreLine(clock('Asia/Kolkata', now), weather), x: gutter, y: 104, color: HERO_COLORS.hud },
  ];
  // Visits 2 to 4 are greeted; from visit 5 the film just gets out of the way.
  if (visits >= 2 && visits <= 4) hud.push({ text: 'you came back.', x: gutter, y: 122, color: HERO_COLORS.hudLive });

  // Greedy word wrap for the title inside the gutters.
  const words = ['MOZILLA', 'FIREFOX', 'CLUB'];
  const font = HERO_FONTS.title(titleSize);
  const maxWidth = width - gutter * 2;
  const trackedWidth = (text) => measure(text, font) + tracking * Math.max(0, text.length - 1);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && trackedWidth(next) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);

  const blockHeight = lines.length * lineHeight;
  const top = Math.max(hud[hud.length - 1].y + 40, height - gutter * 2.2 - blockHeight);
  const title = lines.map((text, i) => ({ text, x: gutter, baseline: Math.round(top + titleSize * 0.82 + i * lineHeight) }));

  return { gutter, logo, hud, title: { size: titleSize, lineHeight, tracking, font, lines: title } };
}
