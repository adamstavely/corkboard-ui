import { HttpErrorResponse } from '@angular/common/http';
import { computed, signal } from '@angular/core';
import type { SidePaneMessage } from '@adamstavely/trenchcoat/ai-side-pane';
import type { PromptStarter } from '@adamstavely/trenchcoat/prompt-starters';
import type { Api } from '../../api/generated/api';
import { assistControllerAssist } from '../../api/generated/fn/assist/assist-controller-assist';
import type { AssistResultDto } from '../../api/generated/models/assist-result-dto';

/** What to ask about a board, before anything has been asked. */
export const ASSISTANT_STARTERS: PromptStarter[] = [
  { id: 'summary', label: 'Summarise the board', text: 'Summarise this board in a few lines.' },
  { id: 'themes', label: 'Group notes into themes', text: 'Group these notes into themes, a frame for each.' },
  { id: 'actions', label: 'Draft action items', text: 'Draft action items with owners from these notes.' },
  { id: 'questions', label: 'Find open questions', text: 'What are the open questions on this board?' },
];

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** What the model did to the board, in a line after its answer. */
export function changesLine(r: AssistResultDto): string {
  const done = [
    r.notesAdded && `added ${plural(r.notesAdded, 'note')}`,
    r.framesAdded && `made ${plural(r.framesAdded, 'frame')}`,
    r.notesMoved && `moved ${plural(r.notesMoved, 'note')} into frames`,
    r.notesChanged && `changed ${plural(r.notesChanged, 'note')}`,
  ].filter(Boolean);
  return done.length ? `On the board: ${done.join(', ')}. Undo it from History.` : '';
}

/**
 * One board's conversation with its assistant, as Trench Coat's side pane shows it: each question goes to the API with
 * the conversation so far and the notes selected, and the model can answer and change the board.
 */
export class AssistantSession {
  readonly #messages = signal<SidePaneMessage[]>([]);
  readonly messages = this.#messages.asReadonly();
  readonly busy = computed(() => this.#messages().some((m) => m.streaming));

  constructor(
    private readonly api: Api,
    private readonly boardId: string,
    /** The workspace model picked, if there is one. */
    private readonly modelId: () => string | undefined,
    /** The notes selected on the board: what a question is about, or the whole board when none are. */
    private readonly selection: () => readonly string[],
  ) {}

  async send(text: string, model = this.modelId()): Promise<void> {
    const question = text.trim();
    if (!question) return;
    const history = this.#messages()
      .filter((m) => !m.error && !m.streaming && m.text)
      .map((m) => ({ role: m.role, text: m.text }));
    const noteIds = [...this.selection()];
    const answerId = crypto.randomUUID();
    this.#messages.update((list) => [
      ...list,
      { id: crypto.randomUUID(), role: 'user', text: question, ...(noteIds.length ? { context: plural(noteIds.length, 'selected note') } : {}) },
      { id: answerId, role: 'assistant', text: '', streaming: true },
    ]);
    if (!model) {
      this.#answer(answerId, { error: 'Connect a model under AI models first.' });
      return;
    }
    try {
      const r = await this.api.invoke(assistControllerAssist, { id: this.boardId, body: { instruction: question, modelId: model, history, ...(noteIds.length ? { noteIds } : {}) } });
      this.#answer(answerId, { text: [r.reply, changesLine(r)].filter(Boolean).join('\n\n') });
    } catch (err) {
      const message = err instanceof HttpErrorResponse ? (err.error as { message?: unknown } | null)?.message : undefined;
      this.#answer(answerId, { error: typeof message === 'string' ? message : "The assistant couldn't answer. Try again." });
    }
  }

  /** Asks the question behind an answer again, in its place. */
  async regenerate(answerId: string): Promise<void> {
    const list = this.#messages();
    const at = list.findIndex((m) => m.id === answerId);
    const question = list.slice(0, at).reverse().find((m) => m.role === 'user');
    if (at < 0 || !question) return;
    this.#messages.set(list.slice(0, list.indexOf(question)));
    await this.send(question.text);
  }

  clear(): void {
    this.#messages.set([]);
  }

  #answer(id: string, change: Partial<SidePaneMessage>): void {
    this.#messages.update((list) => list.map((m) => (m.id === id ? { ...m, ...change, streaming: false } : m)));
  }
}
