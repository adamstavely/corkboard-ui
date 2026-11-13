import { computed, resource, signal } from '@angular/core';
import type { Api } from '../../api/generated/api';
import { providersControllerList } from '../../api/generated/fn/models/providers-controller-list';

const MODEL_KEY = 'corkboard.model';

function stored(): string | null {
  try {
    return localStorage.getItem(MODEL_KEY);
  } catch {
    return null;
  }
}

/**
 * The workspace's models, and the one this browser picked last (or the first). Shared by the chat and the summary, so
 * picking a model in one picks it in both. Call it in an injection context: it makes a resource.
 */
export function modelChoice(api: Api, orgId: () => string) {
  const models = resource({
    params: () => orgId(),
    loader: ({ params }) => api.invoke(providersControllerList, { orgId: params }),
  });
  const options = computed(() => (models.hasValue() ? models.value() : []).map((m) => ({ value: m.id, label: m.label })));
  const chosen = signal<string | null>(stored());
  const modelId = computed<string | undefined>(() => options().find((o) => o.value === chosen())?.value ?? options()[0]?.value);
  const name = computed(() => options().find((o) => o.value === modelId())?.label ?? 'Assistant');
  const choose = (id: string) => {
    chosen.set(id);
    try {
      localStorage.setItem(MODEL_KEY, id);
    } catch {
      // Blocked storage: the choice lasts for this page only.
    }
  };
  return { models, options, modelId, name, choose };
}
