import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, input, resource, signal } from '@angular/core';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { Select } from '@adamstavely/trenchcoat/angular/select';
import { toast } from '@adamstavely/trenchcoat/toaster';
import { Api } from '../../api/generated/api';
import { feedbackControllerBlock } from '../../api/generated/fn/feedback/feedback-controller-block';
import { feedbackControllerClose } from '../../api/generated/fn/feedback/feedback-controller-close';
import { feedbackControllerGet } from '../../api/generated/fn/feedback/feedback-controller-get';
import { feedbackControllerOpen } from '../../api/generated/fn/feedback/feedback-controller-open';
import { feedbackControllerSetVisibility } from '../../api/generated/fn/feedback/feedback-controller-set-visibility';
import { Icon } from '../../shared/icon';

type Visibility = 'names' | 'anonymous' | 'own';

const VISIBILITY_OPTIONS: { value: Visibility; label: string }[] = [
  { value: 'anonymous', label: "See each other's feedback, without names" },
  { value: 'names', label: "See each other's feedback, with names" },
  { value: 'own', label: 'See only their own feedback' },
];

/** The feedback link's address. */
export const feedbackUrl = (token: string) => `${location.origin}/feedback/${token}`;

/**
 * Feedback from outside the team, in the Share panel: a link anyone signed in can use to comment, add notes, react,
 * vote and answer polls, and what those participants see of each other. The team always sees who wrote what, by
 * name. Owners and the facilitator open, change and close it, and can block someone; the rest of the team sees who's
 * joined.
 */
@Component({
  selector: 'app-board-feedback',
  imports: [Button, Select, Icon],
  template: `
    <section class="feedback" aria-labelledby="feedback-heading">
      <h2 id="feedback-heading"><app-icon name="comments" /> Feedback from outside the team</h2>
      @if (state.hasValue()) {
        @if (state.value().link; as link) {
          <p class="hint">Anyone signed in to Corkboard with this link can comment, add notes, react, vote and answer polls. They never see the board's chat or history, and the team always sees who wrote what.</p>
          <div class="row">
            <input class="url" readonly aria-label="Feedback link" [value]="url()" (focus)="$any($event.target).select()" />
            <tc-button size="sm" variant="secondary" label="Copy" (click)="copy()"></tc-button>
          </div>
          @if (canManage()) {
            <tc-select label="What participants see of each other" [options]="options" [value]="link.visibility" (tc-value-change)="setVisibility($any($event.detail.value))"></tc-select>
          } @else {
            <p class="hint">Participants {{ said(link.visibility) }}.</p>
          }
          <h3>{{ participants().length ? participants().length + ' joined' : 'Nobody has joined yet' }}</h3>
          @if (participants().length) {
            <ul class="people">
              @for (p of participants(); track p.userId) {
                <li [class.blocked]="p.blocked">
                  <span class="name">{{ p.name }}</span>
                  <span class="pseudonym">Participant {{ p.pseudonym }}{{ p.blocked ? ' · blocked' : '' }}</span>
                  @if (canManage()) {
                    <tc-button size="sm" variant="ghost" [label]="p.blocked ? 'Let back' : 'Block'" (click)="block(p.userId, !p.blocked)"></tc-button>
                  }
                </li>
              }
            </ul>
          }
          @if (canManage()) {
            <div class="row"><tc-button size="sm" variant="ghost" label="Close to feedback" (click)="close()"></tc-button></div>
          }
        } @else if (!openRefusal()) {
          <p class="hint">Make a link anyone signed in to Corkboard can use to give feedback on this board, from any workspace. The team always sees who wrote what.</p>
          <tc-select label="What participants see of each other" [options]="options" [value]="choice()" (tc-value-change)="choice.set($any($event.detail.value))"></tc-select>
          <div class="row"><tc-button size="sm" variant="secondary" label="Open for feedback" (click)="open()"></tc-button></div>
        } @else {
          <p class="hint">{{ openRefusal() }}</p>
        }
      }
      @if (problem()) {
        <p class="problem" role="alert">{{ problem() }}</p>
      }
    </section>
  `,
  styles: `
    .feedback {
      display: flex;
      flex-direction: column;
      gap: var(--tc-space-2);
      padding: var(--tc-space-3) var(--tc-space-4);
      border: 1px solid var(--tc-border-subtle);
      border-radius: var(--tc-radius-lg);
      background: var(--tc-surface-raised);
    }
    h2 {
      display: flex;
      align-items: center;
      gap: var(--tc-space-2);
      margin: 0;
      font-size: var(--tc-font-size-sm);
      font-weight: var(--tc-font-weight-semibold);
      color: var(--tc-text-strong);
    }
    h2 app-icon {
      --icon-size: 16px;
      color: var(--tc-accent-text);
    }
    h3 {
      margin: var(--tc-space-2) 0 0;
      font-size: var(--tc-font-size-sm);
      font-weight: var(--tc-font-weight-semibold);
    }
    .hint {
      margin: 0;
      color: var(--tc-text-muted);
      font-size: var(--tc-font-size-sm);
    }
    .row {
      display: flex;
      align-items: center;
      gap: var(--tc-space-2);
    }
    .url {
      flex: 1;
      min-width: 0;
      height: 32px;
      padding: 0 var(--tc-space-2);
      border: 1px solid var(--tc-border-default);
      border-radius: var(--tc-radius-md);
      background: var(--tc-surface-raised);
      color: var(--tc-text-primary);
      font: inherit;
      font-size: var(--tc-font-size-sm);
    }
    .people {
      display: flex;
      flex-direction: column;
      gap: 2px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .people li {
      display: flex;
      align-items: center;
      gap: var(--tc-space-2);
      font-size: var(--tc-font-size-sm);
    }
    .name {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .pseudonym {
      color: var(--tc-text-muted);
    }
    .blocked .name {
      color: var(--tc-text-muted);
      text-decoration: line-through;
    }
    .problem {
      margin: 0;
      color: var(--tc-status-danger-fg);
      font-size: var(--tc-font-size-sm);
    }
  `,
})
export class BoardFeedback {
  readonly #api = inject(Api);

