import { Component, computed, inject, input, resource, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AppPicker } from '@adamstavely/trenchcoat/angular/app-picker';
import { HeaderNav } from '@adamstavely/trenchcoat/angular/header-nav';
import { Notifications as NotificationCentre } from '@adamstavely/trenchcoat/angular/notifications';
import { TermsDialog } from '@adamstavely/trenchcoat/angular/terms-dialog';
import type { HeaderNavAccountSelect } from '@adamstavely/trenchcoat/header-nav';
import { profileMenuIcon, type ProfileMenuItem } from '@adamstavely/trenchcoat/profile-menu';
import type { TermsSection } from '@adamstavely/trenchcoat/terms-dialog';
import { toast } from '@adamstavely/trenchcoat/toaster';
import { Apps } from '../core/apps';
import { Auth } from '../core/auth';
import { NOTIFICATION_CATEGORIES, Notifications } from '../core/notifications';
import { ThemeService } from '../core/theme';

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

/**
 * The bell, the app picker and your avatar with its account card: Trench Coat's header nav. The app's top bar shows it,
 * and so does a board's top-right panel, where the top bar is hidden.
 */
@Component({
  selector: 'app-account-nav',
  imports: [HeaderNav, NotificationCentre, AppPicker, TermsDialog],
  template: `
    <!-- The bell and the app picker sit inside the header nav, which lines them up with the avatar and keeps one popover
         open at a time. -->
    <tc-header-nav [user]="auth.profile()" [accountItems]="accountItems()" [separator]="separator()" (tc-account-select)="onAccountSelect($event)">
      <tc-notifications
        [items]="notifications.items()"
        [categories]="notificationCategories"
        (tc-item-open)="onNotificationOpen($event)"
        (tc-read-change)="onNotificationsRead($event)"
        (tc-mark-all-read)="onAllRead($event)"
      ></tc-notifications>
      @if (apps()) {
        <tc-app-picker label="Apps" [apps]="appList.config.value().apps" [current]="appList.config.value().current"></tc-app-picker>
      }
    </tc-header-nav>

    <!-- Read-only: nothing to agree to yet, so Close in place of Accept and no Decline. Loaded the first time it's
         opened, so it costs the first page nothing. -->
    @defer (when termsOpen()) {
      @if (terms.hasValue()) {
        <tc-terms-dialog
          [open]="termsOpen()"
          [heading]="terms.value().heading"
          [version]="terms.value().version"
          [effectiveDate]="terms.value().effectiveDate"
          [sections]="terms.value().sections"
          [canDecline]="false"
          accept-label="Close"
          (tc-accept)="termsOpen.set(false)"
          (tc-open-change)="termsOpen.set($event.detail.open)"
        ></tc-terms-dialog>
      }
    }
  `,
  styles: `
    :host {
      display: contents;
    }
  `,
})
export class AccountNav {
  protected readonly auth = inject(Auth);
  protected readonly notifications = inject(Notifications);
  protected readonly appList = inject(Apps);
  protected readonly notificationCategories = NOTIFICATION_CATEGORIES;
  readonly #router = inject(Router);
  readonly #theme = inject(ThemeService);

  /** Whether to show the app picker (a board's panel leaves it out to stay short). */
  readonly apps = input(true);
  /** The hairline before the avatar. */
  readonly separator = input(true);

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
