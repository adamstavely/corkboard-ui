import { listen, notificationItems } from './notifications';

describe('notificationItems', () => {
  it('shows who, what, where and when, linking to the board', () => {
    expect(
      notificationItems([
        { id: '1', kind: 'mention', actor: 'Ada', title: 'mentioned you in a comment', body: 'Hi @Grace', context: 'Retro', link: '/boards/b', at: 5, read: false },
        { id: '2', kind: 'invite', actor: null, title: 'invited you', body: null, context: null, link: null, at: 4, read: true },
      ]),
    ).toEqual([
      { id: '1', title: 'mentioned you in a comment', actor: 'Ada', body: 'Hi @Grace', context: 'Retro', href: '/boards/b', time: 5, read: false, category: 'mention' },
      { id: '2', title: 'invited you', time: 4, read: true, category: 'invite' },
    ]);
  });

  it('reads events from the live stream, even when they arrive in pieces', async () => {
    const chunks = ['event: ping\ndata: \n\nevent: chan', 'ged\ndata: \n\n', 'event: changed\ndata: \n\n'];
    const real = globalThis.fetch;
    let headers: HeadersInit | undefined;
    globalThis.fetch = ((_url: string, init?: RequestInit) => {
      headers = init?.headers;
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          for (const chunk of chunks) c.enqueue(new TextEncoder().encode(chunk));
          c.close();
        },
      });
      return Promise.resolve(new Response(body, { headers: { 'Content-Type': 'text/event-stream' } }));
    }) as typeof fetch;
    try {
      const heard: string[] = [];
      await listen('/stream', 'person-1', (e) => heard.push(e), new AbortController().signal);
      expect(heard).toEqual(['ping', 'changed', 'changed']);
      expect(headers).toMatchObject({ Authorization: 'Bearer person-1' });
    } finally {
      globalThis.fetch = real;
    }
  });
});
