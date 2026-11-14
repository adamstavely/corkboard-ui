import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, resource, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { DataTable } from '@adamstavely/trenchcoat/angular/data-table';
import { Skeleton } from '@adamstavely/trenchcoat/angular/shimmer-loader';
import type { DataColumn, DataRow } from '@adamstavely/trenchcoat/data-table';
import { toast } from '@adamstavely/trenchcoat/toaster';
import { Api } from '../../api/generated/api';
import { adminControllerRemove } from '../../api/generated/fn/admin/admin-controller-remove';
import { adminControllerUsage } from '../../api/generated/fn/admin/admin-controller-usage';
import { providersControllerList } from '../../api/generated/fn/models/providers-controller-list';
import { providersControllerUpdate } from '../../api/generated/fn/models/providers-controller-update';
import { Auth } from '../../core/auth';
import { Session } from '../../core/session';

const BOARD_COLUMNS: DataColumn[] = [
  { key: 'title', label: 'Board', type: 'title' },
  { key: 'events', label: 'Things done', type: 'number' },
  { key: 'visitors', label: 'People', type: 'number' },
  { key: 'tokens', label: 'Model tokens', type: 'number' },
  { key: 'updated', label: 'Last change', type: 'text' },
];

const n = (v: number) => v.toLocaleString();

/**
 * Workspace owners: the last 30 days board by board, what the models used (and cost, once prices are set), a data
 * export (not a backup: see its description), and deleting the workspace.
 */
