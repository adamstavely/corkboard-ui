import { DEFAULT_APPS, parseApps } from './apps';

describe('the app picker list', () => {
  it('keeps well-formed apps and the current id', () => {
    const cfg = parseApps({ current: 'docs', apps: [{ id: 'docs', name: 'Docs' }, { name: 'No id' }, null] });
    expect(cfg).toEqual({ current: 'docs', apps: [{ id: 'docs', name: 'Docs' }] });
  });

  it('falls back to just Corkboard when the file is empty or broken', () => {
    expect(parseApps(null)).toBe(DEFAULT_APPS);
    expect(parseApps({ apps: [] })).toBe(DEFAULT_APPS);
  });
});
