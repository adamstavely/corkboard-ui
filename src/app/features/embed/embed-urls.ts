/** An embedded board's page, which other tools put in an iframe. */
export const embedUrl = (origin: string, token: string) => `${origin}/embed/${token}`;

/** Where oEmbed consumers ask about an embed page (the API, through the UI's /api). */
export const oembedUrl = (origin: string, page: string) => `${origin}/api/oembed?url=${encodeURIComponent(page)}&format=json`;

const escapeAttr = (text: string) => text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** The iframe to paste where a tool takes HTML (Confluence's HTML macro, a wiki page). */
export const iframeSnippet = (page: string, title: string) =>
  `<iframe src="${escapeAttr(page)}" width="800" height="500" style="border:0" loading="lazy" allowfullscreen title="${escapeAttr(`${title} (Corkboard board)`)}"></iframe>`;
