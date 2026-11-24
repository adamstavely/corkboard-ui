import { sequenceEngine } from './vendor/sequence';

/**
 * Editable sequence diagrams: participants side by side, messages down the page in time order, frames (alt, opt, loop,
 * par, break, critical, and coloured phases) around runs of messages, and notes. The board keeps the diagram as the
 * Ultimate Diagram skill's JSON model, laid out by its engine (vendor/), and reads and writes Mermaid's sequenceDiagram.
 */

/** Text measurements the engine wraps and sizes by, for Corkboard's interface font. */
const TOKENS = {
  font: {
    metrics: {
      label: 7.4,
      title: 7.4,
      detail: 6.4,
      note: 6.2,
      type: 6.6,
      edgeLabel: 7,
      edgeWrap: 6.6,
    },
  },
};

export const PARTICIPANT_KINDS = [
  'system',
  'actor',
  'ui',
  'database',
  'queue',
  'external',
] as const;
export type ParticipantKind = (typeof PARTICIPANT_KINDS)[number];
export const MESSAGE_KINDS = ['sync', 'reply', 'async'] as const;
export type MessageKind = (typeof MESSAGE_KINDS)[number];
export const FRAME_KINDS = ['alt', 'opt', 'loop', 'par', 'break', 'critical', 'group'] as const;
export type FrameKind = (typeof FRAME_KINDS)[number];

export interface SeqParticipant {
  id: string;
  name: string;
  kind?: ParticipantKind;
  /** A colour slot, "1" to "6". */
  color?: string;
}
export interface SeqMessage {
  id: string;
  from: string;
  to: string;
  label: string;
  detail?: string;
  kind?: MessageKind;
  /** false: the message opens no activation bar. */
  activate?: false;
  /** The message whose time ends this message's activation bar. */
  until?: string;
}
export interface SeqBranch {
  at: string;
  label?: string;
}
export interface SeqFragment {
  id: string;
  kind: FrameKind;
  label: string;
  /** The first and last message inside. */
  from: string;
  to: string;
  branches?: SeqBranch[];
  color?: string;
  collapsed?: boolean;
}
export interface SeqNote {
  id: string;
  text: string;
  /** The participant it sits over, or two to span between. */
  over?: string | string[];
  after?: string;
  before?: string;
}
export interface SequenceModel {
  title?: string;
  participants: SeqParticipant[];
  messages: SeqMessage[];
  fragments: SeqFragment[];
  notes: SeqNote[];
  numbered?: boolean;
  showDetails?: boolean;
  rails?: boolean;
  lifespans?: boolean;
}

/** At most this many of each, so one diagram stays a size people can read (and a board stays a size Yjs likes). */
export const SEQ_LIMITS = { participants: 30, messages: 300, fragments: 80, notes: 100, text: 400 };

interface SeqEngine {
  layoutDiagram(data: unknown): void;
  fromMermaid(text: string): { data?: unknown; warnings?: string[]; error?: string } | null;
  toMermaid(data: unknown): string;
  SQ: Record<string, number>;
}
let engine: SeqEngine | undefined;
const seq = (): SeqEngine => (engine ??= sequenceEngine(TOKENS) as SeqEngine);

/** The engine's sizes (box width and height, rows, gaps). */
export const sq = (): Record<string, number> => seq().SQ;

const str = (v: unknown, max = SEQ_LIMITS.text): string =>
  typeof v === 'string' ? v.slice(0, max) : typeof v === 'number' ? String(v) : '';
const idOf = (v: unknown): string | null =>
  typeof v === 'string' && /^[A-Za-z0-9_.:-]{1,64}$/.test(v) ? v : null;
const slot = (v: unknown): string | undefined =>
  typeof v === 'string' && /^[1-6]$/.test(v) ? v : undefined;