@Component({
  selector: 'app-admin-page',
  imports: [Button, DataTable, Skeleton],
  template: `
    <div class="page">
      <h1>Workspace admin</h1>
      @if (!isOwner()) {
        <p class="muted">Only owners of this workspace can see this.</p>
      } @else {
        <p class="lead">{{ session.org()?.name }}, over the last 30 days.</p>
        @if (usage.isLoading() && !usage.hasValue()) {
          <tc-skeleton height="240" radius="12"></tc-skeleton>
        } @else if (usage.hasValue()) {
          <div class="totals">
            <div><strong>{{ usage.value().totals.boards }}</strong><span>boards</span></div>
            <div><strong>{{ n(usage.value().totals.events) }}</strong><span>things done</span></div>
            <div><strong>{{ n(usage.value().totals.inputTokens + usage.value().totals.outputTokens) }}</strong><span>model tokens</span></div>
            <div><strong>{{ usage.value().totals.cost === null ? '—' : usage.value().totals.cost!.toFixed(2) }}</strong><span>estimated spend</span></div>
          </div>
          <tc-data-table heading="Boards" [columns]="boardColumns" [rows]="boardRows()" readonly></tc-data-table>

          <h2>Models</h2>
          <p class="muted">Tokens each model used. Set what you pay per million tokens to see an estimated spend.</p>
          @if (models().length) {
            <table class="spend">
              <thead>
                <tr><th scope="col">Model</th><th scope="col">Calls</th><th scope="col">Input tokens</th><th scope="col">Output tokens</th><th scope="col">Price in / out per million</th><th scope="col">Spend</th></tr>
              </thead>
              <tbody>
                @for (m of models(); track m.key) {
                  <tr>
                    <th scope="row">{{ m.label }}</th>
                    <td>{{ n(m.calls) }}</td>
                    <td>{{ n(m.input) }}</td>
                    <td>{{ n(m.output) }}</td>
                    <td>
                      @if (m.providerId) {
                        <input type="number" min="0" step="0.01" [attr.aria-label]="'Price per million input tokens for ' + m.label" [value]="m.priceIn ?? ''" (change)="setPrice(m.providerId, 'in', $any($event.target).value)" />
                        <input type="number" min="0" step="0.01" [attr.aria-label]="'Price per million output tokens for ' + m.label" [value]="m.priceOut ?? ''" (change)="setPrice(m.providerId, 'out', $any($event.target).value)" />
                      } @else {
                        <span class="muted">Removed</span>
                      }
                    </td>
                    <td>{{ m.cost === null ? '—' : m.cost.toFixed(2) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          } @else {
            <p class="muted">No model calls in the last 30 days.</p>
          }
        }

        <h2>Data</h2>
        <div class="data">
          <div>
            <strong>Download a data export</strong>
            <p class="muted">
              Members, boards (notes, frames, tasks, chat and comments), folders, models and trackers, as one JSON file. Keys and tokens are never
              included. It isn't a backup and can't be restored from: attached images and files are listed but not included, and neither are
              board-by-board sharing, saved versions or rich text formatting.
            </p>
          </div>
          <tc-button variant="secondary" label="Download" [loading]="exporting()" (click)="download()"></tc-button>
        </div>
        <div class="data danger">
          <div>
            <strong>Delete this workspace</strong>
            <p class="muted">
              Every board, comment and file in it goes, for everyone, and can't be brought back; the data export doesn't keep attached files. You
              can't delete your only workspace.
            </p>
          </div>
          @if (!confirming()) {
            <tc-button variant="secondary" label="Delete workspace…" (click)="confirming.set(true)"></tc-button>
          }
        </div>
        @if (confirming()) {
          <form class="confirm" (submit)="$event.preventDefault(); remove(typed.value)" aria-label="Confirm deleting the workspace">
            <label>
              <span>Type <strong>{{ session.org()?.name }}</strong> to delete it and everything in it. This can't be undone.</span>
              <input #typed autocomplete="off" />
            </label>
            <div class="confirm-actions">
              <tc-button variant="ghost" label="Cancel" (click)="confirming.set(false); problem.set('')"></tc-button>
              <tc-button type="submit" label="Delete for good" [loading]="deleting()"></tc-button>
            </div>
            @if (problem()) {
              <p class="problem" role="alert">{{ problem() }}</p>
            }
          </form>
        }
      }
    </div>

  `,
  styles: `
    .page {
      max-width: 960px;
      margin: 0 auto;
      padding: var(--tc-space-8) var(--tc-space-4);
    }
    h1 {
      margin: 0;
      font-size: var(--tc-font-size-2xl);
    }
    h2 {
      margin: var(--tc-space-8) 0 var(--tc-space-1);
      font-size: var(--tc-font-size-lg);
    }
    .lead,
    .muted {
      color: var(--tc-text-muted);
    }
    .muted {
      margin: 0 0 var(--tc-space-3);
      font-size: var(--tc-font-size-sm);
    }
    .totals {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: var(--tc-space-3);
      margin: var(--tc-space-4) 0;
    }
    .totals div {
      display: flex;
      flex-direction: column;
      padding: var(--tc-space-3) var(--tc-space-4);
      border: 1px solid var(--tc-border-subtle);
      border-radius: var(--tc-radius-md);
      background: var(--tc-surface-raised);
    }
    .totals strong {
      font-size: var(--tc-font-size-xl);
    }
    .totals span {
      color: var(--tc-text-muted);
      font-size: var(--tc-font-size-sm);
    }
    .spend {
      width: 100%;
      border-collapse: collapse;
      font-size: var(--tc-font-size-sm);
    }
    .spend th,
    .spend td {
      padding: var(--tc-space-2);
      border-bottom: 1px solid var(--tc-border-subtle);
      text-align: left;
    }
    .spend input {
      width: 80px;
      margin-right: 4px;
      padding: 2px 6px;
      border: 1px solid var(--tc-border-default);
      border-radius: var(--tc-radius-sm);
      background: var(--tc-surface-base);
      color: var(--tc-text-primary);
      font: inherit;
    }
    .data {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--tc-space-4);
      padding: var(--tc-space-3) var(--tc-space-4);
      border: 1px solid var(--tc-border-subtle);
      border-radius: var(--tc-radius-md);
      background: var(--tc-surface-raised);
    }
    .data + .data {
      margin-top: var(--tc-space-2);
    }
    .data .muted {
      margin: 2px 0 0;
    }
    .danger strong {
      color: var(--tc-status-danger-fg);
    }
    .confirm {
      display: flex;
      flex-direction: column;
      gap: var(--tc-space-2);
      margin-top: var(--tc-space-2);
      padding: var(--tc-space-3) var(--tc-space-4);
      border: 1px solid var(--tc-status-danger-fg);
      border-radius: var(--tc-radius-md);
    }
    .confirm label {
      display: flex;
      flex-direction: column;
      gap: var(--tc-space-1);
    }
    .confirm-actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--tc-space-2);
    }
    .confirm input {
      padding: var(--tc-space-2) var(--tc-space-3);
      border: 1px solid var(--tc-border-default);
      border-radius: var(--tc-radius-sm);
      background: var(--tc-surface-base);
      color: var(--tc-text-primary);
      font: inherit;
    }
    .problem {
      width: 100%;
      margin: 0;
      color: var(--tc-status-danger-fg);
    }
  `,
})
export class AdminPage {
  readonly #api = inject(Api);
  readonly #auth = inject(Auth);
  readonly #router = inject(Router);
  protected readonly session = inject(Session);
  protected readonly n = n;

