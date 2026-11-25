/**
 * Diagrams written as text in Mermaid: flowcharts, sequence, state, class and ER diagrams, Gantt charts, pies, journeys,
 * timelines, mind maps and a few more. Mermaid loads the first time a diagram is drawn, so boards without one never
 * fetch it. It runs at its strictest (no scripts, no click handlers, no HTML in labels) and its SVG is shown as an
 * image, so nothing in a diagram's text can run, load or be clicked on the page. Links and pictures are Corkboard's own
 * doing: links (click A href "https://…") are read here and laid over the image as ordinary links, and pictures are
 * fetched here and put inside the SVG before it's drawn.
 */

type Kind = { name: string; test: RegExp; starter?: string };

/**
 * The kinds Corkboard draws, by the word their text starts with; each draws under the settings below. The API checks
 * the same list (corkboard-api's diagram-node.ts). Those with a starter can be added from the board's menu.
 */
const KINDS = {
  flowchart: {
    name: 'Flowchart',
    test: /^(?:flowchart|graph)(?=[\s;]|$)/,
    starter: ['flowchart TD', '  start([Idea]) --> check{Worth doing?}', '  check -- Yes --> build[Build it]', '  check -- No --> park[Park it]'].join('\n'),
  },
  sequence: {
    name: 'Sequence diagram',
    test: /^sequenceDiagram(?=[\s;]|$)/,
    starter: ['sequenceDiagram', '  participant You', '  participant Corkboard', '  You->>Corkboard: Write a note', '  Corkboard-->>You: Everyone sees it'].join('\n'),
  },
  state: {
    name: 'State diagram',
    test: /^stateDiagram(?:-v2)?(?=[\s;]|$)/,
    starter: ['stateDiagram-v2', '  [*] --> Draft', '  Draft --> Review: Submit', '  Review --> Draft: Changes asked', '  Review --> Done: Approve', '  Done --> [*]'].join('\n'),
  },
  class: {
    name: 'Class diagram',
    test: /^classDiagram(?:-v2)?(?=[\s;]|$)/,
    starter: ['classDiagram', '  class Board {', '    +String title', '    +addNote()', '  }', '  class Note {', '    +String text', '  }', '  Board "1" --> "*" Note : holds'].join('\n'),
  },
  er: {
    name: 'Entity relationship',
    test: /^erDiagram(?=[\s;]|$)/,
    starter: ['erDiagram', '  BOARD ||--o{ NOTE : holds', '  PERSON ||--o{ NOTE : writes', '  BOARD {', '    string title', '  }'].join('\n'),
  },
  gantt: {
    name: 'Gantt chart',
    test: /^gantt(?=[\s;]|$)/,
    starter: [
      'gantt',
      '  title Launch plan',
      '  dateFormat YYYY-MM-DD',
      '  axisFormat %b %d',
      '  section Build',
      '    Design :a1, 2026-01-05, 7d',
      '    Build :a2, after a1, 14d',
      '  section Ship',
      '    Test :a3, after a2, 5d',
    ].join('\n'),
  },
  pie: {
    name: 'Pie chart',
    test: /^pie(?=[\s;]|$)/,
    starter: ['pie title Where the time goes', '  "Meetings" : 30', '  "Building" : 50', '  "Reviews" : 20'].join('\n'),
  },
  journey: {
    name: 'User journey',
    test: /^journey(?=[\s;]|$)/,
    starter: ['journey', '  title Joining a board', '  section Arrive', '    Open the link: 5: Guest', '    Find the notes: 3: Guest', '  section Take part', '    Add a note: 4: Guest, Host'].join(
      '\n',
    ),
  },
  timeline: {
    name: 'Timeline diagram',
    test: /^timeline(?=[\s;]|$)/,
    starter: ['timeline', '  title Roadmap', '  2026 Q1 : Plan : Hire', '  2026 Q2 : Build', '  2026 Q3 : Launch'].join('\n'),
  },
  mindmap: {
    name: 'Mind map diagram',
    test: /^mindmap(?=[\s;]|$)/,
    starter: ['mindmap', '  root((Launch))', '    Marketing', '      Blog post', '    Product', '      Docs', '      Training'].join('\n'),
  },
  quadrant: {
    name: 'Quadrant chart',
    test: /^quadrantChart(?=[\s;]|$)/,
    starter: [
      'quadrantChart',
      '  title Value and effort',
      '  x-axis Low effort --> High effort',
      '  y-axis Low value --> High value',
      '  quadrant-1 Plan',
      '  quadrant-2 Do now',
      '  quadrant-3 Drop',
      '  quadrant-4 Maybe',
      '  Search: [0.3, 0.8]',
      '  Export: [0.7, 0.4]',
    ].join('\n'),
  },
  xychart: {
    name: 'Bar and line chart',
    test: /^xychart(?:-beta)?(?=[\s;]|$)/,
    starter: ['xychart', '  title Notes per week', '  x-axis [W1, W2, W3, W4]', '  y-axis "Notes" 0 --> 50', '  bar [12, 30, 22, 41]', '  line [12, 30, 22, 41]'].join('\n'),
  },
  git: {
    name: 'Git graph',
    test: /^gitGraph(?=[\s;:]|$)/,
    starter: ['gitGraph', '  commit', '  branch feature', '  checkout feature', '  commit', '  checkout main', '  merge feature'].join('\n'),
  },
  kanban: {
    name: 'Kanban diagram',
    test: /^kanban(?=[\s;]|$)/,
    starter: ['kanban', '  todo[To do]', '    t1[Write the brief]', '  doing[Doing]', '    t2[Draw the flow]', '  done[Done]', '    t3[Kick-off]'].join('\n'),
  },
  requirement: { name: 'Requirement diagram', test: /^requirementDiagram(?=[\s;]|$)/ },
  sankey: { name: 'Sankey diagram', test: /^sankey(?:-beta)?(?=[\s;]|$)/ },
  block: { name: 'Block diagram', test: /^block(?:-beta)?(?=[\s;:]|$)/ },
  packet: { name: 'Packet diagram', test: /^packet(?:-beta)?(?=[\s;:]|$)/ },
  c4: { name: 'C4 diagram', test: /^C4(?:Context|Container|Component|Dynamic|Deployment)(?=[\s;]|$)/ },
  architecture: { name: 'Architecture diagram', test: /^architecture(?:-beta)?(?=[\s;]|$)/ },
  radar: { name: 'Radar chart', test: /^radar(?:-beta)?(?=[\s;]|$)/ },
  treemap: { name: 'Treemap', test: /^treemap(?:-beta)?(?=[\s;]|$)/ },
  venn: { name: 'Venn diagram', test: /^venn(?:-beta)?(?=[\s;]|$)/ },
  ishikawa: { name: 'Fishbone diagram', test: /^ishikawa(?:-beta)?(?=[\s;]|$)/ },
  wardley: { name: 'Wardley map', test: /^wardley(?:-beta)?(?=[\s;]|$)/ },
  // Anything else Mermaid knows: it says so itself if it doesn't.
  mermaid: { name: 'Mermaid diagram', test: /^\S/ },
} satisfies Record<string, Kind>;

