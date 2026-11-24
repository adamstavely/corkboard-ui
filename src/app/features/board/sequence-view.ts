import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Icon, type IconName } from '../../shared/icon';
import {
  addMessage,
  addNote,
  addParticipant,
  canSplitAt,
  drawSequence,
  FRAME_KINDS,
  moveMessage,
  moveParticipant,
  parseSequence,
  PARTICIPANT_KINDS,
  removeFragment,
  removeMessages,
  removeNote,
  removeParticipant,
  reverseMessage,
  sequenceMermaid,
  splitAt,
  sq,
  updateFragment,
  updateMessage,
  updateNote,
  updateParticipant,
  wrapMessages,
  type FrameKind,
  type MessageKind,
  type ParticipantKind,
  type SequenceModel,
} from './diagrams/sequence';

/** A part of the diagram picked to change. */
export type SeqPick = { kind: 'participant' | 'message' | 'fragment' | 'note'; id: string };

const KIND_ICONS: Record<ParticipantKind, IconName | null> = {
  system: null,
  actor: 'user',
  ui: 'monitor',
  database: 'database',
  queue: 'queue',
  external: 'globe',
};
const KIND_LABELS: Record<ParticipantKind, string> = {
  system: 'Service',
  actor: 'Person',
  ui: 'Screen or front end',
  database: 'Database',
  queue: 'Queue',
  external: 'Outside system',
};
const FRAME_LABELS: Record<FrameKind, string> = {
  alt: 'Alternatives (alt)',
  opt: 'Optional (opt)',
  loop: 'Repeats (loop)',
  par: 'At the same time (par)',
  break: 'Stops here (break)',
  critical: 'Must finish (critical)',
  group: 'Coloured phase',
};
const MESSAGE_LABELS: Record<MessageKind, string> = {
  sync: 'Call: waits for an answer',
  reply: 'Reply',
  async: 'No reply expected',
};
const COLOURS = ['1', '2', '3', '4', '5', '6'] as const;
const COLOUR_NAMES = ['Blue', 'Green', 'Purple', 'Yellow', 'Pink', 'Gray'];

let nextUid = 0;

/**
 * An editable sequence diagram on the board, drawn from its model by the skill's engine. When its item is the one
 * selected (and the person may edit), its parts can be picked and changed in place: drag from one lifeline to another
 * to draw a message, double-click (or Enter on) anything to rename it, and use the bar above what's picked.
 */
@Component({
  selector: 'app-sequence-view',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sequence-view.html',
  styleUrl: './sequence-view.css',
  host: { '(keydown)': 'onKey($event)' },
})
export class SequenceView {
  readonly model = input.required<SequenceModel>();
  /** The item's width on the board: the drawing scales to it. */
  readonly width = input.required<number>();
  readonly editable = input(false);
  readonly zoom = input(1);
  readonly label = input('Sequence diagram');
  readonly changed = output<SequenceModel>();
  /** Something to say to people using a screen reader. */
  readonly announce = output<string>();

  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly #injector = inject(Injector);
  protected readonly uid = `seq${nextUid++}`;
  protected readonly drawing = computed(() => drawSequence(this.model()));
  protected readonly scale = computed(() => this.width() / this.drawing().width);
  /** Bars and editors keep their size on screen however far the board is zoomed. */
  protected readonly barScale = computed(() => 1 / (this.scale() * this.zoom()));
  protected readonly SQ = computed(() => sq());

  protected readonly picked = signal<SeqPick | null>(null);
  /** Messages picked together (with shift), to put a frame around. */
  protected readonly run = signal<string[]>([]);
  protected readonly editing = signal<(SeqPick & { value: string }) | null>(null);
  protected readonly menu = signal<'kind' | 'colour' | 'frame' | 'frameKind' | 'to' | null>(null);
  protected readonly menuLabels: Record<'kind' | 'colour' | 'frame' | 'frameKind' | 'to', string> =
    {
      kind: 'Kind',
      colour: 'Colour',
      frame: 'Put a frame around',
      frameKind: 'Kind of frame',
      to: 'Send a message to',
    };
  protected toggleMenu(which: 'kind' | 'colour' | 'frame' | 'frameKind' | 'to'): void {
    this.menu.set(this.menu() === which ? null : which);
  }
  protected readonly textOpen = signal(false);
  protected readonly text = signal('');
  protected readonly textError = signal('');
  /** A message being drawn from a lifeline: where it started and where the pointer is. */
  protected readonly rubber = signal<{
    from: string;
    x1: number;
    y: number;
    x2: number;
    y2: number;
  } | null>(null);

