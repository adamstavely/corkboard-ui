import type { ParticipationDto } from '../../api/generated/models/participation-dto';
import {
  FrameLooks,
  frameRows,
  LOOK_MS,
  peopleRows,
  QUIET,
  SEND_MS,
  sessionLine,
  summaryLines,
  TAKING_PART,
  UNSEEN,
  unseenLine,
} from './participation';

function report(change: Partial<ParticipationDto> = {}): ParticipationDto {
  return {
    since: 0,
    fromAgenda: false,
    private: false,
    people: [
      { id: 'cy', name: 'Cy', online: false, notes: 0, votes: 0, comments: 0, chat: 0 },
      { id: 'ada', name: 'Ada', online: true, notes: 3, votes: 2, comments: 0, chat: 1 },
    ],
    team: { people: 2, online: 1, quiet: 1, notes: 3, votes: 2, comments: 0, chat: 1 },
    participants: { people: 0, online: 0, notes: 0, votes: 0, comments: 0 },
    anonymousNotes: 0,
    writing: { open: false, notes: 0, writers: 0 },
    frames: [
      { id: 'f2', title: '', viewers: 0, contributors: 0, notes: 0 },
      { id: 'f1', title: 'Ideas', viewers: 3, contributors: 2, notes: 4 },
    ],
    ...change,
  };
}

describe('frames looked at', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('counts a frame once it has been on screen a few seconds, not one only passed over', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const looks = new FrameLooks(send);
    looks.inView(['f1', 'f2']);
    await vi.advanceTimersByTimeAsync(LOOK_MS - 500);
    looks.inView(['f1']);
    await vi.advanceTimersByTimeAsync(1000);
    expect(send).toHaveBeenCalledExactlyOnceWith(['f1']);
    looks.destroy();
  });

  it('sends each frame once, and no more often than every few seconds', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const looks = new FrameLooks(send);
    looks.inView(['f1']);
    await vi.advanceTimersByTimeAsync(LOOK_MS);
    looks.inView(['f2']);
    await vi.advanceTimersByTimeAsync(LOOK_MS);
    looks.inView(['f1']);
    await vi.advanceTimersByTimeAsync(LOOK_MS);
    looks.inView(['f3']);
    await vi.advanceTimersByTimeAsync(LOOK_MS);
    expect(send.mock.calls).toEqual([[['f1']]]);
    await vi.advanceTimersByTimeAsync(SEND_MS);
    expect(send.mock.calls).toEqual([[['f1']], [['f2', 'f3']]]);
    looks.destroy();
  });

  it("doesn't mind when sending fails", async () => {
    const looks = new FrameLooks(() => Promise.reject(new Error('offline')));
    looks.inView(['f1']);
    await vi.advanceTimersByTimeAsync(LOOK_MS + 10);
    looks.destroy();
  });
});

describe('the participation view', () => {
  it('says the quiet ones are quiet in words, not only colour', () => {
    const rows = peopleRows(report());
    expect(rows.map((r) => [r['name'], r['status'], r['here']])).toEqual([
      ['Cy', QUIET, 'Left'],
      ['Ada', TAKING_PART, 'Here now'],
    ]);
    expect(summaryLines(report())[0]).toBe(
      '2 people from the team this session, 1 here now. 1 person hasn’t added anything yet.',
    );
  });

  it('names nobody in private mode, giving only totals', () => {
    const p = report({ private: true });
    expect(peopleRows(p)).toEqual([]);
    const text = summaryLines(p).join(' ');
    expect(text).toContain(
      'Private mode is on, so nobody is named. The team added 3 notes, 2 votes, 0 comments and 1 chat message.',
    );
    expect(text).not.toContain('Ada');
  });

  it('only counts feedback participants, anonymous notes and hidden writing', () => {
    const lines = summaryLines(
      report({
        participants: { people: 3, online: 2, notes: 5, votes: 1, comments: 0 },
        anonymousNotes: 6,
        writing: { open: true, notes: 4, writers: 3 },
      }),
    );
    expect(lines.slice(1)).toEqual([
      '3 feedback participants (2 here now): 5 notes, 1 vote, 0 comments. Counted together, never named.',
      '6 anonymous notes from hidden writing. Counted, never credited to anyone.',
      'Hidden writing under way: 4 notes from 3 people so far.',
    ]);
  });

  it('flags frames nobody has looked at', () => {
    const p = report();
    expect(frameRows(p).map((r) => [r['title'], r['status'], r['viewers']])).toEqual([
      ['Untitled frame', UNSEEN, 0],
      ['Ideas', 'Looked at', 3],
    ]);
    expect(unseenLine(p)).toBe('1 frame nobody has looked at yet.');
    expect(unseenLine(report({ frames: [] }))).toBeNull();
  });

  it('says what it counts from', () => {
    expect(sessionLine({ since: 0, fromAgenda: false }, 3 * 3_600_000)).toBe(
      'In the last 3 hours (start the agenda to count from then)',
    );
    expect(
      sessionLine({ since: new Date(2026, 10, 21, 14, 5).getTime(), fromAgenda: true }),
    ).toMatch(/^Since the agenda started at (14:05|2:05\sPM)$/);
  });
});
