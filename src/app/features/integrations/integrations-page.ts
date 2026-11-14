import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, resource, signal } from '@angular/core';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { Skeleton } from '@adamstavely/trenchcoat/angular/shimmer-loader';
import { toast } from '@adamstavely/trenchcoat/toaster';
import { Api } from '../../api/generated/api';
import { integrationsControllerCreate } from '../../api/generated/fn/integrations/integrations-controller-create';
import { integrationsControllerList } from '../../api/generated/fn/integrations/integrations-controller-list';
import { integrationsControllerRemove } from '../../api/generated/fn/integrations/integrations-controller-remove';
import type { IntegrationDto } from '../../api/generated/models/integration-dto';
import { Session } from '../../core/session';

type Kind = IntegrationDto['kind'];

const KINDS: { id: Kind; name: string; token: string; help: string }[] = [
  { id: 'github', name: 'GitHub Issues', token: 'Fine-grained token with Issues: read and write', help: 'Issues go to one repository.' },
  { id: 'linear', name: 'Linear', token: 'Personal API key', help: "Issues go to one team; its id is in the team's settings." },
  { id: 'jira', name: 'Jira', token: 'API token for the account below', help: 'Issues go to one project on your Jira Cloud site, as Tasks.' },
];

/** The workspace's issue trackers: board tasks can be sent to them. Owners connect and remove; everyone sees them. */
@Component({
  selector: 'app-integrations-page',
  imports: [Button, Skeleton],
  template: `
    <div class="page">
      <h1>Integrations</h1>
      @if (session.org(); as org) {
        <p class="lead">Issue trackers people in <strong>{{ org.name }}</strong> can send board tasks to. Each task keeps a link to its issue.</p>
      }
      @if (list.isLoading() && !list.hasValue()) {
        <tc-skeleton height="120" radius="12"></tc-skeleton>
      } @else if (list.hasValue()) {
        @if (list.value().length) {
          <ul class="list">
            @for (i of list.value(); track i.id) {
              <li>
                <span class="name">{{ i.label }}</span>
                <span class="meta">{{ kindName(i.kind) }} · {{ i.target }}</span>
                @if (isOwner()) {
                  <tc-button size="sm" variant="ghost" label="Remove" [attr.aria-label]="'Remove ' + i.label" (click)="remove(i)"></tc-button>
                }
              </li>
            }
          </ul>
        } @else {
          <p class="muted">No trackers yet.{{ isOwner() ? '' : ' An owner of this workspace can connect one here.' }}</p>
        }
      }

      @if (isOwner()) {
        <form class="add" (submit)="$event.preventDefault(); add()">
          <h2>Connect a tracker</h2>
          <div class="kinds" role="radiogroup" aria-label="Tracker">
            @for (k of kinds; track k.id) {
              <label><input type="radio" name="kind" [checked]="kind() === k.id" (change)="kind.set(k.id)" /> {{ k.name }}</label>
            }
          </div>
          <p class="muted">{{ chosen().help }}</p>
          <label><span>Name</span><input required maxlength="80" [value]="label()" (input)="label.set($any($event.target).value)" placeholder="Web repo" /></label>
          @switch (kind()) {
            @case ('github') {
              <label><span>Repository</span><input required [value]="repo()" (input)="repo.set($any($event.target).value)" placeholder="owner/name" /></label>
            }
            @case ('linear') {
              <label><span>Team id</span><input required [value]="teamId()" (input)="teamId.set($any($event.target).value)" /></label>
            }
            @case ('jira') {
              <label><span>Site</span><input required type="url" [value]="baseUrl()" (input)="baseUrl.set($any($event.target).value)" placeholder="https://acme.atlassian.net" /></label>
              <label><span>Project key</span><input required [value]="projectKey()" (input)="projectKey.set($any($event.target).value.toUpperCase())" placeholder="ENG" /></label>
              <label><span>Account email</span><input required type="email" [value]="email()" (input)="email.set($any($event.target).value)" /></label>
            }
          }
          <label><span>{{ chosen().token }}</span><input required type="password" autocomplete="off" [value]="token()" (input)="token.set($any($event.target).value)" /></label>
          <p class="muted">The token is stored encrypted and never shown again.</p>
          @if (problem()) {
            <p class="problem" role="alert">{{ problem() }}</p>
          }
          <div class="actions"><tc-button type="submit" label="Connect" [loading]="saving()"></tc-button></div>
        </form>
      }
    </div>
  `,
  styles: `
    .page {
      max-width: 720px;
      margin: 0 auto;
      padding: var(--tc-space-8) var(--tc-space-4);
    }
    h1 {
      margin: 0;
      font-size: var(--tc-font-size-2xl);
    }
    h2 {
      margin: 0;
      font-size: var(--tc-font-size-lg);
    }
    .lead,
    .muted {
      color: var(--tc-text-muted);
    }
    .muted {
      margin: 0;
      font-size: var(--tc-font-size-sm);
    }
    .list {
      display: flex;
      flex-direction: column;
      gap: var(--tc-space-2);
      margin: var(--tc-space-4) 0;
      padding: 0;
      list-style: none;
    }
    .list li {
      display: grid;
      grid-template-columns: 1fr auto;
      padding: var(--tc-space-3) var(--tc-space-4);
      border: 1px solid var(--tc-border-subtle);
      border-radius: var(--tc-radius-md);
      background: var(--tc-surface-raised);
    }
    .name {
      font-weight: var(--tc-font-weight-medium);
    }
    .meta {
      grid-row: 2;
      color: var(--tc-text-muted);
      font-size: var(--tc-font-size-sm);
    }
    .list tc-button {
      grid-row: 1 / span 2;
      grid-column: 2;
      align-self: center;
    }
    .add {
      display: flex;
      flex-direction: column;
      gap: var(--tc-space-3);
      margin-top: var(--tc-space-8);
      padding: var(--tc-space-4);
      border: 1px solid var(--tc-border-subtle);
      border-radius: var(--tc-radius-lg);
      background: var(--tc-surface-raised);
    }
    .kinds {
      display: flex;
      gap: var(--tc-space-4);
    }
    label {
      display: flex;
      flex-direction: column;
      gap: var(--tc-space-1);
      font-weight: var(--tc-font-weight-medium);
    }
    .kinds label {
      flex-direction: row;
      align-items: center;
    }
    input:not([type='radio']) {
      padding: var(--tc-space-2) var(--tc-space-3);
      border: 1px solid var(--tc-border-default);
      border-radius: var(--tc-radius-sm);
      background: var(--tc-surface-base);
      color: var(--tc-text-primary);
      font: inherit;
      font-weight: var(--tc-font-weight-regular);
    }
    .actions {
      display: flex;
      justify-content: flex-end;
    }
    .problem {
      margin: 0;
      color: var(--tc-status-danger-fg);
    }
  `,
})
export class IntegrationsPage {
  readonly #api = inject(Api);
  protected readonly session = inject(Session);

