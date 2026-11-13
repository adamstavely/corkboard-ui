import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { ApiConfiguration } from '../api/generated/api-configuration';
import { Auth } from './auth';

/** Sends who they are with every API call, and asks again when the API doesn't know them (say, a reset database). */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(inject(ApiConfiguration).rootUrl)) return next(req);
  const auth = inject(Auth);
  const router = inject(Router);
  const token = auth.token();
  return next(token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse && err.status === 401 && token) {
        auth.signOut();
        void router.navigate(['/who'], { queryParams: { returnUrl: router.url } });
      }
      return throwError(() => err);
    }),
  );
};
