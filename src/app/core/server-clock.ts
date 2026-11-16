import { HttpResponse, type HttpInterceptorFn } from '@angular/common/http';
import { tap } from 'rxjs';

/**
 * How far this computer's clock is from the API's, from the Date header on its answers. Timers end at a time the API
 * set by its own clock, so a laptop running 90 seconds fast would otherwise show a 5-minute timer starting at 3:30.
 * The header is to the second, so a difference under two seconds is taken as none: clocks kept in time stay as they are.
 */
let offset = 0;

/** Now, by the API's clock as near as this page can tell. */
export const serverNow = (): number => Date.now() + offset;

/** Takes the API's clock from an answer's Date header, sent between `sentAt` and `receivedAt` by this computer's clock. */
export function noteServerDate(date: string | null, sentAt: number, receivedAt: number): void {
  const at = date ? Date.parse(date) : NaN;
  if (Number.isNaN(at)) return;
  // The header drops the milliseconds: the API's time was somewhere in that second, taken as its middle.
  const measured = at + 500 - (sentAt + receivedAt) / 2;
  offset = Math.abs(measured) < 2000 ? 0 : Math.round(measured);
}

export const serverClockInterceptor: HttpInterceptorFn = (req, next) => {
  const sentAt = Date.now();
  return next(req).pipe(
    tap((event) => {
      if (event instanceof HttpResponse) noteServerDate(event.headers.get('Date'), sentAt, Date.now());
    }),
  );
};
