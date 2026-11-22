import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, resource, signal } from '@angular/core';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { Checkbox } from '@adamstavely/trenchcoat/angular/checkbox';
import { CodeBlock } from '@adamstavely/trenchcoat/angular/code-block';
import { Dialog } from '@adamstavely/trenchcoat/angular/dialog';
import { Select } from '@adamstavely/trenchcoat/angular/select';
import { Skeleton } from '@adamstavely/trenchcoat/angular/shimmer-loader';
import { toast } from '@adamstavely/trenchcoat/toaster';
import { html } from 'lit';
import { Api } from '../../api/generated/api';
import { tokensControllerCreate } from '../../api/generated/fn/tokens/tokens-controller-create';
import { tokensControllerList } from '../../api/generated/fn/tokens/tokens-controller-list';
import { tokensControllerRevoke } from '../../api/generated/fn/tokens/tokens-controller-revoke';
import type { AccessTokenDto } from '../../api/generated/models/access-token-dto';
import type { CreatedAccessTokenDto } from '../../api/generated/models/created-access-token-dto';

export type Scope = AccessTokenDto['scopes'][number];

/** The scopes, in the order the form offers them, with what each lets an agent do. */
export const SCOPES: { id: Scope; label: string; description: string }[] = [
  {
    id: 'boards:read',
    label: 'Read boards',
    description: 'List, read and search the boards you can open.',
  },
  {
    id: 'boards:propose',
    label: 'Propose changes',
    description:
      'Suggest notes, frames, tasks and diagrams. They wait for an updater to accept them.',
  },
  {
    id: 'comments:write',
    label: 'Comment',
    description: 'Comment on notes and other items, shown as yours via the agent.',
  },
];

const EXPIRIES = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: '365', label: 'A year' },
  { value: 'never', label: 'Never' },
];

/** Where agents reach Corkboard's MCP server: through the same /api the app uses. */
export const mcpUrl = (origin: string) => `${origin}/api/mcp`;

/** The command that adds Corkboard to Claude Code. */
export const claudeCodeCommand = (url: string, token: string) =>
  `claude mcp add --transport http corkboard ${url} --header "Authorization: Bearer ${token}"`;

/** Corkboard in Cursor's mcp.json. */
export const cursorConfig = (url: string, token: string) =>
  JSON.stringify(
    { mcpServers: { corkboard: { url, headers: { Authorization: `Bearer ${token}` } } } },
    null,
    2,
  );

/** A token's scopes, in words: "Read boards, Propose changes". */
export const scopeWords = (scopes: readonly Scope[]) =>
  SCOPES.filter((s) => scopes.includes(s.id))
    .map((s) => s.label)
    .join(', ');

const failure = (err: unknown, fallback: string) => {
  const message =
    err instanceof HttpErrorResponse
      ? (err.error as { message?: unknown } | null)?.message
      : undefined;
  return typeof message === 'string'
    ? message
    : Array.isArray(message)
      ? String(message[0])
      : fallback;
};

/**
 * Personal access tokens, for agents such as Claude Code and Cursor to work with your boards through MCP: make one
 * (shown once, with the config to paste), see when each was last used, and revoke one.
 */
