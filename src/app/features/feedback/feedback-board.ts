import { feedbackControllerSeen } from '../../api/generated/fn/feedback/feedback-controller-seen';
import { FrameLooks } from '../board/participation';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, effect, inject, input, resource, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { CommentThread } from '@adamstavely/trenchcoat/angular/comment-thread';
import type { ThreadMessage } from '@adamstavely/trenchcoat/comment-thread';
import { Skeleton } from '@adamstavely/trenchcoat/angular/shimmer-loader';
import { Api } from '../../api/generated/api';
import { feedbackControllerAddNote } from '../../api/generated/fn/feedback/feedback-controller-add-note';
import { feedbackControllerComment } from '../../api/generated/fn/feedback/feedback-controller-comment';
import { feedbackControllerComments } from '../../api/generated/fn/feedback/feedback-controller-comments';
import { feedbackControllerEditNote } from '../../api/generated/fn/feedback/feedback-controller-edit-note';
import { feedbackControllerJoin } from '../../api/generated/fn/feedback/feedback-controller-join';
import { feedbackControllerReact } from '../../api/generated/fn/feedback/feedback-controller-react';
import { feedbackControllerRemoveNote } from '../../api/generated/fn/feedback/feedback-controller-remove-note';
import { feedbackControllerVote } from '../../api/generated/fn/feedback/feedback-controller-vote';
import { Session } from '../../core/session';
import { Auth } from '../../core/auth';
import { Icon } from '../../shared/icon';
import { BoardConnection } from '../board/board-connection';
import { BoardDoc, NOTE_COLORS, NOTE_SIZE, type NoteColor } from '../board/board-doc';
import { BoardFacilitation } from '../board/board-facilitation';
import { Canvas } from '../board/canvas';
import { FacilitationFeed, noteVotes } from '../board/facilitation';
import { colorFor } from '../board/presence';
import { ReactionsFeed, reactionsFor } from '../board/reactions';
import { noteLines } from '../board/tasks';

/** What each choice means to a participant, said on their page. */
const SEEN: Record<string, string> = {
  names: 'Other participants see your feedback with your name. The team sees everything.',
  anonymous: 'Other participants see your feedback but not your name. The team sees who wrote what.',
  own: "Other participants don't see your feedback, and you don't see theirs. The team sees everything.",
};

/**
 * A board opened from its feedback link by someone outside the team. They see the server's projection of it (see
 * corkboard-api's collab/projection.ts): read-only, with nobody's identity in it but what the board allows. What they
 * add (notes, comments, reactions, votes, poll answers) goes through the API, which records who they really are.
 */
@Component({
  selector: 'app-feedback-board',
  imports: [Canvas, BoardFacilitation, CommentThread, Button, Skeleton, Icon],
  templateUrl: './feedback-board.html',
  styleUrl: './feedback-board.css',
})
export class FeedbackBoard {
  readonly #api = inject(Api);
  readonly #router = inject(Router);
  readonly #session = inject(Session);
  readonly #auth = inject(Auth);

  /** From the route. */
  readonly token = input.required<string>();

