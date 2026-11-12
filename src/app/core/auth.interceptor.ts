import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { ApiConfiguration } from '../api/generated/api-configuration';
import { Auth } from './auth';

/** Sends the access token with every API call, and signs in again when the API says the session is over. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(inject(ApiConfiguration).rootUrl)) return next(req);
  const auth = inject(Auth);
  const router = inject(Router);
  const token = auth.accessToken();
  return next(token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse && err.status === 401) void auth.signIn(router.url);
      return throwError(() => err);
    }),
  );
};
