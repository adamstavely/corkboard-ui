import { HttpErrorResponse } from '@angular/common/http';
import { Component, effect, inject, input, signal, untracked } from '@angular/core';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { Icon } from '../../shared/icon';
import { Api } from '../../api/generated/api';
import { writingControllerEdit } from '../../api/generated/fn/facilitation/writing-controller-edit';
import { writingControllerMine } from '../../api/generated/fn/facilitation/writing-controller-mine';
import { writingControllerRemove } from '../../api/generated/fn/facilitation/writing-controller-remove';
import { writingControllerWrite } from '../../api/generated/fn/facilitation/writing-controller-write';
import type { NoteDraftDto } from '../../api/generated/models/note-draft-dto';
import { NOTE_COLORS, type NoteColor } from './board-doc';
import type { Writing } from './facilitation';

/**
 * Your notes in a hidden writing round. They're kept on the server where only you can read them, until the facilitator
 * reveals everyone's at once.
 */
@Component({
  selector: 'app-writing-tray',
  imports: [Button, Icon],
  template: `
    <aside class="tray" aria-labelledby="tray-heading">
      <h2 id="tray-heading">Your hidden notes</h2>
      <p class="muted">
        Only you can see these until {{ writing().startedBy || 'the facilitator' }} reveals everyone's{{ writing().anonymous ? ', without names' : '' }}.
      </p>
      @if (drafts().length) {
        <ul>
          @for (d of drafts(); track d.id) {
            <li [style.background]="'var(--note-' + d.color + ')'">
              @if (editing() === d.id) {
                <textarea
                  aria-label="Edit note"
                  rows="3"
                  maxlength="2000"
                  [value]="d.text"
                  (keydown.enter)="$event.preventDefault(); save(d, $any($event.target).value)"
                  (keydown.escape)="editing.set(null)"
                  (blur)="save(d, $any($event.target).value)"
                ></textarea>
              } @else {
                <button type="button" class="text" [attr.aria-label]="'Edit: ' + d.text" (click)="editing.set(d.id)">{{ d.text }}</button>
              }
              <button type="button" class="remove" [attr.aria-label]="'Delete: ' + d.text" (click)="remove(d)"><app-icon name="close" /></button>
            </li>
          }
        </ul>
      }
      <form (submit)="$event.preventDefault(); add()">
        <textarea
          aria-label="A new hidden note"
          placeholder="Write a note. Enter adds it; Shift+Enter for a new line."
          rows="3"
          maxlength="2000"
          [value]="text()"
          (input)="text.set($any($event.target).value)"
          (keydown.enter)="onEnter($any($event))"
        ></textarea>
        <div class="row">
          <div class="swatches" role="radiogroup" aria-label="Colour">
            @for (c of colors; track c) {
              <button
                type="button"
                role="radio"
                class="swatch"
                [attr.aria-checked]="color() === c"
                [attr.aria-label]="c"
                [style.background]="'var(--note-' + c + ')'"
                (click)="color.set(c)"
              ></button>
            }
          </div>
          <tc-button size="sm" type="submit" label="Add" [loading]="adding()" [disabled]="!text().trim()"></tc-button>
        </div>
      </form>
      @if (problem()) {
        <p class="problem" role="alert">{{ problem() }}</p>
      }
    </aside>
  `,
  styles: `
    .tray {
      position: absolute;
      left: var(--tc-space-4);
      /* Above the minimap and the toolbar. */
      bottom: 124px;
      z-index: 15;
      display: flex;
      flex-direction: column;
      gap: var(--tc-space-2);
      width: 300px;
      max-height: calc(100% - 200px);
      overflow: auto;
      padding: var(--tc-space-3);
      border: 1px solid var(--tc-border-subtle);
      border-radius: var(--tc-radius-lg);
      background: var(--tc-surface-raised);
      box-shadow: 0 6px 24px rgb(0 0 0 / 0.12);
    }
    h2 {
      margin: 0;
      font-size: var(--tc-font-size-md);
    }
    .muted {
      margin: 0;
      color: var(--tc-text-muted);
      font-size: var(--tc-font-size-sm);
    }
    ul {
      display: flex;
      flex-direction: column;
      gap: var(--tc-space-1);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    li {
      display: flex;
      align-items: flex-start;
      gap: var(--tc-space-1);
      padding: var(--tc-space-2);
      border-radius: var(--tc-radius-sm);
      color: #1a1a1a;
    }
    .text {
      flex: 1;
      padding: 0;
      border: 0;
      background: none;
      color: inherit;
      font: inherit;
      text-align: left;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      cursor: text;
    }
    .remove {
      padding: 0 4px;
      border: 0;
      background: none;
      color: inherit;
      font-size: 16px;
      line-height: 1;
      cursor: pointer;
    }
    textarea {
      width: 100%;
      box-sizing: border-box;
      padding: var(--tc-space-2);
      border: 1px solid var(--tc-border-default);
      border-radius: var(--tc-radius-sm);
      background: var(--tc-surface-base);
      color: var(--tc-text-primary);
      font: inherit;
      resize: vertical;
    }
    li textarea {
      flex: 1;
      background: rgb(255 255 255 / 0.6);
      color: #1a1a1a;
    }
    .row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: var(--tc-space-1);
    }
    .swatches {
      display: flex;
      gap: 4px;
    }
    .swatch {
      width: 18px;
      height: 18px;
      padding: 0;
      border: 1px solid var(--tc-border-default);
      border-radius: 50%;
      cursor: pointer;
    }
    .swatch[aria-checked='true'] {
      outline: 2px solid var(--tc-accent-text);
      outline-offset: 1px;
    }
    .problem {
      margin: 0;
      color: var(--tc-status-danger-fg);
      font-size: var(--tc-font-size-sm);
    }
  `,
})
export class WritingTray {
  readonly #api = inject(Api);

