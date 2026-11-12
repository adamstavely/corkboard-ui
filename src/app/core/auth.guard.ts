import { inject } from '@angular/core';
import type { CanActivateFn } from '@angular/router';
import { Auth } from './auth';

/** Pages need a signed-in person; anyone else goes to the identity provider and comes back here. */
export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(Auth);
  if (auth.signedIn()) return true;
  await auth.signIn(state.url);
  return false;
};
