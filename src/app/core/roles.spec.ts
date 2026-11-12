import { aRole, atLeast, ROLE_LEVELS } from './roles';

describe('roles', () => {
  it('orders the roles, least first', () => {
    expect(ROLE_LEVELS.map((l) => l.label)).toEqual(['Reader', 'Commenter', 'Updater', 'Owner']);
    expect(atLeast('owner', 'updater')).toBe(true);
    expect(atLeast('commenter', 'updater')).toBe(false);
    expect(atLeast(null, 'reader')).toBe(false);
    expect(aRole('updater')).toBe('an updater');
    expect(aRole('commenter')).toBe('a commenter');
  });
});
