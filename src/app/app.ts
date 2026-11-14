import { Component, computed, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { HeaderBrand } from '@adamstavely/trenchcoat/angular/header-brand';
import { HeaderNav } from '@adamstavely/trenchcoat/angular/header-nav';
import { Notifications as NotificationCentre } from '@adamstavely/trenchcoat/angular/notifications';
import { Toaster } from '@adamstavely/trenchcoat/angular/toaster';
import { LookProvider } from '@adamstavely/trenchcoat/angular/look-provider';
import type { HeaderNavAccountSelect } from '@adamstavely/trenchcoat/header-nav';
import { profileMenuIcon, type ProfileMenuItem } from '@adamstavely/trenchcoat/profile-menu';
import { Auth } from './core/auth';
import { Session } from './core/session';
import { NOTIFICATION_CATEGORIES, Notifications } from './core/notifications';
import { BoardSearch } from './features/search/board-search';
import { ThemeService } from './core/theme';

const THEME = 'theme';
const PASSKEYS = 'passkeys';
const SIGN_OUT = 'sign-out';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, LookProvider, HeaderBrand, HeaderNav, NotificationCentre, Toaster, BoardSearch],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly auth = inject(Auth);
  protected readonly session = inject(Session);
  protected readonly notifications = inject(Notifications);
  protected readonly notificationCategories = NOTIFICATION_CATEGORIES;

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

  /** Light and dark as a switch (the card stays open while it's flipped), their passkeys, then Sign out. */
  protected readonly accountItems = computed<ProfileMenuItem[]>(() => [
    { id: THEME, label: 'Dark mode', icon: profileMenuIcon('moon'), checked: this.#theme.theme() === 'dark' },
    { id: PASSKEYS, label: 'Passkeys' },
    { id: SIGN_OUT, label: 'Sign out' },
  ]);

  /** The picker shows before anyone is someone, so it gets no header. */
  protected readonly showHeader = this.auth.signedIn;

  protected onBrandNavigate(event: CustomEvent<{ href: string }>): void {
    event.preventDefault();
    void this.#router.navigateByUrl(event.detail.href);
  }

  protected onAccountSelect(event: CustomEvent<HeaderNavAccountSelect>): void {
    if (event.detail.id === THEME) this.#theme.set(event.detail.checked ? 'dark' : 'light');
    else if (event.detail.id === PASSKEYS) void this.#router.navigateByUrl('/account');
    else if (event.detail.id === SIGN_OUT) {
      this.auth.signOut();
      void this.#router.navigateByUrl('/who');
    }
  }
}
