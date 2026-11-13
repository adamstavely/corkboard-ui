import type { NetworkLink, NetworkNode } from '@adamstavely/trenchcoat/network-graph';

const STOP = new Set(
  'the and for are but not you all any can had her was one our out has have this that with from they will would there their what about which when your just into than then them these some more also very been were said each make made like over such only'.split(' '),
);

/** A note's words that say something: lower case, three letters or more, common words left out. */
export function keywords(text: string): Set<string> {
  return new Set((text.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []).filter((w) => !STOP.has(w)).map((w) => w.replace(/(ies|es|s)$/, '')));
}

/**
 * Notes as a graph for spotting themes: a node per note (grouped by its frame), a link between notes that share words,
 * stronger the more they share. Nothing leaves the browser.
 */
export function noteGraph(notes: readonly { id: string; text: string; frame?: string }[]): { nodes: NetworkNode[]; links: NetworkLink[] } {
  const words = notes.map((n) => keywords(n.text));
  const links: NetworkLink[] = [];
  for (let i = 0; i < notes.length; i++) {
    for (let j = i + 1; j < notes.length; j++) {
      const shared = [...words[i]].filter((w) => words[j].has(w)).length;
      if (shared) links.push({ source: notes[i].id, target: notes[j].id, value: shared });
    }
  }
  const degree = new Map<string, number>();
  for (const l of links) for (const id of [l.source, l.target]) degree.set(id, (degree.get(id) ?? 0) + 1);
  const nodes = notes.map((n) => ({ id: n.id, label: n.text.slice(0, 40) || 'Empty note', group: n.frame ?? 'Not in a frame', size: 1 + (degree.get(n.id) ?? 0) }));
  return { nodes, links };
}
