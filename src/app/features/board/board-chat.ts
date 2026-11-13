import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, effect, inject, input, output, resource, signal, untracked } from '@angular/core';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { MultiplayerThread } from '@adamstavely/trenchcoat/angular/multiplayer-thread';
import { Select } from '@adamstavely/trenchcoat/angular/select';
import type { MultiplayerMode, MultiplayerSend } from '@adamstavely/trenchcoat/multiplayer-thread';
import { Router } from '@angular/router';
import { Api } from '../../api/generated/api';
import { Session } from '../../core/session';
import { chatControllerSend } from '../../api/generated/fn/chat/chat-controller-send';
import { providersControllerList } from '../../api/generated/fn/models/providers-controller-list';
import { MODEL_AUTHOR, scopeLine, threadItems, threadPeople, type ChatMessage } from './chat';

const MODEL_KEY = 'corkboard.model';
const MODE_KEY = 'corkboard.chat-mode';
/** Typing stops showing this long after the last keystroke. */
const TYPING_MS = 4000;

/** For people who can't change the board: questions only. */
const QUESTIONS = ['Summarise this', 'What are the open questions?', 'Who owns what?'];
const SUGGESTIONS = ['Group this retro by theme', 'Draft action items with owners', 'Turn this plan into a timeline', 'Score these by value and effort', 'Summarise this'];

function stored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function store(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Blocked storage: the choice lasts for this page only.
  }
}

/**
 * The board's chat, shared by everyone on it: Trench Coat's multiplayer thread, with the workspace's model in it. The
 * model answers when someone mentions it (or every message, for whoever switches that on), about the board or their
 * selection, and what it changes lands on the board for everyone.
 */
@Component({
  selector: 'app-board-chat',
  imports: [MultiplayerThread, Select, Button],
  templateUrl: './board-chat.html',
  styleUrl: './board-chat.css',
})
export class BoardChat {
  readonly #api = inject(Api);
  readonly #router = inject(Router);
  readonly #session = inject(Session);

  readonly boardId = input.required<string>();
  readonly orgId = input.required<string>();
  /** The chat so far, live from the board's document. */
  readonly messages = input<readonly ChatMessage[]>([]);
  readonly me = input.required<{ id: string; name: string }>();
  /** Everyone else on the board now, and who of them is writing. */
  readonly here = input<readonly { id: string; name: string; typing: boolean }[]>([]);
  /** Whether the model is answering someone. */
  readonly answering = input(false);
  /** The notes selected on the canvas, with those in selected frames; empty for the whole board. */
  readonly selection = input<readonly string[]>([]);
  /** Titles of the selected frames, to name the region being asked about. */
  readonly frames = input<readonly string[]>([]);
  /** Whether they may change the board, and whether they may post at all (readers only read). */
  readonly canEdit = input(true);
  readonly canPost = input(true);
  /** A request from elsewhere on the page to ask the model; each new `n` is sent once. */
  readonly request = input<{ text: string; n: number } | null>(null);
  /** Workspace owners can connect a model when there's none. */
  readonly isOwner = input(false);
  readonly closed = output<void>();
  /** Whether this person is writing a message, for everyone else's typing dots. */
  readonly typingChange = output<boolean>();
  /** Show these notes on the board: the ones the last answer is about. */
  readonly show = output<readonly string[]>();
  /** Write the last answer as a note beside the notes it was about. */
  readonly pin = output<{ text: string; near: readonly string[] }>();

  protected readonly models = resource({
    params: () => this.orgId(),
    loader: ({ params: orgId }) => this.#api.invoke(providersControllerList, { orgId }),
  });
  protected readonly options = computed(() => (this.models.hasValue() ? this.models.value() : []).map((m) => ({ value: m.id, label: m.label })));

