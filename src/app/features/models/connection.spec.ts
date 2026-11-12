import { baseUrlOf, valueOf } from './connection';

describe('model connections', () => {
  it("shows Claude's own address for a connection without one, and saves it as none", () => {
    const v = valueOf({ kind: 'anthropic', model: 'claude-opus-5-5', baseUrl: null, hasKey: true });
    expect(v).toEqual({ provider: 'anthropic', endpoint: 'https://api.anthropic.com', deployment: 'claude-opus-5-5', credentialRef: 'saved' });
    expect(baseUrlOf(v)).toBeUndefined();
    expect(baseUrlOf({ ...v, endpoint: 'https://proxy.test/' })).toBe('https://proxy.test');
  });

  it('keeps the address of an OpenAI-compatible server', () => {
    const v = valueOf({ kind: 'openai', model: 'llama3.3', baseUrl: 'http://localhost:11434/v1', hasKey: false });
    expect(v.credentialRef).toBe('');
    expect(baseUrlOf(v)).toBe('http://localhost:11434/v1');
  });
});