type AnyKind = keyof typeof KINDS;
/** The kinds a new diagram can start as. */
export type DiagramKind = {
  [K in AnyKind]: (typeof KINDS)[K] extends { starter: string } ? K : never;
}[AnyKind];

/** What a new diagram starts as, by kind. */
export const DIAGRAM_STARTERS = Object.fromEntries(Object.entries(KINDS).flatMap(([k, v]) => ('starter' in v ? [[k, v.starter]] : []))) as Record<DiagramKind, string>;

/** The kinds a diagram can be added as, with their names, most used first. */
export const DIAGRAM_MENU: { kind: DiagramKind; name: string }[] = (Object.keys(DIAGRAM_STARTERS) as DiagramKind[]).map((kind) => ({ kind, name: KINDS[kind].name }));

/** The longest a diagram's text may be: what the server takes for it (corkboard-api's node-schema.ts). */
export const MAX_DIAGRAM_CHARS = 20_000;

/** Where a picture in a diagram can come from: a file on the board, by id. */
export const BOARD_FILE = /^corkboard-file:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
/** Front matter at the top of a diagram: only a title may go in it. */
const FRONT_MATTER = /^---[ \t]*\r?\n([\s\S]*?)\r?\n?---[ \t]*(?:\r?\n|$)/;
/** A link on a node: click A href "https://…" (the word href may be left out), with a tooltip and target if wanted. */
const CLICK = /^\s*click\s+(\S+)\s+(?:href\s+)?"([^"]*)"(?:\s+"([^"]*)")?(?:\s+_(?:blank|self|parent|top))?\s*;?\s*$/;
const CLICK_LINE = /^\s*click\s/;
/** A node's shape data, A@{ … }, and the picture in it: img: "…" (quoted or not). */
const SHAPE_DATA = /@\{([^}]*)\}/g;
const IMG = /(^|[\s,{])img(\s*:\s*)(?:"([^"]*)"|'([^']*)'|([^\s,}]+))/;

