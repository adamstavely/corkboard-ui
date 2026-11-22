import { embedUrl, iframeSnippet, oembedUrl } from './embed-urls';

describe('embed addresses', () => {
  it('builds the embed page, its oEmbed address and an iframe to paste', () => {
    const page = embedUrl('https://cork.test', 'tok_en-1');
    expect(page).toBe('https://cork.test/embed/tok_en-1');
    expect(oembedUrl('https://cork.test', page)).toBe('https://cork.test/api/oembed?url=https%3A%2F%2Fcork.test%2Fembed%2Ftok_en-1&format=json');
    expect(iframeSnippet(page, 'Plan "Q3" <draft>')).toBe(
      '<iframe src="https://cork.test/embed/tok_en-1" width="800" height="500" style="border:0" loading="lazy" allowfullscreen title="Plan &quot;Q3&quot; &lt;draft&gt; (Corkboard board)"></iframe>',
    );
  });
});
