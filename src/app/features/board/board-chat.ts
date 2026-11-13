import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { MessageActions } from '@adamstavely/trenchcoat/angular/message-actions';
import { MultiplayerThread } from '@adamstavely/trenchcoat/angular/multiplayer-thread';
import { PromptStarters } from '@adamstavely/trenchcoat/angular/prompt-starters';
import type { PromptStarter, PromptStarterIconName } from '@adamstavely/trenchcoat/prompt-starters';
import { ModelPicker } from '@adamstavely/trenchcoat/angular/model-picker';
import type { MultiplayerMode, MultiplayerSend } from '@adamstavely/trenchcoat/multiplayer-thread';
import { Router } from '@angular/router';
import { Api } from '../../api/generated/api';
import { Session } from '../../core/session';
import { chatControllerSend } from '../../api/generated/fn/chat/chat-controller-send';
import { modelChoice } from './model-choice';
import { MODEL_AUTHOR, scopeLine, threadItems, threadPeople, type ChatMessage } from './chat';

const MODE_KEY = 'corkboard.chat-mode';
/** Typing stops showing this long after the last keystroke. */
const TYPING_MS = 4000;

/** For people who can't change the board: questions only. */
const QUESTIONS = ['Summarise this', 'What are the open questions?', 'Who owns what?'];
const STARTER_ICONS: Record<string, PromptStarterIconName> = {
  'Group this retro by theme': 'list',
  'Draft action items with owners': 'write',
  'Turn this plan into a timeline': 'calendar',
  'Score these by value and effort': 'chart',
  'Summarise this': 'document',
  'What are the open questions?': 'question',
  'Who owns what?': 'search',
};
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
  imports: [MultiplayerThread, MessageActions, PromptStarters, ModelPicker, Button],
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

  readonly #choice = modelChoice(this.#api, () => this.orgId());
  protected readonly models = this.#choice.models;
  protected readonly options = this.#choice.options;
  protected readonly modelId = this.#choice.modelId;
  protected readonly pickerModels = this.#choice.pickerModels;
  protected readonly model = computed(() => ({ name: this.#choice.name() }));

  protected readonly mode = signal<MultiplayerMode>(stored(MODE_KEY) === 'every' ? 'every' : 'mentions');

  protected readonly items = computed(() => threadItems(this.messages()));
  protected readonly people = computed(() => threadPeople([this.me(), ...this.here()], this.messages()));
  protected readonly present = computed(() => [this.me().id, ...this.here().map((p) => p.id), ...(this.modelId() ? [MODEL_AUTHOR] : [])]);
  protected readonly typing = computed(() => [...this.here().filter((p) => p.typing).map((p) => p.id), ...(this.answering() ? [MODEL_AUTHOR] : [])]);

  protected readonly starters = computed<PromptStarter[]>(() =>
    (this.canEdit() ? SUGGESTIONS : QUESTIONS).map((text, i) => ({ id: `s${i}`, text, icon: STARTER_ICONS[text] ?? 'sparkle' })),
  );
  protected readonly scope = computed(() => scopeLine(this.selection().length, this.frames()));

  /** The model's latest answer to this person, and the message of theirs it answered, for acting on it. */
  protected readonly last = computed(() => {
    const me = this.me().id;
    const messages = this.messages();
    // Newest first (the app targets ES2022, which has no findLast).
    const newest = [...messages].reverse();
    const answer = newest.find((m) => m.authorId === MODEL_AUTHOR && m.replyTo === me);
    if (!answer || answer.failed) return null;
    const question = newest.slice(newest.indexOf(answer)).find((m) => m.authorId === me);
    return { reply: answer.text, cited: answer.cited ?? [], asked: answer.asked ?? [], question: question?.text };
  });

  /** Asks the last question again; the new answer arrives in the chat. */
  protected readonly regenerate = async (): Promise<void> => {
    const question = this.last()?.question;
    if (question) await this.send(question, true);
  };

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
    this.#choice.choose(id);
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

  protected onStarter(e: Event): void {
    this.ask((e as CustomEvent<{ text: string }>).detail.text);
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
