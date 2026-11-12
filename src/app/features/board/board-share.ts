import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, input, output, resource, signal } from '@angular/core';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { DataTable } from '@adamstavely/trenchcoat/angular/data-table';
import { SharePanel } from '@adamstavely/trenchcoat/angular/share-panel';
import type { DataColumn, DataRow } from '@adamstavely/trenchcoat/data-table';
import type { ShareRecipient, ShareSubmit } from '@adamstavely/trenchcoat/share-panel';
import { Api } from '../../api/generated/api';
import { boardsControllerMembers } from '../../api/generated/fn/boards/boards-controller-members';
import { boardsControllerSetRole } from '../../api/generated/fn/boards/boards-controller-set-role';
import { ROLE_LABELS, ROLE_LEVELS } from '../../core/roles';
import { boardAccessOf, boardChangesOf, boardDirectoryOf, boardEntitlement } from './board-access';

const COLUMNS: DataColumn[] = [
  { key: 'name', label: 'Name', type: 'title' },
  { key: 'role', label: 'Role', type: 'tag' },
];

/**
 * Who can open this board and what each may do. Board owners change it with Trench Coat's share panel: a role here
 * replaces someone's workspace role on this board, and removing someone keeps them out. Others see the list.
 */
@Component({
  selector: 'app-board-share',
  imports: [SharePanel, DataTable, Button],
  templateUrl: './board-share.html',
  styleUrl: './board-share.css',
})
export class BoardShare {
  readonly #api = inject(Api);

  readonly boardId = input.required<string>();
  readonly boardName = input('');
  readonly canManage = input(false);
  readonly meId = input<string | undefined>(undefined);
  readonly closed = output<void>();

  protected readonly list = resource({
    params: () => this.boardId(),
    loader: ({ params: id }) => this.#api.invoke(boardsControllerMembers, { id }),
  });
  readonly #members = computed(() => (this.list.hasValue() ? this.list.value() : []));

  protected readonly levels = ROLE_LEVELS;
  protected readonly access = computed(() => boardAccessOf(this.#members(), this.meId()));
  protected readonly directory = computed(() => boardDirectoryOf(this.#members()));
  protected readonly entitled = (recipient: ShareRecipient, level: string) => boardEntitlement(this.#members(), recipient, level);

  protected readonly columns = COLUMNS;
  protected readonly rows = computed<DataRow[]>(() =>
    this.#members()
      .filter((m) => m.role !== null)
      .map((m) => ({ id: m.userId, name: m.userId === this.meId() ? `${m.name} (you)` : m.name, role: ROLE_LABELS[m.role!] })),
  );

  protected readonly sending = signal(false);
  protected readonly problem = signal<string | null>(null);

  protected async onShare(e: CustomEvent<ShareSubmit>): Promise<void> {
    this.sending.set(true);
    this.problem.set(null);
    const failures: string[] = [];
    for (const { userId, role } of boardChangesOf(this.#members(), e.detail)) {
      try {
        await this.#api.invoke(boardsControllerSetRole, { id: this.boardId(), userId, body: { role } });
      } catch (err) {
        const message = err instanceof HttpErrorResponse ? (err.error as { message?: unknown } | null)?.message : undefined;
        failures.push(typeof message === 'string' ? message : "Something didn't save. Try again.");
      }
    }
    this.list.reload();
    this.sending.set(false);
    if (failures.length) this.problem.set(failures.join(' '));
  }
}