  protected readonly isOwner = computed(() => this.session.org()?.role === 'owner');
  protected readonly usage = resource({
    params: () => (this.isOwner() ? this.session.org()?.id : undefined),
    loader: ({ params: orgId }) => this.#api.invoke(adminControllerUsage, { orgId }),
  });
  readonly #providers = resource({
    params: () => (this.isOwner() ? this.session.org()?.id : undefined),
    loader: ({ params: orgId }) => this.#api.invoke(providersControllerList, { orgId }),
  });

  protected readonly boardColumns = BOARD_COLUMNS;
  protected readonly boardRows = computed<DataRow[]>(() =>
    (this.usage.hasValue() ? this.usage.value().boards : []).map((b) => ({
      id: b.id,
      title: b.title,
      events: b.events,
      visitors: b.visitors,
      tokens: b.tokens,
      updated: new Date(b.updatedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
    })),
  );
  /** Each model with its prices, including ones not used yet so their prices can be set ahead. */
  protected readonly models = computed(() => {
    const used = this.usage.hasValue() ? this.usage.value().models : [];
    const providers = this.#providers.hasValue() ? this.#providers.value() : [];
    const rows = used.map((u) => {
      const p = providers.find((x) => x.id === u.providerId);
      return { key: u.providerId ?? u.label, providerId: u.providerId, label: u.label, calls: u.calls, input: u.inputTokens, output: u.outputTokens, cost: u.cost, priceIn: p?.priceInPerMillion ?? null, priceOut: p?.priceOutPerMillion ?? null };
    });
    for (const p of providers) {
      if (!rows.some((r) => r.providerId === p.id)) rows.push({ key: p.id, providerId: p.id, label: p.label, calls: 0, input: 0, output: 0, cost: null, priceIn: p.priceInPerMillion, priceOut: p.priceOutPerMillion });
    }
    return rows;
  });

  protected readonly exporting = signal(false);
  protected readonly confirming = signal(false);
  protected readonly deleting = signal(false);
  protected readonly problem = signal('');

  protected async setPrice(providerId: string, which: 'in' | 'out', raw: string): Promise<void> {
    const orgId = this.session.org()?.id;
    if (!orgId) return;
    const value = raw.trim() === '' ? null : Math.max(0, Number(raw));
    if (value !== null && !Number.isFinite(value)) return;
    await this.#api.invoke(providersControllerUpdate, { orgId, id: providerId, body: which === 'in' ? { priceInPerMillion: value } : { priceOutPerMillion: value } });
    this.#providers.reload();
    this.usage.reload();
  }

  /** The export is an authenticated download, so it's fetched and handed to the browser as a file. */
  protected async download(): Promise<void> {
    const orgId = this.session.org()?.id;
    if (!orgId) return;
    this.exporting.set(true);
    try {
      const res = await fetch(`/api/orgs/${orgId}/admin/export`, { headers: { Authorization: `Bearer ${this.#auth.token() ?? ''}` } });
      if (!res.ok) throw new Error(`The export answered ${res.status}`);
      const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? 'corkboard-workspace.json';
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success('Workspace downloaded', { description: name });
    } catch (err) {
      toast.error("The workspace couldn't be downloaded", { description: (err as Error).message });
    } finally {
      this.exporting.set(false);
    }
  }

  protected async remove(typed: string): Promise<void> {
    const org = this.session.org();
    if (!org) return;
    this.deleting.set(true);
    this.problem.set('');
    try {
      await this.#api.invoke(adminControllerRemove, { orgId: org.id, body: { confirm: typed } });
      toast.success(`Deleted ${org.name}`);
      this.confirming.set(false);
      this.session.refresh();
      void this.#router.navigateByUrl('/');
    } catch (err) {
      const message = err instanceof HttpErrorResponse ? (err.error as { message?: unknown } | null)?.message : undefined;
      this.problem.set(typeof message === 'string' ? message : "It couldn't be deleted. Try again.");
    } finally {
      this.deleting.set(false);
    }
  }
}
