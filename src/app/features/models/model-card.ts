import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { ProviderConnection } from '@adamstavely/trenchcoat/angular/provider-connection';
import { SecretField } from '@adamstavely/trenchcoat/angular/secret-field';
import type { ProviderConnectionCheck, ProviderConnectionValue } from '@adamstavely/trenchcoat/provider-connection';
import { Api } from '../../api/generated/api';
import { providersControllerCreate } from '../../api/generated/fn/models/providers-controller-create';
import { providersControllerRemove } from '../../api/generated/fn/models/providers-controller-remove';
import { providersControllerTest } from '../../api/generated/fn/models/providers-controller-test';
import { providersControllerUpdate } from '../../api/generated/fn/models/providers-controller-update';
import type { ProviderDto } from '../../api/generated/models/provider-dto';
import { baseUrlOf, checkOf, DEFAULT_MODEL, ENTERED_KEY, PROVIDERS, SAVED_KEY, valueOf, type Kind } from './connection';

/**
 * One model connection for an owner to set up: its name, Trench Coat's connection panel (API, address, model, whether
 * a key is saved, and a test), and a field to enter or replace the key. With no `provider`, it adds a new one.
 */
@Component({
  selector: 'app-model-card',
  imports: [ProviderConnection, SecretField, Button],
  templateUrl: './model-card.html',
  styleUrl: './model-card.css',
})
export class ModelCard {
  readonly #api = inject(Api);

  readonly orgId = input.required<string>();
  /** The saved connection; unset for a new one. */
  readonly provider = input<ProviderDto | undefined>(undefined);
  readonly changed = output<void>();

  protected readonly label = signal('');
  protected readonly value = signal<ProviderConnectionValue>(valueOf({ kind: 'anthropic', model: DEFAULT_MODEL.anthropic, baseUrl: null, hasKey: false }));
  protected readonly key = signal('');
  protected readonly check = signal<ProviderConnectionCheck | null>(null);
  protected readonly busy = signal(false);
  protected readonly problem = signal<string | null>(null);

  /** A saved connection keeps its API; a new one can pick either. */
  protected readonly providers = computed(() => {
    const saved = this.provider();
    return saved ? [PROVIDERS[saved.kind]] : [PROVIDERS.anthropic, PROVIDERS.openai];
  });
  protected readonly credentials = computed(() => (this.provider()?.hasKey ? [SAVED_KEY, ENTERED_KEY] : [ENTERED_KEY]));
  protected readonly kind = computed(() => this.value().provider as Kind);

  constructor() {
    effect(() => {
      const saved = this.provider();
      if (!saved) return;
      this.label.set(saved.label);
      this.value.set(valueOf(saved));
    });
  }

  /** The panel keeps its own value; this mirrors it. Switching API on a new connection starts from that API's usual model. */
  protected onValue(next: ProviderConnectionValue): void {
    const prev = this.value();
    if (!this.provider() && next.provider !== prev.provider) {
      const kind = next.provider as Kind;
      next = { ...valueOf({ kind, model: DEFAULT_MODEL[kind], baseUrl: null, hasKey: false }), credentialRef: next.credentialRef };
    }
    this.value.set(next);
  }

  protected async save(): Promise<void> {
    const v = this.value();
    const label = this.label().trim();
    if (!label || !v.deployment.trim()) {
      this.problem.set('Give the model a name and a model id.');
      return;
    }
    await this.#run(async () => {
      const saved = this.provider();
      const baseUrl = baseUrlOf(v);
      const apiKey = this.key().trim() || undefined;
      if (saved) {
        await this.#api.invoke(providersControllerUpdate, {
          orgId: this.orgId(),
          id: saved.id,
          body: { label, model: v.deployment.trim(), ...(baseUrl ? { baseUrl } : {}), ...(apiKey ? { apiKey } : {}) },
        });
      } else {
        await this.#api.invoke(providersControllerCreate, {
          orgId: this.orgId(),
          body: { label, kind: this.kind(), model: v.deployment.trim(), baseUrl, apiKey },
        });
        this.label.set('');
        this.value.set(valueOf({ kind: 'anthropic', model: DEFAULT_MODEL.anthropic, baseUrl: null, hasKey: false }));
      }
      this.key.set('');
      this.changed.emit();
    });
  }

  /** Tests the saved connection – what people will use – not edits that haven't been saved yet. */
  protected async test(e: CustomEvent): Promise<void> {
    const saved = this.provider();
    if (!saved) {
      e.preventDefault();
      this.problem.set('Add the model first, then test it.');
      return;
    }
    await this.#run(async () => {
      const result = await this.#api.invoke(providersControllerTest, { orgId: this.orgId(), id: saved.id });
      this.check.set(checkOf(result));
    });
  }

  protected async remove(): Promise<void> {
    const saved = this.provider();
    if (!saved) return;
    await this.#run(async () => {
      await this.#api.invoke(providersControllerRemove, { orgId: this.orgId(), id: saved.id });
      this.changed.emit();
    });
  }

  async #run(work: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.problem.set(null);
    try {
      await work();
    } catch (err) {
      const message = err instanceof HttpErrorResponse ? (err.error as { message?: unknown } | null)?.message : undefined;
      this.problem.set(typeof message === 'string' ? message : Array.isArray(message) ? message.join(' ') : "That didn't save. Try again.");
    } finally {
      this.busy.set(false);
    }
  }
}
