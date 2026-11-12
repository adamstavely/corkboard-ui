import { Component, computed, inject, resource } from '@angular/core';
import { DataTable } from '@adamstavely/trenchcoat/angular/data-table';
import { Skeleton } from '@adamstavely/trenchcoat/angular/shimmer-loader';
import type { DataColumn, DataRow } from '@adamstavely/trenchcoat/data-table';
import { Api } from '../../api/generated/api';
import { providersControllerList } from '../../api/generated/fn/models/providers-controller-list';
import { Session } from '../../core/session';
import { PROVIDERS } from './connection';
import { ModelCard } from './model-card';

const COLUMNS: DataColumn[] = [
  { key: 'label', label: 'Name', type: 'title' },
  { key: 'api', label: 'API', type: 'text' },
  { key: 'model', label: 'Model', type: 'text' },
];

/** The models this workspace can use on its boards. Admins connect, test and remove them; members see the list. */
@Component({
  selector: 'app-models-page',
  imports: [ModelCard, DataTable, Skeleton],
  templateUrl: './models-page.html',
  styleUrl: './models-page.css',
})
export class ModelsPage {
  readonly #api = inject(Api);
  protected readonly session = inject(Session);

  protected readonly list = resource({
    params: () => this.session.org()?.id,
    loader: ({ params: orgId }) => this.#api.invoke(providersControllerList, { orgId }),
  });

  protected readonly isAdmin = computed(() => this.session.org()?.role === 'admin');

  protected readonly columns = COLUMNS;
  protected readonly rows = computed<DataRow[]>(() =>
    (this.list.hasValue() ? this.list.value() : []).map((p) => ({ id: p.id, label: p.label, api: PROVIDERS[p.kind].label, model: p.model })),
  );
}
