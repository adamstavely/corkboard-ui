import type { BoardDoc, Frame, Item, Layout, NoteColor } from '../board-doc';
import { plainText } from '../comments';
import { c4Engine } from './vendor/c4';

/**
 * Editable C4 diagrams at all four levels, from the skill's C4 JSON or Mermaid C4: the Ultimate Diagram skill's C4
 * engine (vendor/) places people, systems, containers, databases and queues in nested boundaries and routes the
 * relations. A group opens or closes to one box: a system to its containers (level 2), a container to its components
 * (level 3), a component to its code, its classes, interfaces and enums with their members (level 4). They become board
 * things tagged with their parts.
 */

const TOKENS = {
  font: { metrics: { label: 7.4, title: 7.4, detail: 6.4, note: 6.2, type: 6.6, edgeLabel: 7, edgeWrap: 6.6 } },
  // The skill's C4 sizes (assets/tokens/default.json): card, group tag, ring and flow spacing.
  c4: {
    cardW: 156, cardMaxW: 240, cardH: 112, cardLine: 18, pad: 14, tagH: 44, padB: 14, tagPad: 72, emptyW: 200, emptyH: 96, innerGap: 20, innerLinkX: 120, innerLinkY: 64,
    ringV: 72, ringH: 130, ringGap: 34, ringLinkX: 150, ringLinkY: 90, ringStagger: 6, ringStaggerCap: 12, centreGap: 50, rowMax: 8, margin: 48, sep: 24,
    flowAcross: 56, flowAlong: 72, flowPerEdge: 10, flowEdgeCap: 8, flowRowGap: 40, labelMaxW: 140,
  },
};

type Pt = [number, number];
export const C4_KINDS = ['person', 'system', 'container', 'database', 'queue', 'external', 'component', 'code'] as const;
export type C4Kind = (typeof C4_KINDS)[number];
export interface C4Element {
  id: string;
  kind: C4Kind;
  name: string;
  description?: string;
  tech?: string;
  group?: string;
  icon?: string;
  color?: string;
  core?: boolean;
  side?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  _hidden?: boolean;
}
/** A group's kind: who owns what (boundary), or a system, container or component opened to what's inside it. */
export const C4_GROUP_KINDS = ['boundary', 'system', 'container', 'component'] as const;
export type C4GroupKind = (typeof C4_GROUP_KINDS)[number];
/** The level at which each kind of group opens: a system shows its containers at 2, and so on. */
const OPENS_AT: Partial<Record<C4GroupKind, number>> = { system: 2, container: 3, component: 4 };
export interface C4Group {
  id: string;
  name: string;
  kind: C4GroupKind;
  parent?: string;
  collapsed?: boolean;
  core?: boolean;
  side?: string;
  color?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  _hidden?: boolean;
  _collapsed?: boolean;
}
export interface C4Relation {
  id?: string;
  from: string;
  to: string;
  label: string;
  tech?: string;
  async?: boolean;
}
export interface C4Data {
  diagramType: 'c4';
  schemaVersion?: number;
  title?: string;
  arrange?: 'surround' | 'flow' | 'layers';
  colorKey?: Record<string, string>;
  groups: C4Group[];
  elements: C4Element[];
  relations: C4Relation[];
  notes?: { id: string; text: string; elements?: string[]; groups?: string[] }[];
  _edges?: { from: string; to: string; members: number[]; points?: Pt[]; path?: string; labelBox?: { x: number; y: number; w: number; h: number } }[];
}
interface C4Engine {
  layoutDiagram(data: C4Data): void;
  routeDiagram(data: C4Data, opts?: object): void;
  fromMermaid(text: string): { data: C4Data; infos: string[]; warnings: string[] };
  toMermaid(data: C4Data, opts?: object): string;
}
let engine: C4Engine | undefined;
const c4 = (): C4Engine => (engine ??= c4Engine(TOKENS) as C4Engine);

