import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, resource, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { DataTable } from '@adamstavely/trenchcoat/angular/data-table';
import { SharePanel } from '@adamstavely/trenchcoat/angular/share-panel';
import { Skeleton } from '@adamstavely/trenchcoat/angular/shimmer-loader';
import type { DataColumn, DataRow } from '@adamstavely/trenchcoat/data-table';
import type { ShareSubmit } from '@adamstavely/trenchcoat/share-panel';
import { Api } from '../../api/generated/api';
import { membersControllerChangeInvite } from '../../api/generated/fn/members/members-controller-change-invite';
import { membersControllerChangeRole } from '../../api/generated/fn/members/members-controller-change-role';
import { membersControllerInvite } from '../../api/generated/fn/members/members-controller-invite';
import { membersControllerList } from '../../api/generated/fn/members/members-controller-list';
import { membersControllerRemove } from '../../api/generated/fn/members/members-controller-remove';
import { membersControllerRevokeInvite } from '../../api/generated/fn/members/members-controller-revoke-invite';
import { Session } from '../../core/session';
import { ROLE_LABELS, ROLE_LEVELS } from '../../core/roles';
import { accessOf, changesOf, searchFor, type Change } from './members';

const COLUMNS: DataColumn[] = [
  { key: 'name', label: 'Name', type: 'title' },
  { key: 'email', label: 'Email', type: 'text' },
  { key: 'role', label: 'Role', type: 'tag' },
];

/** Who's in the workspace. Owners invite people by email, change roles and remove people; anyone can leave. */
@Component({
  selector: 'app-members-page',
  imports: [SharePanel, DataTable, Button, Skeleton],
  templateUrl: './members-page.html',
  styleUrl: './members-page.css',
})
export class MembersPage {
  readonly #api = inject(Api);
  readonly #router = inject(Router);
  protected readonly session = inject(Session);

  protected readonly list = resource({
    params: () => this.session.org()?.id,
    loader: ({ params: orgId }) => this.#api.invoke(membersControllerList, { orgId }),
  });

  protected readonly isOwner = computed(() => this.session.org()?.role === 'owner');
  protected readonly meId = computed(() => (this.session.me.hasValue() ? this.session.me.value().id : undefined));

  protected readonly levels = ROLE_LEVELS;
  protected readonly access = computed(() => (this.list.hasValue() ? accessOf(this.list.value(), this.meId()) : []));
  protected readonly search = (query: string) => (this.list.hasValue() ? searchFor(query, this.list.value()) : []);
  /** Anyone can be invited; the API turns away someone already in the workspace. */
  protected readonly entitled = () => ({ status: 'allowed' as const });

  protected readonly columns = COLUMNS;
  protected readonly rows = computed<DataRow[]>(() => {
    if (!this.list.hasValue()) return [];
    const { members, invites } = this.list.value();
    return [
      ...members.map((m) => ({ id: m.userId, name: m.name, email: m.email ?? '', role: ROLE_LABELS[m.role] })),
      ...invites.map((i) => ({ id: i.id, name: i.email, email: 'Invited', role: ROLE_LABELS[i.role] })),
    ];
  });

  protected readonly sending = signal(false);
  protected readonly problem = signal<string | null>(null);
  protected readonly leaving = signal(false);

  /**
   * Applies the panel's changes one by one, then shows what the server now says, whatever got through. The panel is
   * left to accept the share (no preventDefault), so its draft rows clear; the reload then puts the server's list in.
   */
  protected async onShare(e: CustomEvent<ShareSubmit>): Promise<void> {
    const orgId = this.session.org()?.id;
    if (!orgId) return;
    this.sending.set(true);
    this.problem.set(null);
    const failures: string[] = [];
    for (const change of changesOf(e.detail)) {
      try {
        await this.#apply(orgId, change);
      } catch (err) {
        failures.push(messageOf(err));
      }
    }
    this.list.reload();
    this.sending.set(false);
    if (failures.length) this.problem.set(failures.join(' '));
  }

  protected async leave(): Promise<void> {
    const orgId = this.session.org()?.id;
    const me = this.meId();
    if (!orgId || !me) return;
    this.leaving.set(true);
    this.problem.set(null);
    try {
      await this.#api.invoke(membersControllerRemove, { orgId, userId: me });
      this.session.refresh();
      await this.#router.navigateByUrl('/');
    } catch (err) {
      this.problem.set(messageOf(err));
    } finally {
      this.leaving.set(false);
    }
  }

  #apply(orgId: string, change: Change): Promise<unknown> {
    switch (change.op) {
      case 'invite':
        return this.#api.invoke(membersControllerInvite, { orgId, body: { email: change.email, role: change.role } });
      case 'changeInvite':
        return this.#api.invoke(membersControllerChangeInvite, { orgId, inviteId: change.inviteId, body: { role: change.role } });
      case 'revokeInvite':
        return this.#api.invoke(membersControllerRevokeInvite, { orgId, inviteId: change.inviteId });
      case 'changeRole':
        return this.#api.invoke(membersControllerChangeRole, { orgId, userId: change.userId, body: { role: change.role } });
      case 'remove':
        return this.#api.invoke(membersControllerRemove, { orgId, userId: change.userId });
    }
  }
}

/** The API's own words for a refusal (it says why: last owner, already a member), or a general line. */
function messageOf(err: unknown): string {
  const message = err instanceof HttpErrorResponse ? (err.error as { message?: unknown } | null)?.message : undefined;
  return typeof message === 'string' ? message : "Something didn't save. Try again.";
}
