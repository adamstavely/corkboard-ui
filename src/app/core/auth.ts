import { clearLocalBoards } from './pending-work';
import { computed, Injectable, signal } from '@angular/core';
import type { PersonDto } from '../api/generated/models/person-dto';
import type { SessionDto } from '../api/generated/models/session-dto';

const SESSION_KEY = 'corkboard.session';
/** Where the development picker used to keep who was picked; still read, so nobody is signed out by the change. */
const PERSON_KEY = 'corkboard.person';

interface Stored {
  token: string;
  person: PersonDto;
}

function read(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null');
  } catch {
    return null;
  }
}

function stored(): Stored | null {
  const session = read(SESSION_KEY) as Stored | null;
  if (session?.token && session.person) return session;
  const picked = read(PERSON_KEY) as PersonDto | null;
  return picked?.id ? { token: picked.id, person: picked } : null;
}

/**
 * Who's using Corkboard in this browser. People sign in with a passkey (see WhoPage) and the API hands back a session
 * token; in development they can instead pick who they are, and their id is the token. Remembered in localStorage until
 * they sign out.
 */
@Injectable({ providedIn: 'root' })
export class Auth {
  readonly #session = signal<Stored | null>(stored());

  readonly person = computed(() => this.#session()?.person ?? null);
  readonly signedIn = computed(() => !!this.#session());

  /** Name and email for the account card. */
  readonly profile = computed(() => ({ name: this.person()?.name ?? '', email: this.person()?.email ?? '' }));

  /** The bearer token for API calls and the board connection. */
  token(): string | undefined {
    return this.#session()?.token;
  }

  /** Signed in with a passkey. */
  signedInWith(session: SessionDto): void {
    this.#set({ token: session.token, person: session.person });
  }

  /** Picked from the development list: their id is the token. */
  signInAs(person: PersonDto): void {
    this.#set({ token: person.id, person });
  }

  /** Forgets who they are here, and ends their session on the server (best effort: they're signed out here anyway). */
  signOut(): void {
    const token = this.token();
    if (token?.startsWith('cbs_')) {
      void fetch('/api/auth/sign-out', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => undefined);
    }
    this.#set(null);
    // Boards' unsent edits kept in this browser go too: they're this person's, and the browser may be shared.
    void clearLocalBoards();
  }

  #set(value: Stored | null): void {
    this.#session.set(value);
    try {
      localStorage.removeItem(PERSON_KEY);
      if (value === null) localStorage.removeItem(SESSION_KEY);
      else localStorage.setItem(SESSION_KEY, JSON.stringify(value));
    } catch {
      // Blocked storage: the sign-in lasts for this page only.
    }
  }
}

/** Only ever back into this app. */
export const safeReturnUrl = (url: string | null | undefined): string =>
  url?.startsWith('/') && !url.startsWith('//') ? url : '/';