const S = 1.25;
const PAD = 24;
const TITLE = 56;
const NOTE = { w: 220, h: 140, gap: 24 };
const SLOT_COLOURS: NoteColor[] = ['blue', 'green', 'yellow', 'purple', 'pink', 'gray', 'blue', 'green', 'gray'];
/** A kind's colour when the diagram gives none: people one colour, what's yours another, outside systems grey. */
const KIND_COLOUR: Record<string, NoteColor> = { person: 'purple', system: 'blue', container: 'blue', component: 'blue', database: 'blue', queue: 'blue', external: 'gray', code: 'green' };
const KIND_SHAPE: Record<string, 'person' | 'rect' | 'cylinder' | 'queue'> = { person: 'person', database: 'cylinder', queue: 'queue' };
/** The bracket line under an element's name, as C4 diagrams write it. */
const KIND_NAMES: Record<string, string> = { person: 'Person', system: 'Software System', container: 'Container', component: 'Component', database: 'Database', queue: 'Queue', external: 'External System', code: 'Code' };
const colourOf = (e: { kind: string; color?: string }): NoteColor => (e.color && /^[1-9]$/.test(e.color) ? SLOT_COLOURS[Number(e.color) - 1] : KIND_COLOUR[e.kind] ?? 'blue');

/** Whether text is a C4 diagram: the skill's JSON, or Mermaid C4 (C4Context, C4Container…). */
export function isC4Text(text: string): boolean {
  const t = text.trim();
  if (t.startsWith('{')) {
    try {
      return (JSON.parse(t) as { diagramType?: string }).diagramType === 'c4';
    } catch {
      return false;
    }
  }
  return /^\s*C4(Context|Container|Component|Dynamic|Deployment)\b/m.test(t);
}

/** C4 text (JSON or Mermaid) read as the model, with the reader's warnings; or why it can't be read. */
export function parseC4(text: string): { data: C4Data; warnings: string[] } | { error: string } {
  try {
    const t = text.trim();
    const data = t.startsWith('{') ? (JSON.parse(t) as C4Data) : c4().fromMermaid(t).data;
    if (!Array.isArray(data.elements) || !data.elements.length) return { error: 'The C4 diagram has no elements.' };
    data.groups ??= [];
    data.relations ??= [];
    return { data, warnings: [] };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'The C4 diagram could not be read.' };
  }
}

/** An element's words on the board: its name, its kind and technology in brackets, and what it does. */
export function elementLabel(e: C4Element): string {
  const kind = KIND_NAMES[e.kind] ?? 'Software System';
  return [e.name, `[${kind}${e.tech ? `: ${e.tech}` : ''}]`, e.description ?? ''].filter(Boolean).join('\n');
}
/** An element's words with its kind changed: its name, technology and description kept. */
export const relabelC4 = (label: string, kind: C4Kind): string => elementLabel({ id: '', kind, ...readLabel(label) });
/** An element's look by kind: its shape, and its colour when the diagram gives none. */
export const c4Look = (kind: C4Kind): { shape: 'person' | 'rect' | 'cylinder' | 'queue'; color: NoteColor } => ({ shape: KIND_SHAPE[kind] ?? 'rect', color: KIND_COLOUR[kind] ?? 'blue' });
/** The kind an element's bracket line names ("[Component: Spring]"), if it names one. */
export function bracketKind(label: string): C4Kind | undefined {
  const line = label.split('\n').slice(1).find((l) => /^\[.*\]$/.test(l.trim()));
  const name = line && /^\[([^:\]]*)/.exec(line.trim())?.[1]?.trim().toLowerCase();
  return name ? (Object.entries(KIND_NAMES).find(([, n]) => n.toLowerCase() === name)?.[0] as C4Kind | undefined) : undefined;
}
/** The names kinds go by on the board. */
export const C4_KIND_NAMES = KIND_NAMES as Record<C4Kind, string>;

/** An element's name, technology and description, read back from its words. */
function readLabel(label: string): { name: string; tech?: string; description?: string } {
  const [name = '', ...rest] = label.split('\n');
  const bracket = rest.findIndex((l) => /^\[.*\]$/.test(l.trim()));
  const tech = bracket >= 0 ? /^\[[^:\]]*(?::\s*(.*))?\]$/.exec(rest[bracket].trim())?.[1] : undefined;
  // A code element's members are a line each; other descriptions are one line.
  const description = rest.filter((_, i) => i !== bracket).join('\n').trim();
  return { name: name.trim(), ...(tech ? { tech } : {}), ...(description ? { description } : {}) };
}
const relationLabel = (r: C4Relation) => `${r.label}${r.tech ? ` [${r.tech}]` : ''}`.slice(0, 200);
const readRelation = (label: string) => {
  const m = /^(.*?)(?:\s*\[([^\]]*)\])?$/.exec(label.trim());
  return { label: (m?.[1] ?? label).trim(), ...(m?.[2] ? { tech: m[2].trim() } : {}) };
};

