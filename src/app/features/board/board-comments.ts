import { HttpErrorResponse } from '@angular/common/http';
import { afterNextRender, Component, computed, DestroyRef, effect, ElementRef, inject, input, output, resource, signal, untracked } from '@angular/core';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { CommentThread } from '@adamstavely/trenchcoat/angular/comment-thread';
import { MentionPicker } from '@adamstavely/trenchcoat/angular/mention-picker';
import type { ThreadMessage } from '@adamstavely/trenchcoat/comment-thread';
import type { MentionPickerPick, MentionPickerTrigger } from '@adamstavely/trenchcoat/mention-picker';
import { Api } from '../../api/generated/api';
import { boardsControllerMembers } from '../../api/generated/fn/boards/boards-controller-members';
import { commentsControllerAdd } from '../../api/generated/fn/comments/comments-controller-add';
import { commentsControllerResolve } from '../../api/generated/fn/comments/comments-controller-resolve';
import type { CommentThreadDto } from '../../api/generated/models/comment-thread-dto';
import type { BoardDoc } from './board-doc';
import { messagesOf, nodeLabel } from './comments';
import { paintMentions, pickedNames, plainMentions, shutOut, unpaintMentions, writeMentions, type MentionPerson } from './mentions';

/**
 * The board's comments. With one note or frame selected, its thread, in Trench Coat's comment thread, to read, reply
 * to and resolve; otherwise every thread, open ones first, each a way to that note or frame.
 */
@Component({
  selector: 'app-board-comments',
  imports: [CommentThread, MentionPicker, Button],
  templateUrl: './board-comments.html',
  styleUrl: './board-comments.css',
})
export class BoardComments {
  readonly #api = inject(Api);
  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly boardId = input.required<string>();
  readonly board = input.required<BoardDoc>();
  readonly threads = input.required<readonly CommentThreadDto[]>();
  /** What's selected on the canvas: notes and frames. */
  readonly selection = input<readonly string[]>([]);
  readonly canComment = input(false);
  readonly me = input<{ id: string; name: string } | undefined>(undefined);
  /** A comment pinned to an image, opened from its pin or just placed (with where), shown instead of the selection's. */
  readonly target = input<{ nodeId: string; anchor?: { x: number; y: number } } | null>(null);
  readonly closed = output<void>();
  /** Bring this note or frame into view and select it. */
  readonly show = output<string>();
  /** Comments changed here; fetch them again. */
  readonly changed = output<void>();

  /** The one note or frame selected, whose thread shows. */
  protected readonly nodeId = computed(() => {
    const target = this.target();
    if (target) return target.nodeId;
    const selected = this.selection();
    return selected.length === 1 ? selected[0] : null;
  });
  protected readonly thread = computed(() => this.threads().find((t) => t.nodeId === this.nodeId()));
  protected readonly heading = computed(() => {
    const id = this.nodeId();
    return id ? nodeLabel(this.board(), id) : '';
  });
  protected readonly messages = computed<ThreadMessage[]>(() => messagesOf(this.thread(), this.me()?.id));
  protected readonly currentUser = computed(() => ({ name: this.me()?.name ?? 'You' }));

  protected readonly showResolved = signal(false);
  protected readonly list = computed(() => {
    const board = this.board();
    const threads = this.threads().filter((t) => this.showResolved() || !t.resolvedAt);
    return [...threads]
      .sort((a, b) => Number(!!a.resolvedAt) - Number(!!b.resolvedAt))
      .map((t) => {
        const last = t.comments.at(-1);
        return {
          id: t.id,
          nodeId: t.nodeId,
          label: nodeLabel(board, t.nodeId),
          resolved: !!t.resolvedAt,
          count: t.comments.length,
          last: last ? `${last.author.name}: ${plainMentions(last.body)}` : '',
        };
      });
  });
  protected readonly resolvedCount = computed(() => this.threads().filter((t) => t.resolvedAt).length);

  protected readonly problem = signal<string | null>(null);
  protected readonly busy = signal(false);

  // ── Mentions ──

