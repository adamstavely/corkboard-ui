import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { HeaderBrand } from '@adamstavely/trenchcoat/angular/header-brand';
import { Toaster } from '@adamstavely/trenchcoat/angular/toaster';
import { LookProvider } from '@adamstavely/trenchcoat/angular/look-provider';
import { Auth } from './core/auth';
import { Session } from './core/session';
import { BoardSearch } from './features/search/board-search';
import { AccountNav } from './shell/account-nav';

/** A board fills the window, with its own floating panels in place of the top bar. */
const onBoard = (url: string) => /^\/boards\/[^/?#]+/.test(url);

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, LookProvider, HeaderBrand, AccountNav, Toaster, BoardSearch],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly auth = inject(Auth);
  protected readonly session = inject(Session);
  readonly #router = inject(Router);

  readonly #onBoard = toSignal(
    this.#router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => onBoard(e.urlAfterRedirects)),
    ),
    { initialValue: onBoard(this.#router.url) },
  );

  /** The picker shows before anyone is someone, so it gets no header; nor does a board. */
  protected readonly showHeader = computed(() => this.auth.signedIn() && !this.#onBoard());

  protected onBrandNavigate(event: CustomEvent<{ href: string }>): void {
    event.preventDefault();
    void this.#router.navigateByUrl(event.detail.href);
  }
}