/** A model as stored, anything malformed or dangling left out, within the limits. */
export function cleanSequence(raw: unknown): SequenceModel {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const list = (v: unknown): Record<string, unknown>[] =>
    Array.isArray(v)
      ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
      : [];
  const seen = new Set<string>();
  const unique = (id: string | null): id is string => !!id && !seen.has(id) && !!seen.add(id);

  const participants: SeqParticipant[] = [];
  for (const p of list(r['participants'])) {
    const id = idOf(p['id']);
    if (!unique(id) || participants.length >= SEQ_LIMITS.participants) continue;
    const kind = PARTICIPANT_KINDS.includes(p['kind'] as ParticipantKind)
      ? (p['kind'] as ParticipantKind)
      : undefined;
    const color = slot(p['color']);
    participants.push({
      id,
      name: str(p['name'], 80) || id,
      ...(kind && kind !== 'system' ? { kind } : {}),
      ...(color ? { color } : {}),
    });
  }
  const pids = new Set(participants.map((p) => p.id));

  const messages: SeqMessage[] = [];
  for (const m of list(r['messages'])) {
    const id = idOf(m['id']);
    const from = idOf(m['from']);
    const to = idOf(m['to']);
    if (
      !from ||
      !to ||
      !pids.has(from) ||
      !pids.has(to) ||
      !unique(id) ||
      messages.length >= SEQ_LIMITS.messages
    )
      continue;
    const kind = MESSAGE_KINDS.includes(m['kind'] as MessageKind)
      ? (m['kind'] as MessageKind)
      : undefined;
    const detail = str(m['detail']);
    messages.push({
      id,
      from,
      to,
      label: str(m['label']),
      ...(detail ? { detail } : {}),
      ...(kind && kind !== 'sync' ? { kind } : {}),
      ...(m['activate'] === false ? { activate: false as const } : {}),
      ...(idOf(m['until']) ? { until: m['until'] as string } : {}),
    });
  }
  const at = new Map(messages.map((m, i) => [m.id, i]));
  for (const m of messages) if (m.until !== undefined && !at.has(m.until)) delete m.until;

  const fragments: SeqFragment[] = [];
  for (const f of list(r['fragments'])) {
    const id = idOf(f['id']);
    let from = idOf(f['from']);
    let to = idOf(f['to']);
    if (
      !from ||
      !to ||
      !at.has(from) ||
      !at.has(to) ||
      !unique(id) ||
      fragments.length >= SEQ_LIMITS.fragments
    )
      continue;
    if (at.get(from)! > at.get(to)!) [from, to] = [to, from];
    const kind = FRAME_KINDS.includes(f['kind'] as FrameKind) ? (f['kind'] as FrameKind) : 'opt';
    const lo = at.get(from)!;
    const hi = at.get(to)!;
    const branches = list(f['branches'] ?? (f['elseAt'] !== undefined ? [{ at: f['elseAt'] }] : []))
      .map((b) => ({ at: idOf(b['at']), label: str(b['label'], 120) }))
      .filter(
        (b): b is { at: string; label: string } =>
          !!b.at && at.has(b.at) && at.get(b.at)! > lo && at.get(b.at)! <= hi,
      )
      .map((b) => (b.label ? b : { at: b.at }));
    const color = slot(f['color']);
    fragments.push({
      id,
      kind,
      label: str(f['label'], 120),
      from,
      to,
      ...(branches.length && (kind === 'alt' || kind === 'par' || kind === 'critical')
        ? { branches }
        : {}),
      ...(color ? { color } : {}),
      ...(f['collapsed'] === true ? { collapsed: true } : {}),
    });
  }

  const notes: SeqNote[] = [];
  for (const n of list(r['notes'])) {
    const id = idOf(n['id']);
    if (!unique(id) || notes.length >= SEQ_LIMITS.notes) continue;
    const over = (Array.isArray(n['over']) ? n['over'] : [n['over']])
      .map(idOf)
      .filter((p): p is string => !!p && pids.has(p))
      .slice(0, 2);
    if (!over.length) continue;
    const after = idOf(n['after']);
    const before = idOf(n['before']);
    notes.push({
      id,
      text: str(n['text']),
      over: over.length === 1 ? over[0] : over,
      ...(after && at.has(after) ? { after } : before && at.has(before) ? { before } : {}),
    });
  }

  const title = str(r['title'], 120);
  return {
    ...(title ? { title } : {}),
    participants,
    messages,
    fragments,
    notes,
    ...(r['numbered'] === true ? { numbered: true } : {}),
    ...(r['showDetails'] === false ? { showDetails: false } : {}),
    ...(r['rails'] === true ? { rails: true } : {}),
    ...(r['lifespans'] === true ? { lifespans: true } : {}),
  };
}

/** Whether text is a Mermaid sequence diagram (front matter and comments allowed before it). */
export function isSequenceText(text: string): boolean {
  const body = text.replace(/^\s*---\n[\s\S]*?\n---\s*\n/, '');
  const first = body.split('\n').find((l) => l.trim() && !l.trim().startsWith('%%'));
  return !!first && /^\s*sequenceDiagram\b/.test(first);
}

/** A sequence diagram read from Mermaid, with what couldn't be kept; or why it can't be read. */
export function parseSequence(
  text: string,
): { model: SequenceModel; warnings: string[] } | { error: string } {
  let read: ReturnType<SeqEngine['fromMermaid']>;
  try {
    read = seq().fromMermaid(text);
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'The sequence diagram could not be read.' };
  }
  if (!read || read.error)
    return { error: read?.error ?? 'The sequence diagram could not be read.' };
  const model = cleanSequence(read.data ?? read);
  if (!model.participants.length) return { error: 'The sequence diagram has no participants.' };
  return { model, warnings: read.warnings ?? [] };
}

/** A sequence diagram written as Mermaid. */
export const sequenceMermaid = (model: SequenceModel): string =>
  seq().toMermaid({ diagramType: 'sequence', ...structuredClone(model) });

/** What a new sequence diagram starts as: a customer checking out, the shop asking the payment provider. */
export const SEQUENCE_STARTER = `---
title: Checkout
---
sequenceDiagram
  actor customer as Customer
  participant shop as Shop
  participant pay as Payment
  customer->>shop: Place order
  shop->>pay: Charge card
  alt card approved
    pay-->>shop: Approved
    shop-->>customer: Order confirmed
  else card declined
    pay-->>shop: Declined
    shop-->>customer: Order failed
  end
`;

// ---------------------------------------------------------------------------------------------------------------
// Layout

/** A laid-out participant, message, frame or note: the model's own fields and where the engine put it. */
export interface PlacedParticipant extends SeqParticipant {
  x: number;
  rail?: boolean;
  top?: number;
  bottom?: number;
}
export interface PlacedMessage extends SeqMessage {
  y: number;
  hidden?: boolean;
  lab?: number;
  det?: number;
}
export interface PlacedFragment extends SeqFragment {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  dividers?: { at: string; y: number; label?: string }[];
}
export interface PlacedNote extends SeqNote {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}
export interface SeqBar {
  pid: string;
  y1: number;
  y2: number;
  depth: number;
}
export interface SequenceLayout {
  width: number;
  height: number;
  participants: PlacedParticipant[];
  messages: PlacedMessage[];
  fragments: PlacedFragment[];
  notes: PlacedNote[];
  bars: SeqBar[];
  /** Each message's step number, counting from 1. */
  step: Map<string, number>;
}

