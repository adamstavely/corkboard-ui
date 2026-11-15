import { appFileName, APP_CSP, notesMessage, sandboxed } from './mini-app';

describe('mini-apps', () => {
  it('puts the no-network policy first, after the doctype if there is one', () => {
    const meta = `<meta http-equiv="Content-Security-Policy" content="${APP_CSP}">`;
    expect(sandboxed('<!DOCTYPE html><html><script>x()</script></html>')).toBe(`<!DOCTYPE html>${meta}<html><script>x()</script></html>`);
    expect(sandboxed('<p>Hi</p>')).toBe(`${meta}<p>Hi</p>`);
    expect(APP_CSP).toContain("default-src 'none'");
  });

  it('names its message and its download', () => {
    expect(notesMessage([{ id: 'n1', text: 'A', color: 'yellow' }])).toEqual({ type: 'corkboard:notes', notes: [{ id: 'n1', text: 'A', color: 'yellow' }] });
    expect(appFileName('Vote tally!')).toBe('vote-tally.html');
    expect(appFileName('  ')).toBe('app.html');
  });
});
