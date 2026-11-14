import { FileCache, fileSize, imageSize, shrinkImage } from './file-cache';

describe('files on the board', () => {
  it('fits images within 360 by 360, keeping their shape, never tiny', () => {
    expect(imageSize(1200, 600)).toEqual({ w: 360, h: 180 });
    expect(imageSize(200, 100)).toEqual({ w: 200, h: 100 });
    expect(imageSize(4000, 10)).toEqual({ w: 360, h: 40 });
  });

  it('writes sizes for people', () => {
    expect(fileSize(2_500_000)).toBe('2.4 MB');
    expect(fileSize(34_000)).toBe('33 KB');
    expect(fileSize(10)).toBe('1 KB');
  });

  it('settles an upload that is cancelled, before or during sending', async () => {
    const sent: { abort: () => void }[] = [];
    class FakeXhr {
      upload = {};
      responseType = '';
      onabort: (() => void) | null = null;
      onloadend: (() => void) | null = null;
      open(): void {}
      setRequestHeader(): void {}
      send(): void {
        sent.push(this);
      }
      abort(): void {
        this.onabort?.();
        this.onloadend?.();
      }
    }
    const real = globalThis.XMLHttpRequest;
    globalThis.XMLHttpRequest = FakeXhr as unknown as typeof XMLHttpRequest;
    try {
      const cache = new FileCache('b', () => 't');
      const file = new File(['x'], 'x.png', { type: 'image/png' });

      const before = new AbortController();
      before.abort();
      await expect(cache.upload(file, () => undefined, before.signal)).rejects.toMatchObject({ name: 'AbortError' });
      expect(sent).toHaveLength(0);

      const during = new AbortController();
      const upload = cache.upload(file, () => undefined, during.signal);
      await new Promise((resolve) => setTimeout(resolve));
      expect(sent).toHaveLength(1);
      during.abort();
      await expect(upload).rejects.toMatchObject({ name: 'AbortError' });
    } finally {
      globalThis.XMLHttpRequest = real;
    }
  });

  it('sends small images, GIFs and other files as they are', async () => {
    const small = new File(['x'], 'x.png', { type: 'image/png' });
    const gif = new File([new Uint8Array(2_000_000)], 'big.gif', { type: 'image/gif' });
    const pdf = new File([new Uint8Array(2_000_000)], 'big.pdf', { type: 'application/pdf' });
    for (const f of [small, gif, pdf]) expect(await shrinkImage(f)).toBe(f);
  });

  it("fetches a shared board's files with the link, not a person's token", () => {
    const calls: [string, RequestInit | undefined][] = [];
    const real = globalThis.fetch;
    globalThis.fetch = ((url: string, init?: RequestInit) => {
      calls.push([url, init]);
      return Promise.resolve(new Response(null, { status: 404 }));
    }) as typeof fetch;
    try {
      FileCache.forLink('b', 'tok/en').load(['f1']);
      expect(calls).toEqual([['/api/shared/tok%2Fen/files/f1', {}]]);
    } finally {
      globalThis.fetch = real;
    }
  });
});
