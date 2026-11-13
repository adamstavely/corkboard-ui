import { Component, computed, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { HeaderBrand } from '@adamstavely/trenchcoat/angular/header-brand';
import { HeaderNav } from '@adamstavely/trenchcoat/angular/header-nav';
import { LookProvider } from '@adamstavely/trenchcoat/angular/look-provider';
import type { HeaderNavAccountSelect } from '@adamstavely/trenchcoat/header-nav';
import { profileMenuIcon, type ProfileMenuItem } from '@adamstavely/trenchcoat/profile-menu';
import { Auth } from './core/auth';
import { Session } from './core/session';
import { BoardSearch } from './features/search/board-search';
import { ThemeService } from './core/theme';

const THEME = 'theme';
const SWITCH = 'switch-person';

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

  /** Light and dark as a switch (the card stays open while it's flipped), then Switch person. */
  protected readonly accountItems = computed<ProfileMenuItem[]>(() => [
    { id: THEME, label: 'Dark mode', icon: profileMenuIcon('moon'), checked: this.#theme.theme() === 'dark' },
    { id: SWITCH, label: 'Switch person' },
  ]);

  /** The picker shows before anyone is someone, so it gets no header. */
  protected readonly showHeader = this.auth.signedIn;

  protected onBrandNavigate(event: CustomEvent<{ href: string }>): void {
    event.preventDefault();
    void this.#router.navigateByUrl(event.detail.href);
  }

  protected onAccountSelect(event: CustomEvent<HeaderNavAccountSelect>): void {
    if (event.detail.id === THEME) this.#theme.set(event.detail.checked ? 'dark' : 'light');
    else if (event.detail.id === SWITCH) {
      this.auth.signOut();
      void this.#router.navigateByUrl('/who');
    }
  }
}