/** The text after any front matter, and the front matter's lines; null if it's never closed. */
function splitFrontMatter(text: string): { head: string[]; body: string } | null {
  if (!text.startsWith('---')) return { head: [], body: text };
  const match = FRONT_MATTER.exec(text);
  return match ? { head: match[1].split(/\r?\n/).filter((l) => l.trim()), body: text.slice(match[0].length) } : null;
}

/** Which kind a diagram's text is, or null when Corkboard doesn't draw it. */
export function diagramKind(source: string): AnyKind | null {
  const split = splitFrontMatter(source.trim());
  if (!split) return null;
  const body = split.body.replace(/^(?:\s*(?:%%[^\n]*)?\n)*\s*/, '');
  return (Object.keys(KINDS) as AnyKind[]).find((k) => KINDS[k].test.test(body)) ?? null;
}

/** A link's address if it's one a diagram may open (a web page or an email), else null. */
export function linkUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

/** A link on a diagram's node: the node's id, where it goes, and what to call it. */
export interface DiagramLink {
  node: string;
  url: string;
  label: string;
}

/** The links a diagram's nodes carry (click A href "https://…"), each named by its tooltip, else its node's label. */
export function diagramLinks(source: string): DiagramLink[] {
  return source.split('\n').flatMap((line) => {
    const m = CLICK.exec(line);
    const url = m && linkUrl(m[2]);
    return m && url ? [{ node: m[1], url, label: m[3]?.trim() || nodeLabel(source, m[1]) }] : [];
  });
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A node's label as written: A[Label], A(Label), A{Label}, A([Label]) and the like, quoted or not; else its id. */
export function nodeLabel(source: string, node: string): string {
  const id = escape(node);
  const shaped = new RegExp(`(?:^|[\\s;&>|-])${id}\\s*[\\[({>]+[/\\\\]?\\s*"?([^"\\])}\\n]+?)"?\\s*[/\\\\]?[\\])}]+`, 'm').exec(source)?.[1];
  const data = new RegExp(`${id}@\\{([^}]*)\\}`).exec(source)?.[1];
  const labelled = data ? /\blabel\s*:\s*"([^"]+)"/.exec(data)?.[1] : undefined;
  return shaped?.trim() || labelled?.trim() || node;
}

/** The text Mermaid draws: without the link lines, which are Corkboard's to follow, not Mermaid's. */
export const withoutLinks = (source: string) =>
  source
    .split('\n')
    .filter((line) => !CLICK_LINE.test(line))
    .join('\n');

/** Every picture source a diagram's text names. */
export function diagramImages(source: string): string[] {
  return [...source.matchAll(SHAPE_DATA)].flatMap(([, data]) => {
    const m = IMG.exec(data);
    return m ? [(m[3] ?? m[4] ?? m[5]).trim()] : [];
  });
}