  readonly boardId = input.required<string>();
  readonly writing = input.required<Writing>();

  protected readonly colors = NOTE_COLORS;
  protected readonly drafts = signal<NoteDraftDto[]>([]);
  protected readonly text = signal('');
  protected readonly color = signal<NoteColor>('yellow');
  protected readonly editing = signal<string | null>(null);
  protected readonly adding = signal(false);
  protected readonly problem = signal('');

  constructor() {
    // Your notes in this round, fetched again whenever a new round starts.
    effect(() => {
      const round = this.writing().round;
      const id = this.boardId();
      untracked(() => {
        this.drafts.set([]);
        if (round) void this.#api.invoke(writingControllerMine, { id }).then((d) => this.drafts.set(d), () => undefined);
      });
    });
  }

  protected onEnter(e: KeyboardEvent): void {
    if (e.shiftKey) return;
    e.preventDefault();
    void this.add();
  }

  protected async add(): Promise<void> {
    const text = this.text().trim();
    if (!text || this.adding()) return;
    this.adding.set(true);
    await this.#run(async () => {
      const draft = await this.#api.invoke(writingControllerWrite, { id: this.boardId(), body: { text, color: this.color() } });
      this.drafts.update((d) => [...d, draft]);
      this.text.set('');
    });
    this.adding.set(false);
  }

  protected async save(draft: NoteDraftDto, text: string): Promise<void> {
    if (this.editing() !== draft.id) return;
    this.editing.set(null);
    if (!text.trim() || text.trim() === draft.text) return;
    await this.#run(async () => {
      const saved = await this.#api.invoke(writingControllerEdit, { id: this.boardId(), draftId: draft.id, body: { text: text.trim() } });
      this.drafts.update((d) => d.map((x) => (x.id === saved.id ? saved : x)));
    });
  }

  protected async remove(draft: NoteDraftDto): Promise<void> {
    await this.#run(async () => {
      await this.#api.invoke(writingControllerRemove, { id: this.boardId(), draftId: draft.id });
      this.drafts.update((d) => d.filter((x) => x.id !== draft.id));
    });
  }

  async #run(call: () => Promise<void>): Promise<void> {
    this.problem.set('');
    try {
      await call();
    } catch (err) {
      const message = err instanceof HttpErrorResponse ? (err.error as { message?: unknown } | null)?.message : undefined;
      this.problem.set(typeof message === 'string' ? message : "That didn't work. Try again.");
    }
  }
}
