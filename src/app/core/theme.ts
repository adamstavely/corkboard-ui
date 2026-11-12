import { Injectable, signal } from '@angular/core';

export type Theme = 'light' | 'dark';

/** Shared with the inline script in index.html, which applies a saved theme before the app boots. */
export const THEME_STORAGE_KEY = 'corkboard.theme';

function storedTheme(): Theme | null {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

function systemTheme(): Theme {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Light or dark, via Trench Coat's `data-tc-theme` on <html>. Until someone picks one the app follows the OS; once
 * picked, the choice is remembered in this browser.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<Theme>(storedTheme() ?? systemTheme());
  #picked = storedTheme() !== null;

  constructor() {
    // While nothing is picked, keep up with the OS switching between light and dark.
    if (typeof matchMedia === 'function') {
      matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        if (!this.#picked) this.theme.set(e.matches ? 'dark' : 'light');
      });
    }
  }

  set(theme: Theme): void {
    this.#picked = true;
    this.theme.set(theme);
    document.documentElement.dataset['tcTheme'] = theme;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Private mode or blocked storage: the choice lasts for this page only.
    }
  }

  toggle(): void {
    this.set(this.theme() === 'dark' ? 'light' : 'dark');
  }
}
