import { savedTemplatesControllerList } from '../../api/generated/fn/boards/saved-templates-controller-list';
import { savedTemplatesControllerRemove } from '../../api/generated/fn/boards/saved-templates-controller-remove';
import type { SavedTemplateDto } from '../../api/generated/models/saved-template-dto';
import { html } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { Component, computed, effect, type ElementRef, inject, resource, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
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
import { Icon, iconMarkup, type IconName } from '../../shared/icon';
import { templateCards } from '../board/template-cards';

const INTRO_HIDDEN = 'cb-intro-hidden';
function readIntroOpen(): boolean {
  try {
    return localStorage.getItem(INTRO_HIDDEN) !== '1';
  } catch {
    return true;
  }
}

/** The workspace's boards, most recently changed first, and the way to start a new one. */
/** Focuses a field once the dialog that opened it has closed and handed focus back to its button. */
function focusSoon(el: HTMLElement | undefined): void {
  if (el) setTimeout(() => el.focus(), 60);
}

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
  protected readonly folderOptions = computed(() => [{ value: '', label: 'No project' }, ...this.folderList().map((f) => ({ value: f.id, label: f.name }))]);
  protected readonly filter = signal<BoardFilter>({ kind: 'all' });
  protected readonly currentFolder = computed(() => {
    const f = this.filter();
    return f.kind === 'folder' ? this.folderList().find((x) => x.id === f.id) : undefined;
  });
  /** A workspace's name being typed: a new workspace ('new') or renaming this one ('this'). */
  protected readonly orgNaming = signal<{ id: 'new' | 'this'; name: string } | null>(null);
  protected readonly savingOrg = signal(false);
  private readonly orgName = viewChild<ElementRef<HTMLInputElement>>('orgName');
  /** Typing starts in the name field as soon as it opens. */
  readonly #focusOrgName = effect(() => focusSoon(this.orgName()?.nativeElement));

  protected async saveOrg(): Promise<void> {
    const naming = this.orgNaming();
    const name = naming?.name.trim();
    if (!naming || !name || this.savingOrg()) return;
    this.savingOrg.set(true);
    try {
      if (naming.id === 'new') {
        await this.session.createOrg(name);
        this.filter.set({ kind: 'all' });
        toast.success(`${name} is ready: invite people to it from Members.`);
      } else {
        const orgId = this.session.org()?.id;
        if (orgId) await this.session.renameOrg(orgId, name);
      }
      this.orgNaming.set(null);
    } catch {
      toast.error(naming.id === 'new' ? "The workspace couldn't be made. Try again." : "The workspace couldn't be renamed. Try again.");
    } finally {
      this.savingOrg.set(false);
    }
  }

  /** A project's name being typed: a new project ('new') or a rename. (Projects are the API's folders.) */
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
      toast.error("The project couldn't be saved. Try again.");
    }
  }

  protected async deleteFolder(id: string, name: string): Promise<void> {
    const orgId = this.session.org()?.id;
    if (!orgId) return;
    await this.#api.invoke(organiseControllerRemoveFolder, { orgId, folderId: id });
    this.filter.set({ kind: 'all' });
    this.folders.reload();
    this.boards.reload();
    toast.success(`Deleted “${name}”`, { description: 'Its boards are still here, in no project.' });
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
  /** The Create new chooser: a board, a project or a workspace. */
  protected readonly choosing = signal(false);
  private readonly folderName = viewChild<ElementRef<HTMLInputElement>>('folderName');
  /** Typing a project's name starts in its field. */
  readonly #focusFolderName = effect(() => focusSoon(this.folderName()?.nativeElement));

  /** The chooser's options: a board and a project for those who can make them, a workspace for anyone. */
  protected readonly createChoices = computed(() => {
    const canCreate = this.canCreate() && !!this.session.org();
    const choices: { id: 'project' | 'board' | 'workspace'; icon: IconName; label: string; hint: string }[] = [
      ...(canCreate ? [{ id: 'project' as const, icon: 'project' as const, label: 'Project', hint: 'Keep boards together' }] : []),
      ...(canCreate ? [{ id: 'board' as const, icon: 'board' as const, label: 'Board', hint: 'Blank or from a template' }] : []),
      { id: 'workspace' as const, icon: 'workspace' as const, label: 'Workspace', hint: 'For another team' },
    ];
    return html`<div class="cb-create-choices">
      ${choices.map(
        (c) => html`<button type="button" class="cb-create-choice" @click=${() => this.chooseNew(c.id)}>
          <span class="cb-create-icon">${unsafeSVG(iconMarkup(c.icon, 36))}</span>
          <span class="cb-create-label">${c.label}</span>
          <span class="cb-create-hint">${c.hint}</span>
        </button>`,
      )}
    </div>`;
  });

  /** Starts making what was chosen: the template picker for a board, a name to type for a project or a workspace. */
  protected chooseNew(what: 'project' | 'board' | 'workspace'): void {
    this.choosing.set(false);
    if (what === 'board') this.picking.set(true);
    else if (what === 'project') this.naming.set({ id: 'new', name: '' });
    else this.orgNaming.set({ id: 'new', name: '' });
  }

  /** The intro above the boards: open until this person hides it, remembered in this browser only. */
  protected readonly introOpen = signal(readIntroOpen());
  protected setIntro(open: boolean): void {
    this.introOpen.set(open);
    try {
      if (open) localStorage.removeItem(INTRO_HIDDEN);
      else localStorage.setItem(INTRO_HIDDEN, '1');
    } catch {
      // Storage can be off (a private window); the intro then just shows again next time.
    }
  }

  protected readonly templates = resource({ loader: () => this.#api.invoke(boardsControllerTemplates) });

  /** The new-board picker: a blank board, or one laid out from a template, grouped by kind. */
  /** The templates people in this workspace saved from their boards. */
  protected readonly savedTemplates = resource({
    params: () => this.session.org()?.id,
    loader: ({ params: orgId }) => this.#api.invoke(savedTemplatesControllerList, { orgId }),
  });

  protected readonly templateCards = computed(() =>
    templateCards(this.templates.hasValue() ? this.templates.value() : [], (t) => void this.create(t?.id as CreateBoardDto['template'], t?.name), true, {
      templates: this.savedTemplates.hasValue() ? this.savedTemplates.value() : [],
      remove: (t) => void this.removeTemplate(t),
    }),
  );

  /** Deletes a template the workspace saved; boards made from it keep what they have. */
  protected async removeTemplate(t: SavedTemplateDto): Promise<void> {
    const orgId = this.session.org()?.id;
    if (!orgId) return;
    try {
      await this.#api.invoke(savedTemplatesControllerRemove, { orgId, templateId: t.id });
      this.savedTemplates.reload();
      toast.success(`Deleted the template “${t.name}”`);
    } catch {
      toast.error(`“${t.name}” wasn't deleted. Try again.`);
    }
  }

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
