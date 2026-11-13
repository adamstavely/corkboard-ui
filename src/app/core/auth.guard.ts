import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { Auth } from './auth';

/** Pages need someone to be them; anyone else picks who they are first and comes back here. */
export const authGuard: CanActivateFn = (_route, state) =>
  inject(Auth).signedIn() || inject(Router).createUrlTree(['/who'], { queryParams: { returnUrl: state.url } });
