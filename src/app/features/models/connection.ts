import type {
  ProviderConnectionCheck,
  ProviderConnectionCredential,
  ProviderConnectionOption,
  ProviderConnectionValue,
} from '@adamstavely/trenchcoat/provider-connection';
import type { ProviderDto } from '../../api/generated/models/provider-dto';
import type { ProviderTestDto } from '../../api/generated/models/provider-test-dto';

export type Kind = 'anthropic' | 'openai';

export const PROVIDERS: Record<Kind, ProviderConnectionOption> = {
  anthropic: { id: 'anthropic', label: 'Anthropic (Claude)', endpoint: 'https://api.anthropic.com', deploymentLabel: 'Model' },
  openai: { id: 'openai', label: 'OpenAI-compatible', endpoint: 'https://api.openai.com/v1', deploymentLabel: 'Model' },
};

/** The default model per API, for a new connection. */
export const DEFAULT_MODEL: Record<Kind, string> = { anthropic: 'claude-opus-5-5', openai: '' };

/** The stored key, as a reference the panel can show: the key itself never reaches the browser. */
export const SAVED_KEY: ProviderConnectionCredential = { id: 'saved', label: 'Saved key' };
/** A key typed into the field below the panel, not saved yet. Listed so the panel offers a choice, not a name to type. */
export const ENTERED_KEY: ProviderConnectionCredential = { id: 'entered', label: 'Key entered below' };

/** Claude's own API needs no address, but the panel always shows one: its default stands for "none". */
export function valueOf(p: Pick<ProviderDto, 'kind' | 'model' | 'baseUrl' | 'hasKey'>): ProviderConnectionValue {
  const endpoint = p.baseUrl ?? (p.kind === 'anthropic' ? PROVIDERS.anthropic.endpoint! : '');
  return { provider: p.kind, endpoint, deployment: p.model, credentialRef: p.hasKey ? SAVED_KEY.id : '' };
}

/** The address to save: none for Claude's own API. */
export function baseUrlOf(v: ProviderConnectionValue): string | undefined {
  const endpoint = v.endpoint.trim().replace(/\/+$/, '');
  if (!endpoint || (v.provider === 'anthropic' && endpoint === PROVIDERS.anthropic.endpoint)) return undefined;
  return endpoint;
}

/** A connection test's result, as the panel's health check. "error" (say, rate-limited) shows as unreachable with the API's words. */
export function checkOf(test: ProviderTestDto): ProviderConnectionCheck {
  return {
    status: test.status === 'error' ? 'unreachable' : test.status,
    at: Date.now(),
    latencyMs: test.latencyMs,
    message: test.message,
  };
}
