import { computed, Injectable, signal } from '@angular/core';
import type { PersonDto } from '../api/generated/models/person-dto';

const PERSON_KEY = 'corkboard.person';

function storedPerson(): PersonDto | null {
  try {
    return JSON.parse(localStorage.getItem(PERSON_KEY) ?? 'null') as PersonDto | null;
  } catch {
    return null;
  }
}

/**
 * Who's using Corkboard in this browser. There's no sign-in: people pick who they are (see WhoPage), and the API takes
 * their id as the bearer token. Remembered in localStorage until they switch.
 */
@Injectable({ providedIn: 'root' })
export class Auth {
  readonly #person = signal<PersonDto | null>(storedPerson());

  readonly person = this.#person.asReadonly();
  readonly signedIn = computed(() => !!this.#person());

  /** Name and email for the account card. */
  readonly profile = computed(() => ({ name: this.#person()?.name ?? '', email: this.#person()?.email ?? '' }));

  /** The bearer token for API calls and the board connection. */
  token(): string | undefined {
    return this.#person()?.id;
  }

  signInAs(person: PersonDto): void {
    this.#person.set(person);
    this.#store(JSON.stringify(person));
  }

  signOut(): void {
    this.#person.set(null);
    this.#store(null);
  }

  #store(value: string | null): void {
    try {
      if (value === null) localStorage.removeItem(PERSON_KEY);
      else localStorage.setItem(PERSON_KEY, value);
    } catch {
      // Blocked storage: who they are lasts for this page only.
    }
  }
}

/** Only ever back into this app. */
export const safeReturnUrl = (url: string | null | undefined): string =>
  url?.startsWith('/') && !url.startsWith('//') ? url : '/';
