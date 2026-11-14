import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { App } from './app';
import { Auth } from './core/auth';
import { Session } from './core/session';
import { Notifications } from './core/notifications';

@Component({ template: '' })
class Blank {}

describe('App', () => {
  async function render(signedIn: boolean) {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([{ path: 'boards/:id', component: Blank }]),
        { provide: Auth, useValue: { signedIn: () => signedIn, profile: () => ({ name: 'Ada', email: 'ada@x.test' }) } },
        { provide: Session, useValue: { org: () => undefined } },
        { provide: Notifications, useValue: { items: () => [], unread: () => 0, read: () => Promise.resolve() } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows the header to a signed-in person', async () => {
    const el = await render(true);
    expect(el.querySelector('tc-header-brand')).not.toBeNull();
    const nav = el.querySelector('tc-header-nav') as HTMLElement & { user: { name: string }; accountItems: { id: string }[] };
    expect(nav.user.name).toBe('Ada');
    // The bell and the app picker live inside the header nav, so it lines them up with the avatar.
    expect(nav.querySelector('tc-notifications')).not.toBeNull();
    expect(nav.querySelector('tc-app-picker')).not.toBeNull();
    expect(nav.accountItems.map((i) => i.id)).toEqual(['settings', 'theme', 'language', 'docs', 'terms', 'sign-out']);
  });

  it('shows no header before sign-in', async () => {
    const el = await render(false);
    expect(el.querySelector('tc-header-brand')).toBeNull();
  });

  it('leaves the top bar off a board, which has its own panels', async () => {
    const el = await render(true);
    await TestBed.inject(Router).navigateByUrl('/boards/b1');
    TestBed.tick();
    expect(el.querySelector('tc-header-brand')).toBeNull();
  });
});