  protected readonly editor = viewChild<ElementRef<HTMLTextAreaElement>>('editor');

  protected readonly kinds = PARTICIPANT_KINDS;
  protected readonly kindIcons = KIND_ICONS;
  protected readonly kindLabels = KIND_LABELS;
  protected readonly frameKinds = FRAME_KINDS;
  protected readonly frameLabels = FRAME_LABELS;
  protected readonly messageLabels = MESSAGE_LABELS;
  protected readonly colours = COLOURS;
  protected readonly colourNames = COLOUR_NAMES;
  protected readonly slotColours = ['blue', 'green', 'purple', 'yellow', 'pink', 'gray'];

  /** What's picked, as the model has it (gone when someone else removed it). */
  protected readonly current = computed(() => {
    const p = this.picked();
    if (!p || !this.editable()) return null;
    const m = this.model();
    const thing =
      p.kind === 'participant'
        ? m.participants.find((x) => x.id === p.id)
        : p.kind === 'message'
          ? m.messages.find((x) => x.id === p.id)
          : p.kind === 'fragment'
            ? m.fragments.find((x) => x.id === p.id)
            : m.notes.find((x) => x.id === p.id);
    return thing ? { ...p, thing } : null;
  });
  protected readonly pickedParticipant = computed(() => {
    const c = this.current();
    return c?.kind === 'participant' ? this.model().participants.find((p) => p.id === c.id)! : null;
  });
  protected readonly pickedMessage = computed(() => {
    const c = this.current();
    return c?.kind === 'message' ? this.model().messages.find((m) => m.id === c.id)! : null;
  });
  protected readonly pickedFragment = computed(() => {
    const c = this.current();
    return c?.kind === 'fragment' ? this.model().fragments.find((f) => f.id === c.id)! : null;
  });
  protected readonly pickedNote = computed(() => {
    const c = this.current();
    return c?.kind === 'note' ? this.model().notes.find((n) => n.id === c.id)! : null;
  });
  protected readonly canSplit = computed(() => {
    const m = this.pickedMessage();
    return !!m && canSplitAt(this.model(), m.id);
  });
  protected readonly others = computed(() => {
    const p = this.pickedParticipant();
    return p ? this.model().participants : [];
  });

  /**
   * Where the bar sits: beside the diagram's right edge, level with what's picked (over the drawing it would hide the
   * messages next to it), or under the diagram's bottom-left corner when nothing is (above the diagram is the board's
   * own bar for the selected item).
   */
  protected readonly barAt = computed((): { x: number; y: number; place: 'side' | 'below' } => {
    const d = this.drawing();
    const c = this.current();
    const side = (y: number) => ({ x: d.width + 16, y, place: 'side' as const });
    if (c?.kind === 'participant') {
      const p = d.participants.find((x) => x.id === c.id);
      if (p) return side(p.y + p.h / 2);
    }
    if (c?.kind === 'message') {
      const m = d.messages.find((x) => x.id === c.id);
      if (m) return side(m.y);
    }
    if (c?.kind === 'fragment') {
      const f = d.frames.find((x) => x.id === c.id);
      if (f) return side(f.y + 13);
    }
    if (c?.kind === 'note') {
      const n = d.notes.find((x) => x.id === c.id);
      if (n) return side(n.y + n.h / 2);
    }
    return { x: 0, y: d.height, place: 'below' };
  });

  /** The inline editor's box, over what's being renamed. */
  protected readonly editorBox = computed(() => {
    const e = this.editing();
    if (!e) return null;
    const d = this.drawing();
    if (e.kind === 'participant') {
      const p = d.participants.find((x) => x.id === e.id);
      return p ? { x: p.x, y: p.y, w: p.w, h: p.h } : null;
    }
    if (e.kind === 'message') {
      const m = d.messages.find((x) => x.id === e.id);
      if (!m) return null;
      const w = 240;
      return {
        x: m.label.anchor === 'middle' ? m.label.x - w / 2 : m.label.x,
        y: m.label.y - 4,
        w,
        h: Math.max(34, m.label.lines.length * 22 + 8),
      };
    }
    if (e.kind === 'fragment') {
      const f = d.frames.find((x) => x.id === e.id);
      return f ? { x: f.x + 4, y: f.y + 2, w: 240, h: 30 } : null;
    }
    const n = d.notes.find((x) => x.id === e.id);
    return n ? { x: n.x, y: n.y, w: Math.max(n.w, 200), h: Math.max(n.h, 60) } : null;
  });

