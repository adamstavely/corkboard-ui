import { TestBed } from '@angular/core/testing';
import { Api } from '../../api/generated/api';
import { boardsControllerMembers } from '../../api/generated/fn/boards/boards-controller-members';
import { commentsControllerAdd } from '../../api/generated/fn/comments/comments-controller-add';
import type { CommentThreadDto } from '../../api/generated/models/comment-thread-dto';
import { BoardComments } from './board-comments';
import { BoardDoc } from './board-doc';

const ADA = '11111111-1111-4111-8111-111111111111';
const GRACE = '33333333-3333-4333-8333-333333333333';
const members = [
  {
    userId: ADA,
    name: 'Ada Lovelace',
    email: 'ada@corkboard.test',
    role: 'owner',
    workspaceRole: 'owner',
    boardRole: null,
  },
  {
    userId: GRACE,
    name: 'Grace Hopper',
    email: 'grace@corkboard.test',
    role: 'commenter',
    workspaceRole: 'commenter',
    boardRole: null,
  },
  {
    userId: 'l',
    name: 'Linus Torvalds',
    email: 'linus@corkboard.test',
    role: null,
    workspaceRole: 'reader',
    boardRole: 'none',
  },
];

async function setup(threads: CommentThreadDto[] = []) {
  const sent: unknown[] = [];
  const invoke = (fn: unknown, params: { body?: unknown }) => {
    if (fn === boardsControllerMembers) return Promise.resolve(members);
    if (fn === commentsControllerAdd) sent.push(params.body);
    return Promise.resolve({});
  };
  TestBed.configureTestingModule({ providers: [{ provide: Api, useValue: { invoke } }] });
  const board = new BoardDoc();
  const note = board.addNote(0, 0, 'yellow', 'Deploys are slow');
  const fixture = TestBed.createComponent(BoardComments);
  fixture.componentRef.setInput('boardId', 'b1');
  fixture.componentRef.setInput('board', board);
  fixture.componentRef.setInput(
    'threads',
    threads.map((t) => ({ ...t, nodeId: note })),
  );
  fixture.componentRef.setInput('selection', [note]);
  fixture.componentRef.setInput('canComment', true);
  fixture.componentRef.setInput('me', { id: ADA, name: 'Ada Lovelace' });
  const settle = async () => {
    for (let i = 0; i < 4; i++) {
      fixture.detectChanges();
      await fixture.whenStable();
      await new Promise((r) => setTimeout(r));
    }
  };
  await settle();
  const host = fixture.nativeElement as HTMLElement;
  const field = host.querySelector<HTMLInputElement>('tc-comment-thread .ui-ct__input')!;
  const type = async (text: string) => {
    field.focus();
    field.value = text;
    field.setSelectionRange(text.length, text.length);
    field.dispatchEvent(new InputEvent('input', { bubbles: true }));
    await settle();
  };
  const key = async (k: string) => {
    field.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
    await settle();
  };
  return { fixture, host, field, type, key, sent, settle, note, board };
}

describe('mentions in the comments panel', () => {
  it('offers the people on the board as a listbox from @, picked with the keyboard and sent as one person', async () => {
    const { host, field, type, key, sent } = await setup();
    expect(field).toBeTruthy();
    expect(field.getAttribute('role')).toBe('combobox');
    expect(field.getAttribute('aria-autocomplete')).toBe('list');

    await type('Can you check, @');
    const listbox = host.querySelector('[role="listbox"]');
    expect(listbox).toBeTruthy();
    const options = [...host.querySelectorAll('[role="option"]')].map((o) => o.textContent ?? '');
    // Not you, and not someone who can't open the board.
    expect(options.some((o) => o.includes('Grace Hopper'))).toBe(true);
    expect(options.some((o) => o.includes('Linus'))).toBe(false);
    expect(options.some((o) => o.includes('Ada'))).toBe(false);
    expect(field.getAttribute('aria-expanded')).toBe('true');

    await type('Can you check, @gr');
    await key('Enter');
    expect(field.value).toBe('Can you check, @Grace Hopper ');

    field.closest('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r));
    expect(sent).toEqual([
      expect.objectContaining({ body: `Can you check, @[Grace Hopper](${GRACE})` }),
    ]);
  });

  it('closes the list with Escape', async () => {
    const { host, type, key, field } = await setup();
    await type('@');
    expect(host.querySelector('[role="option"]')).toBeTruthy();
    await key('Escape');
    expect(field.getAttribute('aria-expanded')).toBe('false');
  });

  it("says when the draft names someone who can't open the board", async () => {
    const { host, type } = await setup();
    await type('@Linus Torvalds what do you think?');
    expect(host.querySelector('[role="status"] .warn')?.textContent).toContain(
      "Linus Torvalds can't open this board, so won’t be told.",
    );
    await type('@Grace what do you think?');
    expect(host.querySelector('[role="status"] .warn')).toBeNull();
  });

  it('shows stored mentions as names in the thread', async () => {
    const { host } = await setup([
      {
        id: 't1',
        nodeId: '',
        anchor: null,
        resolvedAt: null,
        comments: [
          {
            id: 'c1',
            author: { id: ADA, name: 'Ada Lovelace' },
            body: `Over to @[Grace Hopper](${GRACE})`,
            createdAt: '2026-11-21T10:00:00Z',
          },
        ],
      } as unknown as CommentThreadDto,
    ]);
    expect(host.querySelector('.ui-ct__text')?.textContent).toBe('Over to @Grace Hopper');
  });
});
