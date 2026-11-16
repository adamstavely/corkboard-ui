import { noteServerDate, serverNow } from './server-clock';

describe('the API clock', () => {
  afterEach(() => noteServerDate(new Date(Date.now()).toUTCString(), Date.now() - 500, Date.now() - 500));

  it('follows the API when this computer is well off, and ignores less than two seconds', () => {
    const now = Date.now();
    // The API is 90 seconds behind this computer.
    noteServerDate(new Date(now - 90_000).toUTCString(), now - 100, now + 100);
    expect(serverNow() - Date.now()).toBeGreaterThan(-91_500);
    expect(serverNow() - Date.now()).toBeLessThan(-88_500);
    noteServerDate(new Date(now).toUTCString(), now, now);
    expect(Math.abs(serverNow() - Date.now())).toBeLessThan(5);
    noteServerDate('not a date', now, now);
    expect(Math.abs(serverNow() - Date.now())).toBeLessThan(5);
  });
});
