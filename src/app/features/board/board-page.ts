import { savedTemplatesControllerList } from '../../api/generated/fn/boards/saved-templates-controller-list';
import { savedTemplatesControllerRemove } from '../../api/generated/fn/boards/saved-templates-controller-remove';
import type { SavedTemplateDto } from '../../api/generated/models/saved-template-dto';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, effect, ElementRef, HostListener, inject, input, resource, signal, untracked, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { html } from 'lit';
import { Dialog } from '@adamstavely/trenchcoat/angular/dialog';
import { Skeleton } from '@adamstavely/trenchcoat/angular/shimmer-loader';
import { StackSpread } from '@adamstavely/trenchcoat/angular/stack-spread';
import { MenuMorph } from '@adamstavely/trenchcoat/angular/menu-morph';
import { boardCanvas, boardMarkdown, download, fileName, loadImages } from './export';
import { Api } from '../../api/generated/api';
import { summaryControllerCatchUp } from '../../api/generated/fn/summary/summary-controller-catch-up';
import type { CatchUpDto } from '../../api/generated/models/catch-up-dto';
import { boardsControllerTemplates } from '../../api/generated/fn/boards/boards-controller-templates';
import { templateCards } from './template-cards';
import type { BoardTemplateDto } from '../../api/generated/models/board-template-dto';
import { facilitationControllerSetAgenda } from '../../api/generated/fn/facilitation/facilitation-controller-set-agenda';
import { policiesControllerOnBoard } from '../../api/generated/fn/policies/policies-controller-on-board';
import { boardsControllerGet } from '../../api/generated/fn/boards/boards-controller-get';
import { boardsControllerRemove } from '../../api/generated/fn/boards/boards-controller-remove';
import { boardsControllerRename } from '../../api/generated/fn/boards/boards-controller-rename';
import { Auth } from '../../core/auth';
import { Session } from '../../core/session';
import { BoardConnection, type ConnectionStatus } from './board-connection';
import { BoardDoc } from './board-doc';
import { Commands, type AppCommand } from '../../core/commands';
import { formatRemaining } from './facilitation';
import { facilitationControllerJoinBreakout } from '../../api/generated/fn/facilitation/facilitation-controller-join-breakout';
import { facilitationControllerBringEveryone } from '../../api/generated/fn/facilitation/facilitation-controller-bring-everyone';
import { boardsControllerNext } from '../../api/generated/fn/boards/boards-controller-next';
import { VersionPreview } from './version-preview';
import { BoardOutline } from './board-outline';
import { WritingTray } from './writing-tray';
import type { BoardVersionDto } from '../../api/generated/models/board-version-dto';
import { BoardChat } from './board-chat';
import { BoardMatrix } from './board-matrix';
import { BoardTasks } from './board-tasks';
import { BoardDiagram } from './board-diagram';
import { BoardChart } from './board-chart';
import { BoardSaveTemplate } from './board-save-template';
import { BoardGantt } from './board-gantt';
import { noteLines, TaskFeed, type StoredTask } from './tasks';
import type { BoardView } from './board-doc';
import { BoardSummary } from './board-summary';
import { SummaryFeed } from './summary';
import { BoardClusters, BoardHistory } from './board-insights';
import { LedgerFeed } from './ledger';
import { BoardApp } from './board-app';
import { BoardSuggestions, SuggestionPreview } from './board-suggestions';
import { SuggestionsFeed, type Suggestion } from './suggestions';
import { ReactionsFeed, reactionsFor } from './reactions';
import { FileCache, imageSize, openFile } from './file-cache';
import { BoardFiles, ImageAsk } from './board-files';
import { BoardActivity } from './board-activity';
import { AwaySummary } from '@adamstavely/trenchcoat/angular/away-summary';
import type { AwayItem } from '@adamstavely/trenchcoat/away-summary';
import { toast } from '@adamstavely/trenchcoat/toaster';
import type { SessionRecapDto } from '../../api/generated/models/session-recap-dto';
import { recapLayout } from './recap';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { activityControllerList } from '../../api/generated/fn/activity/activity-controller-list';
import type { BoardFileDto } from '../../api/generated/models/board-file-dto';
import { FILE_CARD, type Media } from './board-doc';
import { placedFileSize } from './items';
import { reactionsControllerReact } from '../../api/generated/fn/reactions/reactions-controller-react';
import { BoardFacilitation } from './board-facilitation';
import { FacilitationFeed, noteVotes } from './facilitation';
import { facilitationControllerVote } from '../../api/generated/fn/facilitation/facilitation-controller-vote';
import type { PresentedView } from './presence';
import { ChatFeed } from './chat';
import { Canvas, layoutLocked } from './canvas';
import { BoardShare } from './board-share';
import { BoardComments } from './board-comments';
import { imagePins, openCounts, pinOf } from './comments';
import { commentsControllerList } from '../../api/generated/fn/comments/comments-controller-list';
import { atLeast, type Role } from '../../core/roles';
import { colorFor, type PresenceUser } from './presence';
import { Icon } from '../../shared/icon';
import { Logo } from '../../shared/logo';
import { BoardSearch } from '../search/board-search';
import { AccountNav } from '../../shell/account-nav';
import { AssistantSession, ASSISTANT_STARTERS } from './assistant';
import { modelChoice } from './model-choice';
import { dictate } from '../../shared/speech';
import { AiSidePane } from '@adamstavely/trenchcoat/angular/ai-side-pane';
import { BoardStart } from './board-start';
import { serverNow } from '../../core/server-clock';