  protected isPicked(kind: SeqPick['kind'], id: string): boolean {
    const p = this.current();
    return (p?.kind === kind && p.id === id) || (kind === 'message' && this.run().includes(id));
  }

  /** Something just added, to open for naming once the board hands back the model with it. */
  readonly #pending = signal<SeqPick | null>(null);

  constructor() {
    effect(() => {
      const p = this.#pending();
      const m = this.model();
      if (!p) return;
      const there = [...m.participants, ...m.messages, ...m.fragments, ...m.notes].some(
        (x) => x.id === p.id,
      );
      if (there)
        untracked(() => {
          this.#pending.set(null);
          this.openEditor(null, p.kind, p.id);
        });
    });
    // Letting go of the diagram lets go of what was picked in it.
    effect(() => {
      if (this.editable()) return;
      this.picked.set(null);
      this.run.set([]);
      this.editing.set(null);
      this.textOpen.set(false);
    });
  }

  // -- Picking and keys ---------------------------------------------------------------------------------------

  protected pick(e: Event, kind: SeqPick['kind'], id: string): void {
    if (!this.editable()) return;
    const shift = e instanceof MouseEvent && e.shiftKey;
    const prev = this.current();
    if (shift && kind === 'message' && prev?.kind === 'message') {
      const run = new Set([...this.run(), prev.id]);
      if (run.has(id)) run.delete(id);
      else run.add(id);
      this.run.set([...run]);
    } else this.run.set([]);
    this.picked.set({ kind, id });
    this.menu.set(null);
    this.textOpen.set(false);
  }

  protected openEditor(e: Event | null, kind: SeqPick['kind'], id: string): void {
    if (!this.editable()) return;
    e?.stopPropagation();
    const m = this.model();
    const value =
      kind === 'participant'
        ? m.participants.find((p) => p.id === id)?.name
        : kind === 'message'
          ? m.messages.find((x) => x.id === id)?.label
          : kind === 'fragment'
            ? m.fragments.find((f) => f.id === id)?.label
            : m.notes.find((n) => n.id === id)?.text;
    if (value === undefined) return;
    this.picked.set({ kind, id });
    this.editing.set({ kind, id, value });
    afterNextRender(
      () => {
        const el = this.editor()?.nativeElement;
        el?.focus();
        el?.select();
      },
      { injector: this.#injector },
    );
  }

  protected commitEditor(): void {
    const e = this.editing();
    if (!e) return;
    this.editing.set(null);
    const value = this.editor()?.nativeElement.value ?? e.value;
    const m = this.model();
    const next =
      e.kind === 'participant'
        ? updateParticipant(m, e.id, {
            name: value.trim() || m.participants.find((p) => p.id === e.id)?.name,
          })
        : e.kind === 'message'
          ? updateMessage(m, e.id, { label: value.trim() })
          : e.kind === 'fragment'
            ? updateFragment(m, e.id, { label: value.trim() })
            : updateNote(m, e.id, value.trim());
    this.#change(next);
    this.#focusPicked();
  }

  protected editorKey(e: KeyboardEvent): void {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      this.editing.set(null);
      this.#focusPicked();
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.commitEditor();
    }
  }

  /** Keys on a picked part: Enter renames it, Delete removes it, Escape lets it go. */
  onKey(e: KeyboardEvent): void {
    if (!this.editable() || this.editing() || (e.target as HTMLElement).closest('textarea, input'))
      return;
    const p = this.current();
    if (!p) return;
    if (e.key === 'Escape') {
      this.picked.set(null);
      this.run.set([]);
      e.stopPropagation();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      e.stopPropagation();
      this.remove();
    } else if (e.key === 'Enter' && (e.target as HTMLElement).dataset['part']) {
      e.preventDefault();
      e.stopPropagation();
      this.openEditor(null, p.kind, p.id);
    }
  }

  #focusPicked(): void {
    afterNextRender(
      () => {
        const p = this.current();
        if (p)
          this.#host.nativeElement
            .querySelector<HTMLElement>(`[data-part="${p.kind}:${p.id}"]`)
            ?.focus({ preventScroll: true });
      },
      { injector: this.#injector },
    );
  }