  protected readonly joined = resource({ params: () => this.token(), loader: ({ params }) => this.#api.invoke(feedbackControllerJoin, { token: params }) });
  protected readonly board = signal<BoardDoc | undefined>(undefined);
  protected readonly connection = signal<BoardConnection | undefined>(undefined);
  protected readonly facilitation = signal<FacilitationFeed | undefined>(undefined);
  protected readonly reactionsFeed = signal<ReactionsFeed | undefined>(undefined);
  protected readonly fstate = computed(() => this.facilitation()?.state());

  protected readonly boardId = computed(() => (this.joined.hasValue() ? this.joined.value().boardId : ''));
  protected readonly title = computed(() => (this.joined.hasValue() ? this.joined.value().title : 'Feedback'));
  /** The key their own notes and votes carry on their view of the board ("p4"). */
  protected readonly myKey = computed(() => (this.joined.hasValue() && this.joined.value().you ? `p${this.joined.value().you!.pseudonym}` : ''));
  protected readonly visibility = computed(() => {
    const live = this.board()?.doc.getMap('you').get('visibility');
    this.#tick();
    return typeof live === 'string' ? live : this.joined.hasValue() ? this.joined.value().visibility : 'anonymous';
  });
  protected readonly seen = computed(() => SEEN[this.visibility()] ?? '');
  readonly #tick = signal(0);

  protected readonly problem = computed(() => {
    const err = this.joined.error();
    if (err instanceof HttpErrorResponse) {
      if (err.status === 410) return 'This board is no longer open for feedback.';
      if (err.status === 403) return 'The team has stopped you giving feedback on this board.';
      return "This link doesn't open a board.";
    }
    return this.connection()?.status() === 'denied' ? 'This board is no longer open for feedback.' : '';
  });
  protected readonly statusText = computed(() => (this.connection()?.status() === 'offline' ? 'Reconnecting…' : 'Live'));

  // ── Votes and reactions, under their key ──
  protected readonly noteVotes = computed(() => {
    const s = this.fstate();
    return s && this.myKey() ? noteVotes(s.voting, s.votes, this.myKey()) : new Map();
  });
  protected readonly votesLeft = computed(() => {
    const s = this.fstate();
    return s ? Math.max(0, s.voting.votesEach - (s.votes.get(this.myKey())?.length ?? 0)) : 0;
  });
  protected readonly reactions = computed(() => {
    const all = this.reactionsFeed()?.all();
    return all && this.myKey() ? reactionsFor(all, this.myKey()) : new Map();
  });

  // ── Their own notes ──
  protected readonly selection = signal<readonly string[]>([]);
  /** The one note selected, when it's theirs. */
  protected readonly ownSelected = computed(() => {
    const [id, more] = this.selection();
    if (!id || more) return null;
    const note = this.board()?.notes().find((n) => n.id === id);
    return note && note.by === this.myKey() ? note : null;
  });
  protected readonly colors = NOTE_COLORS;
  /** The note being written: a new one, or one of theirs being changed. */
  protected readonly composing = signal<{ id: string | null; text: string; color: NoteColor } | null>(null);
  protected readonly busy = signal(false);
  protected readonly actionProblem = signal('');

  // ── Comments ──
  protected readonly commentsOn = signal<string | null>(null);
  protected readonly comments = resource({
    params: () => (this.boardId() ? { id: this.boardId(), changed: this.connection()?.commentsChanged() ?? 0 } : undefined),
    loader: ({ params }) => this.#api.invoke(feedbackControllerComments, { id: params.id }),
  });
  protected readonly commentCounts = computed(() => new Map((this.comments.hasValue() ? this.comments.value() : []).map((t) => [t.nodeId, t.comments.length])));
  protected readonly messages = computed<ThreadMessage[]>(() => {
    const thread = (this.comments.hasValue() ? this.comments.value() : []).find((t) => t.nodeId === this.commentsOn());
    return (thread?.comments ?? []).map((c) => ({ id: c.id, author: { name: c.by }, createdAt: new Date(c.createdAt), text: c.body }));
  });
  protected readonly onReply = async (text: string): Promise<void> => {
    const nodeId = this.commentsOn();
    if (!nodeId || !text.trim()) return;
    await this.#act(() => this.#api.invoke(feedbackControllerComment, { id: this.boardId(), body: { nodeId, body: text } }));
    this.comments.reload();
  };

  /** The frames this participant looks at: only ever counted, for the facilitator. */
  #frameLooks: FrameLooks | undefined;

  protected onFramesInView(frameIds: readonly string[]): void {
    this.#frameLooks?.inView(frameIds);
  }

  constructor() {
    effect((onCleanup) => {
      if (!this.joined.hasValue()) return;
      const joined = this.joined.value();
      // Someone in the board's workspace opens the board as themselves.
      if (joined.member) {
        void this.#router.navigate(['/boards', joined.boardId], { replaceUrl: true });
        return;
      }
      const me = this.#session.me.hasValue() ? this.#session.me.value() : undefined;
      if (!me || !joined.you) return;
      const you = joined.you;
      untracked(() => {
        const board = new BoardDoc();
        board.canChangeLocked = false;
        const name = joined.visibility === 'names' ? you.name : `Participant ${you.pseudonym}`;
        const connection = new BoardConnection(`${joined.boardId}~p~${me.id}`, board, () => this.#auth.token() ?? '', { id: `p${you.pseudonym}`, name, color: colorFor(me.id) }, { keepLocal: false });
        const facilitation = new FacilitationFeed(board.doc);
        const reactions = new ReactionsFeed(board.doc);
        const you$ = board.doc.getMap('you');
        const bump = () => this.#tick.update((n) => n + 1);
        you$.observe(bump);
        const looks = new FrameLooks((frameIds) => this.#api.invoke(feedbackControllerSeen, { id: joined.boardId, body: { frameIds } }));
        this.#frameLooks = looks;
        this.board.set(board);
        this.connection.set(connection);
        this.facilitation.set(facilitation);
        this.reactionsFeed.set(reactions);
        onCleanup(() => {
          you$.unobserve(bump);
          looks.destroy();
          this.#frameLooks = undefined;
          this.board.set(undefined);
          this.connection.set(undefined);
          this.facilitation.set(undefined);
          this.reactionsFeed.set(undefined);
          facilitation.destroy();
          reactions.destroy();
          connection.destroy();
          board.destroy();
        });
      });
    });
  }

  protected newNote(): void {
    this.actionProblem.set('');
    this.composing.set({ id: null, text: '', color: 'yellow' });
  }

  protected editOwn(): void {
    const note = this.ownSelected();
    if (!note) return;
    this.composing.set({ id: note.id, text: noteLines(note.text).map((l) => l.text).join('\n'), color: note.color });
  }

  protected async saveNote(canvas: Canvas): Promise<void> {
    const draft = this.composing();
    if (!draft || !draft.text.trim()) return;
    const ok = await this.#act(async () => {
      if (draft.id) {
        await this.#api.invoke(feedbackControllerEditNote, { id: this.boardId(), noteId: draft.id, body: { text: draft.text.trim(), color: draft.color } });
      } else {
        const at = canvas.viewCentre();
        await this.#api.invoke(feedbackControllerAddNote, {
          id: this.boardId(),
          body: { text: draft.text.trim(), color: draft.color, x: Math.round(at.x - NOTE_SIZE.w / 2), y: Math.round(at.y - NOTE_SIZE.h / 2) },
        });
      }
    });
    if (ok) this.composing.set(null);
  }

  protected async removeOwn(): Promise<void> {
    const note = this.ownSelected();
    if (note) await this.#act(() => this.#api.invoke(feedbackControllerRemoveNote, { id: this.boardId(), noteId: note.id }));
  }

  protected async onReact(nodeId: string, emoji: string, on: boolean): Promise<void> {
    await this.#act(() => this.#api.invoke(feedbackControllerReact, { id: this.boardId(), body: { nodeId, emoji: emoji as never, on } }));
  }

  protected async onVote(noteId: string, add: boolean): Promise<void> {
    await this.#act(() => this.#api.invoke(feedbackControllerVote, { id: this.boardId(), body: { noteId, add } }));
  }

  async #act(call: () => Promise<unknown>): Promise<boolean> {
    this.busy.set(true);
    this.actionProblem.set('');
    try {
      await call();
      return true;
    } catch (err) {
      const message = err instanceof HttpErrorResponse ? (err.error as { message?: unknown } | null)?.message : undefined;
      this.actionProblem.set(typeof message === 'string' ? message : "That didn't work. Try again.");
      return false;
    } finally {
      this.busy.set(false);
    }
  }
}
