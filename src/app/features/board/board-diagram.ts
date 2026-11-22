import { Component, computed, effect, input, output, signal, untracked } from '@angular/core';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { Select } from '@adamstavely/trenchcoat/angular/select';
import type { BoardDoc } from './board-doc';
import { diagramKind, MAX_DIAGRAM_CHARS, type DiagramImages } from './diagram';
import { DiagramView } from './diagram-view';

/**
 * A diagram's text, beside the board: write Mermaid on the left of a live preview, then save it to the board as one
 * undoable change. Closing without saving leaves the diagram as it was.
 */
@Component({
  selector: 'app-board-diagram',
  imports: [Button, Select, DiagramView],
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
        [maxLength]="max"
        (input)="type($any($event.target).value)"
        (keydown.meta.enter)="save()"
        (keydown.control.enter)="save()"
      ></textarea>
      <div id="diagram-help" class="help">
        <p>
          Start with the kind: <code>flowchart TD</code>, <code>sequenceDiagram</code>, <code>stateDiagram-v2</code>, <code>classDiagram</code>, <code>erDiagram</code>, <code>gantt</code>,
          <code>pie</code>, <code>journey</code>, <code>timeline</code>, <code>mindmap</code>… Flowchart: <code>A[Idea] --&gt; B{{ '{' }}Decide{{ '}' }}</code
          >.
        </p>
        <p>Link a node to a page: <code>click A href "https://example.com"</code>. It opens in a new tab from the board.</p>
        <p>
          Show a picture in a flowchart (https, or a picture on the board, picked below):
          <code>P@{{ '{' }} img: "https://example.com/logo.png", label: "Logo", w: 60, h: 60 {{ '}' }}</code
          >.
          <a href="https://mermaid.js.org/intro/" target="_blank" rel="noopener noreferrer">Mermaid's guide</a>
        </p>
      </div>
      @if (pictures().length && isFlowchart()) {
        <tc-select
          label="Add a picture from the board"
          [labelVisible]="false"
          placeholder="Add a picture from the board…"
          [options]="pictures()"
          [value]="picked()"
          (tc-value-change)="addPicture($any($event.detail.value))"
        ></tc-select>
      }
      <div class="preview" aria-label="Preview">
        <app-diagram-view [source]="shown()" [images]="images()" label="Preview of the diagram" />
      </div>
      @if (theirs()) {
        <p class="notice" role="status">
          Someone else changed this diagram while you were writing.
          <tc-button size="sm" variant="ghost" label="Use their version" (click)="useTheirs()"></tc-button>
        </p>
      }
      <div class="actions">
        @if (draft().length > max * 0.9) {
          <span class="help" aria-live="polite">{{ draft().length }} of {{ max }} characters</span>
        }
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
    .notice {
      display: flex;
      align-items: center;
      gap: var(--tc-space-2);
      margin: 0;
      font-size: var(--tc-font-size-sm);
    }
    .help p {
      margin: 0 0 var(--tc-space-1);
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
  /** Where the preview gets its pictures (see FileCache). */
  readonly images = input<DiagramImages | undefined>(undefined);
  readonly closed = output<void>();

  /** The diagram as it is on the board. */
  readonly #saved = computed(() => {
    const item = this.board().items().find((i) => i.id === this.diagramId());
    return item?.kind === 'diagram' ? item.source : null;
  });
  protected readonly draft = signal('');
  /** What's on the board as the draft started from it: when the board moves on, an untouched draft follows. */
  readonly #base = signal<string | null>(null);
  /** What the preview draws: the draft, a moment after typing stops. */
  protected readonly shown = signal('');
  protected readonly max = MAX_DIAGRAM_CHARS;
  protected readonly changed = computed(() => this.#saved() !== null && this.draft().trim() !== this.#saved()!.trim());
  /** Someone else saved while this draft had changes of its own: saving now would put theirs back. */
  protected readonly theirs = computed(() => {
    const saved = this.#saved();
    const base = this.#base();
    return saved !== null && base !== null && saved.trim() !== base.trim() && this.changed();
  });
  /** The pictures on the board, to put in a flowchart by name rather than by id. */
  protected readonly pictures = computed(() =>
    this.board()
      .media()
      .filter((m) => m.kind === 'image')
      .map((m) => ({ value: m.fileId, label: m.name })),
  );
  protected readonly isFlowchart = computed(() => diagramKind(this.draft()) === 'flowchart');
  protected readonly picked = signal('');
  #wait?: ReturnType<typeof setTimeout>;
  #openedId: string | null = null;

  constructor() {
    // Each diagram opened starts from what's on the board, and keeps up with it while the draft is untouched.
    effect(() => {
      const id = this.diagramId();
      const saved = this.#saved();
      if (saved === null) {
        this.closed.emit();
        return;
      }
      untracked(() => {
        const opened = this.#openedId !== id;
        const untouched = this.draft().trim() === (this.#base() ?? '').trim();
        if (!opened && !untouched) return;
        this.#openedId = id;
        this.#start(saved);
      });
    });
  }

  protected useTheirs(): void {
    const saved = this.#saved();
    if (saved !== null) this.#start(saved);
  }

  #start(text: string): void {
    clearTimeout(this.#wait);
    this.#base.set(text);
    this.draft.set(text);
    this.shown.set(text);
  }

  protected type(text: string): void {
    this.draft.set(text);
    clearTimeout(this.#wait);
    this.#wait = setTimeout(() => this.shown.set(text), 300);
  }

  /** Adds a node showing a picture on the board to the end of the flowchart, named by the picture. */
  protected addPicture(fileId: string): void {
    const picture = this.pictures().find((p) => p.value === fileId);
    if (!picture) return;
    const draft = this.draft().replace(/\s+$/, '');
    let n = 1;
    while (new RegExp(`\\bpicture${n}\\b`).test(draft)) n++;
    const label = picture.label.replace(/\.\w+$/, '').replace(/["{}]/g, '');
    this.type(`${draft}\n  picture${n}@{ img: "corkboard-file:${fileId}", label: "${label}", pos: "t", w: 60, h: 60 }`);
    // The menu goes back to asking, ready for another.
    this.picked.set(fileId);
    setTimeout(() => this.picked.set(''));
  }

  protected save(): void {
    if (!this.changed()) return;
    const text = this.draft().trim().slice(0, MAX_DIAGRAM_CHARS);
    this.board().setDiagram(this.diagramId(), text);
    this.#base.set(text);
    this.shown.set(this.draft());
  }
}
