import { TestBed } from '@angular/core/testing';
import { Icon } from './icon';

describe('app-icon', () => {
  it('draws the named Lucide icon', () => {
    const fixture = TestBed.createComponent(Icon);
    fixture.componentRef.setInput('name', 'trash');
    fixture.detectChanges();
    const svg = (fixture.nativeElement as HTMLElement).querySelector('svg')!;
    expect(svg.children.length).toBeGreaterThan(0);
    expect(svg.getAttribute('aria-hidden')).toBe('true');
  });
});
