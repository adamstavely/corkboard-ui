/**
 * Stepping through a board's history in replay. The API sends the board at up to CHUNK points at a time, the first
 * whole and each after it as only what changed; points are fetched in fixed chunks of the whole list, so stepping
 * forward within a chunk applies just the next update, and anything else starts again from the chunk's first.
 */
export const CHUNK = 30;

/** Points a second at each speed. */
export const SPEEDS = [1, 2, 4] as const;
export type Speed = (typeof SPEEDS)[number];

export type ReplayRange = 'session' | 'all';

/** The first point of the chunk `index` is in. */
export const chunkOf = (index: number) => Math.floor(index / CHUNK) * CHUNK;

/** How to get from what's shown to `target`: apply the updates `from`..`to` on top, or start afresh (`fresh`). */
export function route(shown: number | null, target: number): { fresh: boolean; from: number; to: number } {
  const start = chunkOf(target);
  if (shown !== null && shown <= target && chunkOf(shown) === start) return { fresh: false, from: shown + 1, to: target };
  return { fresh: true, from: start, to: target };
}

/** The first and last points (inclusive) a range covers; "this session" falls back to everything when it's unknown. */
export function rangeOf(frames: readonly { id: string }[], sessionStartId: string | null, range: ReplayRange): { start: number; end: number } {
  const end = frames.length - 1;
  const session = range === 'session' && sessionStartId ? frames.findIndex((f) => f.id === sessionStartId) : -1;
  return { start: Math.max(0, session), end };
}

/** The point after `index` while playing, or null at the end of the range. */
export const nextPoint = (index: number, end: number) => (index < end ? index + 1 : null);

/** What happened between the point before `index` and it (all up to it, for the first). */
export function eventsAt<E extends { at: number }>(events: readonly E[], frames: readonly { at: number }[], index: number): E[] {
  const to = frames[index]?.at;
  if (to === undefined) return [];
  const from = index > 0 ? frames[index - 1].at : -Infinity;
  return events.filter((e) => e.at > from && e.at <= to);
}

/** The time of a point: just the time when the range is all on one day, else the day too. */
export function pointTime(at: number, oneDay: boolean): string {
  const options: Intl.DateTimeFormatOptions = oneDay ? { hour: 'numeric', minute: '2-digit' } : { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' };
  return new Date(at).toLocaleString(undefined, options);
}

export const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString();

/** Base64 to bytes. */
export function decode(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
