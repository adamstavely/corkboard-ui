import { notificationItems } from './notifications';

describe('notificationItems', () => {
  it('shows who, what, where and when, linking to the board', () => {
    expect(
      notificationItems([
        { id: '1', kind: 'mention', actor: 'Ada', title: 'mentioned you in a comment', body: 'Hi @Grace', context: 'Retro', link: '/boards/b', at: 5, read: false },
        { id: '2', kind: 'invite', actor: null, title: 'invited you', body: null, context: null, link: null, at: 4, read: true },
      ]),
    ).toEqual([
      { id: '1', title: 'mentioned you in a comment', actor: 'Ada', body: 'Hi @Grace', context: 'Retro', href: '/boards/b', time: 5, read: false, category: 'mention' },
      { id: '2', title: 'invited you', time: 4, read: true, category: 'invite' },
    ]);
  });
});