/** The diagram laid out by the engine (sizes in the engine's pixels), with its activation bars. */
export function layoutSequence(model: SequenceModel): SequenceLayout {
  const data = { diagramType: 'sequence', ...structuredClone(model) } as unknown as {
    participants: PlacedParticipant[];
    messages: PlacedMessage[];
    fragments: PlacedFragment[];
    notes: PlacedNote[];
    layout: { width: number; height: number };
  };
  seq().layoutDiagram(data);
  const step = new Map(data.messages.map((m, i) => [m.id, i + 1]));
  return {
    width: Math.max(1, data.layout.width),
    height: Math.max(1, data.layout.height),
    participants: data.participants,
    messages: data.messages,
    fragments: data.fragments,
    notes: data.notes ?? [],
    bars: activations(data.participants, data.messages),
    step,
  };
}

interface Execution {
  pid: string;
  y1: number;
  caller: string | null;
  callerDepth: number;
  async: boolean;
  lastOut: number | null;
  until: number | null;
  open: boolean;
  initiator?: boolean;
  visible: boolean;
  closedBy?: PlacedMessage | null;
}

/**
 * Activation bars, as the skill's page draws them: each participant keeps a stack of open executions, walked in
 * message order. A call opens one on its target that its reply closes; a call with no reply closes when the caller
 * moves on; an async message opens one only if the target then sends something; a self-call is a short bar on a bar;
 * a system that starts the flow is busy until it is next called (a person starting it gets no bar).
 */