/** A C4 model laid out afresh as board things, from the layout's top-left; things hidden in a collapsed system wait in its box. */
export function layoutC4(data: C4Data): Layout {
  c4().layoutDiagram(data);
  const at = (x = 0, y = 0) => ({ x: Math.round(PAD + x * S), y: Math.round(TITLE + y * S) });
  const size = (w = 0, h = 0) => ({ w: Math.max(1, Math.round(w * S)), h: Math.max(1, Math.round(h * S)) });
  const shown = [...data.groups.filter((g) => !g._hidden), ...data.elements.filter((e) => !e._hidden)];
  const right = Math.max(...shown.map((t) => (t.x ?? 0) + (t.w ?? 0)));
  const bottom = Math.max(...shown.map((t) => (t.y ?? 0) + (t.h ?? 0)));
  const keys = Object.entries(data.colorKey ?? {});
  const legendH = keys.length ? 48 : 0;
  const diagram = { w: Math.round(PAD * 2 + right * S), h: Math.round(TITLE + bottom * S + PAD + legendH) };
  const layout: Layout = { frames: [], shapes: [], notes: [], texts: [], arrows: [] };
  layout.frames!.push({
    key: 'diagram',
    title: data.title?.trim() || 'System landscape',
    x: 0,
    y: 0,
    ...diagram,
    look: 'outline',
    part: { role: 'diagram', key: 'diagram', type: 'c4', ...(data.arrange ? { extra: { arrange: data.arrange } } : {}) },
  });
  const groupBox = new Map<string, { x: number; y: number }>();
  // Outer groups first, so inner ones lie on top of them.
  const depth = (g: C4Group): number => (g.parent ? 1 + depth(data.groups.find((p) => p.id === g.parent) ?? { id: '', name: '', kind: 'boundary' }) : 0);
  for (const g of [...data.groups].sort((a, b) => depth(a) - depth(b))) {
    const box = { ...at(g.x, g.y), ...size(g.w, g.h) };
    groupBox.set(g.id, box);
    const collapsed = !!g._collapsed;
    const extra: Record<string, string | boolean> = { kind: g.kind };
    if (collapsed) extra['collapsed'] = true;
    if (g._hidden) extra['hidden'] = true;
    if (g.parent) extra['parent'] = g.parent;
    if (g.color) extra['color'] = g.color;
    if (g.core) extra['core'] = true;
    if (g.side) extra['side'] = g.side;
    layout.frames!.push({
      key: `group:${g.id}`,
      title: g.name,
      ...box,
      look: collapsed ? 'card' : 'outline',
      border: g.kind === 'boundary' ? 'dashed' : 'solid',
      ...(collapsed || g.color ? { fill: g.color && /^[1-9]$/.test(g.color) ? SLOT_COLOURS[Number(g.color) - 1] : 'blue' } : {}),
      part: { role: 'group', key: g.id, extra },
    });
  }
  for (const e of data.elements) {
    const extra: Record<string, string | boolean> = {};
    if (e.group) extra['group'] = e.group;
    if (e.icon) extra['icon'] = e.icon;
    if (e.color) extra['color'] = e.color;
    if (e.core) extra['core'] = true;
    if (e.side) extra['side'] = e.side;
    if (e._hidden) extra['hidden'] = true;
    // A hidden element waits where its collapsed system is.
    const home = e._hidden && e.group ? groupBox.get(e.group) : undefined;
    layout.shapes!.push({
      key: e.id,
      shape: KIND_SHAPE[e.kind] ?? 'rect',
      color: colourOf(e),
      label: elementLabel(e),
      ...(e.icon ? { icon: e.icon } : {}),
      ...(home ? { x: home.x, y: home.y, w: Math.round(156 * S), h: Math.round(112 * S) } : { ...at(e.x, e.y), ...size(e.w, e.h) }),
      part: { role: 'step', key: e.id, type: e.kind, ...(Object.keys(extra).length ? { extra } : {}) },
    });
  }
  for (const r of data.relations) {
    layout.arrows!.push({ from: r.from, to: r.to, route: 'elbow', dash: r.async ? 'dashed' : 'solid', weight: 2, start: 'none', end: 'arrow', ...(r.label ? { label: relationLabel(r) } : {}) });
  }
  keys.forEach(([slot, name], i) => {
    const x = PAD + i * 200;
    const y = diagram.h - legendH + 8;
    layout.shapes!.push({ key: `legend:${slot}`, shape: 'rect', color: SLOT_COLOURS[Number(slot) - 1] ?? 'blue', label: '', x, y, w: 24, h: 24, part: { role: 'legend', key: `legend:${slot}` } });
    layout.texts!.push({ key: `legend-name:${slot}`, text: name.slice(0, 60), size: 'sm', x: x + 32, y: y - 2, w: 160, part: { role: 'legend', key: `legend-name:${slot}` } });
  });
  (data.notes ?? []).forEach((n, i) => {
    const key = `note:${n.id}`;
    layout.notes!.push({ key, text: n.text, color: 'yellow', x: i * (NOTE.w + NOTE.gap), y: diagram.h + NOTE.gap * 2, w: NOTE.w, h: NOTE.h, part: { role: 'note', key: n.id } });
    for (const id of n.elements ?? []) layout.arrows!.push({ from: key, to: id, route: 'straight', dash: 'dotted', start: 'none', end: 'none', weight: 1 });
  });
  return layout;
}

