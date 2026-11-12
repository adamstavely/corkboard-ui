import { computed, Injectable, signal } from '@angular/core';
import { User, UserManager, WebStorageStateStore } from 'oidc-client-ts';
import type { RuntimeConfig } from './config';

export const CALLBACK_PATH = '/auth/callback';

interface SignInState {
  returnUrl: string;
}

/**
 * Sign-in through the identity provider: authorization code with PKCE, the session kept in sessionStorage and
 * renewed with the refresh token before it expires.
 */
@Injectable({ providedIn: 'root' })
export class Auth {
  #manager: UserManager | undefined;
  readonly #user = signal<User | null>(null);

  readonly signedIn = computed(() => {
    const user = this.#user();
    return !!user && !user.expired;
  });

  /** Name and email for the account card. */
  readonly profile = computed(() => {
    const p = this.#user()?.profile;
    return { name: p?.name ?? p?.preferred_username ?? '', email: p?.email ?? '' };
  });

  async init(config: RuntimeConfig['oidc']): Promise<void> {
    const manager = new UserManager({
      authority: config.authority,
      client_id: config.clientId,
      redirect_uri: `${location.origin}${CALLBACK_PATH}`,
      post_logout_redirect_uri: location.origin,
      response_type: 'code',
      scope: 'openid profile email',
      automaticSilentRenew: true,
      userStore: new WebStorageStateStore({ store: sessionStorage }),
    });
    manager.events.addUserLoaded((user) => this.#user.set(user));
    manager.events.addUserUnloaded(() => this.#user.set(null));
    manager.events.addAccessTokenExpired(() => this.#user.set(null));
    this.#manager = manager;
    this.#user.set(await manager.getUser());
  }

  /** The access token for API calls, while it's still valid. */
  accessToken(): string | undefined {
    const user = this.#user();
    return user && !user.expired ? user.access_token : undefined;
  }

  /** Off to the identity provider; back at `returnUrl` once signed in. */
  async signIn(returnUrl: string): Promise<void> {
    await this.#require().signinRedirect({ state: { returnUrl } satisfies SignInState });
  }

  /** Finishes a sign-in on the callback page and says where to go next. */
  async completeSignIn(): Promise<string> {
    const user = await this.#require().signinRedirectCallback();
    const returnUrl = (user.state as SignInState | undefined)?.returnUrl;
    // Only ever back into this app.
    return returnUrl?.startsWith('/') && !returnUrl.startsWith('//') ? returnUrl : '/';
  }

  async signOut(): Promise<void> {
    await this.#require().signoutRedirect();
  }

  #require(): UserManager {
    if (!this.#manager) throw new Error('Auth.init has not run');
    return this.#manager;
  }
}
