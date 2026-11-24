import { HttpErrorResponse } from '@angular/common/http';
import { Component, effect, inject, resource, signal } from '@angular/core';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { SecretField } from '@adamstavely/trenchcoat/angular/secret-field';
import { Select } from '@adamstavely/trenchcoat/angular/select';
import { Skeleton } from '@adamstavely/trenchcoat/angular/shimmer-loader';
import { toast } from '@adamstavely/trenchcoat/toaster';
import { Api } from '../../api/generated/api';
import { siteModelsControllerList } from '../../api/generated/fn/site/site-models-controller-list';
import { siteModelsControllerUpdate } from '../../api/generated/fn/site/site-models-controller-update';
import { siteSearchControllerGet } from '../../api/generated/fn/site/site-search-controller-get';
import { siteSearchControllerSet } from '../../api/generated/fn/site/site-search-controller-set';
import { Session } from '../../core/session';
import { WorkspaceLogos } from '../admin/workspace-logos';
import { SEARCH_SERVICES } from '../models/assistant-tools';
import { ModelCard } from '../models/model-card';

const message = (err: unknown): string => {
  const m =
    err instanceof HttpErrorResponse
      ? (err.error as { message?: unknown } | null)?.message
      : undefined;
  return typeof m === 'string' ? m : Array.isArray(m) ? m.join(' ') : 'Try again.';
};

/**
 * Corkboard's site admin page: the AI connections every workspace chooses from (and what they cost), the search
 * service the assistant's web search uses, and the cloud icon library. Nothing here shows, or opens, any workspace or
 * board: site admins are in those only when invited, like anyone.
 */
@Component({
  selector: 'app-site-page',
  imports: [ModelCard, WorkspaceLogos, Button, SecretField, Select, Skeleton],
  template: `
    <div class="page">
      <h1>Site admin</h1>
      @if (!session.siteAdmin()) {
        <p class="lead">This page is for Corkboard's site admins.</p>
      } @else {
        <p class="lead">
          What every workspace shares: the AI models they choose from, web search, and the cloud
          icon library. Workspaces and boards stay their own: being a site admin doesn't open them.
        </p>

        <section aria-labelledby="models-heading">
          <h2 id="models-heading">AI connections</h2>
          <p class="note">
            Each workspace's owners choose which of these their people use. Keys are encrypted and
            never shown again.
          </p>
          @if (models.isLoading() && !models.hasValue()) {
            <tc-skeleton height="240" radius="12"></tc-skeleton>
          } @else if (models.error()) {
            <p role="alert">The connections couldn't be loaded. Refresh to try again.</p>
          } @else {
            <div class="cards">
              @for (provider of models.value(); track provider.id) {
                <app-model-card [provider]="provider" (changed)="models.reload()" />
              }
              <app-model-card (changed)="models.reload()" />
            </div>
            @if (models.value()?.length) {
              <table class="prices">
                <caption>
                  What the site pays per million tokens, for each workspace's estimated spend
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Model</th>
                    <th scope="col">Input</th>
                    <th scope="col">Output</th>
                  </tr>
                </thead>
                <tbody>
                  @for (m of models.value(); track m.id) {
                    <tr>
                      <th scope="row">{{ m.label }}</th>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          [attr.aria-label]="'Price per million input tokens for ' + m.label"
                          [value]="m.priceInPerMillion ?? ''"
                          (change)="setPrice(m.id, 'in', $any($event.target).value)"
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          [attr.aria-label]="'Price per million output tokens for ' + m.label"
                          [value]="m.priceOutPerMillion ?? ''"
                          (change)="setPrice(m.id, 'out', $any($event.target).value)"
                        />
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            }
          }
        </section>

        <section aria-labelledby="search-heading">
          <h2 id="search-heading">Web search</h2>
          <p class="note">
            The search service the assistant uses when a workspace switches web search on.
          </p>
          @if (search.hasValue()) {
            <div class="search">
              <tc-select
                label="Search service"
                [options]="services"
                [value]="service()"
                [disabled]="busy()"
                (tc-value-change)="service.set($any($event.detail.value))"
              ></tc-select>
              <tc-secret-field
                [label]="search.value().hasKey ? 'Replace the search key' : 'Search key'"
                description="The search service's API key. Encrypted on the server and never shown again."
                [value]="key()"
                [disabled]="busy()"
                (tc-value-change)="$event.preventDefault(); key.set($event.detail.value)"
              ></tc-secret-field>
              <p class="note">
                {{
                  search.value().hasKey
                    ? 'Web search is available to workspaces.'
                    : 'No key yet: workspaces can’t switch web search on.'
                }}
              </p>
              <div class="actions">
                @if (search.value().hasKey) {
                  <tc-button
                    variant="ghost"
                    label="Remove the key"
                    [disabled]="busy()"
                    (click)="saveSearch(true)"
                  ></tc-button>
                }
                <tc-button label="Save" [loading]="busy()" (click)="saveSearch(false)"></tc-button>
              </div>
            </div>
          }
        </section>

        <section aria-labelledby="icons-heading">
          <h2 id="icons-heading">Cloud icon library</h2>
          <p class="note">
            The cloud vendors' service icons, for diagrams on every workspace's boards. Their terms
            don't let Corkboard ship them, so add the SVG files from each vendor's own icon
            download, and replace the pack when the vendor publishes a new one.
          </p>
          <app-workspace-logos />
        </section>
      }
    </div>
  `,
  styles: `
    .page {
      display: flex;
      flex-direction: column;
      gap: var(--tc-space-6);
      max-width: 960px;
      margin: 0 auto;
      padding: var(--tc-space-6) var(--tc-space-4);
    }
    h1 {
      margin: 0;
    }
    section {
      display: flex;
      flex-direction: column;
      gap: var(--tc-space-3);
    }
    h2 {
      margin: 0;
      font-size: var(--tc-font-size-2xl);
    }
    .lead,
    .note {
      margin: 0;
      color: var(--tc-text-secondary);
    }
    .note {
      font-size: var(--tc-font-size-md);
    }
    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: var(--tc-space-4);
    }
    .prices {
      border-collapse: collapse;
      font-size: var(--tc-font-size-sm);
    }
    .prices caption {
      margin-bottom: var(--tc-space-2);
      color: var(--tc-text-secondary);
      text-align: left;
    }
    .prices th,
    .prices td {
      padding: var(--tc-space-1) var(--tc-space-3) var(--tc-space-1) 0;
      text-align: left;
    }
    .prices input {
      width: 7rem;
      height: 32px;
      padding: 0 var(--tc-space-2);
      border: 1px solid var(--tc-border-default);
      border-radius: var(--tc-radius-md);
      background: var(--tc-surface-base, var(--tc-surface-raised));
      color: var(--tc-text-primary);
      font: inherit;
    }
    .search {
      display: flex;
      flex-direction: column;
      gap: var(--tc-space-3);
      max-width: 560px;
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--tc-space-2);
    }
  `,
})
export class SitePage {
  readonly #api = inject(Api);
  protected readonly session = inject(Session);

