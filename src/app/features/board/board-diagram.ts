import { Component, computed, effect, input, output, signal, untracked } from '@angular/core';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import type { BoardDoc } from './board-doc';
import { DiagramView } from './diagram-view';

/**
 * A diagram's text, beside the board: write Mermaid on the left of a live preview, then save it to the board as one
 * undoable change. Closing without saving leaves the diagram as it was.
 */
@Component({
  selector: 'app-board-diagram',
  imports: [Button, DiagramView],
  template: `
    <aside class="panel" aria-labelledby="diagram-heading">
      <div class="head">
        <h2 id="diagram-heading">Diagram</h2>
        <tc-button size="sm" variant="ghost" label="Close" (click)="closed.emit()"></tc-button>
      </div>
      <textarea
        class="source"
        spellcheck="false"
        aria-label="Diagram text, in Mermaid"
        aria-describedby="diagram-help"
        [value]="draft()"
        (input)="type($any($event.target).value)"
        (keydown.meta.enter)="save()"
        (keydown.control.enter)="save()"
      ></textarea>
      <p id="diagram-help" class="help">
        Flowchart: <code>A[Idea] --&gt; B{{ '{' }}Decide{{ '}' }}</code>. Sequence: <code>Ada-&gt;&gt;Grace: Ask</code>.
        <a href="https://mermaid.js.org/syntax/flowchart.html" target="_blank" rel="noopener noreferrer">Mermaid's guide</a>
      </p>
      <div class="preview" aria-label="Preview">
        <app-diagram-view [source]="shown()" label="Preview of the diagram" />
      </div>
      <div class="actions">
        <span class="grow"></span>
        <tc-button size="sm" variant="primary" label="Save to the board" [disabled]="!changed()" (click)="save()"></tc-button>
      </div>
    </aside>
  `,
  styles: `
    .panel {
      position: absolute;
      top: calc(var(--tc-space-3) + 52px);
      right: var(--tc-space-4);
      z-index: 4;
      display: flex;
      flex-direction: column;
      gap: var(--tc-space-2);
      width: min(420px, calc(100% - 2 * var(--tc-space-4)));
      max-height: calc(100% - 140px);
      padding: var(--tc-space-3);
      border: 1px solid var(--tc-border-subtle);
      border-radius: var(--tc-radius-lg);
      background: var(--tc-surface-raised);
      box-shadow: 0 6px 24px rgb(0 0 0 / 0.1);
      color: var(--tc-text-primary);
    }
    .head,
    .actions {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .grow {
      flex: 1;
    }
    h2 {
      margin: 0;
      font-size: var(--tc-font-size-md);
    }
    .source {
      min-height: 160px;
      padding: var(--tc-space-2);
      border: 1px solid var(--tc-border-default);
      border-radius: var(--tc-radius-md);
      background: var(--tc-surface-sunken, var(--tc-surface-raised));
      color: var(--tc-text-primary);
      font-family: var(--tc-font-mono, ui-monospace, monospace);
      font-size: var(--tc-font-size-sm);
      resize: vertical;
    }
    .help {
      margin: 0;
      color: var(--tc-text-muted);
      font-size: var(--tc-font-size-xs, 0.75rem);
    }
    .preview {
      flex: none;
      height: 240px;
      padding: var(--tc-space-2);
      border-radius: var(--tc-radius-md);
      background: #ffffff;
      color: #1a1a1a;
    }
  `,
})
export class BoardDiagram {
  readonly board = input.required<BoardDoc>();
  readonly diagramId = input.required<string>();
  readonly closed = output<void>();

  /** The diagram as it is on the board. */
  readonly #saved = computed(() => {
    const item = this.board().items().find((i) => i.id === this.diagramId());
    return item?.kind === 'diagram' ? item.source : null;
  });
  protected readonly draft = signal('');
  /** What the preview draws: the draft, a moment after typing stops. */
  protected readonly shown = signal('');
  protected readonly changed = computed(() => this.#saved() !== null && this.draft().trim() !== this.#saved()!.trim());
  #wait?: ReturnType<typeof setTimeout>;

  constructor() {
    // Each diagram opened starts from what's on the board; one taken off the board closes the panel.
    effect(() => {
      const id = this.diagramId();
      const saved = untracked(this.#saved);
      if (saved === null) {
        this.closed.emit();
        return;
      }
      void id;
      this.draft.set(saved);
      this.shown.set(saved);
    });
    effect(() => {
      if (this.#saved() === null) this.closed.emit();
    });
  }

  protected type(text: string): void {
    this.draft.set(text);
    clearTimeout(this.#wait);
    this.#wait = setTimeout(() => this.shown.set(text), 300);
  }

  protected save(): void {
    if (!this.changed()) return;
    this.board().setDiagram(this.diagramId(), this.draft().trim());
    this.shown.set(this.draft());
  }
}
