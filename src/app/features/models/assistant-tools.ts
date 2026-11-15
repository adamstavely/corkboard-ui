import { HttpErrorResponse } from '@angular/common/http';
import { Component, effect, inject, input, resource, signal } from '@angular/core';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { SecretField } from '@adamstavely/trenchcoat/angular/secret-field';
import { Select } from '@adamstavely/trenchcoat/angular/select';
import { Switch } from '@adamstavely/trenchcoat/angular/switch';
import { toast } from '@adamstavely/trenchcoat/toaster';
import { Api } from '../../api/generated/api';
import { toolsControllerGet } from '../../api/generated/fn/models/tools-controller-get';
import { toolsControllerUpdate } from '../../api/generated/fn/models/tools-controller-update';

type Service = 'brave' | 'tavily';

/** The web search services a workspace can use, with where to get a key. */
export const SEARCH_SERVICES: { value: Service; label: string }[] = [
  { value: 'brave', label: 'Brave Search' },
  { value: 'tavily', label: 'Tavily' },
];

/**
 * What the workspace's assistant may use beyond the board. Owners switch web search on, pick the search service and
 * give its key; everyone else sees whether it's on.
 */
@Component({
  selector: 'app-assistant-tools',
  imports: [Switch, Select, SecretField, Button],
  template: `
    <section class="card" aria-labelledby="tools-heading">
      <h2 id="tools-heading">Assistant tools</h2>
      @if (state.hasValue()) {
        @if (canManage()) {
          <tc-switch
            label="Search the web"
            description="The assistant can search the web and read public pages when the board and its files don't say. Answers list the pages they read."
            [value]="webSearch()"
            [disabled]="busy()"
            (tc-value-change)="webSearch.set($event.detail.value)"
          ></tc-switch>
          <tc-select label="Search service" [options]="services" [value]="service()" [disabled]="busy()" (tc-value-change)="service.set($any($event.detail.value))"></tc-select>
          <tc-secret-field
            [label]="state.value().hasSearchKey ? 'Replace the search key' : 'Search key'"
            description="The search service's API key. Encrypted on the server and never shown again."
            [value]="key()"
            [disabled]="busy()"
            (tc-value-change)="$event.preventDefault(); key.set($event.detail.value)"
          ></tc-secret-field>
          @if (problem(); as problem) {
            <p class="problem" role="alert">{{ problem }}</p>
          }
          <div class="actions">
            <tc-button label="Save" [loading]="busy()" (click)="save()"></tc-button>
          </div>
        } @else {
          <p class="note">{{ state.value().webSearch ? 'The assistant can search the web with ' + serviceName(state.value().searchProvider) + '.' : "The assistant doesn't search the web. An owner can switch it on here." }}</p>
        }
      } @else if (state.error()) {
        <p role="alert" class="note">The assistant's tools couldn't be loaded. Refresh to try again.</p>
      }
    </section>
  `,
  styles: `
    .card {
      display: flex;
      flex-direction: column;
      gap: var(--tc-space-4);
      padding: var(--tc-space-5);
      border: 1px solid var(--tc-border-subtle);
      border-radius: var(--tc-radius-lg);
      background: var(--tc-surface-raised);
    }
    h2 {
      margin: 0;
      font-size: var(--tc-font-size-lg);
      font-weight: var(--tc-font-weight-semibold);
      color: var(--tc-text-strong);
    }
    .note {
      margin: 0;
      color: var(--tc-text-muted);
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
export class AssistantTools {
  readonly #api = inject(Api);

  readonly orgId = input.required<string>();
  /** Owners: change the tools. */
  readonly canManage = input(false);

  protected readonly state = resource({ params: () => this.orgId(), loader: ({ params: orgId }) => this.#api.invoke(toolsControllerGet, { orgId }) });
  protected readonly services = SEARCH_SERVICES;
  protected readonly webSearch = signal(false);
  protected readonly service = signal<Service>('brave');
  protected readonly key = signal('');
  protected readonly busy = signal(false);
  protected readonly problem = signal<string | null>(null);

  constructor() {
    effect(() => {
      if (!this.state.hasValue()) return;
      const saved = this.state.value();
      this.webSearch.set(saved.webSearch);
      if (saved.searchProvider) this.service.set(saved.searchProvider);
    });
  }

  protected serviceName(value: string | null | undefined): string {
    return SEARCH_SERVICES.find((s) => s.value === value)?.label ?? 'a search service';
  }

  protected async save(): Promise<void> {
    this.busy.set(true);
    this.problem.set(null);
    try {
      const key = this.key().trim();
      await this.#api.invoke(toolsControllerUpdate, {
        orgId: this.orgId(),
        body: { webSearch: this.webSearch(), searchProvider: this.service(), ...(key ? { searchKey: key } : {}) },
      });
      this.key.set('');
      this.state.reload();
      toast.success(this.webSearch() ? 'Web search is on' : 'Web search is off');
    } catch (err) {
      const message = err instanceof HttpErrorResponse ? (err.error as { message?: unknown } | null)?.message : undefined;
      this.problem.set(typeof message === 'string' ? message : "That didn't save. Try again.");
    } finally {
      this.busy.set(false);
    }
  }
}
