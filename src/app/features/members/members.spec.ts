import type { MembersDto } from '../../api/generated/models/members-dto';
import { accessOf, changesOf, searchFor } from './members';

const list: MembersDto = {
  members: [
    { userId: 'u1', name: 'Ada', email: 'ada@x.test', role: 'admin' },
    { userId: 'u2', name: 'Grace', email: 'grace@x.test', role: 'member' },
  ],
  invites: [{ id: 'i1', email: 'alan@x.test', role: 'member', invitedByName: 'Ada', createdAt: '' }],
};

describe('members', () => {
  it('lists members (marking you) and open invites with their roles', () => {
    expect(accessOf(list, 'u1').map((g) => [g.recipient.id, g.recipient.name, g.level])).toEqual([
      ['user:u1', 'Ada (you)', 'admin'],
      ['user:u2', 'Grace', 'member'],
      ['invite:i1', 'alan@x.test', 'member'],
    ]);
  });

  it('offers a typed email to invite, unless it is already a member or invited', () => {
    expect(searchFor(' New@X.test ', list)).toEqual([
      { id: 'email:new@x.test', kind: 'person', name: 'new@x.test', detail: 'Invite by email' },
    ]);
    expect(searchFor('grace@x.test', list)).toEqual([]);
    expect(searchFor('alan@x.test', list)).toEqual([]);
    expect(searchFor('not an email', list)).toEqual([]);
  });

  it('turns the panel’s changes into one API call each', () => {
    const person = (id: string) => ({ id, kind: 'person' as const, name: id });
    expect(
      changesOf({
        add: [{ recipient: person('email:new@x.test'), level: 'admin' }],
        change: [
          { recipient: person('user:u2'), level: 'admin' },
          { recipient: person('invite:i1'), level: 'admin' },
        ],
        remove: [person('user:u3'), person('invite:i2')],
      }),
    ).toEqual([
      { op: 'invite', email: 'new@x.test', role: 'admin' },
      { op: 'changeRole', userId: 'u2', role: 'admin' },
      { op: 'changeInvite', inviteId: 'i1', role: 'admin' },
      { op: 'remove', userId: 'u3' },
      { op: 'revokeInvite', inviteId: 'i2' },
    ]);
  });
});