  /** Everyone in the board's workspace, and whether each can open the board (for those who can comment here). */
  protected readonly members = resource({
    params: () => (this.canComment() ? this.boardId() : undefined),
    loader: ({ params: id }) => this.#api.invoke(boardsControllerMembers, { id }),
  });
  readonly #members = computed(() => (this.members.hasValue() ? this.members.value() : []));
  /** Who @ offers: people who can open the board, but not you (nor share-link guests, who aren't members). */
  protected readonly triggers = computed<MentionPickerTrigger[]>(() => [
    {
      char: '@',
      label: 'People on this board',
      noun: ['person', 'people'],
      emptyText: 'Nobody on this board by that name',
      groups: [
        {
          id: 'people',
          label: 'People on this board',
          items: this.#members()
            .filter((m) => m.role && m.userId !== this.me()?.id)
            .map((m) => ({ id: m.userId, label: m.name, avatar: true, ...(m.email ? { hint: m.email, keywords: m.email } : {}) })),
        },
      ],
    },
  ]);
  /** Trench Coat's reply field, which the picker attaches to. */
  protected readonly replyField = signal<HTMLInputElement | null>(null);
  /** What's in the reply field, and the people picked into it so far, in order. */
  protected readonly draft = signal('');
  #picks: MentionPerson[] = [];
  /** People the draft names who can't open the board: said under the field, as they won't be told. */
  protected readonly unreachable = computed(() => {
    const names = shutOut(this.draft(), this.#members()).map((p) => p.name);
    if (names.length === 0) return '';
    const who = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
    return `${who} can't open this board, so ${names.length === 1 ? 'won’t' : 'they won’t'} be told. Share the board with them first if they should see it.`;
  });
  /** The names to highlight in the thread: those picked in its comments, and everyone who can open the board. */
  readonly #mentionNames = computed(() => {
    const names = new Set(this.thread()?.comments.flatMap((c) => pickedNames(c.body)) ?? []);
    for (const m of this.#members()) {
      if (!m.role) continue;
      names.add(m.name);
      names.add(m.name.split(/\s+/)[0]);
    }
    return [...names];
  });

  constructor() {
    // A different thread starts a fresh draft.
    effect(() => {
      this.nodeId();
      this.#picks = [];
      this.draft.set('');
    });
    const onInput = (e: Event) => this.draft.set((e.target as HTMLInputElement).value);
    const host = this.#host.nativeElement;
    // Trench Coat renders the thread after Angular does: watch for its reply field, and repaint the mentions in what
    // it shows each time it renders again.
    const look = () => {
      const field = host.querySelector<HTMLInputElement>('tc-comment-thread .ui-ct__input');
      const was = untracked(this.replyField);
      if (field !== was) {
        was?.removeEventListener('input', onInput);
        field?.addEventListener('input', onInput);
        this.replyField.set(field);
      }
      paintMentions(host, untracked(this.#mentionNames));
    };
    const observer = new MutationObserver(look);
    afterNextRender(() => {
      observer.observe(host, { childList: true, subtree: true, characterData: true });
      look();
    });
    effect(() => {
      this.#mentionNames();
      untracked(look);
    });
    inject(DestroyRef).onDestroy(() => {
      observer.disconnect();
      this.replyField()?.removeEventListener('input', onInput);
      unpaintMentions();
    });
  }

  protected onPick(e: CustomEvent<MentionPickerPick>): void {
    this.#picks.push({ id: e.detail.item.id, name: e.detail.item.label });
  }

  /** Replies go to the server; the thread shows them once they're back, with everyone else's. */
  protected readonly onReply = (text: string): Promise<void> => this.#post(text);

  protected onMessages(e: Event): void {
    // The server's list is the source of truth: don't show a reply until it's saved.
    e.preventDefault();
  }

  protected async setResolved(resolved: boolean): Promise<void> {
    const thread = this.thread();
    if (!thread) return;
    this.busy.set(true);
    this.problem.set(null);
    try {
      await this.#api.invoke(commentsControllerResolve, { id: this.boardId(), threadId: thread.id, body: { resolved } });
      this.changed.emit();
    } catch (err) {
      this.problem.set(messageOf(err));
    } finally {
      this.busy.set(false);
    }
  }

  async #post(text: string): Promise<void> {
    const nodeId = this.nodeId();
    if (!nodeId || !text.trim()) return;
    this.problem.set(null);
    try {
      const anchor = this.target()?.nodeId === nodeId ? this.target()?.anchor : undefined;
      const body = writeMentions(text, this.#picks);
      await this.#api.invoke(commentsControllerAdd, { id: this.boardId(), body: { nodeId, body, ...(anchor && !this.thread() ? { anchor } : {}) } });
      this.#picks = [];
      this.draft.set('');
      this.changed.emit();
    } catch (err) {
      this.problem.set(messageOf(err));
      throw err;
    }
  }
}

function messageOf(err: unknown): string {
  const message = err instanceof HttpErrorResponse ? (err.error as { message?: unknown } | null)?.message : undefined;
  return typeof message === 'string' ? message : "That didn't save. Try again.";
}
