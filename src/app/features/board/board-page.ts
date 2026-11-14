import { Component, computed, effect, HostListener, inject, input, resource, signal, untracked, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { html } from 'lit';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { Dialog } from '@adamstavely/trenchcoat/angular/dialog';
import { Skeleton } from '@adamstavely/trenchcoat/angular/shimmer-loader';
import { StackSpread } from '@adamstavely/trenchcoat/angular/stack-spread';
import { MenuMorph } from '@adamstavely/trenchcoat/angular/menu-morph';
import { boardCanvas, boardMarkdown, download, fileName, loadImages } from './export';
import { Api } from '../../api/generated/api';
import { boardsControllerGet } from '../../api/generated/fn/boards/boards-controller-get';
import { boardsControllerRemove } from '../../api/generated/fn/boards/boards-controller-remove';
import { boardsControllerRename } from '../../api/generated/fn/boards/boards-controller-rename';
import { Auth } from '../../core/auth';
import { Session } from '../../core/session';
import { BoardConnection, type ConnectionStatus } from './board-connection';
import { BoardDoc } from './board-doc';
import { VersionPreview } from './version-preview';
import { WritingTray } from './writing-tray';
import type { BoardVersionDto } from '../../api/generated/models/board-version-dto';
import { BoardChat } from './board-chat';
import { BoardMatrix } from './board-matrix';
import { BoardTasks } from './board-tasks';
import { BoardGantt } from './board-gantt';
import { TaskFeed } from './tasks';
import { BoardSummary } from './board-summary';
import { SummaryFeed } from './summary';
import { BoardClusters, BoardHistory } from './board-insights';
import { LedgerFeed } from './ledger';
import { ReactionsFeed, reactionsFor } from './reactions';
import { FileCache, imageSize, openFile } from './file-cache';
import { BoardFiles, ImageAsk } from './board-files';
import { BoardActivity } from './board-activity';
import { AwaySummary } from '@adamstavely/trenchcoat/angular/away-summary';
import type { AwayItem } from '@adamstavely/trenchcoat/away-summary';
import { toast } from '@adamstavely/trenchcoat/toaster';
import { activityControllerList } from '../../api/generated/fn/activity/activity-controller-list';
import type { BoardFileDto } from '../../api/generated/models/board-file-dto';
import { FILE_CARD, type Media } from './board-doc';
import { reactionsControllerReact } from '../../api/generated/fn/reactions/reactions-controller-react';
import { BoardFacilitation } from './board-facilitation';
import { FacilitationFeed, noteVotes } from './facilitation';
import { facilitationControllerVote } from '../../api/generated/fn/facilitation/facilitation-controller-vote';
import type { PresentedView } from './presence';
import { ChatFeed } from './chat';
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
  imports: [Canvas, BoardChat, BoardFacilitation, BoardMatrix, BoardTasks, BoardGantt, BoardSummary, BoardHistory, BoardClusters, BoardFiles, ImageAsk, BoardActivity, VersionPreview, WritingTray, AwaySummary, BoardShare, BoardComments, Button, Dialog, Skeleton, StackSpread, MenuMorph],
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

  protected readonly chatOpen = signal(false);

  // ── Facilitation: dot voting, the shared timer, presenting ──
  protected readonly facilitation = signal<FacilitationFeed | undefined>(undefined);
  protected readonly facilitating = signal(false);
  protected readonly canRun = computed(() => atLeast(this.role(), 'updater'));
  protected readonly fstate = computed(() => this.facilitation()?.state());
  protected readonly noteVotes = computed(() => {
    const s = this.fstate();
    const me = this.#me()?.id;
    return s && me ? noteVotes(s.voting, s.votes, me) : new Map();
  });
  protected readonly votingNow = computed(() => !!this.fstate()?.voting.open && this.canComment());
  protected readonly votesLeft = computed(() => {
    const s = this.fstate();
    const me = this.#me()?.id;
    return s && me ? Math.max(0, s.voting.votesEach - (s.votes.get(me)?.length ?? 0)) : 0;
  });
  protected readonly presenting = signal(false);
  /** The person this person follows, by their connection; null when not following. */
  protected readonly followingId = signal<number | null>(null);
  /** Someone else presenting: the one followed, or the first. */
  protected readonly presenter = computed(() => {
    const presenters = (this.connection()?.presence.peers() ?? []).filter((p) => p.presenting);
    const p = presenters.find((x) => x.clientId === this.followingId()) ?? presenters[0];
    return p ? { clientId: p.clientId, name: p.user.name, view: p.presenting! } : null;
  });
  #lastView: PresentedView | null = null;

  protected async onVote(noteId: string, add: boolean): Promise<void> {
    try {
      await this.#api.invoke(facilitationControllerVote, { id: this.id(), body: { noteId, add } });
    } catch (err) {
      const message = (err as { error?: { message?: unknown } }).error?.message;
      toast.error(typeof message === 'string' ? message : "That vote didn't count. Try again.");
    }
  }

  protected onView(view: PresentedView): void {
    this.#lastView = view;
    if (this.presenting()) this.connection()?.presence.setPresenting(view);
  }

  protected togglePresenting(): void {
    const next = !this.presenting();
    this.presenting.set(next);
    this.followingId.set(null);
    this.connection()?.presence.setPresenting(next ? this.#lastView : null);
  }

  protected setFollowing(on: boolean): void {
    this.followingId.set(on ? (this.presenter()?.clientId ?? null) : null);
  }
  protected readonly chat = signal<ChatFeed | undefined>(undefined);
  /** Everyone else on the board, once each, and whether they're writing in the chat. */
  protected readonly others = computed(() => {
    const me = this.#me()?.id;
    const seen = new Map<string, { id: string; name: string; typing: boolean }>();
    for (const { user, typing } of this.connection()?.presence.peers() ?? []) {
      if (user.id === me) continue;
      const known = seen.get(user.id);
      seen.set(user.id, { id: user.id, name: user.name, typing: typing || !!known?.typing });
    }
    return [...seen.values()];
  });
  protected readonly answering = computed(() => (this.connection()?.answering().size ?? 0) > 0);
  protected readonly isWorkspaceOwner = computed(() => {
    const orgId = this.meta.hasValue() ? this.meta.value().orgId : undefined;
    return this.#session.orgs().find((o) => o.id === orgId)?.role === 'owner';
  });
  /** The panel docked at the upper right, if any: they take turns. */
  protected readonly panel = signal<'share' | 'comments' | 'matrix' | 'tasks' | 'gantt' | 'summary' | 'history' | 'clusters' | 'files' | 'ask-image' | 'activity' | null>(null);
  protected readonly files = signal<FileCache | undefined>(undefined);
  protected readonly emptyUrls: ReadonlyMap<string, string> = new Map();
  /** A saved version shown in place of the board, read-only, until they go back (or restore it). */
  protected readonly previewing = signal<BoardVersionDto | null>(null);
  /** Goes up when a version is restored from the preview, so the versions list reloads. */
  protected readonly versionsChanged = signal(0);
  /** The image being asked about. */
  protected readonly asking = signal<Media | null>(null);
  protected readonly ledger = signal<LedgerFeed | undefined>(undefined);
  protected readonly reactionsFeed = signal<ReactionsFeed | undefined>(undefined);
  protected readonly reactions = computed(() => {
    const me = this.#me()?.id;
    const all = this.reactionsFeed()?.all();
    return all && me ? reactionsFor(all, me) : new Map();
  });

  protected async onReact(nodeId: string, emoji: string, on: boolean): Promise<void> {
    try {
      await this.#api.invoke(reactionsControllerReact, { id: this.id(), body: { nodeId, emoji: emoji as never, on } });
    } catch {
      // The note keeps showing what the board has.
    }
  }
  protected readonly tasks = signal<TaskFeed | undefined>(undefined);
  protected readonly summaryFeed = signal<SummaryFeed | undefined>(undefined);
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

  /** Something to ask the model in the chat, from elsewhere on the page; `n` makes each request new. */
  protected readonly chatRequest = signal<{ text: string; n: number } | null>(null);

  protected askInChat(text: string): void {
    this.chatOpen.set(true);
    this.chatRequest.update((r) => ({ text, n: (r?.n ?? 0) + 1 }));
  }

  protected readonly viewsOpen = signal(false);
  protected readonly exportOpen = signal(false);
  protected readonly views = [
    { id: 'matrix', label: 'Prioritise', hint: 'Value against effort' },
    { id: 'tasks', label: 'Tasks', hint: 'Action items on a kanban' },
    { id: 'gantt', label: 'Timeline', hint: 'A plan as a Gantt chart' },
    { id: 'summary', label: 'Summary', hint: 'A shared AI summary' },
    { id: 'clusters', label: 'Clusters', hint: 'Notes linked by shared words' },
    { id: 'history', label: 'History', hint: 'What the model changed, to undo' },
    { id: 'activity', label: 'Activity', hint: 'Who did what, and versions to restore' },
  ] as const;

  protected openView(id: (typeof this.views)[number]['id']): void {
    this.viewsOpen.set(false);
    this.togglePanel(id);
  }

  /** The board as a picture, with its images. */
  async #picture(board: BoardDoc): Promise<HTMLCanvasElement> {
    return boardCanvas(board, await loadImages(board, this.files()?.urls() ?? new Map()));
  }

  protected async exportPng(): Promise<void> {
    this.exportOpen.set(false);
    const board = this.board();
    if (!board) return;
    (await this.#picture(board)).toBlob((blob) => {
      if (!blob) return;
      download(`${fileName(this.title())}.png`, blob);
      toast.success('Image saved', { description: `${fileName(this.title())}.png` });
    }, 'image/png');
  }

  protected exportMarkdown(): void {
    this.exportOpen.set(false);
    const board = this.board();
    if (!board) return;
    download(`${fileName(this.title())}.md`, new Blob([boardMarkdown(board, this.title() || 'Board')], { type: 'text/markdown' }));
    toast.success('Markdown saved', { description: `${fileName(this.title())}.md` });
  }

  /** Prints the board's picture from a hidden frame; the print dialog can save it as a PDF. */
  protected async exportPdf(): Promise<void> {
    this.exportOpen.set(false);
    const board = this.board();
    if (!board) return;
    const src = (await this.#picture(board)).toDataURL('image/png');
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden';
    document.body.append(frame);
    const doc = frame.contentDocument!;
    doc.title = this.title() || 'Board';
    const style = doc.createElement('style');
    style.textContent = '@page{margin:12mm}body{margin:0}img{width:100%;height:auto}';
    const img = doc.createElement('img');
    img.alt = this.title();
    img.onload = () => {
      frame.contentWindow!.print();
      setTimeout(() => frame.remove(), 1000);
    };
    doc.head.append(style);
    doc.body.append(img);
    img.src = src;
  }

  /** Places an uploaded file on the board: images at their own shape, files as cards. */
  protected async place(file: BoardFileDto, local: File | undefined, at = this.canvas()?.viewCentre()): Promise<void> {
    const board = this.board();
    if (!board || !at) return;
    let size: { w: number; h: number } = FILE_CARD;
    if (file.mime.startsWith('image/') && local) {
      const bitmap = await createImageBitmap(local).catch(() => null);
      if (bitmap) size = imageSize(bitmap.width, bitmap.height);
      bitmap?.close();
    }
    board.addMedia(file, at.x, at.y, size);
  }

  /** Files dropped straight on the board go up and land where they were dropped, side by side. */
  protected async onDropped(files: File[], at: { x: number; y: number }): Promise<void> {
    const cache = this.files();
    if (!cache || !this.canEdit()) return;
    for (const [i, local] of files.entries()) {
      try {
        const stored = await cache.upload(local, () => undefined, new AbortController().signal);
        await this.place(stored, local, { x: at.x + i * 40, y: at.y + i * 40 });
      } catch (err) {
        toast.error(`${local.name} wasn't added`, { description: (err as Error).message });
      }
    }
  }

  protected askAbout(media: Media): void {
    this.asking.set(media);
    this.panel.set('ask-image');
  }

  /** Opens a file in a new tab (images and PDFs show; others download). */
  protected open(media: Media): void {
    const url = this.files()?.urls().get(media.fileId);
    if (url) openFile(url, media);
  }

  // ── While you were away ──

  /** What others did on the board since this person last had it open; null when there's nothing to say. */
  protected readonly away = signal<{ since: number; items: AwayItem[] } | null>(null);
  #seenKey = (id: string) => `corkboard.seen.${id}`;

  #seen(id: string): number | null {
    try {
      const v = Number(localStorage.getItem(this.#seenKey(id)));
      return Number.isFinite(v) && v > 0 ? v : null;
    } catch {
      return null;
    }
  }

  #markSeen(id: string): void {
    try {
      localStorage.setItem(this.#seenKey(id), String(Date.now()));
    } catch {
      // Blocked storage: the summary just shows less.
    }
  }

  protected async checkAway(id: string, myName: string): Promise<void> {
    const since = this.#seen(id);
    this.#markSeen(id);
    // Not for a first visit, or a quick look back.
    if (!since || Date.now() - since < 10 * 60 * 1000) return;
    try {
      const events = (await this.#api.invoke(activityControllerList, { id, since })).filter((e) => e.actor !== myName);
      if (!events.length || this.id() !== id) return;
      this.away.set({
        since,
        items: events.slice(0, 20).map((e) => ({ id: e.id, title: `${e.actor} ${e.action}${e.target ? ` “${e.target}”` : ''}`, status: 'done' as const, at: e.at, ...(e.detail ? { detail: e.detail } : {}) })),
      });
    } catch {
      // No summary is fine.
    }
  }

  protected togglePanel(which: 'share' | 'comments' | 'matrix' | 'tasks' | 'gantt' | 'summary' | 'history' | 'clusters' | 'files' | 'activity'): void {
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

    // Fetch the board's images and files as they appear on it.
    effect(() => {
      const ids = this.board()?.media().map((m) => m.fileId) ?? [];
      untracked(() => this.files()?.load(ids));
    });

    // A board opens showing everything on it, once, when its content first arrives.
    let fitted: string | null = null;
    effect(() => {
      const id = this.id();
      const board = this.board();
      const ready = this.status() !== 'connecting' && !!this.canvas() && !!board && board.notes().length + board.frames().length > 0;
      if (ready && fitted !== id && this.followingId() === null) {
        fitted = id;
        untracked(() => this.canvas()?.fitAll());
      }
    });

    // Following a presenter: look where they look, until they stop or leave.
    effect(() => {
      const following = this.followingId();
      if (following === null) return;
      const p = this.presenter();
      if (!p || p.clientId !== following) {
        untracked(() => this.followingId.set(null));
        return;
      }
      untracked(() => this.canvas()?.lookAt(p.view));
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
        void this.checkAway(id, me.name);
        const board = new BoardDoc();
        const connection = new BoardConnection(id, board, () => this.#auth.token() ?? '', user);
        const chat = new ChatFeed(board.doc);
        const facilitation = new FacilitationFeed(board.doc);
        this.facilitation.set(facilitation);
        const tasks = new TaskFeed(board.doc, () => this.canEdit());
        this.tasks.set(tasks);
        const summary = new SummaryFeed(board.doc);
        this.summaryFeed.set(summary);
        const ledger = new LedgerFeed(board.doc);
        this.ledger.set(ledger);
        const reactions = new ReactionsFeed(board.doc);
        this.reactionsFeed.set(reactions);
        const files = new FileCache(id, () => this.#auth.token() ?? '');
        this.files.set(files);
        this.board.set(board);
        this.connection.set(connection);
        this.chat.set(chat);
        onCleanup(() => {
          this.board.set(undefined);
          this.connection.set(undefined);
          this.chat.set(undefined);
          this.facilitation.set(undefined);
          this.tasks.set(undefined);
          tasks.destroy();
          this.summaryFeed.set(undefined);
          summary.destroy();
          this.ledger.set(undefined);
          ledger.destroy();
          this.reactionsFeed.set(undefined);
          reactions.destroy();
          this.files.set(undefined);
          files.destroy();
          this.away.set(null);
          this.#markSeen(id);
          this.presenting.set(false);
          this.followingId.set(null);
          chat.destroy();
          facilitation.destroy();
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
