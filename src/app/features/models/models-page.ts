import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, resource, signal } from '@angular/core';
import { DataTable } from '@adamstavely/trenchcoat/angular/data-table';
import { Skeleton } from '@adamstavely/trenchcoat/angular/shimmer-loader';
import { Switch } from '@adamstavely/trenchcoat/angular/switch';
import type { DataColumn, DataRow } from '@adamstavely/trenchcoat/data-table';
import { toast } from '@adamstavely/trenchcoat/toaster';
import { Api } from '../../api/generated/api';
import { providersControllerChoices } from '../../api/generated/fn/models/providers-controller-choices';
import { providersControllerList } from '../../api/generated/fn/models/providers-controller-list';
import { providersControllerSetEnabled } from '../../api/generated/fn/models/providers-controller-set-enabled';
import { Session } from '../../core/session';
import { PROVIDERS } from './connection';
import { AssistantTools } from './assistant-tools';

const COLUMNS: DataColumn[] = [
  { key: 'label', label: 'Name', type: 'title' },
  { key: 'api', label: 'API', type: 'text' },
  { key: 'model', label: 'Model', type: 'text' },
];

/**
 * The models this workspace's people can use on its boards. Corkboard's site admins connect them; the workspace's owners
 * choose which ones it uses; everyone sees the list.
 */
@Component({
  selector: 'app-models-page',
  imports: [AssistantTools, DataTable, Skeleton, Switch],
  templateUrl: './models-page.html',
  styleUrl: './models-page.css',
})
export class ModelsPage {
  readonly #api = inject(Api);
  protected readonly session = inject(Session);

  protected readonly isOwner = computed(() => this.session.org()?.role === 'owner');
  protected readonly list = resource({
    params: () => this.session.org()?.id,
    loader: ({ params: orgId }) => this.#api.invoke(providersControllerList, { orgId }),
  });
  /** Owners: every model the site offers, switched on or not. */
  protected readonly choices = resource({
    params: () => (this.isOwner() ? this.session.org()?.id : undefined),
    loader: ({ params: orgId }) => this.#api.invoke(providersControllerChoices, { orgId }),
  });
  protected readonly busy = signal<string | null>(null);

  protected readonly columns = COLUMNS;
  protected readonly rows = computed<DataRow[]>(() =>
    (this.list.hasValue() ? this.list.value() : []).map((p) => ({
      id: p.id,
      label: p.label,
      api: PROVIDERS[p.kind].label,
      model: p.model,
    })),
  );
  protected readonly apiName = (kind: 'anthropic' | 'openai') => PROVIDERS[kind].label;

  protected async setEnabled(id: string, label: string, enabled: boolean): Promise<void> {
    const orgId = this.session.org()?.id;
    if (!orgId) return;
    this.busy.set(id);
    try {
      await this.#api.invoke(providersControllerSetEnabled, { orgId, id, body: { enabled } });
      this.choices.reload();
      this.list.reload();
      toast.success(
        enabled ? `People here can use ${label}` : `${label} is off for this workspace`,
      );
    } catch (err) {
      const message =
        err instanceof HttpErrorResponse
          ? (err.error as { message?: unknown } | null)?.message
          : undefined;
      toast.error("That didn't change", {
        description: typeof message === 'string' ? message : 'Try again.',
      });
      this.choices.reload();
    } finally {
      this.busy.set(null);
    }
  }
}
