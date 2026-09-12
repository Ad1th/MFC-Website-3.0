import { flags } from '../../live/flags.js';

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

function clock(timeZone, now) {
  try {
    return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).format(now);
  } catch {
    return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
  }
}

export function viewerTimeZone() {
  if (flags.tz) return flags.tz;
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * @param {number} width
 * @param {number} height
 * @param {(text: string, font: string) => number} measure text width in CSS px
 * @param {Date} [now]
 */
export function heroLayout(width, height, measure, now = new Date()) {
  const gutter = clamp(16, 6.4 + 0.03 * width, 56);
  const titleSize = Math.round(clamp(56, 0.11 * width, 192));
  const lineHeight = titleSize * 0.9;
  const tracking = -0.03 * titleSize;

  const logo = { x: gutter, y: 22, size: 40 };

  const zone = viewerTimeZone();
  const hud = [
    { text: `you: ${zone.toLowerCase()} ${clock(zone, now)}`, x: gutter, y: 86, color: HERO_COLORS.hud },
    { text: `vellore: ${clock('Asia/Kolkata', now)}`, x: gutter, y: 104, color: HERO_COLORS.hud },
  ];

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
  const top = Math.max(hud[1].y + 40, height * 0.56 - blockHeight / 2);
  const title = lines.map((text, i) => ({ text, x: gutter, baseline: Math.round(top + titleSize * 0.82 + i * lineHeight) }));

  return { gutter, logo, hud, title: { size: titleSize, lineHeight, tracking, font, lines: title } };
}
