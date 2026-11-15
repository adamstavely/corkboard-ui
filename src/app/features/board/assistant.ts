import { HttpErrorResponse } from '@angular/common/http';
import { computed, signal } from '@angular/core';
import type { AnswerSource } from '@adamstavely/trenchcoat/ai-answer';
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

/** What the model did to the board (or suggested doing), in a line after its answer. */
export function changesLine(r: AssistResultDto): string {
  const done = [
    r.notesAdded && `added ${plural(r.notesAdded, 'note')}`,
    r.framesAdded && `made ${plural(r.framesAdded, 'frame')}`,
    r.notesMoved && `moved ${plural(r.notesMoved, 'note')} into frames`,
    r.notesChanged && `changed ${plural(r.notesChanged, 'note')}`,
  ].filter(Boolean);
  if (!done.length) return '';
  return r.suggestionId ? `Suggested, not made yet: ${done.join(', ')}. Accept it or turn it down under Suggestions.` : `On the board: ${done.join(', ')}. Undo it from History.`;
}

/** What kind of file a name is, for its citation chip: "PDF", "Word", "Markdown"… */
export function fileKind(name: string): string {
  const ext = name.toLowerCase().match(/\.(\w+)$/)?.[1] ?? '';
  return { pdf: 'PDF', docx: 'Word', md: 'Markdown', markdown: 'Markdown', csv: 'CSV', txt: 'Text' }[ext] ?? 'File';
}

/** The board's files an answer drew on, as citation chips, each opening its file when the page can fetch it. */
export async function fileSources(files: readonly { fileId: string; name: string }[], urlOf: (fileId: string) => Promise<string | undefined>): Promise<AnswerSource[]> {
  return Promise.all(
    files.map(async (f) => {
      const href = await urlOf(f.fileId);
      return { title: f.name, name: fileKind(f.name), ...(href ? { href } : {}) };
    }),
  );
}

/** "news.example" – a page's site, for its citation chip. */
export function siteOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** The web pages an answer read, as citation chips that open them. */
export function pageSources(pages: readonly { url: string; title: string }[]): AnswerSource[] {
  return pages.map((p) => ({ title: p.title || siteOf(p.url), name: siteOf(p.url), href: p.url }));
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
    /** Fetches a file of the board's for the page, to link the files an answer cites. */
    private readonly fileUrl: (fileId: string) => Promise<string | undefined> = () => Promise.resolve(undefined),
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
      const sources = [...(await fileSources(r.citedFiles ?? [], this.fileUrl)), ...pageSources(r.citedPages ?? [])];
      this.#answer(answerId, { text: [r.reply, changesLine(r)].filter(Boolean).join('\n\n'), ...(sources.length ? { sources } : {}) });
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