  protected readonly list = resource({
    params: () => this.session.org()?.id,
    loader: ({ params: orgId }) => this.#api.invoke(integrationsControllerList, { orgId }),
  });
  protected readonly isOwner = computed(() => this.session.org()?.role === 'owner');
  protected readonly kinds = KINDS;
  protected readonly kind = signal<Kind>('github');
  protected readonly chosen = computed(() => KINDS.find((k) => k.id === this.kind())!);
  protected readonly label = signal('');
  protected readonly repo = signal('');
  protected readonly teamId = signal('');
  protected readonly baseUrl = signal('');
  protected readonly projectKey = signal('');
  protected readonly email = signal('');
  protected readonly token = signal('');
  protected readonly saving = signal(false);
  protected readonly problem = signal('');

  protected kindName(kind: Kind): string {
    return KINDS.find((k) => k.id === kind)?.name ?? kind;
  }

  protected async add(): Promise<void> {
    const orgId = this.session.org()?.id;
    if (!orgId) return;
    const config =
      this.kind() === 'github' ? { repo: this.repo() } : this.kind() === 'linear' ? { teamId: this.teamId() } : { baseUrl: this.baseUrl(), projectKey: this.projectKey(), email: this.email() };
    this.saving.set(true);
    this.problem.set('');
    try {
      const made = await this.#api.invoke(integrationsControllerCreate, { orgId, body: { kind: this.kind(), label: this.label(), config, token: this.token() } });
      toast.success(`Connected ${made.label}`, { description: made.target });
      this.token.set('');
      this.list.reload();
    } catch (err) {
      const message = err instanceof HttpErrorResponse ? (err.error as { message?: unknown } | null)?.message : undefined;
      this.problem.set(Array.isArray(message) ? String(message[0]) : typeof message === 'string' ? message : "It couldn't be connected. Try again.");
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(i: IntegrationDto): Promise<void> {
    const orgId = this.session.org()?.id;
    if (!orgId) return;
    await this.#api.invoke(integrationsControllerRemove, { orgId, id: i.id });
    toast.success(`Removed ${i.label}`);
    this.list.reload();
  }
}
