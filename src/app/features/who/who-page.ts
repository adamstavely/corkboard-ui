import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, input, resource, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { Skeleton } from '@adamstavely/trenchcoat/angular/shimmer-loader';
import { Api } from '../../api/generated/api';
import { peopleControllerCreate } from '../../api/generated/fn/people/people-controller-create';
import { peopleControllerList } from '../../api/generated/fn/people/people-controller-list';
import type { PersonDto } from '../../api/generated/models/person-dto';
import { Auth, safeReturnUrl } from '../../core/auth';

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

/** "Who are you?": pick someone already here, or add yourself. There's no password; Corkboard has no sign-in. */
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

  protected readonly people = resource({ loader: () => this.#api.invoke(peopleControllerList) });
  protected readonly initials = initials;

  protected readonly name = signal('');
  protected readonly email = signal('');
  protected readonly adding = signal(false);
  protected readonly problem = signal('');

  protected pick(person: PersonDto): void {
    this.#auth.signInAs(person);
    void this.#router.navigateByUrl(safeReturnUrl(this.returnUrl()), { replaceUrl: true });
  }

  protected async add(event: Event): Promise<void> {
    event.preventDefault();
    if (this.adding()) return;
    this.problem.set('');
    this.adding.set(true);
    try {
      this.pick(await this.#api.invoke(peopleControllerCreate, { body: { name: this.name().trim(), email: this.email().trim() } }));
    } catch (err) {
      this.problem.set(
        err instanceof HttpErrorResponse && err.status === 409
          ? 'Someone here already has that email. Pick them above.'
          : err instanceof HttpErrorResponse && err.status === 400
            ? 'Enter your name and a valid email.'
            : "You couldn't be added. Try again.",
      );
    } finally {
      this.adding.set(false);
    }
  }
}
