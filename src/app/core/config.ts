/**
 * Settings that differ per deployment, read from /config.json when the app starts (the Docker image writes it from
 * its environment), so one build runs anywhere.
 */
export interface RuntimeConfig {
  oidc: {
    /** The identity provider's issuer URL */
    authority: string;
    /** This app's public client id there */
    clientId: string;
  };
}

export async function loadConfig(): Promise<RuntimeConfig> {
  const res = await fetch('/config.json', { cache: 'no-store' });
  if (!res.ok) throw new Error(`Couldn't load /config.json (HTTP ${res.status})`);
  return (await res.json()) as RuntimeConfig;
}
