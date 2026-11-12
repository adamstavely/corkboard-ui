import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, input, output, signal } from '@angular/core';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { CommentThread } from '@adamstavely/trenchcoat/angular/comment-thread';
import type { ThreadMessage } from '@adamstavely/trenchcoat/comment-thread';
import { Api } from '../../api/generated/api';
import { commentsControllerAdd } from '../../api/generated/fn/comments/comments-controller-add';
import { commentsControllerResolve } from '../../api/generated/fn/comments/comments-controller-resolve';
import type { CommentThreadDto } from '../../api/generated/models/comment-thread-dto';
import type { BoardDoc } from './board-doc';
import { messagesOf, nodeLabel } from './comments';

/**
 * The board's comments. With one note or frame selected, its thread, in Trench Coat's comment thread, to read, reply
 * to and resolve; otherwise every thread, open ones first, each a way to that note or frame.
 */
@Component({
  selector: 'app-board-comments',
  imports: [CommentThread, Button],
  templateUrl: './board-comments.html',
  styleUrl: './board-comments.css',
})
export class BoardComments {
  readonly #api = inject(Api);

  readonly boardId = input.required<string>();
  readonly board = input.required<BoardDoc>();
  readonly threads = input.required<readonly CommentThreadDto[]>();
  /** What's selected on the canvas: notes and frames. */
  readonly selection = input<readonly string[]>([]);
  readonly canComment = input(false);
  readonly me = input<{ id: string; name: string } | undefined>(undefined);
  readonly closed = output<void>();
  /** Bring this note or frame into view and select it. */
  readonly show = output<string>();
  /** Comments changed here; fetch them again. */
  readonly changed = output<void>();

  /** The one note or frame selected, whose thread shows. */
  protected readonly nodeId = computed(() => {
    const selected = this.selection();
    return selected.length === 1 ? selected[0] : null;
  });
  protected readonly thread = computed(() => this.threads().find((t) => t.nodeId === this.nodeId()));
  protected readonly threadKey = computed(() => this.thread()?.id ?? `new:${this.nodeId()}`);
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
        return { id: t.id, nodeId: t.nodeId, label: nodeLabel(board, t.nodeId), resolved: !!t.resolvedAt, count: t.comments.length, last: last ? `${last.author.name}: ${last.body}` : '' };
      });
  });
  protected readonly resolvedCount = computed(() => this.threads().filter((t) => t.resolvedAt).length);

  protected readonly problem = signal<string | null>(null);
  protected readonly busy = signal(false);

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
      await this.#api.invoke(commentsControllerAdd, { id: this.boardId(), body: { nodeId, body: text } });
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