  readonly #chosen = signal<string | null>(stored(MODEL_KEY));
  /** The model picked last in this browser, if it's still there; otherwise the workspace's first. */
  protected readonly modelId = computed<string | undefined>(() => {
    const options = this.options();
    return options.find((o) => o.value === this.#chosen())?.value ?? options[0]?.value;
  });
  protected readonly model = computed(() => ({ name: this.options().find((o) => o.value === this.modelId())?.label ?? 'Assistant' }));

  protected readonly mode = signal<MultiplayerMode>(stored(MODE_KEY) === 'every' ? 'every' : 'mentions');

  protected readonly items = computed(() => threadItems(this.messages()));
  protected readonly people = computed(() => threadPeople([this.me(), ...this.here()], this.messages()));
  protected readonly present = computed(() => [this.me().id, ...this.here().map((p) => p.id), ...(this.modelId() ? [MODEL_AUTHOR] : [])]);
  protected readonly typing = computed(() => [...this.here().filter((p) => p.typing).map((p) => p.id), ...(this.answering() ? [MODEL_AUTHOR] : [])]);

  protected readonly suggestions = computed(() => (this.canEdit() ? SUGGESTIONS : QUESTIONS));
  protected readonly scope = computed(() => scopeLine(this.selection().length, this.frames()));

  /** The model's latest answer to this person, for finding its notes or keeping it on the board. */
  protected readonly last = computed(() => {
    const me = this.me().id;
    const answer = [...this.messages()].reverse().find((m) => m.authorId === MODEL_AUTHOR && m.replyTo === me);
    return answer && !answer.failed ? { reply: answer.text, cited: answer.cited ?? [], asked: answer.asked ?? [] } : null;
  });

  protected readonly problem = signal('');

  #typingTimer: ReturnType<typeof setTimeout> | undefined;
  #sent = 0;
  readonly #sendRequests = effect(() => {
    const request = this.request();
    // Once the models are known, so it goes to one.
    if (!request || request.n <= this.#sent || !this.models.hasValue()) return;
    this.#sent = request.n;
    untracked(() => this.ask(request.text));
  });
  readonly #stopTyping = effect((onCleanup) => onCleanup(() => clearTimeout(this.#typingTimer)));

  protected choose(id: string): void {
    this.#chosen.set(id);
    store(MODEL_KEY, id);
  }

  protected openModels(): void {
    // The models page is for the workspace in use; make it this board's.
    this.#session.selectOrg(this.orgId());
    void this.#router.navigateByUrl('/models');
  }

  protected setMode(mode: MultiplayerMode): void {
    this.mode.set(mode);
    store(MODE_KEY, mode);
  }

  protected onInput(): void {
    if (!this.canPost()) return;
    this.typingChange.emit(true);
    clearTimeout(this.#typingTimer);
    this.#typingTimer = setTimeout(() => this.typingChange.emit(false), TYPING_MS);
  }

  protected onSend(e: CustomEvent<MultiplayerSend>): void {
    if (!this.canPost()) {
      // The text stays in the field.
      e.preventDefault();
      this.problem.set('Readers can follow the chat. A commenter, updater or owner can post.');
      return;
    }
    void this.send(e.detail.text, e.detail.modelAnswers);
  }

  /** Asks the model straight away: the quick actions under the chat. */
  protected ask(suggestion: string): void {
    void this.send(`@${this.model().name} ${suggestion}`, true);
  }

  protected async send(text: string, modelAnswers: boolean): Promise<void> {
    clearTimeout(this.#typingTimer);
    this.typingChange.emit(false);
    this.problem.set('');
    const modelId = this.modelId();
    const answer = modelAnswers && !!modelId;
    if (modelAnswers && !modelId) this.problem.set('No AI model is set up for this workspace yet. An owner can add one under AI models.');
    const noteIds = [...this.selection()];
    try {
      await this.#api.invoke(chatControllerSend, {
        id: this.boardId(),
        body: { text, answer, ...(answer ? { modelId } : {}), ...(answer && noteIds.length ? { noteIds } : {}) },
      });
    } catch (err) {
      const message = err instanceof HttpErrorResponse ? (err.error as { message?: unknown } | null)?.message : undefined;
      this.problem.set(typeof message === 'string' ? message : "Your message couldn't be sent. Try again.");
    }
  }
}
