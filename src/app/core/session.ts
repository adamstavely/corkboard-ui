import { computed, inject, Injectable, resource } from '@angular/core';
import { Api } from '../api/generated/api';
import { meControllerMe } from '../api/generated/fn/me/me-controller-me';
import { Auth } from './auth';

/** The signed-in person as the API knows them, and the workspace they're working in. */
@Injectable({ providedIn: 'root' })
export class Session {
  readonly #api = inject(Api);
  readonly #auth = inject(Auth);

  readonly me = resource({
    params: () => (this.#auth.signedIn() ? true : undefined),
    loader: () => this.#api.invoke(meControllerMe),
  });

  /** Their first workspace, the one made for them at sign-up, until workspaces can be switched. */
  readonly org = computed(() => (this.me.hasValue() ? this.me.value().orgs[0] : undefined));
}