// ── On the board ────────────────────────────────────────────────────────────

type Box = { x: number; y: number; w: number; h: number };
const centreIn = (b: Box, f: Box) => b.x + b.w / 2 >= f.x && b.x + b.w / 2 <= f.x + f.w && b.y + b.h / 2 >= f.y && b.y + b.h / 2 <= f.y + f.h;
const xs = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

/** A C4 diagram on the board read back as its model; relations keep the board's arrow ids. With positions, for routing. */
export function readC4(board: BoardDoc, diagramId: string, withPositions = true): C4Data | null {
  const frame = board.frames().find((f) => f.id === diagramId);
  if (frame?.part?.role !== 'diagram' || frame.part.type !== 'c4') return null;
  const ox = frame.x + PAD;
  const oy = frame.y + TITLE;
  const pos = (b: Box) => (withPositions ? { x: (b.x - ox) / S, y: (b.y - oy) / S, w: b.w / S, h: b.h / S } : {});
  const groupFrames = board.frames().filter((f) => f.part?.of === diagramId && f.part.role === 'group');
  const groups: C4Group[] = groupFrames.map((f) => {
    const x = f.part!.extra ?? {};
    return {
      id: f.part!.key,
      name: f.title.split('\n')[0],
      kind: (C4_GROUP_KINDS as readonly unknown[]).includes(x['kind']) ? (x['kind'] as C4GroupKind) : 'boundary',
      ...(xs(x['parent']) ? { parent: xs(x['parent']) } : {}),
      ...(x['collapsed'] === true ? { collapsed: true } : { collapsed: false }),
      ...(xs(x['color']) ? { color: xs(x['color']) } : {}),
      ...(x['core'] === true ? { core: true } : {}),
      ...(xs(x['side']) ? { side: xs(x['side']) } : {}),
      ...(x['hidden'] === true ? {} : pos(f)),
    };
  });
  const shapes = board.items().filter((i): i is Item & { kind: 'shape' } => i.kind === 'shape' && i.part?.of === diagramId && i.part.role === 'step');
  const keyOf = new Map(shapes.map((s) => [s.id, s.part!.key]));
  const elements: C4Element[] = shapes
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((s) => {
      const x = s.part!.extra ?? {};
      const hidden = x['hidden'] === true;
      // Its group: the one it records, or the innermost open one its centre is in.
      const inside = groupFrames.filter((g) => g.part!.extra?.['collapsed'] !== true && centreIn(s, g)).sort((a, b) => a.w * a.h - b.w * b.h)[0];
      const group = hidden ? xs(x['group']) : (inside?.part!.key ?? (xs(x['group']) && groupFrames.some((g) => g.part!.key === xs(x['group']) && g.part!.extra?.['collapsed'] === true) ? xs(x['group']) : undefined));
      return {
        id: s.part!.key,
        // Its kind: what its bracket line says, where someone has retyped it, else what it was made as.
        kind: bracketKind(s.label) ?? ((C4_KINDS as readonly string[]).includes(s.part!.type ?? '') ? (s.part!.type as C4Kind) : 'system'),
        ...readLabel(s.label),
        ...(group ? { group } : {}),
        ...((s.icon ?? xs(x['icon'])) ? { icon: s.icon ?? xs(x['icon']) } : {}),
        ...(xs(x['color']) ? { color: xs(x['color']) } : {}),
        ...(x['core'] === true ? { core: true } : {}),
        ...(xs(x['side']) ? { side: xs(x['side']) } : {}),
        ...(hidden ? {} : pos(s)),
      };
    });
  const relations: C4Relation[] = board
    .connectors()
    .filter((c) => keyOf.has(c.from) && keyOf.has(c.to))
    .map((c) => ({ id: c.id, from: keyOf.get(c.from)!, to: keyOf.get(c.to)!, ...readRelation(c.label), ...(c.dash !== 'solid' ? { async: true } : {}) }));
  const legend = board.items().filter((i) => i.part?.of === diagramId && i.part.role === 'legend' && i.kind === 'shape');
  const colorKey: Record<string, string> = {};
  for (const swatch of legend) {
    const slot = swatch.part!.key.replace(/^legend:/, '');
    const name = board.items().find((i) => i.part?.of === diagramId && i.part.key === `legend-name:${slot}`);
    if (name?.kind === 'text') colorKey[slot] = name.text;
  }
  const notes = board
    .notes()
    .filter((n) => n.part?.of === diagramId && n.part.role === 'note')
    .map((n) => ({
      id: n.part!.key,
      text: plainText(n.text),
      elements: board
        .connectors()
        .filter((c) => c.from === n.id && keyOf.has(c.to))
        .map((c) => keyOf.get(c.to)!),
    }));
  const arrange = xs(frame.part.extra?.['arrange']);
  return {
    diagramType: 'c4',
    schemaVersion: 1,
    title: frame.title,
    ...(arrange === 'surround' || arrange === 'flow' || arrange === 'layers' ? { arrange } : {}),
    ...(Object.keys(colorKey).length ? { colorKey } : {}),
    groups,
    elements,
    relations: relations.map((r) => (withPositions ? r : (({ id: _id, ...rest }) => rest)(r))),
    ...(notes.length ? { notes } : {}),
  };
}

