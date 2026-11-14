import { Component, computed, inject, resource, signal } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { AppPicker } from '@adamstavely/trenchcoat/angular/app-picker';
import { HeaderBrand } from '@adamstavely/trenchcoat/angular/header-brand';
import { HeaderNav } from '@adamstavely/trenchcoat/angular/header-nav';
import { Notifications as NotificationCentre } from '@adamstavely/trenchcoat/angular/notifications';
import { TermsDialog } from '@adamstavely/trenchcoat/angular/terms-dialog';
import { Toaster } from '@adamstavely/trenchcoat/angular/toaster';
import { LookProvider } from '@adamstavely/trenchcoat/angular/look-provider';
import type { HeaderNavAccountSelect } from '@adamstavely/trenchcoat/header-nav';
import { profileMenuIcon, type ProfileMenuItem } from '@adamstavely/trenchcoat/profile-menu';
import type { TermsSection } from '@adamstavely/trenchcoat/terms-dialog';
import { toast } from '@adamstavely/trenchcoat/toaster';
import { Apps } from './core/apps';
import { Auth } from './core/auth';
import { Session } from './core/session';
import { NOTIFICATION_CATEGORIES, Notifications } from './core/notifications';
import { BoardSearch } from './features/search/board-search';
import { ThemeService } from './core/theme';

const SETTINGS = 'settings';
const THEME = 'theme';
const LANGUAGE = 'language';
const DOCS = 'docs';
const TERMS = 'terms';
const SIGN_OUT = 'sign-out';

/** How to use Corkboard, until it has docs of its own. */
const DOCS_URL = 'https://github.com/adamstavely/corkboard-ui#using-the-board';

/** The Terms and Conditions, from public/terms.json so they can change without a release. */
interface Terms {
  heading: string;
  version: string;
  effectiveDate: string;
  sections: TermsSection[];
}

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, LookProvider, HeaderBrand, HeaderNav, NotificationCentre, AppPicker, Toaster, TermsDialog, BoardSearch],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly auth = inject(Auth);
  protected readonly session = inject(Session);
  protected readonly notifications = inject(Notifications);
  protected readonly notificationCategories = NOTIFICATION_CATEGORIES;
  protected readonly apps = inject(Apps);

  /** Opening one goes to its board in the app, and marks it read. */
  protected onNotificationOpen(e: CustomEvent<{ id: unknown; item: unknown }>): void {
    e.preventDefault();
    const href = (e.detail.item as { href?: string }).href;
    void this.notifications.read([String(e.detail.id)]);
    if (href) void this.#router.navigateByUrl(href);
  }

  protected onNotificationsRead(e: CustomEvent<{ ids: unknown; read: unknown }>): void {
    if (e.detail.read === true) void this.notifications.read(e.detail.ids as string[]);
  }

  protected onAllRead(e: CustomEvent<unknown>): void {
    e.preventDefault();
    void this.notifications.read('all');
  }
  readonly #router = inject(Router);
  readonly #theme = inject(ThemeService);

  /**
   * The header nav's own account actions, with light and dark as a switch after Settings (the card stays open while it's
   * flipped). Settings is the account page, where people manage their passkeys.
   */
  protected readonly accountItems = computed<ProfileMenuItem[]>(() => [
    { id: SETTINGS, label: 'Settings', icon: profileMenuIcon('settings') },
    { id: THEME, label: 'Dark mode', icon: profileMenuIcon('moon'), checked: this.#theme.theme() === 'dark' },
    { id: LANGUAGE, label: 'Language', icon: profileMenuIcon('language') },
    { id: DOCS, label: 'Docs', icon: profileMenuIcon('docs') },
    { id: TERMS, label: 'Terms and Conditions', icon: profileMenuIcon('terms') },
    { id: SIGN_OUT, label: 'Sign out', icon: profileMenuIcon('logout') },
  ]);

  /** The Terms and Conditions dialog: read-only, opened from the account card. Loaded the first time it opens. */
  protected readonly termsOpen = signal(false);
  protected readonly terms = resource({
    params: () => (this.termsOpen() ? true : undefined),
    loader: async () => (await fetch('/terms.json')).json() as Promise<Terms>,
  });

  /** The picker shows before anyone is someone, so it gets no header. */
  protected readonly showHeader = this.auth.signedIn;

  protected onBrandNavigate(event: CustomEvent<{ href: string }>): void {
    event.preventDefault();
    void this.#router.navigateByUrl(event.detail.href);
  }

  protected onAccountSelect(event: CustomEvent<HeaderNavAccountSelect>): void {
    switch (event.detail.id) {
      case SETTINGS:
        void this.#router.navigateByUrl('/account');
        break;
      case THEME:
        this.#theme.set(event.detail.checked ? 'dark' : 'light');
        break;
      case LANGUAGE:
        toast.info('Corkboard is in English for now', { description: 'Other languages will show up here when they are added.' });
        break;
      case DOCS:
        window.open(DOCS_URL, '_blank', 'noopener');
        break;
      case TERMS:
        this.termsOpen.set(true);
        break;
      case SIGN_OUT:
        this.auth.signOut();
        void this.#router.navigateByUrl('/who');
    }
  }
}
