import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, input, linkedSignal, output, signal } from '@angular/core';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { Select } from '@adamstavely/trenchcoat/angular/select';
import { Switch } from '@adamstavely/trenchcoat/angular/switch';
import { toast } from '@adamstavely/trenchcoat/toaster';
import { Api } from '../../api/generated/api';
import { savedTemplatesControllerSave } from '../../api/generated/fn/boards/saved-templates-controller-save';
import type { SaveTemplateDto } from '../../api/generated/models/save-template-dto';
import { TEMPLATE_CATEGORIES } from './template-cards';

/**
 * Saving the board as a template for the workspace: a name, a line about it, where it goes in the picker, and whether
 * its notes' words come too or just its structure. Everyone in the workspace can then start a board from it.
 */
@Component({
  selector: 'app-board-save-template',
  imports: [Button, Select, Switch],
  template: `
    <aside class="panel" aria-labelledby="save-template-heading">
      <div class="head">
        <h2 id="save-template-heading">Save as template</h2>
        <tc-button size="sm" variant="ghost" label="Close" (click)="closed.emit()"></tc-button>
      </div>
      <p class="hint">Everyone in the workspace can start a board from it. Its frames, notes, text, shapes, tables, views, arrows and agenda come along; images, files, drawings, diagrams and charts don't.</p>
      <input type="text" class="text-input" maxlength="80" aria-label="Name" placeholder="Name" [value]="name()" (input)="name.set($any($event.target).value)" />
      <input type="text" class="text-input" maxlength="200" aria-label="Description" placeholder="What it's for, in a line" [value]="description()" (input)="description.set($any($event.target).value)" />
      <tc-select label="Group" [labelVisible]="true" [options]="categories" [value]="category()" (tc-value-change)="category.set($any($event.detail.value))"></tc-select>
      <tc-switch label="Keep the notes" description="Off saves only the structure: frames, headings, shapes and empty tables." [value]="keepNotes()" (tc-value-change)="keepNotes.set($event.detail.value)"></tc-switch>
      @if (problem()) {
        <p class="problem" role="alert">{{ problem() }}</p>
      }
      <div class="actions">
        <tc-button size="sm" variant="primary" label="Save template" [disabled]="!name().trim()" [loading]="saving()" (click)="save()"></tc-button>
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
      gap: var(--tc-space-3);
      width: min(360px, calc(100% - 2 * var(--tc-space-4)));
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
    .actions {
      justify-content: flex-end;
    }
    h2 {
      margin: 0;
      font-size: var(--tc-font-size-md);
    }
    .hint {
      margin: 0;
      color: var(--tc-text-muted);
      font-size: var(--tc-font-size-sm);
    }
    .text-input {
      height: 32px;
      padding: 0 var(--tc-space-2);
      border: 1px solid var(--tc-border-default);
      border-radius: var(--tc-radius-md);
      background: var(--tc-surface-base, var(--tc-surface-raised));
      color: var(--tc-text-primary);
      font: inherit;
      font-size: var(--tc-font-size-sm);
    }
    .text-input:focus-visible {
      outline: 2px solid var(--tc-focus-ring, var(--tc-accent-text));
      outline-offset: 1px;
    }
    .problem {
      margin: 0;
      color: var(--tc-status-danger-fg, var(--tc-text-primary));
      font-size: var(--tc-font-size-sm);
    }
  `,
})
export class BoardSaveTemplate {
  readonly #api = inject(Api);
  readonly boardId = input.required<string>();
  /** Starts as the board's title. */
  readonly boardTitle = input('');
  readonly closed = output<void>();
  /** The template saved, so pickers show it. */
  readonly saved = output<void>();

  protected readonly categories = TEMPLATE_CATEGORIES.map((c) => ({ value: c.id, label: c.label }));
  protected readonly name = linkedSignal(() => this.boardTitle());
  protected readonly description = signal('');
  protected readonly category = signal<SaveTemplateDto['category']>('retro');
  protected readonly keepNotes = signal(true);
  protected readonly saving = signal(false);
  protected readonly problem = signal('');

  protected async save(): Promise<void> {
    if (!this.name().trim() || this.saving()) return;
    this.saving.set(true);
    this.problem.set('');
    try {
      const t = await this.#api.invoke(savedTemplatesControllerSave, {
        id: this.boardId(),
        body: { name: this.name().trim(), description: this.description().trim(), category: this.category(), keepNotes: this.keepNotes() },
      });
      toast.success(`Saved “${t.name}” as a template`, { description: 'Anyone in the workspace can start a board from it.' });
      this.saved.emit();
      this.closed.emit();
    } catch (err) {
      const message = err instanceof HttpErrorResponse ? (err.error as { message?: unknown } | null)?.message : undefined;
      this.problem.set(typeof message === 'string' ? message : "That didn't save. Try again.");
    } finally {
      this.saving.set(false);
    }
  }
}