@Component({
  selector: 'app-access-tokens',
  imports: [Button, Checkbox, CodeBlock, DatePipe, Dialog, Select, Skeleton],
  template: `
    <p class="lead">
      Let an agent such as Claude Code or Cursor work with your boards. It acts as you, with your
      access to each board, and anything it changes waits as a suggestion for someone to accept.
    </p>

    @if (made(); as m) {
      <section class="made" aria-labelledby="made-heading">
        <h3 id="made-heading">{{ m.name }} is ready</h3>
        <p class="warn" role="status">Copy the token now. It won't be shown again.</p>
        <div class="token-row">
          <input
            class="text-input token"
            readonly
            aria-label="Your new access token"
            [value]="m.token"
            (focus)="$any($event.target).select()"
          />
          <tc-button
            size="sm"
            label="Copy token"
            (click)="copy(m.token, 'Token copied')"
          ></tc-button>
        </div>
        <h4>Claude Code</h4>
        <tc-code-block [code]="claudeCode()" language="bash"></tc-code-block>
        <h4>Cursor</h4>
        <p class="hint">Add this to ~/.cursor/mcp.json.</p>
        <tc-code-block [code]="cursor()" language="json" filename="mcp.json"></tc-code-block>
        <div class="actions">
          <tc-button
            size="sm"
            variant="secondary"
            label="Done"
            (click)="made.set(null)"
          ></tc-button>
        </div>
      </section>
    }

    @if (tokens.isLoading() && !tokens.hasValue()) {
      <tc-skeleton height="80" radius="12"></tc-skeleton>
    } @else if (tokens.hasValue()) {
      @if (tokens.value().length) {
        <ul class="tokens" aria-label="Your access tokens">
          @for (t of tokens.value(); track t.id) {
            <li>
              <span class="label"
                >{{ t.name }} <code>{{ t.prefix }}…</code></span
              >
              <span class="when">
                {{ scopes(t.scopes) }} ·
                {{ t.lastUsedAt ? 'last used ' + (t.lastUsedAt | date: 'medium') : 'never used' }} ·
                @if (!t.expiresAt) {
                  never expires
                } @else if (t.expiresAt < now) {
                  <strong class="expired">expired {{ t.expiresAt | date: 'mediumDate' }}</strong>
                } @else {
                  expires {{ t.expiresAt | date: 'mediumDate' }}
                }
              </span>
              <tc-button
                size="sm"
                variant="ghost"
                label="Revoke"
                [attr.aria-label]="'Revoke ' + t.name"
                (click)="revoking.set(t)"
              ></tc-button>
            </li>
          }
        </ul>
      } @else {
        <p class="none">You have no access tokens.</p>
      }
    }

    <form
      class="new"
      aria-labelledby="new-token-heading"
      (submit)="$event.preventDefault(); create()"
    >
      <h3 id="new-token-heading">New token</h3>
      <label class="field">
        <span>Name</span>
        <input
          class="text-input"
          maxlength="60"
          placeholder="Cursor"
          [value]="name()"
          (input)="name.set($any($event.target).value)"
        />
        <span class="hint"
          >Usually the agent that will use it. Boards show its suggestions as "{{
            name().trim() || 'Cursor'
          }}
          for you".</span
        >
      </label>
      <fieldset class="scopes">
        <legend>It may</legend>
        @for (s of scopeOptions; track s.id) {
          <tc-checkbox
            [label]="s.label"
            [description]="s.description"
            [value]="picked().includes(s.id)"
            (tc-value-change)="toggle(s.id, $event.detail.value)"
          ></tc-checkbox>
        }
      </fieldset>
      <tc-select
        label="Expires after"
        [labelVisible]="true"
        [options]="expiries"
        [value]="expiry()"
        (tc-value-change)="expiry.set($any($event.detail.value))"
      ></tc-select>
      @if (problem()) {
        <p class="problem" role="alert">{{ problem() }}</p>
      }
      <div class="actions">
        <tc-button
          type="submit"
          label="Make token"
          [disabled]="!name().trim() || !picked().length"
          [loading]="creating()"
          (click)="create()"
        ></tc-button>
      </div>
    </form>

    <tc-dialog
      size="sm"
      [label]="'Revoke ' + (revoking()?.name ?? 'this token') + '?'"
      text="Agents using it stop working at once. This can't be undone; make a new token to connect again."
      close-label="Cancel"
      [open]="!!revoking()"
      [actions]="revokeActions()"
      (tc-open-change)="!$event.detail.open && revoking.set(null)"
    ></tc-dialog>
  `,
  styles: `
    .lead,
    .none,
    .hint {
      color: var(--tc-text-muted);
    }
    .hint {
      font-size: var(--tc-font-size-sm);
    }
    h3 {
      margin: var(--tc-space-4) 0 var(--tc-space-2);
      font-size: var(--tc-font-size-md);
      font-weight: var(--tc-font-weight-semibold);
    }
    h4 {
      margin: var(--tc-space-3) 0 var(--tc-space-1);
      font-size: var(--tc-font-size-sm);
      font-weight: var(--tc-font-weight-semibold);
    }
    .made {
      padding: var(--tc-space-4);
      border: 1px solid var(--tc-border-default);
      border-radius: var(--tc-radius-lg);
      background: var(--tc-surface-raised);
    }
    .made h3 {
      margin-top: 0;
    }
    .warn {
      margin: 0 0 var(--tc-space-2);
      font-weight: var(--tc-font-weight-medium);
    }
    .token-row {
      display: flex;
      gap: var(--tc-space-2);
      align-items: center;
    }
    .token {
      flex: 1;
      min-width: 0;
      font-family: var(--tc-font-mono, monospace);
    }
    .tokens {
      display: flex;
      flex-direction: column;
      gap: var(--tc-space-2);
      margin: var(--tc-space-4) 0;
      padding: 0;
      list-style: none;
    }
    .tokens li {
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: center;
      gap: 0 var(--tc-space-3);
      padding: var(--tc-space-3) var(--tc-space-4);
      border: 1px solid var(--tc-border-subtle);
      border-radius: var(--tc-radius-md);
      background: var(--tc-surface-raised);
    }
    .label {
      font-weight: var(--tc-font-weight-medium);
    }
    code {
      font-family: var(--tc-font-mono, monospace);
      font-size: var(--tc-font-size-sm);
      color: var(--tc-text-muted);
    }
    .when {
      grid-row: 2;
      color: var(--tc-text-muted);
      font-size: var(--tc-font-size-sm);
    }
    .expired {
      color: var(--tc-status-danger-fg);
    }
    .tokens tc-button {
      grid-row: 1 / span 2;
      grid-column: 2;
    }
    .new {
      display: flex;
      flex-direction: column;
      gap: var(--tc-space-3);
    }
    .field {
      display: flex;
      flex-direction: column;
      gap: var(--tc-space-1);
    }
    .field > span:first-child,
    legend {
      font-weight: var(--tc-font-weight-medium);
    }
    .scopes {
      display: flex;
      flex-direction: column;
      gap: var(--tc-space-2);
      margin: 0;
      padding: 0;
      border: 0;
    }
    legend {
      margin-bottom: var(--tc-space-2);
      padding: 0;
    }
    .text-input {
      height: 36px;
      padding: 0 var(--tc-space-2);
      border: 1px solid var(--tc-border-default);
      border-radius: var(--tc-radius-md);
      background: var(--tc-surface-base, var(--tc-surface-raised));
      color: var(--tc-text-primary);
      font: inherit;
    }
    .text-input:focus-visible {
      outline: 2px solid var(--tc-focus-ring, var(--tc-accent-text));
      outline-offset: 1px;
    }
    .problem {
      margin: 0;
      color: var(--tc-status-danger-fg);
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      margin-top: var(--tc-space-3);
    }
  `,
})
export class AccessTokens {
  readonly #api = inject(Api);

