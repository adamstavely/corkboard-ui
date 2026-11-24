import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, input, resource, signal } from '@angular/core';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { toast } from '@adamstavely/trenchcoat/toaster';
import { Api } from '../../api/generated/api';
import { themesControllerGet } from '../../api/generated/fn/themes/themes-controller-get';
import { themesControllerReset } from '../../api/generated/fn/themes/themes-controller-reset';
import { themesControllerSet } from '../../api/generated/fn/themes/themes-controller-set';
import { themesControllerSuggest } from '../../api/generated/fn/themes/themes-controller-suggest';
import { DiagramLookEditor } from '../board/diagram-look-editor';
import { themeProblems, type DiagramTheme } from '../board/diagrams/diagram-theme';
import { workspaceLook } from '../board/diagrams/workspace-look';

/**
 * The workspace's look for diagrams, on the admin page: Trench Coat's until the owners set their own, by hand, from
 * brand colours or read off their website. A look is only saved once text on every fill meets WCAG 2.2 AA.
 */
@Component({
  selector: 'app-workspace-look',
  imports: [Button, DiagramLookEditor],
  template: `
    @if (look.hasValue()) {
      <p class="muted">
        @if (look.value().custom) {
          Diagrams use the workspace's own look, {{ look.value().theme.name }}. A board can choose
          another.
        } @else {
          Diagrams use Trench Coat's look. Set your own below; a board can still choose another.
        }
      </p>
      <div class="site">
        <label class="field">
          <span>Read the look off a website</span>
          <input
            class="text-input"
            type="url"
            placeholder="https://example.com"
            [value]="site()"
            (input)="site.set($any($event.target).value)"
            (keydown.enter)="suggest()"
          />
        </label>
        <tc-button
          size="sm"
          variant="secondary"
          label="Read it"
          [disabled]="!site().trim() || busy()"
          (click)="suggest()"
        ></tc-button>
      </div>
      @if (notes().length) {
        <ul class="notes" aria-label="How the look was made">
          @for (n of notes(); track $index) {
            <li>{{ n }}</li>
          }
        </ul>
      }
      <app-diagram-look-editor
        [theme]="draft() ?? look.value().theme"
        (themeChange)="draft.set($event)"
      />
      <div class="actions">
        <tc-button
          size="sm"
          variant="primary"
          label="Save the look"
          [disabled]="!draft() || problems().length > 0 || busy()"
          (click)="save()"
        ></tc-button>
        @if (look.value().custom) {
          <tc-button
            size="sm"
            variant="ghost"
            label="Go back to Trench Coat's"
            [disabled]="busy()"
            (click)="reset()"
          ></tc-button>
        }
      </div>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--tc-space-3);
    }
    .muted {
      margin: 0;
      color: var(--tc-text-secondary);
      font-size: var(--tc-font-size-sm);
    }
    .site,
    .actions {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      gap: var(--tc-space-2);
    }
    .field {
      display: flex;
      flex: 1;
      flex-direction: column;
      gap: var(--tc-space-1);
      min-width: 14rem;
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
    .notes {
      margin: 0;
      padding-left: 1.2em;
      color: var(--tc-text-secondary);
      font-size: var(--tc-font-size-sm);
    }
  `,
})
export class WorkspaceLook {
  readonly orgId = input.required<string>();
  readonly #api = inject(Api);

  protected readonly look = resource({
    params: () => this.orgId(),
    loader: ({ params: orgId }) => this.#api.invoke(themesControllerGet, { orgId }),
  });
  /** The look being changed, before it's saved. */
  protected readonly draft = signal<DiagramTheme | null>(null);
  protected readonly site = signal('');
  protected readonly notes = signal<string[]>([]);
  protected readonly busy = signal(false);
  protected readonly problems = computed(() => (this.draft() ? themeProblems(this.draft()) : []));

  protected async suggest(): Promise<void> {
    const url = this.site().trim();
    if (!url) return;
    this.busy.set(true);
    try {
      const made = await this.#api.invoke(themesControllerSuggest, {
        orgId: this.orgId(),
        body: { url },
      });
      this.draft.set(made.theme as DiagramTheme);
      this.notes.set(made.notes);
    } catch (e) {
      toast.error("The site's look couldn't be read", { description: message(e) });
    } finally {
      this.busy.set(false);
    }
  }

  protected async save(): Promise<void> {
    const theme = this.draft();
    if (!theme) return;
    this.busy.set(true);
    try {
      const saved = await this.#api.invoke(themesControllerSet, {
        orgId: this.orgId(),
        body: theme,
      });
      this.look.set(saved);
      workspaceLook.set(saved.theme as DiagramTheme);
      this.draft.set(null);
      this.notes.set([]);
      toast.success('Saved the look for diagrams');
    } catch (e) {
      toast.error("The look couldn't be saved", { description: message(e) });
    } finally {
      this.busy.set(false);
    }
  }

  protected async reset(): Promise<void> {
    this.busy.set(true);
    try {
      await this.#api.invoke(themesControllerReset, { orgId: this.orgId() });
      this.look.reload();
      workspaceLook.set(null);
      this.draft.set(null);
      toast.success("Diagrams use Trench Coat's look again");
    } catch (e) {
      toast.error("The look couldn't be reset", { description: message(e) });
    } finally {
      this.busy.set(false);
    }
  }
}

const message = (e: unknown): string =>
  e instanceof HttpErrorResponse && typeof e.error?.message === 'string'
    ? e.error.message
    : 'Try again in a moment.';
