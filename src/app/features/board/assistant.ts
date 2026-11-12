import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, effect, inject, input, output, resource, signal } from '@angular/core';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { Select } from '@adamstavely/trenchcoat/angular/select';
import { WritingAssistant } from '@adamstavely/trenchcoat/angular/writing-assistant';
import type { ChatMessagesChange, WritingAssistantRespond } from '@adamstavely/trenchcoat/writing-assistant';
import { Api } from '../../api/generated/api';
import { assistControllerAssist } from '../../api/generated/fn/assist/assist-controller-assist';
import { providersControllerList } from '../../api/generated/fn/models/providers-controller-list';

const MODEL_KEY = 'corkboard.model';

/** For people who can't change the board: questions only. */
const QUESTIONS = ['Summarise this', 'What are the open questions?', 'Who owns what?'];
const SUGGESTIONS = ['Group this retro by theme', 'Draft action items with owners', 'Turn this plan into a timeline', 'Summarise this'];

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** "Made 3 frames, moved 9 notes into them and added 2 notes." – what the model did on the board, after what it said. */
export function changesLine(result: { notesAdded: number; notesChanged: number; framesAdded: number; notesMoved: number }): string {
  const parts = [
    result.framesAdded ? `made ${plural(result.framesAdded, 'frame')}` : '',
    result.notesMoved ? `moved ${plural(result.notesMoved, 'note')} into ${result.framesAdded === 1 ? 'it' : 'them'}` : '',
    result.notesAdded ? `added ${plural(result.notesAdded, 'note')}` : '',
    result.notesChanged ? `recoloured ${result.notesChanged}` : '',
  ].filter(Boolean);
  if (!parts.length) return '';
  const line = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0];
  return `${line[0].toUpperCase()}${line.slice(1)}.`;
}

/** "About “Risks” (4 notes)" – what the assistant will be asked about. */
export function scopeLine(notes: number, frames: readonly string[]): string {
  const count = `${notes} note${notes === 1 ? '' : 's'}`;
  if (frames.length === 1) return `About “${frames[0]}” (${count})`;
  if (frames.length > 1) return `About ${frames.length} frames (${count})`;
  return notes ? `About the ${count} selected` : 'About the whole board';
}

function storedModel(): string | null {
  try {
    return localStorage.getItem(MODEL_KEY);
  } catch {
    return null;
  }
}

/**
 * Asks one of the workspace's models about the board, or about the selected notes when there are any. What it adds or
 * recolours lands on the board for everyone, through the live document.
 */
@Component({
  selector: 'app-assistant',
  imports: [WritingAssistant, Select, Button],
  templateUrl: './assistant.html',
  styleUrl: './assistant.css',
})
export class Assistant {
  readonly #api = inject(Api);

  readonly boardId = input.required<string>();
  readonly orgId = input.required<string>();
  /** The notes selected on the canvas, with those in selected frames; empty for the whole board. */
  readonly selection = input<readonly string[]>([]);
  /** Titles of the selected frames, to name the region being asked about. */
  readonly frames = input<readonly string[]>([]);
  /** Whether they may change the board; without, the assistant only answers. */
  readonly canEdit = input(true);
  readonly closed = output<void>();
  /** Show these notes on the board: the ones the last answer is about. */
  readonly show = output<readonly string[]>();
  /** Write the last answer as a note beside the notes it was about. */
  readonly pin = output<{ text: string; near: readonly string[] }>();

  /** The last answer, what it pointed to, and what it was asked about; for the actions under the chat. */
  protected readonly last = signal<{ reply: string; cited: string[]; asked: readonly string[] } | null>(null);

  protected readonly models = resource({
    params: () => this.orgId(),
    loader: ({ params: orgId }) => this.#api.invoke(providersControllerList, { orgId }),
  });
  protected readonly options = computed(() => (this.models.hasValue() ? this.models.value() : []).map((m) => ({ value: m.id, label: m.label })));

  readonly #chosen = signal<string | null>(storedModel());
  /** The model picked last in this browser, if it's still there; otherwise the workspace's first. */
  protected readonly modelId = computed<string | undefined>(() => {
    const options = this.options();
    return options.find((o) => o.value === this.#chosen())?.value ?? options[0]?.value;
  });
  protected readonly modelName = computed(() => this.options().find((o) => o.value === this.modelId())?.label ?? 'Assistant');

  protected readonly suggestions = computed(() => (this.canEdit() ? SUGGESTIONS : QUESTIONS));
  protected readonly scope = computed(() => scopeLine(this.selection().length, this.frames()));

  /** The selection when a message is sent, so a reply is about what was selected then. */
  #selectionAtSend: readonly string[] = [];
  readonly #trackSelection = effect(() => (this.#selectionAtSend = this.selection()));

  protected choose(id: string): void {
    this.#chosen.set(id);
    try {
      localStorage.setItem(MODEL_KEY, id);
    } catch {
      // Blocked storage: the choice lasts for this page only.
    }
  }

  protected onMessages(e: CustomEvent<ChatMessagesChange>): void {
    // A new chat starts over.
    if (e.detail.messages.length === 0) this.last.set(null);
  }

  protected readonly respond: WritingAssistantRespond = async (message, { history }) => {
    const modelId = this.modelId();
    if (!modelId) throw new Error('No model is set up for this workspace yet.');
    const noteIds = [...this.#selectionAtSend];
    // The turns before this one, so follow-up questions make sense.
    const earlier = history.slice(0, -1).map((m) => ({ role: m.role, text: m.text }));
    try {
      const result = await this.#api.invoke(assistControllerAssist, {
        id: this.boardId(),
        body: { modelId, instruction: message, ...(noteIds.length ? { noteIds } : {}), ...(earlier.length ? { history: earlier } : {}) },
      });
      this.last.set({ reply: result.reply, cited: result.citedNoteIds, asked: noteIds });
      const changes = changesLine(result);
      return changes ? `${result.reply}\n\n${changes}` : result.reply;
    } catch (err) {
      const text = err instanceof HttpErrorResponse ? (err.error as { message?: unknown } | null)?.message : undefined;
      throw new Error(typeof text === 'string' ? text : `${this.modelName()} couldn't answer. Try again.`);
    }
  };
}
