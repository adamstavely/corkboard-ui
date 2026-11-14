import { TestBed } from '@angular/core/testing';
import { BoardStart, starters } from './board-start';

describe('the empty-board start', () => {
  it('offers starters that ask the assistant to set the board up', () => {
    const list = starters();
    expect(list.map((s) => s.label)).toEqual(['Run a retro', 'Map a process', 'Plan a workshop']);
    expect(list.every((s) => s.icon instanceof SVGElement)).toBe(true);
  });

  it('sends what was typed and clears the field', () => {
    const fixture = TestBed.createComponent(BoardStart);
    const asked: string[] = [];
    fixture.componentInstance.ask.subscribe((t) => asked.push(t));
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const input = el.querySelector('input')!;
    input.value = '  Plan our offsite  ';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    expect(asked).toEqual(['Plan our offsite']);
    fixture.detectChanges();
    expect(input.value).toBe('');
  });
});
