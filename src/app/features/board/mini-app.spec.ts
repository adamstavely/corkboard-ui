import { appFileName, APP_CSP, HOLDER_CSP, notesMessage, sandboxed, withPolicy } from './mini-app';

describe('mini-apps', () => {
  it('puts the no-network policy first, after the doctype if there is one', () => {
    const meta = `<meta http-equiv="Content-Security-Policy" content="${APP_CSP}">`;
    expect(withPolicy('<!DOCTYPE html><html><script>x()</script></html>')).toBe(`<!DOCTYPE html>${meta}<html><script>x()</script></html>`);
    expect(withPolicy('<p>Hi</p>')).toBe(`${meta}<p>Hi</p>`);
    expect(APP_CSP).toContain("default-src 'none'");
  });

  it('runs the app inside a holder that may load no frames, so the app cannot navigate away', () => {
    const page = sandboxed('<p title="a&b">Hi</p>');
    expect(HOLDER_CSP).toContain("frame-src 'none'");
    expect(page).toContain(`content="${HOLDER_CSP}"`);
    const holder = new DOMParser().parseFromString(page, 'text/html');
    const inner = holder.querySelector('iframe')!;
    expect(inner.getAttribute('sandbox')).toBe('allow-scripts');
    expect(inner.getAttribute('srcdoc')).toBe(withPolicy('<p title="a&b">Hi</p>'));
  });

  it('names its message and its download', () => {
    expect(notesMessage([{ id: 'n1', text: 'A', color: 'yellow' }])).toEqual({ type: 'corkboard:notes', notes: [{ id: 'n1', text: 'A', color: 'yellow' }] });
    expect(appFileName('Vote tally!')).toBe('vote-tally.html');
    expect(appFileName('  ')).toBe('app.html');
  });
});
