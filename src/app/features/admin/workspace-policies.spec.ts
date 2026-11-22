import { days, WHO_OPTIONS } from './workspace-policies';

describe('workspace policies', () => {
  it('reads a day count, with empty or nonsense as no limit', () => {
    expect(days(30)).toBe(30);
    expect(days('7')).toBe(7);
    expect(days(2.6)).toBe(3);
    expect(days(null)).toBeNull();
    expect(days('')).toBeNull();
    expect(days(0)).toBeNull();
    expect(days('soon')).toBeNull();
  });

  it('offers who may do something, fewest first', () => {
    expect(WHO_OPTIONS.map((o) => o.value)).toEqual(['workspace_owners', 'board_owners', 'editors', 'everyone']);
  });
});
