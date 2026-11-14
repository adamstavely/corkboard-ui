import { HttpErrorResponse } from '@angular/common/http';
import { deviceLabel, passkeyProblem } from './passkeys';

describe('passkeys', () => {
  it('names a passkey after the browser and device it was made on', () => {
    expect(deviceLabel('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36')).toBe('Chrome on Mac');
    expect(deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1')).toBe('Safari on iPhone or iPad');
    expect(deviceLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 Edg/140.0')).toBe('Edge on Windows');
    expect(deviceLabel('curl')).toBe('Browser');
  });

  it('says what went wrong in words', () => {
    expect(passkeyProblem(new HttpErrorResponse({ status: 409, error: { message: 'There is already an account with that email. Sign in instead.' } }))).toBe(
      'There is already an account with that email. Sign in instead.',
    );
    expect(passkeyProblem(new DOMException('closed', 'NotAllowedError'))).toMatch(/prompt was closed/);
    expect(passkeyProblem(new HttpErrorResponse({ status: 0 }))).toMatch(/couldn't be reached/);
  });
});