export function activations(
  participants: readonly PlacedParticipant[],
  messages: readonly PlacedMessage[],
): SeqBar[] {
  const STUB = 20;
  const byId = new Map(participants.map((p) => [p.id, p]));
  const yOf = (id: string): number | null => messages.find((m) => m.id === id)?.y ?? null;
  const bars: (SeqBar & { caller?: string | null; closedBy?: PlacedMessage | null })[] = [];
  const stacks = new Map<string, Execution[]>();
  const stack = (pid: string): Execution[] => {
    let s = stacks.get(pid);
    if (!s) stacks.set(pid, (s = []));
    return s;
  };
  const finish = (ex: Execution, y2: number): void => {
    if (ex.async && ex.lastOut === null) return;
    const end = ex.until !== null ? ex.until : y2;
    if (!ex.visible) return;
    bars.push({
      pid: ex.pid,
      y1: ex.y1,
      y2: Math.max(end, ex.y1 + STUB),
      depth: 0,
      caller: ex.caller,
      closedBy: ex.closedBy ?? null,
    });
  };
  const closeAt = (pid: string, k: number, y2: number, by: PlacedMessage | null): void => {
    const st = stack(pid);
    while (st.length > k) {
      const ex = st.pop()!;
      ex.closedBy = st.length === k ? by : null;
      if (by && !by.hidden) ex.visible = true;
      finish(ex, ex.lastOut !== null && st.length >= k ? Math.max(y2, ex.lastOut) : y2);
    }
  };
  const touch = (pid: string, y: number, hidden?: boolean): void => {
    for (const ex of stack(pid)) {
      if (!hidden) ex.visible = true;
      if (ex.lastOut === null || y > ex.lastOut) ex.lastOut = y;
    }
  };
  messages.forEach((m, i) => {
    const { from, to } = m;
    if (!byId.has(from) || !byId.has(to)) return;
    const self = from === to;
    if (m.kind === 'reply') {
      const st = stack(from);
      let k = -1;
      for (let j = st.length - 1; j >= 0; j--)
        if (st[j].caller === to && !st[j].async) {
          k = j;
          break;
        }
      if (k >= 0) {
        closeAt(from, k, m.y + 6, m);
        touch(to, m.y + 6, m.hidden);
        return;
      }
      const prev = [...bars].reverse().find((b) => b.pid === from && b.caller === to && b.closedBy);
      if (prev) {
        const between = messages.slice(messages.indexOf(prev.closedBy!) + 1, i);
        if (!between.some((x) => x.from === to && x.to === from)) {
          prev.y2 = Math.max(prev.y2, m.y + 6);
          prev.closedBy = m;
        }
      }
      touch(from, m.y, m.hidden);
      touch(to, m.y + 6, m.hidden);
      return;
    }
    const depth = stack(from).length;
    for (const [pid, st] of stacks) {
      const k = st.findIndex(
        (ex) => ex.caller === from && !ex.async && ex.callerDepth === depth && ex.open,
      );
      if (k >= 0 && pid !== from)
        closeAt(pid, k, st[k].lastOut !== null ? st[k].lastOut! : st[k].y1 + STUB, null);
    }
    if (
      !depth &&
      byId.get(from)!.kind !== 'actor' &&
      !self &&
      !bars.some((b) => b.pid === from && b.y1 <= m.y && m.y <= b.y2)
    )
      stack(from).push({
        pid: from,
        y1: m.y - 6,
        caller: null,
        callerDepth: -1,
        async: false,
        lastOut: m.y,
        until: null,
        open: false,
        initiator: true,
        visible: !m.hidden,
      });
    touch(from, m.y, m.hidden);
    if (m.activate === false) return;
    if (self) {
      if (!m.hidden && m.kind !== 'async')
        bars.push({ pid: from, y1: m.y + 22, y2: m.y + 48, depth: 0 });
      return;
    }
    const tst = stack(to);
    if (tst.length === 1 && tst[0].initiator) closeAt(to, 0, tst[0].lastOut!, null);
    const until = m.until !== undefined ? yOf(m.until) : null;
    stack(to).push({
      pid: to,
      y1: m.y - 6,
      caller: from,
      callerDepth: stack(from).length,
      async: m.kind === 'async',
      lastOut: m.kind === 'async' ? null : m.y + 6,
      until: until !== null ? until + 6 : null,
      open: m.kind !== 'async',
      visible: !m.hidden,
    });
  });
  for (const pid of [...stacks.keys()]) closeAt(pid, 0, 0, null);
  const out = bars
    .map(({ pid, y1, y2 }) => ({ pid, y1, y2, depth: 0 }))
    .sort((a, b) => a.y1 - b.y1);
  const open = new Map<string, SeqBar[]>();
  for (const b of out) {
    const st = (open.get(b.pid) ?? []).filter((o) => o.y2 > b.y1);
    b.depth = st.length;
    st.push(b);
    open.set(b.pid, st);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Drawing: what the board shows and what a PNG draws, from one description

/** A bar's half-width and how far a bar on a bar steps right. */
export const ACT_HALF = 6;
export const ACT_STEP = 6;
/** Colour slots as the board's colours: a participant without one takes the slot of its place. */
const SLOTS = ['blue', 'green', 'purple', 'yellow', 'pink', 'gray'] as const;
export type SeqColour = (typeof SLOTS)[number];
export const slotColour = (slot: string | undefined, index: number): SeqColour =>
  SLOTS[((slot ? Number(slot) - 1 : index) + SLOTS.length) % SLOTS.length];

export interface DrawnText {
  lines: string[];
  x: number;
  y: number;
  anchor: 'start' | 'middle';
}
export interface SequenceDrawing {
  width: number;
  height: number;
  title?: string;
  participants: {
    id: string;
    name: string;
    kind: ParticipantKind;
    colour: SeqColour;
    x: number;
    y: number;
    w: number;
    h: number;
    cx: number;
    rail: boolean;
  }[];
  lifelines: { id: string; x: number; y1: number; y2: number; colour: SeqColour; cap: boolean }[];
  bars: { pid: string; x: number; y: number; w: number; h: number; colour: SeqColour }[];
  messages: {
    id: string;
    d: string;
    kind: MessageKind;
    self: boolean;
    label: DrawnText;
    detail: DrawnText | null;
    step: number | null;
    y: number;
    from: string;
    to: string;
  }[];
  frames: {
    id: string;
    kind: FrameKind;
    label: string;
    x: number;
    y: number;
    w: number;
    h: number;
    colour: SeqColour | null;
    collapsed: boolean;
    dividers: { at: string; y: number; label: string }[];
    summary: { x: number; y: number; text: string } | null;
  }[];
  notes: { id: string; x: number; y: number; w: number; h: number; lines: string[] }[];
}

function wrap(text: string, charW: number, maxW: number): string[] {
  const cpl = Math.max(1, Math.floor(maxW / charW));
  const out: string[] = [];
  for (const seg of String(text ?? '').split('\n')) {
    let line = '';
    for (let w of seg.split(/(?<=[ /-])/)) {
      if (line.length + w.replace(/ $/, '').length <= cpl) {
        line += w;
        continue;
      }
      if (line) out.push(line.replace(/ $/, ''));
      line = '';
      while (w.length > cpl) {
        out.push(w.slice(0, cpl));
        w = w.slice(cpl);
      }
      line = w;
    }
    out.push(line.replace(/ $/, ''));
  }
  return out;
}

function wrapWords(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  for (const para of String(text ?? '').split('\n')) {
    let line = '';
    for (let word of para.split(/\s+/).filter(Boolean)) {
      while (word.length > maxChars) {
        if (line) lines.push(line);
        line = '';
        lines.push(word.slice(0, maxChars));
        word = word.slice(maxChars);
      }
      if (!line) line = word;
      else if (line.length + 1 + word.length <= maxChars) line += ' ' + word;
      else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

/** The diagram as things to draw, in the engine's pixels. */
export function drawSequence(
  model: SequenceModel,
  L: SequenceLayout = layoutSequence(model),
): SequenceDrawing {
  const SQ = sq();
  const byId = new Map(L.participants.map((p) => [p.id, p]));
  const index = new Map(L.participants.map((p, i) => [p.id, i]));
  const colourOf = (p: PlacedParticipant): SeqColour => slotColour(p.color, index.get(p.id) ?? 0);
  const participants = L.participants.map((p) => {
    const rail = !!p.rail;
    const w = rail ? SQ['RAIL_W'] : SQ['BOX_W'];
    const h = rail ? SQ['RAIL_H'] : SQ['BOX_H'];
    const top = p.top ?? SQ['TOP'];
    return {
      id: p.id,
      name: p.name,
      kind: p.kind ?? 'system',
      colour: colourOf(p),
      x: p.x - w / 2,
      y: top,
      w,
      h,
      cx: p.x,
      rail,
    };
  });
  const lifelines = L.participants.map((p) => {
    const rail = !!p.rail;
    const top = (p.top ?? SQ['TOP']) + (rail ? SQ['RAIL_H'] : SQ['BOX_H']);
    return {
      id: p.id,
      x: p.x,
      y1: top,
      y2: p.bottom ?? L.height - 24,
      colour: colourOf(p),
      cap: p.bottom !== undefined,
    };
  });
  const bars = L.bars.flatMap((b) => {
    const p = byId.get(b.pid);
    return p
      ? [
          {
            pid: b.pid,
            x: p.x - ACT_HALF + b.depth * ACT_STEP,
            y: b.y1,
            w: ACT_HALF * 2,
            h: b.y2 - b.y1,
            colour: colourOf(p),
          },
        ]
      : [];
  });
  const depthAt = (pid: string, y: number): number =>
    L.bars.reduce(
      (mx, b) => (b.pid === pid && b.y1 <= y && y <= b.y2 ? Math.max(mx, b.depth) : mx),
      -1,
    );
  const edgeX = (p: PlacedParticipant, y: number, dir: number): number => {
    const d = depthAt(p.id, y);
    return d < 0 ? p.x : p.x + dir * (ACT_HALF + d * ACT_STEP);
  };
  const showDetails = model.showDetails !== false;
  const messages = L.messages.flatMap((m) => {
    const a = byId.get(m.from);
    const b = byId.get(m.to);
    if (!a || !b || m.hidden) return [];
    const self = a === b;
    const maxW = self ? SQ['LABEL_MAX_W'] : Math.max(SQ['LABEL_MAX_W'], Math.abs(b.x - a.x) - 24);
    const lab = (m.lab ?? 1) > 1 ? wrap(m.label, SQ['CHAR_W'], maxW) : [m.label ?? ''];
    const det =
      m.detail && showDetails
        ? (m.det ?? 1) > 1
          ? wrap(m.detail, SQ['DETAIL_CHAR_W'], maxW)
          : [m.detail]
        : null;
    let d: string;
    let label: DrawnText;
    let detail: DrawnText | null = null;
    if (self) {
      const xs = edgeX(a, m.y, 1);
      const xe = edgeX(a, m.y + 28, 1);
      d = `M ${xs} ${m.y} H ${xs + SQ['SELF_LOOP']} V ${m.y + 28} H ${xe}`;
      label = { lines: lab, x: xs + SQ['SELF_LOOP'] + 8, y: m.y + 4, anchor: 'start' };
      if (det)
        detail = {
          lines: det,
          x: xs + SQ['SELF_LOOP'] + 14,
          y: m.y + 24 + (lab.length - 1) * SQ['LABEL_LINE'],
          anchor: 'start',
        };
    } else {
      const dir = b.x > a.x ? 1 : -1;
      const x1 = edgeX(a, m.y, dir);
      const x2 = edgeX(b, m.y, -dir);
      d = `M ${x1} ${m.y} H ${x2}`;
      label = {
        lines: lab,
        x: (x1 + x2) / 2,
        y: m.y - 28 - (lab.length - 1) * SQ['LABEL_LINE'],
        anchor: 'middle',
      };
      if (det) detail = { lines: det, x: (x1 + x2) / 2, y: m.y + 3, anchor: 'middle' };
    }
    return [
      {
        id: m.id,
        d,
        kind: m.kind ?? 'sync',
        self,
        label,
        detail,
        step: model.numbered ? L.step.get(m.id)! : null,
        y: m.y,
        from: m.from,
        to: m.to,
      },
    ];
  });
  const frames = L.fragments.flatMap((f) => {
    if (f.x === undefined || f.y === undefined || f.w === undefined || f.h === undefined) return [];
    let summary: SequenceDrawing['frames'][number]['summary'] = null;
    if (f.collapsed) {
      const lo = L.step.get(f.from)!;
      const hi = L.step.get(f.to)!;
      const inside = L.messages.filter(
        (m) => m.hidden && L.step.get(m.id)! >= lo && L.step.get(m.id)! <= hi,
      );
      if (inside.length) {
        const a = L.step.get(inside[0].id)!;
        const b = L.step.get(inside[inside.length - 1].id)!;
        summary = {
          x: f.x + f.w / 2,
          y: inside[0].y,
          text: `${inside.length} message${inside.length === 1 ? '' : 's'} hidden (step${a === b ? ` ${a}` : `s ${a}–${b}`})`,
        };
      }
    }
    return [
      {
        id: f.id,
        kind: f.kind,
        label: f.label,
        x: f.x,
        y: f.y,
        w: f.w,
        h: f.h,
        colour: f.kind === 'group' ? slotColour(f.color, 0) : null,
        collapsed: !!f.collapsed,
        dividers: (f.dividers ?? []).map((d) => ({
          at: d.at,
          y: d.y,
          label: d.label ?? (f.kind === 'alt' ? 'else' : ''),
        })),
        summary,
      },
    ];
  });
  const notes = L.notes.flatMap((n) =>
    n.x === undefined || n.y === undefined || n.w === undefined || n.h === undefined
      ? []
      : [
          {
            id: n.id,
            x: n.x,
            y: n.y,
            w: n.w,
            h: n.h,
            lines: wrapWords(
              n.text,
              Math.max(4, Math.floor((n.w - 2 * SQ['NOTE_PAD']) / SQ['NOTE_CHAR_W'])),
            ),
          },
        ],
  );
  return {
    width: L.width,
    height: L.height,
    ...(model.title ? { title: model.title } : {}),
    participants,
    lifelines,
    bars,
    messages,
    frames,
    notes,
  };
}

/** Where the board's item size comes from: the engine's pixels at this scale (the other editable diagrams' too). */
export const SEQ_SCALE = 1.25;

/** The size of the item that shows a diagram. */
export function sequenceSize(model: SequenceModel): { w: number; h: number } {
  const L = layoutSequence(model);
  return { w: Math.round(L.width * SEQ_SCALE), h: Math.round(L.height * SEQ_SCALE) };
}

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Fills and lines of each colour, as the board's light theme draws them (PNGs are always light). */
const FILL: Record<SeqColour, string> = {
  blue: '#dbeafe',
  green: '#dcfce7',
  purple: '#ede9fe',
  yellow: '#fef3c7',
  pink: '#fce7f3',
  gray: '#f1f5f9',
};
const LINE: Record<SeqColour, string> = {
  blue: '#2563eb',
  green: '#16a34a',
  purple: '#7c3aed',
  yellow: '#b45309',
  pink: '#db2777',
  gray: '#475569',
};
const INK = '#1f2937';
const MUTED = '#4b5563';
const FONT = 'Inter, system-ui, -apple-system, Segoe UI, sans-serif';

/** The diagram as a standalone SVG picture (for PNG export): light colours, text as text. */
export function sequenceSvg(model: SequenceModel): string {
  const d = drawSequence(model);
  const out: string[] = [];
  const text = (t: DrawnText, size: number, line: number, colour: string, weight = 400): string =>
    `<text x="${t.x}" font-size="${size}" font-weight="${weight}" fill="${colour}" text-anchor="${t.anchor}">${t.lines
      .map((l, i) => `<tspan x="${t.x}" y="${t.y + size + i * line}">${esc(l)}</tspan>`)
      .join('')}</text>`;
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${d.width}" height="${d.height}" viewBox="0 0 ${d.width} ${d.height}" font-family="${FONT}">`,
    `<defs><marker id="s" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${INK}"/></marker>`,
    `<marker id="o" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M1 1L9 5L1 9" fill="none" stroke="${INK}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></marker></defs>`,
    `<rect width="100%" height="100%" fill="#ffffff"/>`,
  );
  for (const f of d.frames) {
    out.push(
      `<rect x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" rx="6" fill="${f.colour ? FILL[f.colour] : 'none'}" fill-opacity="${f.colour ? 0.5 : 0}" stroke="${f.colour ? LINE[f.colour] : MUTED}" stroke-width="1"/>`,
    );
    const tag = `${f.kind === 'group' ? '' : f.kind + '  '}${f.label}`;
    out.push(text({ lines: [tag], x: f.x + 10, y: f.y + 4, anchor: 'start' }, 12, 16, INK, 600));
    for (const div of f.dividers) {
      out.push(
        `<line x1="${f.x}" x2="${f.x + f.w}" y1="${div.y}" y2="${div.y}" stroke="${MUTED}" stroke-dasharray="6 4"/>`,
      );
      if (div.label)
        out.push(
          text(
            { lines: [`[${div.label}]`], x: f.x + 10, y: div.y + 3, anchor: 'start' },
            12,
            16,
            MUTED,
          ),
        );
    }
    if (f.summary)
      out.push(
        text(
          { lines: [f.summary.text], x: f.summary.x, y: f.summary.y - 8, anchor: 'middle' },
          12,
          16,
          MUTED,
        ),
      );
  }
  for (const l of d.lifelines)
    out.push(
      `<line x1="${l.x}" x2="${l.x}" y1="${l.y1}" y2="${l.y2}" stroke="${LINE[l.colour]}" stroke-opacity="0.6" stroke-dasharray="4 4"/>`,
    );
  for (const b of d.bars)
    out.push(
      `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="2" fill="${FILL[b.colour]}" stroke="${LINE[b.colour]}"/>`,
    );
  for (const m of d.messages) {
    out.push(
      `<path d="${m.d}" fill="none" stroke="${INK}" stroke-width="1.5"${m.kind === 'reply' ? ' stroke-dasharray="6 4"' : ''} marker-end="url(#${m.kind === 'sync' ? 's' : 'o'})"/>`,
    );
    const lab =
      m.step !== null
        ? { ...m.label, lines: [`${m.step}. ${m.label.lines[0] ?? ''}`, ...m.label.lines.slice(1)] }
        : m.label;
    out.push(text(lab, 14, 22, INK, 500));
    if (m.detail) out.push(text(m.detail, 12, 16, MUTED));
  }
  for (const n of d.notes) {
    out.push(
      `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="4" fill="#fef9c3" stroke="#ca8a04"/>`,
    );
    out.push(text({ lines: n.lines, x: n.x + 10, y: n.y + 4, anchor: 'start' }, 12, 17, INK));
  }
  for (const p of d.participants) {
    out.push(
      `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="${p.rail ? 8 : p.h / 2}" fill="${FILL[p.colour]}" stroke="${LINE[p.colour]}" stroke-width="1.5"${p.kind === 'external' ? ' stroke-dasharray="6 4"' : ''}/>`,
    );
    if (!p.rail)
      out.push(
        text(
          {
            lines: wrapWords(p.name, 18).slice(0, 2),
            x: p.cx,
            y: p.y + (p.h - (wrapWords(p.name, 18).length > 1 ? 40 : 20)) / 2 - 2,
            anchor: 'middle',
          },
          14,
          20,
          INK,
          600,
        ),
      );
  }
  out.push('</svg>');
  return out.join('');
}

/** The diagram's words, for search and descriptions: its title, participants and messages in order. */
export function sequenceWords(model: SequenceModel): string {
  const name = new Map(model.participants.map((p) => [p.id, p.name]));
  return [
    model.title ?? '',
    ...model.participants.map((p) => p.name),
    ...model.messages.map((m) => `${name.get(m.from)} → ${name.get(m.to)}: ${m.label}`),
    ...model.notes.map((n) => n.text),
  ]
    .filter(Boolean)
    .join('\n');
}

// ---------------------------------------------------------------------------------------------------------------
// Edits: each returns a new model, the old one untouched

/** A new id with this prefix, not used yet in the model. */
export function freshId(model: SequenceModel, prefix: string): string {
  const used = new Set(
    [...model.participants, ...model.messages, ...model.fragments, ...model.notes].map((x) => x.id),
  );
  let n = 1;
  while (used.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

/** Adds a participant at a place in the row (the end by default). */
export function addParticipant(
  model: SequenceModel,
  at = model.participants.length,
  name?: string,
): { model: SequenceModel; id: string } {
  if (model.participants.length >= SEQ_LIMITS.participants) return { model, id: '' };
  const id = freshId(model, 'p');
  const participants = [...model.participants];
  participants.splice(Math.max(0, Math.min(at, participants.length)), 0, {
    id,
    name: name ?? `Participant ${model.participants.length + 1}`,
  });
  return { model: { ...model, participants }, id };
}

export function updateParticipant(
  model: SequenceModel,
  id: string,
  patch: Partial<Pick<SeqParticipant, 'name' | 'kind' | 'color'>>,
): SequenceModel {
  return cleanSequence({
    ...model,
    participants: model.participants.map((p) => (p.id === id ? { ...p, ...patch } : p)),
  });
}

/** Moves a participant one place left (-1) or right (1). */
export function moveParticipant(model: SequenceModel, id: string, dir: -1 | 1): SequenceModel {
  const i = model.participants.findIndex((p) => p.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= model.participants.length) return model;
  const participants = [...model.participants];
  [participants[i], participants[j]] = [participants[j], participants[i]];
  return { ...model, participants };
}

/** Removes a participant, with its messages and the notes over only it. */
export function removeParticipant(model: SequenceModel, id: string): SequenceModel {
  const gone = removeMessages(
    model,
    model.messages.filter((m) => m.from === id || m.to === id).map((m) => m.id),
  );
  return cleanSequence({ ...gone, participants: gone.participants.filter((p) => p.id !== id) });
}

/** Adds a message from one participant to another at a place in time (the end by default). */
export function addMessage(
  model: SequenceModel,
  from: string,
  to: string,
  at = model.messages.length,
  kind: MessageKind = 'sync',
): { model: SequenceModel; id: string } {
  if (model.messages.length >= SEQ_LIMITS.messages) return { model, id: '' };
  const id = freshId(model, 'm');
  const messages = [...model.messages];
  const k = Math.max(0, Math.min(at, messages.length));
  messages.splice(k, 0, {
    id,
    from,
    to,
    label: kind === 'reply' ? 'Response' : 'Message',
    ...(kind !== 'sync' ? { kind } : {}),
  });
  // A message added right after a frame's last one, inside it, stays outside: frames keep their ends.
  return { model: cleanSequence({ ...model, messages }), id };
}

export function updateMessage(
  model: SequenceModel,
  id: string,
  patch: Partial<Pick<SeqMessage, 'label' | 'detail' | 'kind' | 'from' | 'to'>>,
): SequenceModel {
  return cleanSequence({
    ...model,
    messages: model.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
  });
}

/** Turns a message around: a call becomes the other's, a reply goes back. */
export function reverseMessage(model: SequenceModel, id: string): SequenceModel {
  const m = model.messages.find((x) => x.id === id);
  return m ? updateMessage(model, id, { from: m.to, to: m.from }) : model;
}

/**
 * Moves a message one step earlier (-1) or later (1). A frame's first message moved earlier (or its last moved later)
 * steps out of the frame; a message next to a frame steps into it. A frame of that one message moves with it.
 */
export function moveMessage(model: SequenceModel, id: string, dir: -1 | 1): SequenceModel {
  const i = model.messages.findIndex((m) => m.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= model.messages.length) return model;
  const before = model.messages.map((m) => m.id);
  const messages = [...model.messages];
  [messages[i], messages[j]] = [messages[j], messages[i]];
  const fragments = model.fragments.map((f) => {
    if (f.from === id && f.to === id) return f;
    if (dir < 0 && f.from === id) return { ...f, from: before[i + 1] };
    if (dir > 0 && f.to === id) return { ...f, to: before[i - 1] };
    return f;
  });
  return cleanSequence({ ...model, messages, fragments });
}

/** Removes messages; a frame left with none goes too, and notes and branches tied to them move to a neighbour. */
export function removeMessages(model: SequenceModel, ids: readonly string[]): SequenceModel {
  const gone = new Set(ids);
  if (!gone.size) return model;
  const order = model.messages.map((m) => m.id);
  const kept = order.filter((id) => !gone.has(id));
  const keptAt = new Set(kept);
  /** The nearest kept message from a position, looking one way first. */
  const near = (id: string, dir: 1 | -1, lo = 0, hi = order.length - 1): string | null => {
    const i = order.indexOf(id);
    for (let k = i; k >= lo && k <= hi; k += dir) if (keptAt.has(order[k])) return order[k];
    return null;
  };
  const fragments = model.fragments.flatMap((f) => {
    const lo = order.indexOf(f.from);
    const hi = order.indexOf(f.to);
    const from = near(f.from, 1, lo, hi);
    const to = near(f.to, -1, lo, hi);
    if (!from || !to) return [];
    const branches = f.branches?.flatMap((b) => {
      const at = near(b.at, 1, lo, hi);
      return at && at !== from ? [{ ...b, at }] : [];
    });
    return [{ ...f, from, to, ...(branches ? { branches } : {}) }];
  });
  const notes = model.notes.map((n) => {
    if (n.after && gone.has(n.after)) {
      const after = near(n.after, -1);
      const { after: _a, ...rest } = n;
      return after ? { ...rest, after } : rest;
    }
    if (n.before && gone.has(n.before)) {
      const before = near(n.before, 1);
      const { before: _b, ...rest } = n;
      return before ? { ...rest, before } : rest;
    }
    return n;
  });
  return cleanSequence({
    ...model,
    messages: model.messages.filter((m) => !gone.has(m.id)),
    fragments,
    notes,
  });
}

/** Puts a frame around a run of messages (in time order, the first and last given). */
export function wrapMessages(
  model: SequenceModel,
  ids: readonly string[],
  kind: FrameKind,
  label = '',
): { model: SequenceModel; id: string } {
  const order = model.messages.map((m) => m.id);
  const at = ids.map((id) => order.indexOf(id)).filter((i) => i >= 0);
  if (!at.length || model.fragments.length >= SEQ_LIMITS.fragments) return { model, id: '' };
  const id = freshId(model, 'f');
  const from = order[Math.min(...at)];
  const to = order[Math.max(...at)];
  const fragment: SeqFragment = { id, kind, label: label || defaultFrameLabel(kind), from, to };
  return { model: cleanSequence({ ...model, fragments: [...model.fragments, fragment] }), id };
}

export const defaultFrameLabel = (kind: FrameKind): string =>
  ({
    alt: 'condition',
    opt: 'if needed',
    loop: 'for each',
    par: 'at the same time',
    break: 'on failure',
    critical: 'must finish',
    group: 'Phase',
  })[kind];

export function updateFragment(
  model: SequenceModel,
  id: string,
  patch: Partial<Pick<SeqFragment, 'kind' | 'label' | 'collapsed' | 'color'>>,
): SequenceModel {
  return cleanSequence({
    ...model,
    fragments: model.fragments.map((f) => (f.id === id ? { ...f, ...patch } : f)),
  });
}

export function removeFragment(model: SequenceModel, id: string): SequenceModel {
  return { ...model, fragments: model.fragments.filter((f) => f.id !== id) };
}

/** The frames a message is inside, innermost first. */
export function framesAround(model: SequenceModel, id: string): SeqFragment[] {
  const order = model.messages.map((m) => m.id);
  const i = order.indexOf(id);
  return model.fragments
    .filter((f) => order.indexOf(f.from) <= i && i <= order.indexOf(f.to))
    .sort(
      (a, b) =>
        order.indexOf(b.from) - order.indexOf(a.from) || order.indexOf(a.to) - order.indexOf(b.to),
    );
}

/** Starts another branch ("else" in an alt, "and" in a par) of the innermost such frame at a message. */
export function splitAt(model: SequenceModel, id: string, label = ''): SequenceModel {
  const frame = framesAround(model, id).find(
    (f) => (f.kind === 'alt' || f.kind === 'par' || f.kind === 'critical') && f.from !== id,
  );
  if (!frame || frame.branches?.some((b) => b.at === id)) return model;
  const order = model.messages.map((m) => m.id);
  const branches = [...(frame.branches ?? []), { at: id, ...(label ? { label } : {}) }].sort(
    (a, b) => order.indexOf(a.at) - order.indexOf(b.at),
  );
  return cleanSequence({
    ...model,
    fragments: model.fragments.map((f) => (f.id === frame.id ? { ...f, branches } : f)),
  });
}

/** Whether a message could start another branch of a frame it's in. */
export const canSplitAt = (model: SequenceModel, id: string): boolean =>
  framesAround(model, id).some(
    (f) =>
      (f.kind === 'alt' || f.kind === 'par' || f.kind === 'critical') &&
      f.from !== id &&
      !f.branches?.some((b) => b.at === id),
  );

/** Adds a note over a participant, after a message (or at the start). */
export function addNote(
  model: SequenceModel,
  over: string,
  after?: string,
): { model: SequenceModel; id: string } {
  if (model.notes.length >= SEQ_LIMITS.notes) return { model, id: '' };
  const id = freshId(model, 'n');
  return {
    model: cleanSequence({
      ...model,
      notes: [...model.notes, { id, text: 'Note', over, ...(after ? { after } : {}) }],
    }),
    id,
  };
}

export function updateNote(model: SequenceModel, id: string, text: string): SequenceModel {
  return cleanSequence({
    ...model,
    notes: model.notes.map((n) => (n.id === id ? { ...n, text } : n)),
  });
}

export function removeNote(model: SequenceModel, id: string): SequenceModel {
  return { ...model, notes: model.notes.filter((n) => n.id !== id) };
}
