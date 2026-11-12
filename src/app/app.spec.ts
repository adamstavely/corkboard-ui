import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { Auth } from './core/auth';
import { Session } from './core/session';

describe('App', () => {
  async function render(signedIn: boolean) {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        { provide: Auth, useValue: { signedIn: () => signedIn, profile: () => ({ name: 'Ada', email: 'ada@x.test' }) } },
        { provide: Session, useValue: { org: () => undefined } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows the header to a signed-in person', async () => {
    const el = await render(true);
    expect(el.querySelector('tc-header-brand')).not.toBeNull();
    expect((el.querySelector('tc-header-nav') as HTMLElement & { user: { name: string } }).user.name).toBe('Ada');
  });

  it('shows no header before sign-in', async () => {
    const el = await render(false);
    expect(el.querySelector('tc-header-brand')).toBeNull();
  });
});