/** Says what's wrong with a diagram's text before it's drawn, or null; the API checks the same. */
export function diagramProblem(source: string): string | null {
  const text = source.trim();
  if (!text) return 'Write a diagram: start with its kind, like “flowchart TD”.';
  // Settings (%%{init}%% or config: at the top) are Mermaid's to read: it keeps the ones that matter to safety its own.
  const split = splitFrontMatter(text);
  if (!split) return 'The --- lines at the top need closing with another ---.';
  if (!diagramKind(text))
    return 'Start with the kind of diagram: “flowchart TD”, “sequenceDiagram”, “stateDiagram-v2”, “classDiagram”, “erDiagram”, “gantt”, “pie”, “journey”, “timeline”, “mindmap” and so on.';
  for (const line of split.body.split('\n')) {
    if (!CLICK_LINE.test(line)) continue;
    const m = CLICK.exec(line);
    if (!m) return 'A link goes to a web address, written as click A href "https://…".';
    if (!linkUrl(m[2])) return 'Links in a diagram must start with https://, http:// or mailto:.';
  }
  for (const src of diagramImages(split.body)) {
    if (!BOARD_FILE.test(src) && !(/^https:\/\//i.test(src) && linkUrl(src))) return 'Pictures in a diagram must be a file on the board (corkboard-file:…) or an https:// address.';
  }
  return null;
}

/** Where a diagram's pictures come from: the board's files, and the web through the API (an SVG image can't load them). */
export interface DiagramImages {
  boardFile(fileId: string): Promise<Blob | undefined>;
  webImage(url: string): Promise<Blob | undefined>;
}

/** The picture formats a diagram shows, and the most one may weigh. */
const IMAGE_TYPES = /^image\/(?:png|jpeg|gif|webp|svg\+xml)$/;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** What a picture that can't be had shows instead: a grey frame with a mountain in it, where the picture would be. */
export const IMAGE_PLACEHOLDER = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 60 60"><rect x="1" y="1" width="58" height="58" rx="4" fill="#f2f2f2" stroke="#b3b3b3" stroke-width="2"/><path d="M12 44 26 28l9 10 6-6 7 12z" fill="#c4c4c4"/><circle cx="40" cy="20" r="5" fill="#c4c4c4"/></svg>',
)}`;

const asDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

/**
 * A diagram's text with every picture swapped for one Mermaid can draw without going anywhere: each picture is fetched
 * (board files through the board's file cache, web pictures through the API) and named by a data URL; a picture that
 * can't be had, or isn't a picture, becomes the placeholder. `complete` is false when any was missed, so the drawing
 * isn't kept for next time.
 */
export async function inlineImages(text: string, images?: DiagramImages): Promise<{ text: string; complete: boolean }> {
  const sources = [...new Set(diagramImages(text))];
  if (!sources.length) return { text, complete: true };
  let complete = true;
  const inlined = new Map<string, string>();
  await Promise.all(
    sources.map(async (src) => {
      let blob: Blob | undefined;
      try {
        const file = BOARD_FILE.exec(src)?.[1];
        if (file) blob = await images?.boardFile(file);
        else if (/^https:\/\//i.test(src)) blob = await images?.webImage(src);
      } catch {
        blob = undefined;
      }
      if (blob && IMAGE_TYPES.test(blob.type) && blob.size <= MAX_IMAGE_BYTES) {
        inlined.set(src, await asDataUrl(blob).catch(() => IMAGE_PLACEHOLDER));
      } else {
        complete = false;
        inlined.set(src, IMAGE_PLACEHOLDER);
      }
    }),
  );
  const swapped = text.replace(SHAPE_DATA, (whole, data: string) => {
    const m = IMG.exec(data);
    if (!m) return whole;
    const src = (m[3] ?? m[4] ?? m[5]).trim();
    return `@{${data.replace(IMG, `$1img$2"${inlined.get(src) ?? IMAGE_PLACEHOLDER}"`)}}`;
  });
  return { text: swapped, complete };
}

/** A box in a diagram's own units (its viewBox). */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
/** A link laid over a diagram: where it goes, and the node it covers. */
export type Hotspot = DiagramLink & { box: Box };

export type Rendered = { svg: string; width: number; height: number; view: Box; hotspots: Hotspot[] } | { error: string };

type Mermaid = typeof import('mermaid').default;
let loading: Promise<Mermaid> | null = null;
let n = 0;
const cache = new Map<string, Promise<Rendered>>();

function mermaid(): Promise<Mermaid> {
  loading ??= import('mermaid').then(({ default: m }) => {
    m.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      // What a diagram's own settings (%%{init}%%, config: in front matter) may never change, at any depth: Mermaid's
      // own safety settings, and ours, so labels stay SVG text (an image and the PNG export need that) and its CSS ours.
      secure: ['secure', 'securityLevel', 'startOnLoad', 'maxTextSize', 'suppressErrorRendering', 'maxEdges', 'htmlLabels', 'themeCSS', 'useMaxWidth', 'useWidth'],
      theme: 'neutral',
      fontFamily: 'system-ui, sans-serif',
      // Labels as SVG text, not HTML: an image doesn't always draw HTML, and the PNG export can't.
      htmlLabels: false,
      flowchart: { htmlLabels: false },
      sequence: { useMaxWidth: false },
      journey: { textPlacement: 'tspan' },
      // Gantt charts take the page's width otherwise, and come out too wide to read in a box.
      gantt: { useWidth: 720 },
      // The neutral theme writes a journey's steps in white on pale grey.
      themeCSS: 'text.task, text.journey-section { fill: #333; }',
    });
    return m;
  });
  // A failed load (offline for a moment) is tried again next time, not kept.
  loading.catch(() => (loading = null));
  return loading;
}

/**
 * Draws a diagram's text as SVG, or says what's wrong with it. The same text is drawn once, unless a picture in it
 * couldn't be had (then it's tried again next time).
 */
export function renderDiagram(source: string, images?: DiagramImages): Promise<Rendered> {
  const text = source.trim();
  let done = cache.get(text);
  if (!done) {
    done = draw(text, images);
    cache.set(text, done);
    // Keep the cache to the diagrams in use, more or less.
    if (cache.size > 64) cache.delete(cache.keys().next().value!);
  }
  return done;
}

async function draw(text: string, images?: DiagramImages): Promise<Rendered> {
  const problem = diagramProblem(text);
  if (problem) return { error: problem };
  try {
    let m: Mermaid;
    try {
      m = await mermaid();
    } catch {
      // Not the diagram's fault: draw it again when asked, rather than keep this answer.
      cache.delete(text);
      return { error: 'Diagrams couldn’t be loaded. Check your connection and try again.' };
    }
    const { text: drawable, complete } = await inlineImages(withoutLinks(text), images);
    if (!complete) cache.delete(text);
    const id = `corkboard-diagram-${++n}`;
    const { svg } = await m.render(id, drawable);
    const numbers = /viewBox="([\d.\s-]+)"/.exec(svg)?.[1]?.trim().split(/\s+/).map(Number);
    const view: Box = numbers?.length === 4 ? { x: numbers[0], y: numbers[1], w: numbers[2], h: numbers[3] } : { x: 0, y: 0, w: 400, h: 300 };
    const width = Math.ceil(view.w);
    const height = Math.ceil(view.h);
    // Mermaid sizes its SVG to the page it's on (width 100%); as an image it needs its own size to scale from.
    const sized = onlyInlinePictures(svg.replace(/<svg[^>]*>/, (tag) => tag.replace(/\s(width|height|style)="[^"]*"/g, '').replace('<svg', `<svg width="${width}" height="${height}"`)));
    const links = diagramLinks(text);
    return {
      svg: sized,
      width,
      height,
      view,
      hotspots: links.length ? measure(sized, id, links) : [],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Mermaid's parse errors span several lines: where, the text there, a pointer, and what it expected.
    const lines = message.split('\n').map((l) => l.trim());
    const expected = lines.find((l) => l.startsWith('Expecting'));
    return {
      error: [lines[0], expected].filter(Boolean).join(' ') || 'That diagram has a mistake in it.',
    };
  }
}

/** The SVG with any picture that isn't inside it already taken out: nothing in a diagram loads from anywhere. */
export const onlyInlinePictures = (svg: string) => svg.replace(/<image\b[^>]*>/g, (tag) => tag.replace(/\s(?:xlink:)?href="(?!data:image\/)[^"]*"/g, ''));

/** The id Mermaid gives a node's group in the SVG it drew as `svgId`: flowcharts, state, class and ER diagrams and more. */
export const nodeElementPattern = (svgId: string, node: string) => new RegExp(`^${escape(svgId)}-(?:(?:flowchart|state|classId|entity)-)?${escape(node)}(?:-\\d+)?$`);

/**
 * Where each linked node is in the drawing, in its own units. The SVG is put out of sight for a moment to measure its
 * nodes: parsed, never run (Mermaid's output has nothing to run, and it was on the page while Mermaid drew it). Links
 * whose node isn't found are left out.
 */
function measure(svg: string, svgId: string, links: DiagramLink[]): Hotspot[] {
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none';
  try {
    const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
    if (parsed.nodeName !== 'svg') return [];
    const root = document.adoptNode(parsed) as unknown as SVGSVGElement;
    host.append(root);
    document.body.append(host);
    const toView = root.getScreenCTM()?.inverse();
    if (!toView) return [];
    // Nodes are g.node, image nodes g.image-shape: the id is what tells.
    const groups = [...root.querySelectorAll<SVGGraphicsElement>('g[id]')];
    return links.flatMap((link) => {
      const pattern = nodeElementPattern(svgId, link.node);
      const group = groups.find((g) => pattern.test(g.id));
      const own = group?.getScreenCTM();
      if (!group || !own) return [];
      const b = group.getBBox();
      const m = toView.multiply(own);
      const corners = [
        [b.x, b.y],
        [b.x + b.width, b.y],
        [b.x, b.y + b.height],
        [b.x + b.width, b.y + b.height],
      ].map(([x, y]) => new DOMPoint(x, y).matrixTransform(m));
      const xs = corners.map((p) => p.x);
      const ys = corners.map((p) => p.y);
      const box = {
        x: Math.min(...xs),
        y: Math.min(...ys),
        w: Math.max(...xs) - Math.min(...xs),
        h: Math.max(...ys) - Math.min(...ys),
      };
      return box.w > 0 && box.h > 0 ? [{ ...link, box }] : [];
    });
  } catch {
    // Can't measure here (nothing is laid out): the diagram draws, without its links over it.
    return [];
  } finally {
    host.remove();
  }
}

/**
 * Where a node's box shows, in pixels within the diagram's box: the image (`width` by `height`) is fitted into the box
 * keeping its shape and centred (object-fit: contain), and its viewBox is fitted into the image the same way.
 */
export function placeHotspot(box: Box, view: Box, image: { width: number; height: number }, shown: { w: number; h: number }): { left: number; top: number; width: number; height: number } {
  const fit = Math.min(shown.w / image.width, shown.h / image.height);
  const iw = image.width * fit;
  const ih = image.height * fit;
  const k = Math.min(iw / view.w, ih / view.h);
  const left = (shown.w - iw) / 2 + (iw - view.w * k) / 2;
  const top = (shown.h - ih) / 2 + (ih - view.h * k) / 2;
  return {
    left: left + (box.x - view.x) * k,
    top: top + (box.y - view.y) * k,
    width: box.w * k,
    height: box.h * k,
  };
}

/** The SVG as an image source: an image can't run anything in it. */
export const svgUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** What a diagram is about, for its name: its kind, and its title or else its first node's or participant's label. */
export function diagramTitle(source: string): string {
  const text = source.trim();
  const kind = diagramKind(text) ?? 'flowchart';
  const name = KINDS[kind].name.toLowerCase();
  const titled = ['gantt', 'pie', 'journey', 'timeline', 'quadrant', 'xychart'].includes(kind);
  const title = /^---[ \t]*\n(?:(?!---)[^\n]*\n)*?[ \t]*title[ \t]*:[ \t]*([^\n]+)/.exec(text)?.[1] ?? (titled ? /^\s*(?:pie\s+)?title\s+(.+)$/m.exec(text)?.[1] : undefined);
  if (title?.trim()) return `${name} “${title.trim()}”`;
  let label: string | undefined;
  if (kind === 'flowchart' || kind === 'sequence') {
    const found = /\[\(?([^\]\)]+)\)?\]|\(\[?([^\)\]]+)\]?\)|\{([^}]+)\}|participant\s+(.+)/.exec(text);
    label = found?.slice(1).find(Boolean);
  } else if (kind === 'mindmap') {
    label = /^mindmap[^\n]*\n\s*\S*?[([{]+([^)\]}]+)/.exec(text)?.[1];
  }
  return label?.trim() ? `${name} from “${label.trim()}”` : name;
}