/** A C4 diagram written as text: the skill's JSON model (every level), or Mermaid C4 of what's open now. */
export function c4Text(board: BoardDoc, diagramId: string, as: 'json' | 'mermaid' = 'mermaid'): string | null {
  const data = readC4(board, diagramId, false);
  if (!data) return null;
  // Mermaid's C4 stops at components: a diagram with opened containers or components, or with code, is written as JSON.
  const deep = data.groups.some((g) => g.kind === 'container' || g.kind === 'component') || data.elements.some((e) => e.kind === 'code');
  return as === 'json' || deep ? JSON.stringify(data, null, 2) : c4().toMermaid(data, {});
}

/** A C4 diagram's arrows as the skill's engine routes them, and the arrows a collapsed system's box stands in for. */
export interface C4Routes {
  routes: Map<string, { d: string; start: { x: number; y: number }; end: { x: number; y: number }; angle: number; startAngle: number; mid: { x: number; y: number }; points: { x: number; y: number }[] }>;
  merged: Set<string>;
}
const cache = new Map<string, { key: string; value: C4Routes }>();

export function routeC4(board: BoardDoc, diagram: Frame): C4Routes {
  const data = readC4(board, diagram.id);
  const empty: C4Routes = { routes: new Map(), merged: new Set() };
  if (!data) return empty;
  const key = JSON.stringify([diagram.x, diagram.y, data]);
  const hit = cache.get(diagram.id);
  if (hit?.key === key) return hit.value;
  try {
    c4().routeDiagram(data, { pinned: data.elements.map((e) => e.id) });
  } catch {
    return empty;
  }
  const ox = diagram.x + PAD;
  const oy = diagram.y + TITLE;
  const value: C4Routes = { routes: new Map(), merged: new Set() };
  for (const edge of data._edges ?? []) {
    const [first, ...rest] = edge.members;
    const id = data.relations[first]?.id;
    for (const m of rest) if (data.relations[m]?.id) value.merged.add(data.relations[m].id!);
    if (!id || !edge.points || edge.points.length < 2) continue;
    const p = edge.points.map(([x, y]) => ({ x: ox + x * S, y: oy + y * S }));
    const [a, b] = [p[0], p[1]];
    const [y, z] = [p[p.length - 2], p[p.length - 1]];
    const mid = edge.labelBox ? { x: ox + (edge.labelBox.x + edge.labelBox.w / 2) * S, y: oy + (edge.labelBox.y + edge.labelBox.h / 2) * S } : { x: (a.x + z.x) / 2, y: (a.y + z.y) / 2 };
    value.routes.set(id, { d: `M ${p.map((q) => `${q.x} ${q.y}`).join(' L ')}`, start: a, end: z, angle: Math.atan2(z.y - y.y, z.x - y.x), startAngle: Math.atan2(a.y - b.y, a.x - b.x), mid, points: p });
  }
  cache.set(diagram.id, { key, value });
  return value;
}