  readonly boardId = input.required<string>();
  /** Owners and the facilitator: open, change and close the link, and block people. */
  readonly canManage = input(false);
  /** Why the workspace's policy stops you opening the board for feedback; null when you can. */
  readonly openRefusal = input<string | null>(null);

  protected readonly state = resource({ params: () => this.boardId(), loader: ({ params: id }) => this.#api.invoke(feedbackControllerGet, { id }) });
  protected readonly participants = computed(() => (this.state.hasValue() ? this.state.value().participants : []));
  protected readonly url = computed(() => (this.state.hasValue() && this.state.value().link ? feedbackUrl(this.state.value().link!.token) : ''));
  protected readonly options = VISIBILITY_OPTIONS;
  protected readonly choice = signal<Visibility>('anonymous');
  protected readonly problem = signal('');

  protected said(v: string): string {
    return { names: "see each other's feedback, with names", anonymous: "see each other's feedback, without names", own: 'see only their own feedback' }[v] ?? '';
  }

  protected async open(): Promise<void> {
    const opened = await this.#run(() => this.#api.invoke(feedbackControllerOpen, { id: this.boardId(), body: { visibility: this.choice() } }));
    if (opened?.link) {
      await navigator.clipboard?.writeText(feedbackUrl(opened.link.token)).catch(() => undefined);
      toast.success('Open for feedback', { description: 'The link is copied: share it with anyone signed in to Corkboard.' });
    }
  }

  protected async setVisibility(visibility: Visibility): Promise<void> {
    await this.#run(() => this.#api.invoke(feedbackControllerSetVisibility, { id: this.boardId(), body: { visibility } }));
  }

  protected async close(): Promise<void> {
    if ((await this.#run(() => this.#api.invoke(feedbackControllerClose, { id: this.boardId() }).then(() => true))) === true) toast.success('Closed to feedback', { description: 'The link no longer works.' });
  }

  protected async block(userId: string, blocked: boolean): Promise<void> {
    await this.#run(() => this.#api.invoke(feedbackControllerBlock, { id: this.boardId(), userId, body: { blocked } }));
  }

  protected async copy(): Promise<void> {
    const url = this.url();
    if (!url) return;
    await navigator.clipboard?.writeText(url).catch(() => undefined);
    toast.success('Feedback link copied');
  }

  async #run<T>(call: () => Promise<T>): Promise<T | undefined> {
    this.problem.set('');
    try {
      const result = await call();
      this.state.reload();
      return result;
    } catch (err) {
      const message = err instanceof HttpErrorResponse ? (err.error as { message?: unknown } | null)?.message : undefined;
      this.problem.set(typeof message === 'string' ? message : "That didn't work. Try again.");
      return undefined;
    }
  }
}
