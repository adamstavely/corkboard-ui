import { HttpErrorResponse } from '@angular/common/http';
import { Component, effect, inject, input, resource, signal } from '@angular/core';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { Switch } from '@adamstavely/trenchcoat/angular/switch';
import { toast } from '@adamstavely/trenchcoat/toaster';
import { Api } from '../../api/generated/api';
import { toolsControllerGet } from '../../api/generated/fn/models/tools-controller-get';
import { toolsControllerUpdate } from '../../api/generated/fn/models/tools-controller-update';

/** The web search services the site can use. */
export const SEARCH_SERVICES: { value: 'brave' | 'tavily'; label: string }[] = [
  { value: 'brave', label: 'Brave Search' },
  { value: 'tavily', label: 'Tavily' },
];

/**
 * What the workspace's assistant may use beyond the board. Owners switch web search (with the site's search service,
 * set by Corkboard's site admins) and mini-apps on or off; everyone else sees what's on.
 */
@Component({
  selector: 'app-assistant-tools',
  imports: [Switch, Button],
  template: `
    <section class="card" aria-labelledby="tools-heading">
      <h2 id="tools-heading">Assistant tools</h2>
      @if (state.hasValue()) {
        @if (canManage()) {
          <tc-switch
            label="Search the web"
            description="The assistant can search the web and read public pages when the board and its files don't say. Answers list the pages they read."
            [value]="webSearch()"
            [disabled]="busy() || !state.value().searchAvailable"
            (tc-value-change)="webSearch.set($event.detail.value)"
          ></tc-switch>
          @if (!state.value().searchAvailable) {
            <p class="note">
              Web search needs the site's search service, which Corkboard's site admins haven't set
              up yet.
            </p>
          }
          <tc-switch
            label="Make mini-apps"
            description="The assistant can make small apps from a board's notes, like a tally or a chart. They run sandboxed, with no network."
            [value]="miniApps()"
            [disabled]="busy()"
            (tc-value-change)="miniApps.set($event.detail.value)"
          ></tc-switch>
          @if (problem(); as problem) {
            <p class="problem" role="alert">{{ problem }}</p>
          }
          <div class="actions">
            <tc-button label="Save" [loading]="busy()" (click)="save()"></tc-button>
          </div>
        } @else {
          <p class="note">
            {{
              state.value().webSearch
                ? 'The assistant can search the web.'
                : "The assistant doesn't search the web. An owner can switch it on here."
            }}
          </p>
          <p class="note">
            {{
              state.value().miniApps
                ? 'It can make mini-apps on boards.'
                : "It doesn't make mini-apps."
            }}
          </p>
        }
      } @else if (state.error()) {
        <p role="alert" class="note">
          The assistant's tools couldn't be loaded. Refresh to try again.
        </p>
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

  protected readonly state = resource({
    params: () => this.orgId(),
    loader: ({ params: orgId }) => this.#api.invoke(toolsControllerGet, { orgId }),
  });
  protected readonly webSearch = signal(false);
  protected readonly miniApps = signal(true);
  protected readonly busy = signal(false);
  protected readonly problem = signal<string | null>(null);

  constructor() {
    effect(() => {
      if (!this.state.hasValue()) return;
      const saved = this.state.value();
      this.webSearch.set(saved.webSearch);
      this.miniApps.set(saved.miniApps);
    });
  }

  protected async save(): Promise<void> {
    this.busy.set(true);
    this.problem.set(null);
    try {
      await this.#api.invoke(toolsControllerUpdate, {
        orgId: this.orgId(),
        body: { webSearch: this.webSearch(), miniApps: this.miniApps() },
      });
      this.state.reload();
      toast.success('Assistant tools saved', {
        description: `Web search ${this.webSearch() ? 'on' : 'off'}, mini-apps ${this.miniApps() ? 'on' : 'off'}.`,
      });
    } catch (err) {
      const message =
        err instanceof HttpErrorResponse
          ? (err.error as { message?: unknown } | null)?.message
          : undefined;
      this.problem.set(typeof message === 'string' ? message : "That didn't save. Try again.");
    } finally {
      this.busy.set(false);
    }
  }
}