const STATUS_TEXT: Record<ConnectionStatus, string> = {
  connecting: 'Connecting…',
  saving: 'Saving…',
  saved: 'Saved',
  offline: 'Offline – your changes are kept in this browser and sent when you reconnect',
  stuck: "Some changes weren't accepted by the server",
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
/** The views that are placed on the board rather than opened beside it, by their ids in the Views menu. */
const PLACED_VIEWS = { matrix: 'matrix', tasks: 'kanban', gantt: 'timeline' } as const satisfies Record<string, BoardView>;

@Component({
  selector: 'app-board-page',
  imports: [Button, Canvas, BoardChat, BoardDiagram, BoardChart, BoardSaveTemplate, BoardFacilitation, BoardMatrix, BoardTasks, BoardGantt, BoardSummary, BoardHistory, BoardClusters, BoardFiles, ImageAsk, BoardActivity, VersionPreview, BoardApp, BoardSuggestions, SuggestionPreview, BoardOutline, WritingTray, AwaySummary, BoardShare, BoardComments, Dialog, Skeleton, StackSpread, MenuMorph, Icon, BoardSearch, AccountNav, BoardStart, AiSidePane, Logo],
  templateUrl: './board-page.html',
  styleUrl: './board-page.css',
})
export class BoardPage {
  readonly #api = inject(Api);
  readonly #commands = inject(Commands);
  readonly #router = inject(Router);
  readonly #auth = inject(Auth);
  readonly #session = inject(Session);

  /** From the route. */
  readonly id = input.required<string>();
  /** From the route's query (`?comment=<note id>`, a notification's link): open that note or frame's thread. */
  readonly comment = input<string>();

  protected readonly meta = resource({
    params: () => this.id(),
    loader: ({ params: id }) => this.#api.invoke(boardsControllerGet, { id }),
  });

  /** What the workspace's policies let you do here (share, links, exports, feedback), with the reason for what they don't. */
  protected readonly policy = resource({
    params: () => this.id(),
    loader: ({ params: id }) => this.#api.invoke(policiesControllerOnBoard, { id }),
  });
  /** Exports happen in the browser, so the policy is kept here: they're off until it's known to allow them. */
  protected readonly canExport = computed(() => this.policy.hasValue() && this.policy.value().exports.allowed);
  protected readonly exportRefusal = computed(() => (this.policy.hasValue() ? this.policy.value().exports.reason : null));

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
  /** Owners and the facilitator lock and unlock things, and change what's locked; the server refuses anyone else. */
  /** Private mode is on: nobody's pointer or selection goes out but the facilitator's, and names stay hidden. */
  protected readonly privateMode = computed(() => this.fstate()?.privacy.on === true);
  protected readonly canChangeLocked = computed(() => this.isOwner() || (!!this.meUser() && this.fstate()?.facilitator.userId === this.meUser()!.id));
  protected readonly readOnlyLabel = computed(() => (this.role() === 'commenter' ? 'You can comment' : 'View only'));
  protected readonly meId = computed(() => this.#me()?.id);

  protected readonly chatOpen = signal(false);

  // ── Facilitation: dot voting, the shared timer, presenting ──
  protected readonly facilitation = signal<FacilitationFeed | undefined>(undefined);
  protected readonly facilitating = signal(false);
  protected readonly canRun = computed(() => atLeast(this.role(), 'updater'));
  protected readonly fstate = computed(() => this.facilitation()?.state());
  /** Each person's votes on notes still on the board: one on a deleted note counts for nothing and is theirs again. */
  protected readonly liveVotes = computed<ReadonlyMap<string, readonly string[]>>(() => {
    const votes = this.fstate()?.votes;
    if (!votes?.size) return votes ?? new Map();
    const notes = new Set(this.board()?.notes().map((n) => n.id) ?? []);
    return new Map([...votes].map(([person, ids]) => [person, ids.filter((id) => notes.has(id))]));
  });
  protected readonly noteVotes = computed(() => {
    const s = this.fstate();
    const me = this.#me()?.id;
    return s && me ? noteVotes(s.voting, this.liveVotes(), me) : new Map();
  });
  protected readonly votingNow = computed(() => !!this.fstate()?.voting.open && this.canComment());
  protected readonly votesLeft = computed(() => {
    const s = this.fstate();
    const me = this.#me()?.id;
    return s && me ? Math.max(0, s.voting.votesEach - (this.liveVotes().get(me)?.length ?? 0)) : 0;
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
  protected readonly panel = signal<'share' | 'comments' | 'summary' | 'history' | 'suggestions' | 'clusters' | 'files' | 'ask-image' | 'activity' | 'outline' | 'diagram' | 'chart' | 'save-template' | null>(null);
  /** The diagram whose text is open beside the board. */
  protected readonly diagramId = signal<string | null>(null);
  /** The chart whose numbers are open beside the board. */
  protected readonly chartId = signal<string | null>(null);
  protected readonly files = signal<FileCache | undefined>(undefined);
  protected readonly emptyUrls: ReadonlyMap<string, string> = new Map();
  /** A saved version shown in place of the board, read-only, until they go back (or restore it). */
  protected readonly previewing = signal<BoardVersionDto | null>(null);
  /** Goes up when a version is restored from the preview, so the versions list reloads. */
  protected readonly versionsChanged = signal(0);
  /** The image being asked about. */
  protected readonly asking = signal<Media | null>(null);
  protected readonly ledger = signal<LedgerFeed | undefined>(undefined);
  protected readonly suggestionsFeed = signal<SuggestionsFeed | undefined>(undefined);
  protected readonly suggestions = computed(() => this.suggestionsFeed()?.list() ?? []);
  /** The suggestion shown in place of the board; it closes by itself once someone accepts or turns it down. */
  readonly #previewingSuggestion = signal<string | null>(null);
  protected readonly previewingSuggestion = computed(() => this.suggestions().find((s) => s.id === this.#previewingSuggestion()) ?? null);
  protected previewSuggestion(s: Suggestion | null): void {
    this.#previewingSuggestion.set(s?.id ?? null);
  }
  /** Suggestions already on the board when it opened, or already seen: only new ones for you open the panel. */
  readonly #seenSuggestions = new Set<string>();
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
  /** Tasks not done yet, for planning poker to estimate one. */
  protected readonly openTasks = computed(() => (this.tasks()?.tasks() ?? []).filter((t) => t.status !== 'done').map((t) => ({ id: t.id, key: t.key, title: t.title })));
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
  protected readonly pins = computed(() => imagePins(this.threads()));
  /** A pinned comment to show in the comments panel: one clicked, or one just placed (with where it goes). */
  protected readonly pinTarget = signal<{ nodeId: string; anchor?: { x: number; y: number } } | null>(null);

  protected openPin(target: { nodeId: string; anchor?: { x: number; y: number } }): void {
    this.pinTarget.set(target);
    this.panel.set('comments');
  }
  protected readonly meUser = computed(() => {
    const me = this.#me();
    return me ? { id: me.id, name: me.name } : undefined;
  });

  /** Something to ask the model in the chat, from elsewhere on the page; `n` makes each request new. */
  /** The assistant: one conversation per board, opened from its launcher, ⌘., or an Ask AI menu. */
  protected readonly assistantOpen = signal(false);
  protected readonly assistantStarters = ASSISTANT_STARTERS;
  protected readonly dictate = dictate;
  protected readonly models = modelChoice(this.#api, () => (this.meta.hasValue() ? this.meta.value().orgId : ''));
  protected readonly assistant = computed(() => new AssistantSession(this.#api, this.id(), this.models.modelId, () => this.selection(), (fileId) => this.#fileUrl(fileId)));
  /** What the assistant reads: the selected notes, or the whole board. */
  protected readonly assistantContext = computed(() => {
    const picked = this.selection().length;
    return picked
      ? { title: `${picked} selected ${picked === 1 ? 'note' : 'notes'}`, connected: true, count: picked }
      : { title: this.title() || 'This board', connected: true, count: this.board()?.notes().length ?? 0 };
  });

  /** Opens the assistant and asks it this. */
  protected askAssistant(text: string): void {
    this.assistantOpen.set(true);
    void this.assistant().send(text);
  }

  /** The prompt bar and starters on an empty board, until it has something on it or they're hidden. */
  protected readonly startDismissed = signal(false);
  protected readonly showStart = computed(() => {
    const b = this.board();
    const empty = !!b && !b.notes().length && !b.frames().length && !b.items().length && !b.media().length;
    return empty && this.canEdit() && !this.startDismissed();
  });
  protected readonly mainOpen = signal(false);
  protected readonly viewsOpen = signal(false);
  protected readonly exportOpen = signal(false);
  protected readonly presentOpen = signal(false);
  /** ⌘ on Apple devices, Ctrl elsewhere, for the shortcuts shown. */
  protected readonly modKey = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl ';
  /** The title field grows with the title, within limits, so the panel stays snug. */
  protected readonly titleWidth = computed(() => Math.min(36, Math.max(8, this.title().length + 2)));
  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Opens the folded search in the top-left panel, as ⌘K does. */
  protected openSearch(): void {
    const field = this.#host.nativeElement.querySelector<HTMLInputElement>('.search .ui-cm__search input');
    field?.focus();
    field?.select();
  }
  protected readonly views = [
    { id: 'matrix', label: 'Prioritise', hint: 'Value against effort' },
    { id: 'tasks', label: 'Tasks', hint: 'Action items on a kanban' },
    { id: 'gantt', label: 'Timeline', hint: 'A plan as a Gantt chart' },
    { id: 'summary', label: 'Summary', hint: 'A shared AI summary' },
    { id: 'clusters', label: 'Clusters', hint: 'Notes linked by shared words' },
    { id: 'history', label: 'History', hint: 'What the model changed, to undo' },
    { id: 'activity', label: 'Activity', hint: 'Who did what, and versions to restore' },
    { id: 'outline', label: 'Outline', hint: 'Frames in order, and who is where' },
  ] as const;

  protected openView(id: (typeof this.views)[number]['id']): void {
    this.viewsOpen.set(false);
    // The matrix, tasks and timeline live on the board: this puts one there, or goes to the one already there.
    const placed = PLACED_VIEWS[id as keyof typeof PLACED_VIEWS];
    if (placed) this.canvas()?.placeView(placed);
    else this.togglePanel(id as Exclude<typeof id, keyof typeof PLACED_VIEWS>);
  }

  /** The board as a picture, with its images. */
  async #picture(board: BoardDoc): Promise<HTMLCanvasElement> {
    return boardCanvas(board, await loadImages(board, this.files()?.urls() ?? new Map(), this.files()));
  }

  protected async exportPng(): Promise<void> {
    this.exportOpen.set(false);
    const board = this.board();
    if (!board || !this.canExport()) return;
    (await this.#picture(board)).toBlob((blob) => {
      if (!blob) return;
      download(`${fileName(this.title())}.png`, blob);
      toast.success('Image saved', { description: `${fileName(this.title())}.png` });
    }, 'image/png');
  }

  protected exportMarkdown(): void {
    this.exportOpen.set(false);
    const board = this.board();
    if (!board || !this.canExport()) return;
    download(`${fileName(this.title())}.md`, new Blob([boardMarkdown(board, this.title() || 'Board')], { type: 'text/markdown' }));
    toast.success('Markdown saved', { description: `${fileName(this.title())}.md` });
  }

  /** Prints the board's picture from a hidden frame; the print dialog can save it as a PDF. */
  protected async exportPdf(): Promise<void> {
    this.exportOpen.set(false);
    const board = this.board();
    if (!board || !this.canExport()) return;
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
    let size: { w: number; h: number } = placedFileSize(file.mime) ?? FILE_CARD;
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

  /** One of the board's files, fetched for the assistant to link what it cites. */
  #fileUrl(fileId: string): Promise<string | undefined> {
    return this.files()?.urlOf(fileId) ?? Promise.resolve(undefined);
  }

  // ── While you were away ──

  /** What others did on the board since this person last had it open; null when there's nothing to say. */
  protected readonly away = signal<{ since: number; items: AwayItem[] } | null>(null);
  /** What a model made of what others did while this person was away, once they ask. */
  protected readonly catchUp = signal<CatchUpDto | null>(null);
  protected readonly catchingUp = signal(false);

  protected async askCatchUp(since: number): Promise<void> {
    const modelId = this.models.modelId();
    if (!modelId) return;
    this.catchingUp.set(true);
    try {
      this.catchUp.set(await this.#api.invoke(summaryControllerCatchUp, { id: this.id(), body: { modelId, since } }));
    } catch (err) {
      const message = err instanceof HttpErrorResponse ? (err.error as { message?: unknown } | null)?.message : undefined;
      toast.error("Couldn't catch you up", { description: typeof message === 'string' ? message : 'Try again.' });
    } finally {
      this.catchingUp.set(false);
    }
  }
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

  protected togglePanel(which: 'share' | 'comments' | 'summary' | 'history' | 'suggestions' | 'clusters' | 'files' | 'activity' | 'outline'): void {
    this.panel.update((open) => (open === which ? null : which));
  }

  /** The facilitator's controls dock where the right-hand panels do, so opening them closes any of those. */
  protected toggleFacilitating(open = !this.facilitating()): void {
    this.facilitating.set(open);
    if (open) this.panel.set(null);
  }

  /** From the comments panel: go to a note or frame, or (no id) back to the list. */
  protected showNode(id: string): void {
    if (id) this.canvas()?.show([id]);
    else this.canvas()?.select([]);
  }
  protected readonly selection = signal<readonly string[]>([]);
  protected readonly selectedFrames = signal<readonly string[]>([]);
  protected readonly selectionIds = signal<readonly string[]>([]);

  // ── Breakouts ──

  readonly #breakouts = computed(() => this.fstate()?.breakouts ?? { open: false, groups: [] });
  /** The frames breakouts would use: those selected, else every frame not inside another. */
  protected readonly breakoutFrames = computed(() => {
    const board = this.board();
    if (!board) return [];
    const selected = board.frames().filter((f) => this.selectionIds().includes(f.id));
    if (selected.length >= 2) return selected.map((f) => f.id);
    const frames = board.frames();
    return frames.filter((f) => !frames.some((o) => o.id !== f.id && board.withInnerFrames([o.id]).includes(f.id))).map((f) => f.id);
  });
  protected readonly framesSelected = computed(() => (this.board()?.frames() ?? []).filter((f) => this.selectionIds().includes(f.id)).length >= 2);
  /** Now, every second while a breakout group has a timer. */
  readonly #tick = signal(serverNow());
  /** Under each group's frame: who's in it and the time left; their own group stands out, others can be joined. */
  protected readonly frameBadges = computed(() => {
    const b = this.#breakouts();
    const me = this.meUser()?.id;
    const now = this.#tick();
    const badges = new Map<string, { label: string; mine: boolean; joinable: boolean }>();
    if (!b.open) return badges;
    for (const g of b.groups) {
      const mine = g.members.some((m) => m.id === me);
      const names = g.members.length ? g.members.map((m) => m.name.split(/\s+/)[0]).join(', ') : 'Nobody yet';
      const left = g.endsAt === null ? '' : g.endsAt - now > 0 ? ` · ${formatRemaining(g.endsAt - now)} left` : " · Time's up";
      badges.set(g.frameId, { label: `${mine ? 'Your group' : 'Group'} · ${names}${left}`, mine, joinable: !mine && this.canComment() });
    }
    return badges;
  });

  // ── Board templates ──

  protected readonly pickingTemplate = signal(false);
  /** The templates, fetched the first time the picker opens. */
  protected readonly boardTemplates = resource({
    params: () => (this.pickingTemplate() ? true : undefined),
    loader: () => this.#api.invoke(boardsControllerTemplates),
  });
  /** The templates the workspace saved, fetched when the picker opens (and again after one is saved or deleted). */
  protected readonly savedTemplates = resource({
    params: () => (this.pickingTemplate() && this.meta.hasValue() ? this.meta.value().orgId : undefined),
    loader: ({ params: orgId }) => this.#api.invoke(savedTemplatesControllerList, { orgId }),
  });
  protected readonly templatePicker = computed(() =>
    templateCards(
      this.boardTemplates.hasValue() ? this.boardTemplates.value() : [],
      (t) => {
        this.pickingTemplate.set(false);
        if (t) void this.placeTemplate(t);
      },
      false,
      { templates: this.savedTemplates.hasValue() ? this.savedTemplates.value() : [], remove: (t) => void this.removeTemplate(t) },
    ),
  );

  /** Deletes a template the workspace saved; boards made from it keep what they have. */
  protected async removeTemplate(t: SavedTemplateDto): Promise<void> {
    if (!this.meta.hasValue()) return;
    try {
      await this.#api.invoke(savedTemplatesControllerRemove, { orgId: this.meta.value().orgId, templateId: t.id });
      this.savedTemplates.reload();
      toast.success(`Deleted the template “${t.name}”`);
    } catch {
      toast.error(`“${t.name}” wasn't deleted. Try again.`);
    }
  }

  /** Lays a template out; if it has an agenda and the board has none yet, the agenda comes too, pointing at its frames. */
  async placeTemplate(t: BoardTemplateDto): Promise<void> {
    const ids = this.canvas()?.placeLayout(t.layout) ?? [];
    if (!t.agenda?.length || !ids.length || !this.canRun() || this.fstate()?.agenda.steps.length) return;
    // addLayout returns the frames' ids first, in the layout's order.
    const frameIds = new Map((t.layout.frames ?? []).flatMap((f, i) => (f.key ? [[f.key, ids[i]] as const] : [])));
    try {
      await this.#api.invoke(facilitationControllerSetAgenda, {
        id: this.id(),
        // Each step with what it runs (its vote, poll or hidden writing), as a new board from the template gets.
        body: { steps: t.agenda.map((s) => ({ title: s.title, seconds: Math.round(s.minutes * 60), frameId: (s.frame && frameIds.get(s.frame)) || null, activity: s.activity ?? null })) },
      });
      toast.success(`Added its ${t.agenda.length}-step agenda`, { description: 'Run it from Facilitate.' });
    } catch {
      // The layout is there; the agenda can be planned by hand.
    }
  }

  // ── Recurring boards ──

  /** The board this one carries on from, to link back to; null when there's none, or it's gone. */
  protected readonly previous = resource({
    params: () => (this.meta.hasValue() ? this.meta.value().continuesId : null) ?? undefined,
    loader: ({ params: id }) => this.#api.invoke(boardsControllerGet, { id }).catch(() => null),
  });
  protected readonly startingNext = signal(false);

  /** Starts the next session's board from this one and opens it. */
  protected async nextSession(): Promise<void> {
    this.startingNext.set(true);
    try {
      const next = await this.#api.invoke(boardsControllerNext, { id: this.id(), body: {} });
      toast.success(`Started “${next.title}”`, { description: 'Same frames; open tasks and action items carried over.' });
      void this.#router.navigateByUrl(`/boards/${next.id}`);
    } catch {
      toast.error("The next session couldn't be started", { description: 'Try again.' });
    } finally {
      this.startingNext.set(false);
    }
  }

  protected go(url: string): void {
    void this.#router.navigateByUrl(url);
  }

  /** From the outline: show a frame as the presenter, starting to present if need be, so followers see it too. */
  // ── Slides: the frames, in outline order, one at a time, full screen ──

  /** The frames being shown as slides, and which is on screen; null when not presenting slides. */
  protected readonly slides = signal<{ ids: string[]; at: number } | null>(null);
  protected readonly slideTitle = computed(() => {
    const s = this.slides();
    const frame = s && this.board()?.frames().find((f) => f.id === s.ids[s.at]);
    return frame ? frame.title || 'Untitled frame' : '';
  });
  /** Whether presenting slides started presenting (so ending them stops it), and went full screen. */
  #slidesPresent = false;
  #slidesFullscreen = false;

  /** Shows the frames as slides, in outline order, from one of them (or the first). Everyone following sees them too. */
  protected startSlides(fromFrame?: string): void {
    const ids = this.board()?.outline().map((f) => f.id) ?? [];
    if (!ids.length) {
      toast.info('Add a frame to present it as a slide', { description: 'Each frame is a slide, in the order of the outline.' });
      return;
    }
    this.#slidesPresent = !this.presenting();
    if (this.#slidesPresent) this.togglePresenting();
    this.panel.set(null);
    this.facilitating.set(false);
    this.slides.set({ ids, at: 0 });
    this.slideTo(Math.max(0, fromFrame ? ids.indexOf(fromFrame) : 0));
    const page = document.documentElement;
    if (page.requestFullscreen && !document.fullscreenElement) {
      page.requestFullscreen().then(
        () => (this.#slidesFullscreen = true),
        () => undefined,
      );
    }
  }

  protected slideTo(i: number): void {
    const s = this.slides();
    if (!s) return;
    const at = Math.max(0, Math.min(s.ids.length - 1, i));
    this.slides.set({ ...s, at });
    // After the chrome has gone, so the frame fills what's left.
    requestAnimationFrame(() => this.canvas()?.showSlide(s.ids[at]));
  }

  protected endSlides(): void {
    if (!this.slides()) return;
    this.slides.set(null);
    if (this.#slidesFullscreen && document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    this.#slidesFullscreen = false;
    if (this.#slidesPresent && this.presenting()) this.togglePresenting();
    this.#slidesPresent = false;
  }

  /** Keys while presenting slides, ahead of the board's own: next, back, first, last, and out. */
  readonly #slideKeys = effect((onCleanup) => {
    if (!this.slides()) return;
    const onKey = (e: KeyboardEvent) => {
      const s = this.slides();
      if (!s || e.metaKey || e.ctrlKey || e.altKey) return;
      const next = ['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(e.key);
      const back = ['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(e.key);
      if (next) this.slideTo(s.at + 1);
      else if (back) this.slideTo(s.at - 1);
      else if (e.key === 'Home') this.slideTo(0);
      else if (e.key === 'End') this.slideTo(s.ids.length - 1);
      else if (e.key === 'Escape') this.endSlides();
      else return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    // Leaving full screen (the browser's own Esc) ends the slides too.
    const onFullscreen = () => {
      if (!document.fullscreenElement && this.#slidesFullscreen) {
        this.#slidesFullscreen = false;
        this.endSlides();
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    document.addEventListener('fullscreenchange', onFullscreen);
    onCleanup(() => {
      window.removeEventListener('keydown', onKey, { capture: true });
      document.removeEventListener('fullscreenchange', onFullscreen);
    });
  });

  protected presentFrame(frameId: string): void {
    if (!this.presenting()) this.togglePresenting();
    this.canvas()?.show([frameId], false);
  }

  /** The facilitator brings everyone to what they're looking at. */
  /** A finished vote's results as a bar chart on the board: each voted note, by its first line, and its votes. */
  protected chartVotes(results: readonly { id: string; votes: number }[]): void {
    const board = this.board();
    const canvas = this.canvas();
    if (!board || !canvas || !this.canEdit()) return;
    const notes = new Map(board.notes().map((n) => [n.id, n]));
    const rows = results.flatMap((r) => {
      const note = notes.get(r.id);
      if (!note) return [];
      const first = noteLines(note.text)[0]?.text.replace(/^(•|\d+\.) /, '').trim() || 'Untitled note';
      return [{ label: first.length > 40 ? `${first.slice(0, 39)}…` : first, value: r.votes }];
    });
    if (!rows.length) return;
    canvas.show([canvas.placeChart('Vote results', rows.slice(0, 30))]);
  }

  // ── Session recap ──

  /** The recap has been asked for from outside the chat, until the chat takes it up (once, however often it opens). */
  protected readonly recapWanted = signal(false);

  /** The end of a facilitated session: the chat opens and writes the recap there. */
  protected askRecap(): void {
    this.chatOpen.set(true);
    this.recapWanted.set(true);
  }

  /** The recap as a frame on the board, titled with its title, beside what's there. */
  protected placeRecap(r: SessionRecapDto): void {
    const canvas = this.canvas();
    if (!canvas || !this.canEdit()) return;
    const [frame] = canvas.placeLayout(recapLayout(r));
    if (frame) toast.success('Recap put on the board', { description: r.title });
  }

  /** Planning poker's result, written to the task it estimated. */
  protected setTaskEstimate(taskId: string, estimate: string): void {
    const feed = this.tasks();
    const task = feed?.tasks().find((t) => t.id === taskId);
    if (!feed || !task || !this.canEdit()) return;
    feed.put({ ...task, estimate: estimate as StoredTask['estimate'] });
    toast.success(`${task.key} estimated at ${estimate}`);
  }

  protected async bringEveryone(): Promise<void> {
    const view = this.#lastView;
    if (!view) return;
    try {
      await this.#api.invoke(facilitationControllerBringEveryone, { id: this.id(), body: view });
      toast.success('Everyone is looking where you are');
    } catch (err) {
      const message = err instanceof HttpErrorResponse ? (err.error as { message?: unknown } | null)?.message : undefined;
      toast.error("Everyone couldn't be brought here", { description: typeof message === 'string' ? message : 'Try again.' });
    }
  }

  protected async joinBreakout(frameId: string): Promise<void> {
    try {
      await this.#api.invoke(facilitationControllerJoinBreakout, { id: this.id(), body: { frameId } });
      this.canvas()?.show([frameId]);
    } catch {
      toast.error("You couldn't join that group", { description: 'Try again.' });
    }
  }
  protected readonly canvas = viewChild(Canvas);

  /**
   * The assistant pane opened or closed. Menus and selects inside it fire tc-open-change too, and it bubbles here: only
   * the pane's own counts. A handler that comes to false would cancel theirs (Angular prevents the default), so this
   * returns nothing.
   */
  protected paneOpenChange(event: Event): void {
    if (event.target === event.currentTarget) this.assistantOpen.set((event as CustomEvent<{ open: boolean }>).detail.open);
  }
  /** Whether the board's layout (frames, text, shapes, tables) is locked, for the top bar's lock button. */
  protected readonly layoutLocked = computed(() => {
    const board = this.board();
    return !!board && layoutLocked(board);
  });

  protected readonly title = signal('');
  protected readonly confirmDelete = signal(false);
  protected readonly deleting = signal(false);

  constructor() {
    // A new suggestion made for you (from Ask AI or the chat) opens the suggestions, so you can decide on it.
    effect(() => {
      const list = this.suggestions();
      const loaded = this.connection()?.status() !== 'connecting';
      const me = this.meId();
      untracked(() => {
        const fresh = list.filter((s) => !this.#seenSuggestions.has(s.id));
        for (const s of fresh) this.#seenSuggestions.add(s.id);
        if (loaded && fresh.some((s) => s.forId === me) && this.canEdit()) this.panel.set('suggestions');
      });
    });
    // When the facilitator brings everyone, everyone else's view goes there (once each time, not on opening the board).
    let seenSpotlight: number | null = null;
    effect(() => {
      const spot = this.fstate()?.spotlight;
      const facilitator = this.fstate()?.facilitator;
      if (!spot) return;
      untracked(() => {
        const fresh = seenSpotlight !== null && spot.n > seenSpotlight;
        seenSpotlight = spot.n;
        if (!fresh || !spot.view || facilitator?.userId === this.meUser()?.id) return;
        this.canvas()?.lookAt(spot.view);
        toast.info(`${spot.by} brought everyone here`);
      });
    });

    // What this board can do, in the header's ⌘K menu, for as long as it's open.
    effect((onCleanup) => {
      const canvas = this.canvas();
      if (!canvas) return;
      const edit = this.canEdit();
      const view = (id: (typeof this.views)[number]['id'], label: string): AppCommand => ({ id: `view:${id}`, label, run: () => this.openView(id) });
      const commands: AppCommand[] = [
        ...(edit
          ? [
              { id: 'note', label: 'Add a note', hint: 'N', run: () => canvas.addNote() },
              { id: 'text', label: 'Add text', run: () => canvas.insert('text') },
              { id: 'rect', label: 'Add a rectangle', run: () => canvas.insert('rect') },
              { id: 'diamond', label: 'Add a diamond', run: () => canvas.insert('diamond') },
              { id: 'table', label: 'Add a table', run: () => canvas.insert('table') },
              { id: 'link', label: 'Add a link', run: () => canvas.insert('link') },
              { id: 'pen', label: 'Draw with the pen', run: () => canvas.togglePen() },
            ]
          : []),
        { id: 'find', label: 'Find on this board', hint: '⌘F', run: () => canvas.toggleFind() },
        { id: 'fit', label: 'Fit everything in view', run: () => canvas.fitAll() },
        { id: 'chat', label: 'Open the chat', run: () => this.chatOpen.set(true) },
        { id: 'slides', label: 'Present as slides', run: () => this.startSlides() },
        { id: 'present', label: 'Share my view (others can follow)', run: () => this.togglePresenting() },
        ...(this.canEdit() ? [{ id: 'templates', label: 'Board templates', run: () => this.pickingTemplate.set(true) }] : []),
        ...(this.canRun() ? [{ id: 'facilitate', label: 'Facilitate: timer, votes, writing, breakouts', run: () => this.toggleFacilitating(true) }] : []),
        view('tasks', 'Tasks on the board'),
        view('matrix', 'Prioritisation matrix on the board'),
        view('gantt', 'Timeline on the board'),
        view('summary', 'Open the summary'),
        view('activity', 'Open activity and versions'),
        ...(this.canExport()
          ? [
              { id: 'png', label: 'Export as an image (PNG)', run: () => void this.exportPng() },
              { id: 'markdown', label: 'Export as Markdown', run: () => this.exportMarkdown() },
            ]
          : []),
        ...(edit ? [{ id: 'next', label: 'Start the next session', run: () => void this.nextSession() }] : []),
      ];
      onCleanup(this.#commands.offer(commands));
    });

    // A notification's link: once the board has loaded, select the note or frame and open its thread, then drop the
    // query so going back or reloading doesn't do it again.
    effect(() => {
      const nodeId = this.comment();
      const board = this.board();
      const canvas = this.canvas();
      if (!nodeId || !board || !canvas || this.status() === 'connecting') return;
      untracked(() => {
        this.panel.set('comments');
        const there = [...board.notes(), ...board.frames(), ...board.items(), ...board.media()].some((n) => n.id === nodeId);
        // A pin's thread, or one about something since deleted, opens by itself.
        if (there && !pinOf(nodeId)) canvas.show([nodeId]);
        else this.openPin({ nodeId });
        const url = this.#router.parseUrl(this.#router.url);
        delete url.queryParams['comment'];
        void this.#router.navigateByUrl(url, { replaceUrl: true });
      });
    });
    // Selecting something else on the board shows its comments instead of a pin's.
    effect(() => {
      this.selectionIds();
      untracked(() => this.pinTarget.set(null));
    });
    // Breakout timers tick; when breakouts start, each person goes to their group's frame, and back to the whole board
    // when they end.
    effect((onCleanup) => {
      if (!this.#breakouts().groups.some((g) => g.endsAt !== null)) return;
      const timer = setInterval(() => this.#tick.set(serverNow()), 1000);
      onCleanup(() => clearInterval(timer));
    });
    // Starting breakouts again reshuffles the groups: anyone put in another group's frame goes there.
    let wasOpen = false;
    let myFrame: string | null = null;
    effect(() => {
      const b = this.#breakouts();
      const me = this.meUser()?.id;
      untracked(() => {
        const mine = b.open ? (b.groups.find((g) => g.members.some((m) => m.id === me))?.frameId ?? null) : null;
        if (mine && mine !== myFrame) this.canvas()?.show([mine]);
        else if (!b.open && wasOpen) this.canvas()?.fitAll();
        wasOpen = b.open;
        myFrame = mine;
      });
    });

    effect(() => {
      if (this.meta.hasValue()) this.title.set(this.meta.value().title);
    });

    // Fetch the board's images and files as they appear on it.
    effect(() => {
      const ids = this.board()?.media().map((m) => m.fileId) ?? [];
      untracked(() => this.files()?.load(ids));
    });

    // A board opens showing everything on it, once, when its content first arrives.
    // Keyed to the board loaded, not the route: going from one board to the next, the old one is still here at first.
    let fitted: BoardDoc | null = null;
    effect(() => {
      const board = this.board();
      const ready = this.status() !== 'connecting' && !!this.canvas() && !!board && board.notes().length + board.frames().length + board.media().length > 0;
      if (ready && fitted !== board && this.followingId() === null) {
        fitted = board;
        untracked(() => this.canvas()?.fitAll());
      }
    });
    // A panel opening on the right takes the place of the facilitator's controls.
    effect(() => {
      if (this.panel() !== null) untracked(() => this.facilitating.set(false));
    });
    effect(() => {
      const board = this.board();
      if (board) board.canChangeLocked = this.canChangeLocked();
    });
    effect(() => {
      const facilitator = this.fstate()?.facilitator.userId;
      this.connection()?.presence.setPrivate(this.privateMode() && (!facilitator || facilitator !== this.meUser()?.id));
    });
    // A new board starts without the facilitator's controls open.
    effect(() => {
      this.id();
      untracked(() => this.facilitating.set(false));
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
        board.author = { id: me.id, name: me.name };
        // Until their role and the facilitator's seat are known, nothing here writes to locked things.
        board.canChangeLocked = false;
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
        const suggestions = new SuggestionsFeed(board.doc);
        this.suggestionsFeed.set(suggestions);
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
          this.suggestionsFeed.set(undefined);
          suggestions.destroy();
          this.#previewingSuggestion.set(null);
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

  /** For the route's guard: whether leaving now would leave edits unsent (they're kept in this browser). */
  hasPendingWork(): boolean {
    return !!this.connection()?.pending() && this.status() !== 'stuck';
  }

  /**
   * Once the server has refused edits for good, says so, and offers the way out: start again from the server's board,
   * dropping what it wouldn't take (they'd otherwise be kept and refused again every time the board opens).
   */
  readonly #sayStuck = effect(() => {
    if (this.status() !== 'stuck') return;
    untracked(() =>
      toast.error("Some changes on this board weren't accepted", {
        description: "The server couldn't take them, so they can't be saved. Reload the board from the server to carry on; those changes are dropped.",
        duration: Infinity,
        action: {
          label: 'Reload from the server',
          onClick: () => void this.connection()?.discardLocal().then(() => location.reload()),
        },
      }),
    );
  });

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
