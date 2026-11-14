import type { CanDeactivateFn } from '@angular/router';

/** Where a board's unsent edits are kept in this browser: an IndexedDB database per board (see BoardConnection). */
export const LOCAL_PREFIX = 'corkboard:';

/** Removes every board's local copy from this browser, e.g. on signing out. */
export async function clearLocalBoards(): Promise<void> {
  if (typeof indexedDB === 'undefined' || !indexedDB.databases) return;
  const all = await indexedDB.databases();
  for (const { name } of all) if (name?.startsWith(LOCAL_PREFIX)) indexedDB.deleteDatabase(name);
}

/** Pages that can be left with work not yet saved. */
export interface HoldsWork {
  hasPendingWork(): boolean;
}

/**
 * Asks before leaving a board within the app while edits haven't reached the server (the browser asks itself when the
 * tab closes). They're kept in this browser either way, and sent when the board is next open.
 */
export const pendingWorkGuard: CanDeactivateFn<HoldsWork> = (page) =>
  !page.hasPendingWork() ||
  confirm("Some of your changes haven't reached the server yet. They're kept in this browser and will be sent when you next open the board. Leave anyway?");
