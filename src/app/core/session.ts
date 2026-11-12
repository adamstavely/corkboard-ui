import { computed, inject, Injectable, resource, signal } from '@angular/core';
import { Api } from '../api/generated/api';
import { meControllerMe } from '../api/generated/fn/me/me-controller-me';
import { membersControllerAccept } from '../api/generated/fn/members/members-controller-accept';
import { membersControllerDecline } from '../api/generated/fn/members/members-controller-decline';
import { membersControllerMine } from '../api/generated/fn/members/members-controller-mine';
import type { OrgDto } from '../api/generated/models/org-dto';
import { Auth } from './auth';

const ORG_KEY = 'corkboard.org';

function storedOrg(): string | null {
  try {
    return localStorage.getItem(ORG_KEY);
  } catch {
    return null;
  }
}

/** The signed-in person as the API knows them, the workspace they're working in, and invites waiting for them. */
@Injectable({ providedIn: 'root' })
export class Session {
  readonly #api = inject(Api);
  readonly #auth = inject(Auth);

  readonly me = resource({
    params: () => (this.#auth.signedIn() ? true : undefined),
    loader: () => this.#api.invoke(meControllerMe),
  });

  /** Invites to other workspaces, matched on their verified email. */
  readonly invites = resource({
    params: () => (this.#auth.signedIn() ? true : undefined),
    loader: () => this.#api.invoke(membersControllerMine),
  });

  readonly orgs = computed(() => (this.me.hasValue() ? this.me.value().orgs : []));

  readonly #chosen = signal<string | null>(storedOrg());

  /** The workspace they picked last in this browser, or their first (the one made for them at sign-up). */
  readonly org = computed<OrgDto | undefined>(() => {
    const orgs = this.orgs();
    return orgs.find((o) => o.id === this.#chosen()) ?? orgs[0];
  });

  selectOrg(id: string): void {
    this.#chosen.set(id);
    try {
      localStorage.setItem(ORG_KEY, id);
    } catch {
      // Blocked storage: the choice lasts for this page only.
    }
  }

  /** Joins a workspace they were invited to, and switches to it. */
  async accept(inviteId: string): Promise<void> {
    const org = await this.#api.invoke(membersControllerAccept, { inviteId });
    this.selectOrg(org.id);
    this.me.reload();
    this.invites.reload();
  }

  async decline(inviteId: string): Promise<void> {
    await this.#api.invoke(membersControllerDecline, { inviteId });
    this.invites.reload();
  }

  /** After leaving or being removed from a workspace. */
  refresh(): void {
    this.me.reload();
  }
}
