import { shareLinks } from './share-links';

describe('share links', () => {
  it('lists links with their page, access and state', () => {
    expect(
      shareLinks(
        [
          { id: 'l1', token: 'abc', label: 'Client', createdBy: 'Ada', createdAt: 1, expiresAt: 9, revoked: true, canEdit: false, opens: 3, lastOpenedAt: 5 },
          { id: 'l2', token: 'def', label: 'Team', createdBy: 'Ada', createdAt: 2, expiresAt: 0, revoked: false, canEdit: true, opens: 0, lastOpenedAt: 0 },
        ],
        'https://cork.test',
      ),
    ).toEqual([
      { id: 'l1', label: 'Client', url: 'https://cork.test/shared/abc', createdBy: 'Ada', createdAt: 1, expiresAt: 9, access: 'Can view', opens: 3, lastOpenedAt: 5, status: 'revoked' },
      expect.objectContaining({ id: 'l2', access: 'Can edit' }),
    ]);
  });
});
