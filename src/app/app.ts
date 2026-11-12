import { Component, computed, inject } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { HeaderBrand } from '@adamstavely/trenchcoat/angular/header-brand';
import { HeaderNav } from '@adamstavely/trenchcoat/angular/header-nav';
import { LookProvider } from '@adamstavely/trenchcoat/angular/look-provider';
import type { HeaderNavAccountSelect } from '@adamstavely/trenchcoat/header-nav';
import { profileMenuIcon, type ProfileMenuItem } from '@adamstavely/trenchcoat/profile-menu';
import { Auth, CALLBACK_PATH } from './core/auth';
import { Session } from './core/session';
import { BoardSearch } from './features/search/board-search';
import { ThemeService } from './core/theme';

const THEME = 'theme';
const SIGN_OUT = 'sign-out';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, LookProvider, HeaderBrand, HeaderNav, BoardSearch],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly auth = inject(Auth);
  protected readonly session = inject(Session);
  readonly #router = inject(Router);
  readonly #theme = inject(ThemeService);

  /** Light and dark as a switch (the card stays open while it's flipped), then Sign out. */
  protected readonly accountItems = computed<ProfileMenuItem[]>(() => [
    { id: THEME, label: 'Dark mode', icon: profileMenuIcon('moon'), checked: this.#theme.theme() === 'dark' },
    { id: SIGN_OUT, label: 'Sign out' },
  ]);

  /** The callback page shows before anyone is signed in, so it gets no header. */
  readonly #url = toSignal(
    this.#router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: this.#router.url },
  );
  protected readonly showHeader = computed(() => this.auth.signedIn() && !this.#url().startsWith(CALLBACK_PATH));

  protected onBrandNavigate(event: CustomEvent<{ href: string }>): void {
    event.preventDefault();
    void this.#router.navigateByUrl(event.detail.href);
  }

  protected onAccountSelect(event: CustomEvent<HeaderNavAccountSelect>): void {
    if (event.detail.id === THEME) this.#theme.set(event.detail.checked ? 'dark' : 'light');
    else if (event.detail.id === SIGN_OUT) void this.auth.signOut();
  }
}
