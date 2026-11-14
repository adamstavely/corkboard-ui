import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, input, output, signal } from '@angular/core';
import { AiSummary } from '@adamstavely/trenchcoat/angular/ai-summary';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import type { AiSummaryAsk, AiSummaryCiteOpen, AiSummaryLength, AiSummaryLengthChange, AiSummarySource, AiSummaryStatus } from '@adamstavely/trenchcoat/ai-summary';
import { Api } from '../../api/generated/api';
import { summaryControllerSummarise } from '../../api/generated/fn/summary/summary-controller-summarise';
import type { BoardDoc } from './board-doc';
import { plainText } from './comments';
import { modelChoice } from './model-choice';
import { isStale, type SummaryFeed } from './summary';

const SOURCE_CHARS = 60;

/**
 * The board's summary: a TL;DR, key points citing their notes, and questions to ask next, written by one of the
 * workspace's models and kept in the board for everyone. Follow-up questions go to the board chat.
 */
@Component({
  selector: 'app-board-summary',
  imports: [AiSummary, Button],
  template: `
    <aside class="panel" aria-label="Summary">
      <div class="head">
        <span class="note">{{ note() }}</span>
        <tc-button size="sm" variant="secondary" label="Close" (click)="closed.emit()"></tc-button>
      </div>
      <tc-ai-summary
        heading="Board summary"
        [subject]="boardTitle()"
        [sources]="sources()"
        [status]="status()"
        [tldr]="summary()?.tldr ?? ''"
        [summary]="summary()?.summary ?? ''"
        [points]="summary()?.points ?? []"
        [questions]="summary()?.questions ?? []"
        [length]="length()"
        [model]="summary()?.model ?? modelName()"
        [generatedAt]="summary()?.at"
        [stale]="stale()"
        (tc-summarise)="summarise()"
        (tc-retry)="summarise()"
        (tc-length-change)="onLength($event)"
        (tc-cite-open)="onCite($event)"
        (tc-ask)="onAsk($event)"
      ></tc-ai-summary>
    </aside>
  `,
  styles: `
    .panel {
      position: absolute;
      top: calc(var(--tc-space-3) + 52px);
      right: var(--tc-space-4);
      bottom: calc(var(--tc-space-4) + 56px);
      z-index: 3;
      display: flex;
      flex-direction: column;
      gap: var(--tc-space-2);
      width: min(520px, calc(100% - 2 * var(--tc-space-4)));
      overflow: auto;
    }
    .head {
      display: flex;
      align-items: center;
      gap: var(--tc-space-2);
    }
    .note {
      flex: 1;
      color: var(--tc-text-muted);
      font-size: var(--tc-font-size-sm);
    }
  `,
})
export class BoardSummary {
  readonly #api = inject(Api);

  readonly boardId = input.required<string>();
  readonly orgId = input.required<string>();
  readonly boardTitle = input('');
  readonly board = input.required<BoardDoc>();
  readonly feed = input.required<SummaryFeed>();
  /** Readers can read the summary; commenters and up can have it written. */
  readonly canWrite = input(false);
  readonly closed = output<void>();
  /** Find a cited note on the board. */
  readonly show = output<readonly string[]>();
  /** A follow-up question, for the board chat. */
  readonly ask = output<string>();

  readonly #choice = modelChoice(this.#api, () => this.orgId());
  protected readonly modelName = this.#choice.name;

  protected readonly summary = computed(() => this.feed().summary());
  readonly #working = signal(false);
  readonly #failed = signal('');
  protected readonly length = signal<AiSummaryLength>('short');

  protected readonly status = computed<AiSummaryStatus>(() => (this.#working() ? 'summarising' : this.#failed() ? 'error' : this.summary() ? 'done' : 'idle'));
  protected readonly stale = computed(() => {
    const s = this.summary();
    return !!s && isStale(s, this.board());
  });
  /** The notes, as sources its points cite. */
  protected readonly sources = computed<AiSummarySource[]>(() =>
    this.board()
      .notes()
      .map((n) => ({ id: n.id, label: plainText(n.text).slice(0, SOURCE_CHARS) || 'Empty note', kind: 'other' as const })),
  );
  protected readonly note = computed(() => {
    if (this.#failed()) return this.#failed();
    if (!this.#choice.options().length && this.#choice.models.hasValue()) return 'Connect an AI model under AI models to summarise boards.';
    if (!this.canWrite()) return 'Commenters and up can have the summary written.';
    const s = this.summary();
    return s ? `By ${s.model}, asked by ${s.by}. Everyone on the board sees this summary.` : 'Everyone on the board sees the summary once it is written.';
  });

  protected async summarise(): Promise<void> {
    const modelId = this.#choice.modelId();
    if (!modelId || !this.canWrite() || this.#working()) return;
    this.#working.set(true);
    this.#failed.set('');
    try {
      await this.#api.invoke(summaryControllerSummarise, { id: this.boardId(), body: { modelId, length: this.length() } });
    } catch (err) {
      const message = err instanceof HttpErrorResponse ? (err.error as { message?: unknown } | null)?.message : undefined;
      this.#failed.set(typeof message === 'string' ? message : "The summary couldn't be written. Try again.");
    } finally {
      this.#working.set(false);
    }
  }

  protected onLength(e: CustomEvent<AiSummaryLengthChange>): void {
    this.length.set(e.detail.length);
    if (this.summary()) void this.summarise();
  }

  protected onCite(e: CustomEvent<AiSummaryCiteOpen>): void {
    e.preventDefault();
    this.show.emit([e.detail.sourceId]);
  }

  protected onAsk(e: CustomEvent<AiSummaryAsk>): void {
    e.preventDefault();
    this.ask.emit(e.detail.question);
  }
}