/** Where Tidy puts a C4 diagram's things, by their keys in its layout. */
function c4Keys(board: BoardDoc, diagramId: string): Map<string, string> {
  const byKey = new Map<string, string>([['diagram', diagramId]]);
  for (const f of board.frames()) if (f.part?.of === diagramId && f.part.role === 'group') byKey.set(`group:${f.part.key}`, f.id);
  for (const i of board.items()) if (i.part?.of === diagramId && (i.part.role === 'step' || i.part.role === 'legend')) byKey.set(i.part.key, i.id);
  return byKey;
}

/**
 * Lays a C4 diagram out again where it is (one undo step): positions and sizes, which systems show as one box, and which
 * elements are hidden inside them. Optionally a system group opens or closes first, or every system does (a level).
 */
export function tidyC4(board: BoardDoc, diagramId: string, change?: { collapse?: Record<string, boolean>; level?: C4Level; arrange?: C4Data['arrange'] }): boolean {
  const frame = board.frames().find((f) => f.id === diagramId);
  const data = readC4(board, diagramId, false);
  if (!frame || !data) return false;
  for (const g of data.groups) {
    const opens = OPENS_AT[g.kind];
    if (change?.level && opens) g.collapsed = change.level < opens;
    if (change?.collapse && g.id in change.collapse) g.collapsed = change.collapse[g.id];
  }
  if (change?.arrange) data.arrange = change.arrange;
  const layout = layoutC4(data);
  const byKey = c4Keys(board, diagramId);
  const boxes = new Map<string, Box>();
  const parts = new Map<string, NonNullable<Frame['part']>>();
  for (const f of layout.frames ?? []) {
    const id = f.key && byKey.get(f.key);
    if (!id) continue;
    boxes.set(id, { x: frame.x + f.x, y: frame.y + f.y, w: f.w, h: f.h });
    if (f.part) parts.set(id, { ...f.part, of: diagramId });
  }
  for (const s of layout.shapes ?? []) {
    const id = s.key && byKey.get(s.key);
    if (!id) continue;
    boxes.set(id, { x: frame.x + s.x, y: frame.y + s.y, w: s.w, h: s.h });
    if (s.part) parts.set(id, { ...s.part, of: diagramId });
  }
  // The colour key's names go with their swatches.
  for (const t of layout.texts ?? []) {
    const id = t.key && byKey.get(t.key);
    if (id) boxes.set(id, { x: frame.x + t.x, y: frame.y + t.y, w: 0, h: 0 });
  }
  board.placeBoxes(boxes, parts);
  // A collapsed system shows as a filled card with its kind under its name; an open one as an outline.
  board.restyleDiagramGroups(
    (layout.frames ?? []).flatMap((f) => {
      const id = f.key && f.part?.role === 'group' ? byKey.get(f.key) : undefined;
      return id ? [{ id, title: f.title, look: f.look ?? 'outline', fill: f.fill ?? 'clear' }] : [];
    }),
  );
  return true;
}

/** C4's four levels: system context, containers, components, code. */
export type C4Level = 1 | 2 | 3 | 4;

/** The deepest level a diagram has something to show at: 2 with systems opened to containers, 3 with components, 4 with code. */
export function c4Depth(board: BoardDoc, diagramId: string): C4Level {
  const kinds = new Set(board.frames().filter((f) => f.part?.of === diagramId && f.part.role === 'group').map((f) => f.part!.extra?.['kind']));
  return kinds.has('component') ? 4 : kinds.has('container') ? 3 : 2;
}

/** A C4 element's kind from a shape dropped into the diagram: a figure is a person, a cylinder a database, and so on. */
export const C4_SHAPE_KINDS: Partial<Record<string, string>> = { person: 'person', actor: 'person', cylinder: 'database', queue: 'queue', rect: 'container' };
