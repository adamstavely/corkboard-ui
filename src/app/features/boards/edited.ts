const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/** "Edited 5 minutes ago", "Edited yesterday"; a date once it's more than a few weeks back. */
export function edited(when: Date, now = new Date()): string {
  const ago = now.getTime() - when.getTime();
  const say = (unit: Intl.RelativeTimeFormatUnit, size: number) => `Edited ${rtf.format(-Math.round(ago / size), unit)}`;
  if (ago < MINUTE) return 'Edited just now';
  if (ago < HOUR) return say('minute', MINUTE);
  if (ago < DAY) return say('hour', HOUR);
  if (ago < WEEK) return say('day', DAY);
  if (ago < 5 * WEEK) return say('week', WEEK);
  return `Edited ${when.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}
