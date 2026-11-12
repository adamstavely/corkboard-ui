import type { BoardMemberDto } from '../../api/generated/models/board-member-dto';
import { boardAccessOf, boardChangesOf, boardDirectoryOf, boardEntitlement } from './board-access';

const member = (userId: string, workspaceRole: BoardMemberDto['workspaceRole'], boardRole: BoardMemberDto['boardRole']): BoardMemberDto => ({
  userId,
  name: userId,
  email: `${userId}@x.test`,
  workspaceRole,
  boardRole,
  role: workspaceRole === 'owner' ? 'owner' : boardRole === 'none' ? null : (boardRole ?? workspaceRole),
});

describe('board access', () => {
  const members = [member('ada', 'owner', null), member('grace', 'updater', 'none'), member('linus', 'reader', 'updater')];

  it('lists who can open the board at their role, and the rest to add back', () => {
    expect(boardAccessOf(members, 'ada').map((g) => [g.recipient.name, g.level, g.recipient.detail])).toEqual([
      ['ada', 'owner', 'You · Workspace owner – owns every board'],
      ['linus', 'updater', 'Reader in the workspace, set here'],
    ]);
    expect(boardDirectoryOf(members).map((r) => [r.id, r.detail])).toEqual([['grace', 'grace@x.test · no access to this board']]);
  });

  it("won't lower a workspace owner", () => {
    expect(boardEntitlement(members, { id: 'ada', kind: 'person', name: 'ada' }, 'reader').status).toBe('denied');
    expect(boardEntitlement(members, { id: 'ada', kind: 'person', name: 'ada' }, 'owner').status).toBe('allowed');
    expect(boardEntitlement(members, { id: 'linus', kind: 'person', name: 'linus' }, 'reader').status).toBe('allowed');
  });

  it('sets board roles, going back to the workspace role when that is picked, and none for removed', () => {
    const r = (id: string) => ({ id, kind: 'person' as const, name: id });
    expect(
      boardChangesOf(members, {
        add: [{ recipient: r('grace'), level: 'updater' }],
        change: [{ recipient: r('linus'), level: 'commenter' }],
        remove: [r('linus')],
      }),
    ).toEqual([
      { userId: 'grace', role: null },
      { userId: 'linus', role: 'commenter' },
      { userId: 'linus', role: 'none' },
    ]);
  });
});
