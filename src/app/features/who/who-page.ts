import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, input, resource, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { Skeleton } from '@adamstavely/trenchcoat/angular/shimmer-loader';
import { Api } from '../../api/generated/api';
import { passkeysControllerConfig } from '../../api/generated/fn/auth/passkeys-controller-config';
import { peopleControllerCreate } from '../../api/generated/fn/people/people-controller-create';
import { peopleControllerList } from '../../api/generated/fn/people/people-controller-list';
import type { PersonDto } from '../../api/generated/models/person-dto';
import type { SessionDto } from '../../api/generated/models/session-dto';
import { Auth, safeReturnUrl } from '../../core/auth';
import { passkeyProblem, signInWithPasskey, signUpWithPasskey } from '../../core/passkeys';

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

/**
 * Signing in: with a passkey, or making an account and its first passkey. When the API's development picker is on,
 * people can also pick who they are, or add someone, with no sign-in.
 */
@Component({
  selector: 'app-who-page',
  imports: [Button, Skeleton],
  templateUrl: './who-page.html',
  styleUrl: './who-page.css',
})
export class WhoPage {
  readonly #api = inject(Api);
  readonly #auth = inject(Auth);
  readonly #router = inject(Router);

  /** Where they were headed, from the query string. */
  readonly returnUrl = input<string>();

  protected readonly config = resource({ loader: () => this.#api.invoke(passkeysControllerConfig) });
  protected readonly people = resource({
    params: () => (this.config.value()?.picker ? true : undefined),
    loader: () => this.#api.invoke(peopleControllerList),
  });
  protected readonly initials = initials;

  protected readonly name = signal('');
  protected readonly email = signal('');
  protected readonly busy = signal<'in' | 'up' | 'add' | null>(null);
  protected readonly problem = signal('');
  protected readonly signUpProblem = signal('');

  protected async signIn(): Promise<void> {
    if (this.busy()) return;
    this.problem.set('');
    this.busy.set('in');
    try {
      this.#done(await signInWithPasskey(this.#api));
    } catch (err) {
      this.problem.set(passkeyProblem(err));
    } finally {
      this.busy.set(null);
    }
  }

  protected async signUp(event: Event): Promise<void> {
    event.preventDefault();
    if (this.busy()) return;
    this.signUpProblem.set('');
    this.busy.set('up');
    try {
      this.#done(await signUpWithPasskey(this.#api, this.name().trim(), this.email().trim()));
    } catch (err) {
      this.signUpProblem.set(err instanceof HttpErrorResponse && err.status === 400 && !this.email().includes('@') ? 'Enter your name and a valid email.' : passkeyProblem(err));
    } finally {
      this.busy.set(null);
    }
  }

  /** Development only: be someone without signing in. */
  protected pick(person: PersonDto): void {
    this.#auth.signInAs(person);
    this.#go();
  }

  /** Development only: add someone to pick. */
  protected async add(): Promise<void> {
    if (this.busy()) return;
    this.signUpProblem.set('');
    this.busy.set('add');
    try {
      this.pick(await this.#api.invoke(peopleControllerCreate, { body: { name: this.name().trim(), email: this.email().trim() } }));
    } catch (err) {
      this.signUpProblem.set(
        err instanceof HttpErrorResponse && err.status === 409 ? 'Someone here already has that email. Pick them below.' : 'Enter your name and a valid email.',
      );
    } finally {
      this.busy.set(null);
    }
  }

  #done(session: SessionDto): void {
    this.#auth.signedInWith(session);
    this.#go();
  }

  #go(): void {
    void this.#router.navigateByUrl(safeReturnUrl(this.returnUrl()), { replaceUrl: true });
  }
}
