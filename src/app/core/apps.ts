import { Injectable, resource } from '@angular/core';
import type { AppPickerApp } from '@adamstavely/trenchcoat/app-picker';

export interface AppsConfig {
  /** The id of the app the person is in. */
  current: string;
  apps: AppPickerApp[];
}

/** What the picker shows when apps.json is missing or unreadable: just Corkboard. */
export const DEFAULT_APPS: AppsConfig = {
  current: 'corkboard',
  apps: [{ id: 'corkboard', name: 'Corkboard', href: '/', description: 'Boards your team and a model work on together', tone: 'amber' }],
};

/** Keeps only well-formed entries, so a bad edit to apps.json can't break the header. */
export function parseApps(raw: unknown): AppsConfig {
  const cfg = raw as Partial<AppsConfig> | null;
  const apps = Array.isArray(cfg?.apps) ? cfg.apps.filter((a) => typeof a?.id === 'string' && typeof a?.name === 'string') : [];
  if (!apps.length) return DEFAULT_APPS;
  return { current: typeof cfg?.current === 'string' ? cfg.current : DEFAULT_APPS.current, apps };
}

/**
 * The app picker's list, read at runtime from `/apps.json` (public/apps.json in the build). Deployments replace that file,
 * e.g. from a ConfigMap, to list their other apps without a rebuild.
 */
@Injectable({ providedIn: 'root' })
export class Apps {
  readonly config = resource({
    loader: async ({ abortSignal }) => {
      try {
        const res = await fetch('/apps.json', { signal: abortSignal, cache: 'no-cache' });
        return res.ok ? parseApps(await res.json()) : DEFAULT_APPS;
      } catch {
        return DEFAULT_APPS;
      }
    },
    defaultValue: DEFAULT_APPS,
  });
}