  protected readonly tokens = resource({ loader: () => this.#api.invoke(tokensControllerList) });
  protected readonly scopeOptions = SCOPES;
  protected readonly expiries = EXPIRIES;
  protected readonly scopes = scopeWords;
  protected readonly now = Date.now();

  protected readonly name = signal('');
  protected readonly picked = signal<Scope[]>(['boards:read', 'boards:propose']);
  protected readonly expiry = signal('90');
  protected readonly creating = signal(false);
  protected readonly problem = signal('');
  /** The token just made, shown until "Done": the only time it's seen. */
  protected readonly made = signal<CreatedAccessTokenDto | null>(null);
  protected readonly revoking = signal<AccessTokenDto | null>(null);
  readonly #revokingBusy = signal(false);

  readonly #url = mcpUrl(location.origin);
  protected readonly claudeCode = computed(() =>
    claudeCodeCommand(this.#url, this.made()?.token ?? ''),
  );
  protected readonly cursor = computed(() => cursorConfig(this.#url, this.made()?.token ?? ''));

  protected readonly revokeActions = computed(
    () =>
      html`<tc-button
        label="Revoke"
        variant="destructive"
        ?loading=${this.#revokingBusy()}
        @click=${() => void this.#revoke()}
      ></tc-button>`,
  );

  protected toggle(scope: Scope, on: boolean): void {
    this.picked.update((all) =>
      on ? [...new Set([...all, scope])] : all.filter((s) => s !== scope),
    );
  }

  protected async create(): Promise<void> {
    if (this.creating() || !this.name().trim() || !this.picked().length) return;
    this.problem.set('');
    this.creating.set(true);
    try {
      const expiry = this.expiry();
      const made = await this.#api.invoke(tokensControllerCreate, {
        body: {
          name: this.name().trim(),
          scopes: SCOPES.map((s) => s.id).filter((s) => this.picked().includes(s)),
          ...(expiry === 'never' ? {} : { expiresInDays: Number(expiry) }),
        },
      });
      this.made.set(made);
      this.name.set('');
      this.tokens.reload();
    } catch (err) {
      this.problem.set(failure(err, "The token couldn't be made. Try again."));
    } finally {
      this.creating.set(false);
    }
  }

  protected async copy(text: string, done: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(done);
    } catch {
      toast.error("Couldn't copy. Select it and copy it yourself.");
    }
  }

  async #revoke(): Promise<void> {
    const token = this.revoking();
    if (!token) return;
    this.#revokingBusy.set(true);
    try {
      await this.#api.invoke(tokensControllerRevoke, { tokenId: token.id });
      toast.success('Token revoked', { description: token.name });
      this.revoking.set(null);
      this.tokens.reload();
    } catch (err) {
      toast.error(failure(err, "The token couldn't be revoked. Try again."));
    } finally {
      this.#revokingBusy.set(false);
    }
  }
}
