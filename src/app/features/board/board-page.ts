import { Component, computed, effect, HostListener, inject, input, resource, signal, untracked, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { html } from 'lit';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { Dialog } from '@adamstavely/trenchcoat/angular/dialog';
import { Skeleton } from '@adamstavely/trenchcoat/angular/shimmer-loader';
import { StackSpread } from '@adamstavely/trenchcoat/angular/stack-spread';
import { Api } from '../../api/generated/api';
import { boardsControllerGet } from '../../api/generated/fn/boards/boards-controller-get';
import { boardsControllerRemove } from '../../api/generated/fn/boards/boards-controller-remove';
import { boardsControllerRename } from '../../api/generated/fn/boards/boards-controller-rename';
import { Auth } from '../../core/auth';
import { Session } from '../../core/session';
import { BoardConnection, type ConnectionStatus } from './board-connection';
import { BoardDoc } from './board-doc';
import { Assistant } from './assistant';
import { Canvas } from './canvas';
import { BoardShare } from './board-share';
import { BoardComments } from './board-comments';
import { openCounts } from './comments';
import { commentsControllerList } from '../../api/generated/fn/comments/comments-controller-list';
import { atLeast, type Role } from '../../core/roles';
import { colorFor, type PresenceUser } from './presence';

const STATUS_TEXT: Record<ConnectionStatus, string> = {
  connecting: 'Connecting…',
  saving: 'Saving…',
  saved: 'Saved',
  offline: 'Offline – your changes will sync when you reconnect',
  denied: '',
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

/** One board: its title, who else is on it, how syncing is going, and the canvas. */
@Component({
  selector: 'app-board-page',
  imports: [Canvas, Assistant, BoardShare, BoardComments, Button, Dialog, Skeleton, StackSpread],
  templateUrl: './board-page.html',
  styleUrl: './board-page.css',
})
export class BoardPage {
  readonly #api = inject(Api);
  readonly #router = inject(Router);
  readonly #auth = inject(Auth);
  readonly #session = inject(Session);

  /** From the route. */
  readonly id = input.required<string>();

  protected readonly meta = resource({
    params: () => this.id(),
    loader: ({ params: id }) => this.#api.invoke(boardsControllerGet, { id }),
  });

  protected readonly board = signal<BoardDoc | undefined>(undefined);
  protected readonly connection = signal<BoardConnection | undefined>(undefined);

  protected readonly status = computed<ConnectionStatus>(() => this.connection()?.status() ?? 'connecting');
  protected readonly statusText = computed(() => STATUS_TEXT[this.status()]);

  readonly #me = signal<PresenceUser | undefined>(undefined);

  /** Everyone on the board, you first, once each however many tabs they have open. */
  protected readonly people = computed(() => {
    const me = this.#me();
    const seen = new Map<string, { id: string; name: string; initials: string; color: string; me: boolean }>();
    if (me) seen.set(me.id, { ...me, name: `${me.name} (you)`, initials: initials(me.name), me: true });
    for (const { user } of this.connection()?.presence.peers() ?? []) {
      if (!seen.has(user.id)) seen.set(user.id, { ...user, initials: initials(user.name), me: false });
    }
    return [...seen.values()];
  });



  /** Your role on this board, once it's known. */
  protected readonly role = computed<Role | undefined>(() => (this.meta.hasValue() ? this.meta.value().role : undefined));
  protected readonly canEdit = computed(() => atLeast(this.role(), 'updater'));
  protected readonly isOwner = computed(() => this.role() === 'owner');
  protected readonly readOnlyLabel = computed(() => (this.role() === 'commenter' ? 'You can comment' : 'View only'));
  protected readonly meId = computed(() => this.#me()?.id);

  protected readonly assistantOpen = signal(false);
  /** The panel docked at the upper right, if any: they take turns. */
  protected readonly panel = signal<'share' | 'comments' | null>(null);
  protected readonly canComment = computed(() => atLeast(this.role(), 'commenter'));

  /** The board's comment threads, fetched again whenever someone changes them. */
  protected readonly comments = resource({
    params: () => ({ id: this.id(), changed: this.connection()?.commentsChanged() ?? 0 }),
    loader: ({ params }) => this.#api.invoke(commentsControllerList, { id: params.id }),
  });
  protected readonly threads = computed(() => (this.comments.hasValue() ? this.comments.value() : []));
  protected readonly commentCounts = computed(() => openCounts(this.threads()));
  protected readonly openThreads = computed(() => this.threads().filter((t) => !t.resolvedAt).length);
  protected readonly meUser = computed(() => {
    const me = this.#me();
    return me ? { id: me.id, name: me.name } : undefined;
  });

  protected togglePanel(which: 'share' | 'comments'): void {
    this.panel.update((open) => (open === which ? null : which));
  }

  /** From the comments panel: go to a note or frame, or (no id) back to the list. */
  protected showNode(id: string): void {
    if (id) this.canvas()?.show([id]);
    else this.canvas()?.select([]);
  }
  protected readonly selection = signal<readonly string[]>([]);
  protected readonly selectedFrames = signal<readonly string[]>([]);
  protected readonly selectionIds = signal<readonly string[]>([]);
  protected readonly canvas = viewChild(Canvas);

  protected readonly title = signal('');
  protected readonly confirmDelete = signal(false);
  protected readonly deleting = signal(false);

  constructor() {
    effect(() => {
      if (this.meta.hasValue()) this.title.set(this.meta.value().title);
    });

    // The server reconnects someone whose role changed; ask again what they may do here once they're back in.
    effect(() => {
      if ((this.connection()?.signIns() ?? 0) > 1) untracked(() => this.meta.reload());
    });

    // A live document per board, joined once we know who's joining it; leaving the board lets it go.
    effect((onCleanup) => {
      const id = this.id();
      const me = this.#session.me.hasValue() ? this.#session.me.value() : undefined;
      if (!me) return;
      untracked(() => {
        const user: PresenceUser = { id: me.id, name: me.name, color: colorFor(me.id) };
        this.#me.set(user);
        const board = new BoardDoc();
        const connection = new BoardConnection(id, board, () => this.#auth.accessToken() ?? '', user);
        this.board.set(board);
        this.connection.set(connection);
        onCleanup(() => {
          this.board.set(undefined);
          this.connection.set(undefined);
          connection.destroy();
          board.destroy();
        });
      });
    });
  }

  /** Warn before closing the tab while changes are still on their way to the server. */
  @HostListener('window:beforeunload', ['$event'])
  protected onBeforeUnload(e: BeforeUnloadEvent): void {
    if (this.connection()?.pending()) e.preventDefault();
  }

  protected async rename(): Promise<void> {
    const title = this.title().trim();
    const current = this.meta.hasValue() ? this.meta.value().title : '';
    if (!title) {
      this.title.set(current);
      return;
    }
    if (title === current) return;
    const updated = await this.#api.invoke(boardsControllerRename, { id: this.id(), body: { title } });
    this.meta.set(updated);
  }

  protected onTitleKey(e: KeyboardEvent): void {
    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
    if (e.key === 'Escape') {
      this.title.set(this.meta.hasValue() ? this.meta.value().title : '');
      (e.target as HTMLInputElement).blur();
    }
  }

  protected back(): void {
    void this.#router.navigateByUrl('/');
  }

  protected readonly deleteActions = computed(
    () =>
      html`<tc-button
        label="Delete board"
        variant="destructive"
        ?loading=${this.deleting()}
        @click=${() => void this.#delete()}
      ></tc-button>`,
  );

  async #delete(): Promise<void> {
    this.deleting.set(true);
    try {
      await this.#api.invoke(boardsControllerRemove, { id: this.id() });
      this.confirmDelete.set(false);
      await this.#router.navigateByUrl('/');
    } finally {
      this.deleting.set(false);
    }
  }
}