  #editSoon(kind: SeqPick['kind'], id: string): void {
    this.picked.set({ kind, id });
    this.#pending.set({ kind, id });
  }

  #change(next: SequenceModel, say?: string): void {
    if (next !== this.model()) this.changed.emit(next);
    if (say) this.announce.emit(say);
  }

  // -- Drawing a message from a lifeline --------------------------------------------------------------------------

  /** The pointer in the diagram's own pixels. */
  #local(e: PointerEvent): { x: number; y: number } {
    const r = this.#host.nativeElement.querySelector('.seq')!.getBoundingClientRect();
    const k = r.width / this.drawing().width;
    return { x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k };
  }

  protected startMessage(e: PointerEvent, from: string): void {
    if (!this.editable() || e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const p = this.drawing().participants.find((x) => x.id === from)!;
    const at = this.#local(e);
    this.rubber.set({ from, x1: p.cx, y: at.y, x2: at.x, y2: at.y });
    const move = (ev: PointerEvent) => {
      const pt = this.#local(ev);
      this.rubber.update((r) => r && { ...r, x2: pt.x, y2: pt.y });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const r = this.rubber();
      this.rubber.set(null);
      if (!r) return;
      const pt = this.#local(ev);
      const d = this.drawing();
      const to = d.participants.reduce<{ id: string; dist: number } | null>((best, q) => {
        const dist = Math.abs(q.cx - pt.x);
        return dist <= q.w / 2 + 24 && (!best || dist < best.dist) ? { id: q.id, dist } : best;
      }, null);
      if (!to) return;
      if (to.id === from && Math.abs(pt.y - r.y) < 16) return;
      // In time order: after every message drawn above where the drag started.
      const at = d.messages.length
        ? this.model().messages.findIndex(
            (m) => (d.messages.find((x) => x.id === m.id)?.y ?? -1) > r.y,
          )
        : 0;
      const added = addMessage(
        this.model(),
        from,
        to.id,
        at < 0 ? this.model().messages.length : at,
      );
      if (!added.id) return;
      this.#change(added.model, 'Added a message');
      this.#editSoon('message', added.id);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  // -- The bar's actions --------------------------------------------------------------------------------------

  protected remove(): void {
    const p = this.current();
    if (!p) return;
    const m = this.model();
    const run = this.run();
    const next =
      p.kind === 'participant'
        ? removeParticipant(m, p.id)
        : p.kind === 'message'
          ? removeMessages(m, [...new Set([p.id, ...run])])
          : p.kind === 'fragment'
            ? removeFragment(m, p.id)
            : removeNote(m, p.id);
    this.picked.set(null);
    this.run.set([]);
    this.#change(
      next,
      p.kind === 'fragment' ? 'Removed the frame; its messages stay' : `Removed the ${p.kind}`,
    );
  }

  protected addParticipantAt(at: number): void {
    const added = addParticipant(this.model(), at);
    if (!added.id) return;
    this.#change(added.model, 'Added a participant');
    this.#editSoon('participant', added.id);
  }

  protected setKind(kind: ParticipantKind): void {
    const p = this.pickedParticipant();
    this.menu.set(null);
    if (p)
      this.#change(
        updateParticipant(this.model(), p.id, { kind }),
        `${p.name} is now a ${KIND_LABELS[kind].toLowerCase()}`,
      );
  }

  protected setColour(color: string | undefined): void {
    const c = this.current();
    this.menu.set(null);
    if (c?.kind === 'participant') this.#change(updateParticipant(this.model(), c.id, { color }));
    if (c?.kind === 'fragment') this.#change(updateFragment(this.model(), c.id, { color }));
  }

  protected moveParticipant(dir: -1 | 1): void {
    const p = this.pickedParticipant();
    if (p)
      this.#change(
        moveParticipant(this.model(), p.id, dir),
        `Moved ${p.name} ${dir < 0 ? 'left' : 'right'}`,
      );
  }

  protected messageTo(to: string): void {
    const p = this.pickedParticipant();
    this.menu.set(null);
    if (!p) return;
    const added = addMessage(this.model(), p.id, to);
    if (!added.id) return;
    this.#change(added.model, 'Added a message at the end');
    this.#editSoon('message', added.id);
  }

  protected setMessageKind(kind: MessageKind): void {
    const m = this.pickedMessage();
    if (m) this.#change(updateMessage(this.model(), m.id, { kind }), MESSAGE_LABELS[kind]);
  }

  protected reverse(): void {
    const m = this.pickedMessage();
    if (m) this.#change(reverseMessage(this.model(), m.id), 'Turned the message around');
  }

  protected moveMessage(dir: -1 | 1): void {
    const m = this.pickedMessage();
    if (m)
      this.#change(
        moveMessage(this.model(), m.id, dir),
        dir < 0 ? 'Moved the message earlier' : 'Moved the message later',
      );
  }

  /** Adds the reply to a call, right after it. */
  protected addReply(): void {
    const m = this.pickedMessage();
    if (!m) return;
    const at = this.model().messages.findIndex((x) => x.id === m.id) + 1;
    const added = addMessage(this.model(), m.to, m.from, at, 'reply');
    if (!added.id) return;
    this.#change(added.model, 'Added a reply');
    this.#editSoon('message', added.id);
  }

  protected wrap(kind: FrameKind): void {
    const m = this.pickedMessage();
    this.menu.set(null);
    if (!m) return;
    const wrapped = wrapMessages(this.model(), [m.id, ...this.run()], kind);
    if (!wrapped.id) return;
    this.run.set([]);
    this.#change(
      wrapped.model,
      `Put a ${kind === 'group' ? 'phase' : kind} frame around the messages`,
    );
    this.#editSoon('fragment', wrapped.id);
  }

  protected split(): void {
    const m = this.pickedMessage();
    if (m) this.#change(splitAt(this.model(), m.id), 'Another branch starts at this message');
  }

  protected addNoteHere(): void {
    const c = this.current();
    const m = this.model();
    let over: string | undefined;
    let after: string | undefined;
    if (c?.kind === 'participant') {
      over = c.id;
      after = m.messages.at(-1)?.id;
    } else if (c?.kind === 'message') {
      const msg = m.messages.find((x) => x.id === c.id)!;
      over = msg.to;
      after = msg.id;
    }
    if (!over) return;
    const added = addNote(m, over, after);
    if (!added.id) return;
    this.#change(added.model, 'Added a note');
    this.#editSoon('note', added.id);
  }

  protected setFrameKind(kind: FrameKind): void {
    const f = this.pickedFragment();
    this.menu.set(null);
    if (f) this.#change(updateFragment(this.model(), f.id, { kind }));
  }

  protected toggleCollapsed(id: string): void {
    const f = this.model().fragments.find((x) => x.id === id);
    if (f)
      this.#change(
        updateFragment(this.model(), id, { collapsed: !f.collapsed }),
        f.collapsed ? 'Opened the frame' : 'Folded the frame: its messages are hidden',
      );
  }

  protected toggle(key: 'numbered' | 'showDetails' | 'lifespans' | 'rails'): void {
    const m = this.model();
    const on = key === 'showDetails' ? m.showDetails === false : !m[key];
    this.#change({
      ...m,
      [key]: key === 'showDetails' ? (on ? undefined : false) : on || undefined,
    });
  }

  // -- As text ------------------------------------------------------------------------------------------------

  protected openText(): void {
    this.text.set(sequenceMermaid(this.model()));
    this.textError.set('');
    this.textOpen.set(!this.textOpen());
  }

  protected applyText(): void {
    const parsed = parseSequence(this.text());
    if ('error' in parsed) {
      this.textError.set(parsed.error);
      return;
    }
    this.textOpen.set(false);
    this.picked.set(null);
    this.#change(
      parsed.model,
      parsed.warnings.length
        ? `Updated the diagram. ${parsed.warnings.join(' ')}`
        : 'Updated the diagram from its text',
    );
  }

  protected async copyText(): Promise<void> {
    const text = sequenceMermaid(this.model());
    let copied = false;
    const put = (e: ClipboardEvent) => {
      e.clipboardData?.setData('text/plain', text);
      e.preventDefault();
      copied = true;
    };
    document.addEventListener('copy', put, { once: true });
    try {
      document.execCommand('copy');
    } finally {
      document.removeEventListener('copy', put);
    }
    if (!copied)
      copied = await navigator.clipboard.writeText(text).then(
        () => true,
        () => false,
      );
    this.announce.emit(
      copied
        ? 'Copied the diagram as Mermaid'
        : "The diagram couldn't be copied: the browser didn't allow it",
    );
  }

  // -- Words for screen readers -------------------------------------------------------------------------------

  protected readonly nameOf = computed(
    () => new Map(this.model().participants.map((p) => [p.id, p.name])),
  );
  protected messageAria(m: {
    from: string;
    to: string;
    label: { lines: string[] };
    kind: MessageKind;
    step: number | null;
  }): string {
    const names = this.nameOf();
    const kind =
      m.kind === 'reply' ? 'Reply' : m.kind === 'async' ? 'Message, no reply expected,' : 'Call';
    return `${m.step ? `Step ${m.step}: ` : ''}${kind} from ${names.get(m.from)} to ${names.get(m.to)}: ${m.label.lines.join(' ')}`;
  }
}
