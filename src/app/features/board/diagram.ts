/**
 * Diagrams written as text in Mermaid: flowcharts and sequence diagrams. Mermaid loads the first time a diagram is
 * drawn, so boards without one never fetch it. It runs at its strictest (no scripts, no click handlers, no HTML in
 * labels) and its SVG is shown as an image, so nothing in a diagram's text can run on the page.
 */

/** What a new diagram starts as, by kind. */
export const DIAGRAM_STARTERS = {
  flowchart: ['flowchart TD', '  start([Idea]) --> check{Worth doing?}', '  check -- Yes --> build[Build it]', '  check -- No --> park[Park it]'].join('\n'),
  sequence: ['sequenceDiagram', '  participant You', '  participant Corkboard', '  You->>Corkboard: Write a note', '  Corkboard-->>You: Everyone sees it'].join('\n'),
} as const;
export type DiagramKind = keyof typeof DIAGRAM_STARTERS;

/** The longest a diagram's text may be: what the server takes for it (corkboard-api's node-schema.ts). */
export const MAX_DIAGRAM_CHARS = 20_000;

/** The kinds Corkboard draws; Mermaid knows more, but these are the two it promises. */
const KNOWN = /^\s*(flowchart|graph|sequenceDiagram)\b/;

export type Rendered = { svg: string; width: number; height: number } | { error: string };

type Mermaid = typeof import('mermaid').default;
let loading: Promise<Mermaid> | null = null;
let n = 0;
const cache = new Map<string, Promise<Rendered>>();

function mermaid(): Promise<Mermaid> {
  loading ??= import('mermaid').then(({ default: m }) => {
    m.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'neutral',
      fontFamily: 'system-ui, sans-serif',
      flowchart: { htmlLabels: false },
      sequence: { useMaxWidth: false },
    });
    return m;
  });
  // A failed load (offline for a moment) is tried again next time, not kept.
  loading.catch(() => (loading = null));
  return loading;
}

/** Draws a diagram's text as SVG, or says what's wrong with it. The same text is drawn once. */
export function renderDiagram(source: string): Promise<Rendered> {
  const text = source.trim();
  let done = cache.get(text);
  if (!done) {
    done = draw(text);
    cache.set(text, done);
    // Keep the cache to the diagrams in use, more or less.
    if (cache.size > 64) cache.delete(cache.keys().next().value!);
  }
  return done;
}

async function draw(text: string): Promise<Rendered> {
  if (!text) return { error: 'Write a flowchart or a sequence diagram.' };
  if (!KNOWN.test(text)) return { error: 'Start with “flowchart TD” for a flowchart, or “sequenceDiagram” for a sequence diagram.' };
  try {
    let m: Mermaid;
    try {
      m = await mermaid();
    } catch {
      // Not the diagram's fault: draw it again when asked, rather than keep this answer.
      cache.delete(text);
      return { error: 'Diagrams couldn’t be loaded. Check your connection and try again.' };
    }
    const { svg } = await m.render(`corkboard-diagram-${++n}`, text);
    const view = /viewBox="([\d.\s-]+)"/.exec(svg)?.[1]?.split(/\s+/).map(Number);
    const width = Math.ceil(view?.[2] ?? 400);
    const height = Math.ceil(view?.[3] ?? 300);
    // Mermaid sizes its SVG to the page it's on (width 100%); as an image it needs its own size to scale from.
    const sized = svg.replace(/<svg[^>]*>/, (tag) => tag.replace(/\s(width|height|style)="[^"]*"/g, '').replace('<svg', `<svg width="${width}" height="${height}"`));
    return { svg: sized, width, height };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Mermaid's parse errors span several lines: where, the text there, a pointer, and what it expected.
    const lines = message.split('\n').map((l) => l.trim());
    const expected = lines.find((l) => l.startsWith('Expecting'));
    return { error: [lines[0], expected].filter(Boolean).join(' ') || 'That diagram has a mistake in it.' };
  }
}

/** The SVG as an image source: an image can't run anything in it. */
export const svgUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** What a diagram is about, for its name: its first node's or participant's label, else its kind. */
export function diagramTitle(source: string): string {
  const text = source.trim();
  const label = /\[\(?([^\]\)]+)\)?\]|\(\[?([^\)\]]+)\]?\)|\{([^}]+)\}|participant\s+(.+)/.exec(text);
  const found = label?.slice(1).find(Boolean)?.trim();
  const kind = /^\s*sequenceDiagram/.test(text) ? 'sequence diagram' : 'flowchart';
  return found ? `${kind} from “${found}”` : kind;
}
