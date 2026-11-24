import { BoardDoc, type SequenceItem } from '../board-doc';
import {
  addMessage,
  addNote,
  addParticipant,
  canSplitAt,
  cleanSequence,
  drawSequence,
  isSequenceText,
  layoutSequence,
  moveMessage,
  moveParticipant,
  parseSequence,
  removeMessages,
  removeParticipant,
  reverseMessage,
  SEQ_SCALE,
  SEQUENCE_STARTER,
  sequenceMermaid,
  sequenceSvg,
  sequenceWords,
  splitAt,
  wrapMessages,
  type SequenceModel,
} from './sequence';

function starter(): SequenceModel {
  const parsed = parseSequence(SEQUENCE_STARTER);
  if ('error' in parsed) throw new Error(parsed.error);
  return parsed.model;
}

describe('sequence diagrams', () => {
  it('reads Mermaid: participants, messages in order, an alt frame with its else', () => {
    expect(isSequenceText(SEQUENCE_STARTER)).toBe(true);
    expect(isSequenceText('%% a comment\nsequenceDiagram\n A->>B: hi')).toBe(true);
    expect(isSequenceText('flowchart LR\n a-->b')).toBe(false);
    const m = starter();
    expect(m.title).toBe('Checkout');
    expect(m.participants.map((p) => [p.id, p.name, p.kind])).toEqual([
      ['customer', 'Customer', 'actor'],
      ['shop', 'Shop', undefined],
      ['pay', 'Payment', undefined],
    ]);
    expect(m.messages.map((x) => [x.from, x.to, x.label, x.kind ?? 'sync'])).toEqual([
      ['customer', 'shop', 'Place order', 'sync'],
      ['shop', 'pay', 'Charge card', 'sync'],
      ['pay', 'shop', 'Approved', 'reply'],
      ['shop', 'customer', 'Order confirmed', 'reply'],
      ['pay', 'shop', 'Declined', 'reply'],
      ['shop', 'customer', 'Order failed', 'reply'],
    ]);
    expect(m.fragments).toEqual([
      {
        id: 'f1',
        kind: 'alt',
        label: 'card approved',
        from: 'm3',
        to: 'm6',
        branches: [{ at: 'm5', label: 'card declined' }],
      },
    ]);
    expect(parseSequence('sequenceDiagram\n')).toEqual({ error: expect.any(String) });
  });

  it('writes Mermaid that reads back as the same diagram', () => {
    const m = starter();
    const again = parseSequence(sequenceMermaid(m));
    if ('error' in again) throw new Error(again.error);
    expect(again.model).toEqual(m);
  });

  it('lays out boxes, rows and frames, with activation bars from calls to their replies', () => {
    const m = starter();
    const L = layoutSequence(m);
    expect(L.width).toBeGreaterThan(500);
    const xs = L.participants.map((p) => p.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    const ys = L.messages.map((x) => x.y);
    expect(ys).toEqual([...ys].sort((a, b) => a - b));
    // The shop is busy from the order until its last reply; payment from the charge until it answers.
    expect(L.bars.some((b) => b.pid === 'shop' && b.y1 < ys[0] + 1 && b.y2 >= ys[3])).toBe(true);
    expect(L.bars.some((b) => b.pid === 'pay' && b.y1 < ys[1] + 1 && b.y2 >= ys[2])).toBe(true);
    // The customer, a person, starts the flow without a bar of their own.
    expect(L.bars.some((b) => b.pid === 'customer' && b.y1 < ys[0])).toBe(false);
    const d = drawSequence(m);
    expect(d.frames[0].dividers).toEqual([
      { at: 'm5', y: expect.any(Number), label: 'card declined' },
    ]);
    expect(d.messages[2]).toMatchObject({
      kind: 'reply',
      self: false,
      label: { lines: ['Approved'], anchor: 'middle' },
    });
  });

  it('draws a picture with every name and message in it', () => {
    const svg = sequenceSvg({ ...starter(), numbered: true });
    expect(svg.startsWith('<svg')).toBe(true);
    for (const words of ['Customer', 'Payment', '1. Place order', 'card declined', 'Order failed'])
      expect(svg).toContain(words);
    expect(
      sequenceSvg({
        ...starter(),
        participants: [{ id: 'a', name: '<script>' }],
        messages: [],
        fragments: [],
      }),
    ).toContain('&lt;script&gt;');
  });

  it('adds, moves, turns and removes participants and messages', () => {
    let m = starter();
    const p = addParticipant(m, 1, 'Fraud check');
    m = p.model;
    expect(m.participants.map((x) => x.name)).toEqual([
      'Customer',
      'Fraud check',
      'Shop',
      'Payment',
    ]);
    m = moveParticipant(m, p.id, 1);
    expect(m.participants[2].name).toBe('Fraud check');
    const msg = addMessage(m, 'shop', p.id, 2);
    m = msg.model;
    expect(m.messages[2]).toMatchObject({ id: msg.id, from: 'shop', to: p.id, label: 'Message' });
    m = reverseMessage(m, msg.id);
    expect(m.messages[2]).toMatchObject({ from: p.id, to: 'shop' });
    m = moveMessage(m, msg.id, -1);
    expect(m.messages[1].id).toBe(msg.id);
    m = removeParticipant(m, p.id);
    expect(m.participants).toHaveLength(3);
    expect(m.messages.some((x) => x.id === msg.id)).toBe(false);
  });

  it('keeps frames whole as messages go: the ends move in, an empty frame goes', () => {
    const m = starter();
    const fewer = removeMessages(m, ['m3']);
    expect(fewer.fragments[0]).toMatchObject({
      from: 'm4',
      to: 'm6',
      branches: [{ at: 'm5', label: 'card declined' }],
    });
    const branchGone = removeMessages(m, ['m5']);
    expect(branchGone.fragments[0].branches).toEqual([{ at: 'm6', label: 'card declined' }]);
    expect(removeMessages(m, ['m3', 'm4', 'm5', 'm6']).fragments).toEqual([]);
    // The frame's first message moved earlier steps out of it; the one before it moved later steps in.
    expect(moveMessage(m, 'm3', -1).fragments[0]).toMatchObject({ from: 'm4', to: 'm6' });
    expect(moveMessage(m, 'm2', 1).fragments[0]).toMatchObject({ from: 'm3', to: 'm6' });
    expect(
      moveMessage(m, 'm2', 1)
        .messages.map((x) => x.id)
        .slice(1, 3),
    ).toEqual(['m3', 'm2']);
  });

  it('frames a run of messages, and splits an alt into another branch', () => {
    let m = starter();
    const w = wrapMessages(m, ['m2', 'm1'], 'loop');
    m = w.model;
    expect(m.fragments.find((f) => f.id === w.id)).toEqual({
      id: w.id,
      kind: 'loop',
      label: 'for each',
      from: 'm1',
      to: 'm2',
    });
    expect(canSplitAt(m, 'm4')).toBe(true);
    expect(canSplitAt(m, 'm3')).toBe(false);
    m = splitAt(m, 'm4');
    expect(m.fragments.find((f) => f.id === 'f1')!.branches).toEqual([
      { at: 'm4' },
      { at: 'm5', label: 'card declined' },
    ]);
  });

  it('adds notes after a message, and cleans what is malformed', () => {
    const n = addNote(starter(), 'pay', 'm2');
    expect(n.model.notes).toEqual([{ id: n.id, text: 'Note', over: 'pay', after: 'm2' }]);
    const clean = cleanSequence({
      participants: [
        { id: 'a', name: 'A' },
        { id: 'a', name: 'dup' },
        { id: 'b bad' },
        { id: 'b', name: 'B', kind: 'robot', color: '9' },
      ],
      messages: [
        { id: 'm1', from: 'a', to: 'b', label: 'x' },
        { id: 'm2', from: 'a', to: 'nobody', label: 'y' },
      ],
      fragments: [{ id: 'f1', kind: 'alt', from: 'm1', to: 'gone', label: '' }],
      notes: [{ id: 'n1', text: 'hi', over: 'nobody' }],
    });
    expect(clean).toEqual({
      participants: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ],
      messages: [{ id: 'm1', from: 'a', to: 'b', label: 'x' }],
      fragments: [],
      notes: [],
    });
    expect(sequenceWords(starter())).toContain('Shop → Payment: Charge card');
  });

  it('lives on the board as one item that grows to fit', () => {
    const board = new BoardDoc();
    const id = board.addSequence(0, 0, starter());
    const item = board.items().find((i) => i.id === id) as SequenceItem;
    expect(item.kind).toBe('sequence');
    expect(item.w).toBe(Math.round(layoutSequence(starter()).width * SEQ_SCALE));
    const bigger = addParticipant(item.sequence).model;
    board.setSequence(id, bigger);
    const after = board.items().find((i) => i.id === id) as SequenceItem;
    expect(after.sequence.participants).toHaveLength(4);
    expect(after.w).toBeGreaterThan(item.w);
    expect(after.x).toBe(item.x);
    board.undo.undo();
    expect(
      (board.items().find((i) => i.id === id) as SequenceItem).sequence.participants,
    ).toHaveLength(3);
  });
});
