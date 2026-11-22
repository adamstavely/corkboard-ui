/** Someone a comment can mention. */
export interface MentionPerson {
  id: string;
  name: string;
}

/**
 * A mention picked from the list, as the API stores it: "@[Ada Lovelace](<their user id>)". It names one person even
 * when two share a name, and reads as "@Ada Lovelace".
 */
const MENTION = /@\[([^[\]\n]{1,200})\]\(([0-9a-f-]{36})\)/gi;

/** The text as people read it: each picked mention as "@Name". */
export function plainMentions(text: string): string {
  return text.replace(MENTION, '@$1');
}

/** The names of the people picked in a text. */
export function pickedNames(text: string): string[] {
  return [...text.matchAll(MENTION)].map((m) => m[1]);
}

/** Where "@name" starts in a text, ignoring case, when it isn't the start of a longer word ("@Gracefully"). */
function find(lower: string, name: string, from = 0): number {
  const needle = `@${name.toLowerCase()}`;
  for (let i = lower.indexOf(needle, from); i >= 0; i = lower.indexOf(needle, i + 1)) {
    if (!/[\p{L}\p{N}]/u.test(lower[i + needle.length] ?? '')) return i;
  }
  return -1;
}

/**
 * The draft as it's sent: each person picked from the list, in turn, takes the first "@Name" still written as text.
 * One deleted from the draft since is simply not there; one typed by hand stays as typed, for the API to match by name.
 */
export function writeMentions(text: string, picks: readonly MentionPerson[]): string {
  let out = text;
  for (const p of picks) {
    const name = p.name.replace(/[[\]\n]/g, '').trim();
    const i = find(out.toLowerCase(), name);
    if (!name || i < 0) continue;
    out = `${out.slice(0, i)}@[${name}](${p.id})${out.slice(i + name.length + 1)}`;
  }
  return out;
}

/**
 * People in the workspace a draft names who can't open the board, so won't be told: those written in full, or by a
 * first name nobody who can open it shares.
 */
export function shutOut(
  text: string,
  members: readonly { userId: string; name: string; role: unknown }[],
): MentionPerson[] {
  const lower = plainMentions(text).toLowerCase();
  if (!lower.includes('@')) return [];
  const first = (name: string) => name.split(/\s+/)[0].toLowerCase();
  const openFirsts = new Set(members.filter((m) => m.role).map((m) => first(m.name)));
  return members
    .filter((m) => !m.role)
    .filter(
      (m) =>
        find(lower, m.name) >= 0 ||
        (!openFirsts.has(first(m.name)) && find(lower, first(m.name)) >= 0),
    )
    .map((m) => ({ id: m.userId, name: m.name }));
}

/** Where mentions of these names are in a text, as [start, end) spans, longest name first and never overlapping. */
export function mentionSpans(text: string, names: Iterable<string>): [number, number][] {
  const lower = text.toLowerCase();
  const spans: [number, number][] = [];
  const sorted = [...new Set([...names].map((n) => n.trim()).filter(Boolean))].sort(
    (a, b) => b.length - a.length,
  );
  for (const name of sorted) {
    for (let i = find(lower, name); i >= 0; i = find(lower, name, i + 1)) {
      const span: [number, number] = [i, i + name.length + 1];
      if (!spans.some(([s, e]) => span[0] < e && s < span[1])) spans.push(span);
    }
  }
  return spans.sort((a, b) => a[0] - b[0]);
}

/** The CSS highlight mentions in comment threads are painted with (see styles.css). */
export const MENTION_HIGHLIGHT = 'comment-mention';

/**
 * Paints the mentions in the comment texts under `root` with the CSS Custom Highlight API, which marks ranges of text
 * without touching the DOM Trench Coat renders. Where the browser has no such API, the text shows as it is.
 */
export function paintMentions(root: ParentNode, names: Iterable<string>): void {
  const registry = (globalThis.CSS as { highlights?: Map<string, unknown> } | undefined)
    ?.highlights;
  const HighlightCtor = (globalThis as { Highlight?: new (...ranges: Range[]) => unknown })
    .Highlight;
  if (!registry || !HighlightCtor) return;
  const list = [...names];
  const ranges: Range[] = [];
  for (const p of root.querySelectorAll('.ui-ct__text')) {
    const walker = p.ownerDocument.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    for (
      let node = walker.nextNode() as Text | null;
      node;
      node = walker.nextNode() as Text | null
    ) {
      for (const [start, end] of mentionSpans(node.data, list)) {
        const range = p.ownerDocument.createRange();
        range.setStart(node, start);
        range.setEnd(node, end);
        ranges.push(range);
      }
    }
  }
  registry.set(MENTION_HIGHLIGHT, new HighlightCtor(...ranges));
}

export function unpaintMentions(): void {
  (globalThis.CSS as { highlights?: Map<string, unknown> } | undefined)?.highlights?.delete(
    MENTION_HIGHLIGHT,
  );
}
