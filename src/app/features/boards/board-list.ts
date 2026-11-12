import { Component, computed, inject, resource, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { CollectionCard } from '@adamstavely/trenchcoat/angular/collection-card';
import { FirstUse } from '@adamstavely/trenchcoat/angular/first-use';
import { Select } from '@adamstavely/trenchcoat/angular/select';
import { Skeleton } from '@adamstavely/trenchcoat/angular/shimmer-loader';
import { Api } from '../../api/generated/api';
import { boardsControllerCreate } from '../../api/generated/fn/boards/boards-controller-create';
import { boardsControllerList } from '../../api/generated/fn/boards/boards-controller-list';
import { aRole, atLeast, ROLE_LABELS } from '../../core/roles';
import { Session } from '../../core/session';
import { edited } from './edited';

/** The workspace's boards, most recently changed first, and the way to start a new one. */
@Component({
  selector: 'app-board-list',
  imports: [Button, CollectionCard, FirstUse, Select, Skeleton],
  templateUrl: './board-list.html',
  styleUrl: './board-list.css',
})
export class BoardList {
  readonly #api = inject(Api);
  readonly #router = inject(Router);
  protected readonly session = inject(Session);

  protected readonly boards = resource({
    params: () => this.session.org()?.id,
    loader: ({ params: orgId }) => this.#api.invoke(boardsControllerList, { orgId }),
  });

  protected readonly cards = computed(() =>
    (this.boards.hasValue() ? this.boards.value() : []).map((b) => ({
      ...b,
      href: `/boards/${b.id}`,
      // What you can do there, unless it's the usual: changing it.
      meta: b.role === 'updater' ? edited(new Date(b.updatedAt)) : `${edited(new Date(b.updatedAt))} · ${ROLE_LABELS[b.role]}`,
    })),
  );

  /** Readers and commenters of the workspace can open boards but not make them. */
  protected readonly canCreate = computed(() => atLeast(this.session.org()?.role, 'updater'));
  protected readonly aRole = aRole;

  protected readonly orgOptions = computed(() => this.session.orgs().map((o) => ({ value: o.id, label: o.name })));
  protected readonly invites = computed(() => (this.session.invites.hasValue() ? this.session.invites.value() : []));
  /** The invite being answered, so its buttons show it. */
  protected readonly answering = signal<string | null>(null);

  protected async answer(inviteId: string, accept: boolean): Promise<void> {
    this.answering.set(inviteId);
    try {
      if (accept) await this.session.accept(inviteId);
      else await this.session.decline(inviteId);
    } finally {
      this.answering.set(null);
    }
  }

  protected readonly creating = signal(false);

  /** New boards start untitled and open straight away; they're renamed on the board itself. */
  protected async create(): Promise<void> {
    const orgId = this.session.org()?.id;
    if (!orgId || this.creating()) return;
    this.creating.set(true);
    try {
      const board = await this.#api.invoke(boardsControllerCreate, { orgId, body: { title: 'Untitled board' } });
      await this.#router.navigate(['/boards', board.id]);
    } finally {
      this.creating.set(false);
    }
  }

  protected go(url: string): void {
    void this.#router.navigateByUrl(url);
  }

  protected open(event: Event, href: string): void {
    event.preventDefault();
    void this.#router.navigateByUrl(href);
  }
}
