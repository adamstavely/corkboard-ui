import { expiryChoices, shareLinks } from './share-links';

describe('share links', () => {
  it('lists links with their page, access and state', () => {
    expect(
      shareLinks(
        [
          { id: 'l1', token: 'abc', label: 'Client', createdBy: 'Ada', createdAt: 1, expiresAt: 9, revoked: true, hasPassword: false, embed: false, canEdit: false, opens: 3, lastOpenedAt: 5 },
          { id: 'l2', token: 'def', label: 'Team', createdBy: 'Ada', createdAt: 2, expiresAt: 0, revoked: false, hasPassword: true, embed: false, canEdit: true, opens: 0, lastOpenedAt: 0 },
        ],
        'https://cork.test',
      ),
    ).toEqual([
      { id: 'l1', label: 'Client', url: 'https://cork.test/shared/abc', createdBy: 'Ada', createdAt: 1, expiresAt: 9, access: 'Can view', opens: 3, lastOpenedAt: 5, status: 'revoked' },
      expect.objectContaining({ id: 'l2', access: 'Can edit', password: true }),
    ]);
  });

  it("offers expiries within the workspace's longest, and never only without one", () => {
    expect(expiryChoices(null).map((c) => c.value)).toEqual(['', '1', '7', '30', '90', '365']);
    expect(expiryChoices(14)).toEqual([
      { value: '1', label: 'Expires in 1 day' },
      { value: '7', label: 'Expires in 1 week' },
      { value: '14', label: 'Expires in 14 days' },
    ]);
    expect(expiryChoices(1).map((c) => c.value)).toEqual(['1']);
  });
});
