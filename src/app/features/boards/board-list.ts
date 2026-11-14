import { Component, computed, inject, resource, signal } from '@angular/core';
import { Router } from '@angular/router';
import { html } from 'lit';
import '@adamstavely/trenchcoat/preview-card';
import { Dialog } from '@adamstavely/trenchcoat/angular/dialog';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { CollectionCard } from '@adamstavely/trenchcoat/angular/collection-card';
import { FirstUse } from '@adamstavely/trenchcoat/angular/first-use';
import { Select } from '@adamstavely/trenchcoat/angular/select';
import { Skeleton } from '@adamstavely/trenchcoat/angular/shimmer-loader';
import { Api } from '../../api/generated/api';
import { boardsControllerCreate } from '../../api/generated/fn/boards/boards-controller-create';
import { boardsControllerList } from '../../api/generated/fn/boards/boards-controller-list';
import { boardsControllerTemplates } from '../../api/generated/fn/boards/boards-controller-templates';
import type { CreateBoardDto } from '../../api/generated/models/create-board-dto';
import { aRole, atLeast, ROLE_LABELS } from '../../core/roles';
import { toast } from '@adamstavely/trenchcoat/toaster';
import { organiseControllerCreateFolder } from '../../api/generated/fn/organise/organise-controller-create-folder';
import { organiseControllerFolders } from '../../api/generated/fn/organise/organise-controller-folders';
import { organiseControllerMove } from '../../api/generated/fn/organise/organise-controller-move';
import { organiseControllerRemoveFolder } from '../../api/generated/fn/organise/organise-controller-remove-folder';
import { organiseControllerRenameFolder } from '../../api/generated/fn/organise/organise-controller-rename-folder';
import { organiseControllerStar } from '../../api/generated/fn/organise/organise-controller-star';
import { organiseControllerUnstar } from '../../api/generated/fn/organise/organise-controller-unstar';
import { filterBoards, type BoardFilter } from './organise';
import { Session } from '../../core/session';
import { edited } from './edited';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { Icon, iconMarkup } from '../../shared/icon';

/** The workspace's boards, most recently changed first, and the way to start a new one. */
@Component({
  selector: 'app-board-list',
  imports: [Button, CollectionCard, Dialog, FirstUse, Select, Skeleton, Icon],
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

  protected readonly folders = resource({
    params: () => this.session.org()?.id,
    loader: ({ params: orgId }) => this.#api.invoke(organiseControllerFolders, { orgId }),
  });
  protected readonly folderList = computed(() => (this.folders.hasValue() ? this.folders.value() : []));
  protected readonly folderOptions = computed(() => [{ value: '', label: 'No folder' }, ...this.folderList().map((f) => ({ value: f.id, label: f.name }))]);
  protected readonly filter = signal<BoardFilter>({ kind: 'all' });
  protected readonly currentFolder = computed(() => {
    const f = this.filter();
    return f.kind === 'folder' ? this.folderList().find((x) => x.id === f.id) : undefined;
  });
  /** A folder's name being typed: a new folder ('new') or a rename. */
  protected readonly naming = signal<{ id: string | 'new'; name: string } | null>(null);

  protected isFilter(kind: BoardFilter['kind'], id?: string): boolean {
    const f = this.filter();
    return f.kind === kind && (f.kind !== 'folder' || f.id === id);
  }

  protected async saveFolder(): Promise<void> {
    const naming = this.naming();
    const orgId = this.session.org()?.id;
    const name = naming?.name.trim();
    if (!naming || !orgId || !name) return;
    try {
      if (naming.id === 'new') {
        const folder = await this.#api.invoke(organiseControllerCreateFolder, { orgId, body: { name } });
        this.filter.set({ kind: 'folder', id: folder.id });
      } else {
        await this.#api.invoke(organiseControllerRenameFolder, { orgId, folderId: naming.id, body: { name } });
      }
      this.naming.set(null);
      this.folders.reload();
    } catch {
      toast.error("The folder couldn't be saved. Try again.");
    }
  }

  protected async deleteFolder(id: string, name: string): Promise<void> {
    const orgId = this.session.org()?.id;
    if (!orgId) return;
    await this.#api.invoke(organiseControllerRemoveFolder, { orgId, folderId: id });
    this.filter.set({ kind: 'all' });
    this.folders.reload();
    this.boards.reload();
    toast.success(`Deleted “${name}”`, { description: 'Its boards are still here, in no folder.' });
  }

  protected async toggleStar(id: string, starred: boolean): Promise<void> {
    await this.#api.invoke(starred ? organiseControllerUnstar : organiseControllerStar, { id });
    this.boards.reload();
  }

  protected async moveTo(id: string, folderId: string): Promise<void> {
    await this.#api.invoke(organiseControllerMove, { id, body: { folderId: folderId || null } });
    this.boards.reload();
  }

  protected readonly cards = computed(() =>
    filterBoards(this.boards.hasValue() ? this.boards.value() : [], this.filter()).map((b) => ({
      ...b,
      href: `/boards/${b.id}`,
      canFile: atLeast(b.role, 'updater'),
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
  protected readonly picking = signal(false);

  protected readonly templates = resource({ loader: () => this.#api.invoke(boardsControllerTemplates) });

  /** The new-board picker: a blank board, or one laid out for a retro, a plan or a brainstorm. */
  protected readonly templateCards = computed(() => {
    const templates = this.templates.hasValue() ? this.templates.value() : [];
    const card = (name: string, description: string, columns: readonly string[], template?: CreateBoardDto['template']) =>
      html`<tc-preview-card heading=${name} description=${description} @tc-open=${() => void this.create(template, template ? name : undefined)}>
        <div class="cb-template-preview" aria-hidden="true">
          ${columns.length ? columns.map((c) => html`<span class="cb-template-column"><b>${c}</b><i></i><i></i></span>`) : html`<span class="cb-template-blank">${unsafeSVG(iconMarkup('plus', 28))}</span>`}
        </div>
      </tc-preview-card>`;
    return html`<div class="cb-templates">
      ${card('Blank board', 'An empty board to arrange however you like.', [])}
      ${templates.map((t) => card(t.name, t.description, t.columns, t.id as CreateBoardDto['template']))}
    </div>`;
  });

  /** New boards open straight away, named after their template (or "Untitled board"); they're renamed on the board. */
  protected async create(template?: CreateBoardDto['template'], name?: string): Promise<void> {
    const orgId = this.session.org()?.id;
    if (!orgId || this.creating()) return;
    this.creating.set(true);
    try {
      const board = await this.#api.invoke(boardsControllerCreate, { orgId, body: { title: name ?? 'Untitled board', ...(template ? { template } : {}) } });
      this.picking.set(false);
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
