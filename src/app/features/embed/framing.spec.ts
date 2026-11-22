/** Node's own, reached without its types (the app doesn't install them): the tests run in Node. */
const node = (globalThis as unknown as { process: { cwd(): string; getBuiltinModule(id: 'node:fs'): { readFileSync(path: string, encoding: 'utf8'): string } } }).process;

/** The nginx config that serves the app: only embed pages may be framed by other sites. */
describe('framing headers', () => {
  const conf = node.getBuiltinModule('node:fs').readFileSync(`${node.cwd()}/nginx.conf.template`, 'utf8');
  const block = (start: string) => {
    const at = conf.indexOf(start);
    return conf.slice(at, conf.indexOf('\n  }', at));
  };

  it('refuses framing for the app, at the server and in its own location', () => {
    expect(conf.slice(0, conf.indexOf('\n  location '))).toContain(`add_header Content-Security-Policy "frame-ancestors 'none'" always;`);
    expect(conf.slice(0, conf.indexOf('\n  location '))).toContain('add_header X-Frame-Options "DENY" always;');
    const app = block('location / {');
    expect(app).toContain(`frame-ancestors 'none'`);
    expect(app).toContain('X-Frame-Options "DENY"');
  });

  it('lets any site frame embed pages, and only them, with the oEmbed link in the page', () => {
    const embed = block('location ~ "^/embed/');
    expect(embed).toContain('add_header Content-Security-Policy "frame-ancestors *" always;');
    expect(embed).not.toContain('X-Frame-Options');
    expect(embed).toContain('type="application/json+oembed"');
    expect(conf.match(/frame-ancestors \*/g)).toHaveLength(1);
  });
});
