import { HttpErrorResponse } from '@angular/common/http';
import { Component, effect, inject, input, resource, signal } from '@angular/core';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { NumberField } from '@adamstavely/trenchcoat/angular/number-field';
import { Select } from '@adamstavely/trenchcoat/angular/select';
import { Switch } from '@adamstavely/trenchcoat/angular/switch';
import { toast } from '@adamstavely/trenchcoat/toaster';
import { Api } from '../../api/generated/api';
import { policiesControllerGet } from '../../api/generated/fn/policies/policies-controller-get';
import { policiesControllerSet } from '../../api/generated/fn/policies/policies-controller-set';
import type { PoliciesDto } from '../../api/generated/models/policies-dto';

type Who = PoliciesDto['exports'];

/** The choices for who may do something on a board. */
export const WHO_OPTIONS: { value: Who; label: string }[] = [
  { value: 'workspace_owners', label: 'Workspace owners only' },
  { value: 'board_owners', label: "The board's owners" },
  { value: 'editors', label: 'Anyone who can edit the board' },
  { value: 'everyone', label: 'Anyone who can open the board' },
];
const MANAGING = WHO_OPTIONS.slice(0, 3);

/** A number field's value as a policy's day count: empty or nonsense is no limit. */
export const days = (value: unknown): number | null => {
  const n = Number(value);
  return value === null || value === '' || !Number.isFinite(n) || n < 1 ? null : Math.round(n);
};

/**
 * Workspace policies, on the admin page: who may share boards, make share links (and editable or password-free ones),
 * export, and open boards for outside feedback, how long links may last and how long history is kept. The API enforces
 * them; the board hides what they rule out.
 */
@Component({
  selector: 'app-workspace-policies',
  imports: [Select, Switch, NumberField, Button],
  template: `
    @if (state.hasValue()) {
      <form class="policies" aria-label="Workspace policies" (submit)="$event.preventDefault(); save()">
        <fieldset [disabled]="busy()">
          <legend>Sharing</legend>
          <tc-select label="Who can share a board with people" [options]="managing" [value]="draft().shareWithPeople" (tc-value-change)="set('shareWithPeople', $event.detail.value)"></tc-select>
          <tc-select label="Who can make share links" [options]="managing" [value]="draft().shareLinks" (tc-value-change)="set('shareLinks', $event.detail.value)"></tc-select>
          <tc-switch
            label="Share links can let guests edit"
            description="Off: links only let people view. Editable links already made open read-only."
            [value]="draft().editableLinks"
           
            (tc-value-change)="set('editableLinks', $event.detail.value)"
          ></tc-switch>
          <tc-switch
            label="Share links need a password"
            description="Guests type it before the board opens. Links made without one stop working."
            [value]="draft().linkPassword"
           
            (tc-value-change)="set('linkPassword', $event.detail.value)"
          ></tc-switch>
          <tc-number-field
            label="Longest a share link lasts, in days"
            description="Empty for no limit. Links that would last longer are cut short when you save."
            [min]="1"
            [max]="365"
            [value]="draft().linkMaxDays"
           
            (tc-value-change)="set('linkMaxDays', days($event.detail.value))"
          ></tc-number-field>
          <tc-switch
            label="Boards can be embedded in other tools"
            description="Notion, Confluence and the like show a board live and read-only through a view-only link. Off: embeds stop showing."
            [value]="draft().embeds"
           
            (tc-value-change)="set('embeds', $event.detail.value)"
          ></tc-switch>
          <tc-select label="Who can open a board for outside feedback" [options]="managing" [value]="draft().feedback" (tc-value-change)="set('feedback', $event.detail.value)"></tc-select>
        </fieldset>
        <fieldset [disabled]="busy()">
          <legend>Exports and history</legend>
          <tc-select
            label="Who can export (image, PDF, Markdown, CSV, tasks to trackers)"
            [options]="who"
            [value]="draft().exports"
           
            (tc-value-change)="set('exports', $event.detail.value)"
          ></tc-select>
          <tc-number-field
            label="Keep board history for, in days"
            description="Activity, saved versions and the assistant's undo list older than this are deleted daily. Boards themselves are never deleted. Empty keeps everything."
            [min]="1"
            [max]="3650"
            [value]="draft().retentionDays"
           
            (tc-value-change)="set('retentionDays', days($event.detail.value))"
          ></tc-number-field>
        </fieldset>
        @if (problem(); as problem) {
          <p class="problem" role="alert">{{ problem }}</p>
        }
        <div class="actions">
          <tc-button type="submit" label="Save policies" [loading]="busy()"></tc-button>
        </div>
      </form>
    } @else if (state.error()) {
      <p role="alert" class="problem">The workspace's policies couldn't be loaded. Refresh to try again.</p>
    }
  `,
  styles: `
    .policies {
      display: flex;
      flex-direction: column;
      gap: var(--tc-space-4);
      padding: var(--tc-space-5);
      border: 1px solid var(--tc-border-subtle);
      border-radius: var(--tc-radius-lg);
      background: var(--tc-surface-raised);
    }
    fieldset {
      display: flex;
      flex-direction: column;
      gap: var(--tc-space-4);
      margin: 0;
      padding: 0;
      border: 0;
    }
    legend {
      margin-bottom: var(--tc-space-2);
      font-weight: var(--tc-font-weight-semibold);
      color: var(--tc-text-strong);
    }
    .problem {
      margin: 0;
      color: var(--tc-status-danger-fg);
    }
    .actions {
      display: flex;
      justify-content: flex-end;
    }
  `,
})
export class WorkspacePolicies {
  readonly #api = inject(Api);

  readonly orgId = input.required<string>();

  protected readonly state = resource({ params: () => this.orgId(), loader: ({ params: orgId }) => this.#api.invoke(policiesControllerGet, { orgId }) });
  protected readonly who = WHO_OPTIONS;
  protected readonly managing = MANAGING;
  protected readonly days = days;
  protected readonly draft = signal<PoliciesDto>({
    shareWithPeople: 'board_owners',
    shareLinks: 'board_owners',
    editableLinks: true,
    linkPassword: false,
    linkMaxDays: null,
    exports: 'everyone',
    feedback: 'board_owners',
    retentionDays: null,
    embeds: true,
  });
  protected readonly busy = signal(false);
  protected readonly problem = signal<string | null>(null);

  constructor() {
    effect(() => {
      if (this.state.hasValue()) this.draft.set({ ...this.state.value() });
    });
  }

  protected set<K extends keyof PoliciesDto>(key: K, value: unknown): void {
    this.draft.update((d) => ({ ...d, [key]: value as PoliciesDto[K] }));
  }

  protected async save(): Promise<void> {
    this.busy.set(true);
    this.problem.set(null);
    try {
      await this.#api.invoke(policiesControllerSet, { orgId: this.orgId(), body: this.draft() });
      this.state.reload();
      toast.success('Policies saved', { description: 'They apply to every board in the workspace now.' });
    } catch (err) {
      const message = err instanceof HttpErrorResponse ? (err.error as { message?: unknown } | null)?.message : undefined;
      this.problem.set(typeof message === 'string' ? message : Array.isArray(message) ? message.join(' ') : "The policies didn't save. Try again.");
    } finally {
      this.busy.set(false);
    }
  }
}
