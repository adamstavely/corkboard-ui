import { TestBed } from '@angular/core/testing';
import { Auth } from './auth';

describe('Auth', () => {
  afterEach(() => localStorage.clear());

  it('keeps someone picked before passkeys signed in, then signs in with a session', () => {
    localStorage.setItem('corkboard.person', JSON.stringify({ id: 'p1', name: 'Grace', email: 'grace@x' }));
    const auth = TestBed.inject(Auth);
    expect(auth.token()).toBe('p1');
    expect(auth.profile()).toEqual({ name: 'Grace', email: 'grace@x' });

    auth.signedInWith({ token: 'cbs_abc', person: { id: 'p1', name: 'Grace', email: 'grace@x' } });
    expect(auth.token()).toBe('cbs_abc');
    expect(localStorage.getItem('corkboard.person')).toBeNull();
    expect(JSON.parse(localStorage.getItem('corkboard.session')!)).toMatchObject({ token: 'cbs_abc' });
  });

  it('ends the session on the server when signing out', () => {
    const calls: [string, RequestInit | undefined][] = [];
    const real = globalThis.fetch;
    globalThis.fetch = ((url: string, init?: RequestInit) => {
      calls.push([url, init]);
      return Promise.resolve(new Response(null, { status: 204 }));
    }) as typeof fetch;
    try {
      const auth = TestBed.inject(Auth);
      auth.signedInWith({ token: 'cbs_abc', person: { id: 'p1', name: 'Grace', email: 'grace@x' } });
      auth.signOut();
      expect(auth.signedIn()).toBe(false);
      expect(calls).toEqual([['/api/auth/sign-out', { method: 'POST', headers: { Authorization: 'Bearer cbs_abc' } }]]);
    } finally {
      globalThis.fetch = real;
    }
  });
});