  protected readonly models = resource({
    params: () => this.session.siteAdmin() || undefined,
    loader: () => this.#api.invoke(siteModelsControllerList, {}),
  });
  protected readonly search = resource({
    params: () => this.session.siteAdmin() || undefined,
    loader: () => this.#api.invoke(siteSearchControllerGet, {}),
  });
  protected readonly services = SEARCH_SERVICES;
  protected readonly service = signal<'brave' | 'tavily'>('brave');
  protected readonly key = signal('');
  protected readonly busy = signal(false);

  constructor() {
    effect(() => {
      const saved = this.search.hasValue() ? this.search.value().provider : null;
      if (saved) this.service.set(saved);
    });
  }

  protected async setPrice(id: string, which: 'in' | 'out', raw: string): Promise<void> {
    const value = raw.trim() === '' ? null : Math.max(0, Number(raw));
    if (value !== null && !Number.isFinite(value)) return;
    try {
      await this.#api.invoke(siteModelsControllerUpdate, {
        id,
        body: which === 'in' ? { priceInPerMillion: value } : { priceOutPerMillion: value },
      });
      this.models.reload();
    } catch (err) {
      toast.error("The price didn't save", { description: message(err) });
    }
  }

  /** Saves the search service, with the key typed if there is one (none keeps the saved key); or removes the key. */
  protected async saveSearch(remove: boolean): Promise<void> {
    this.busy.set(true);
    try {
      const key = this.key().trim();
      await this.#api.invoke(siteSearchControllerSet, {
        body: { provider: this.service(), ...(remove ? { key: '' } : key ? { key } : {}) },
      });
      this.key.set('');
      this.search.reload();
      toast.success(remove ? 'Removed the search key' : 'Saved web search');
    } catch (err) {
      toast.error("Web search didn't save", { description: message(err) });
    } finally {
      this.busy.set(false);
    }
  }
}
