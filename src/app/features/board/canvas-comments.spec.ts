import { TestBed } from '@angular/core/testing';
import { BoardDoc } from './board-doc';
import { Canvas } from './canvas';

/** The canvas with one shape and one file on it, and the given open comment counts. */
async function drawn(
  counts: (ids: { shape: string; file: string }) => Map<string, number>,
): Promise<HTMLElement> {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  const board = new BoardDoc();
  const shape = board.addShape(100, 100, 'rect', 'blue', 'OrderService');
  const file = board.addMedia(
    { id: 'f1', name: 'spec.txt', mime: 'text/plain', size: 10 },
    400,
    100,
    { w: 200, h: 80 },
  );
  const fixture = TestBed.createComponent(Canvas);
  fixture.componentRef.setInput('board', board);
  fixture.componentRef.setInput('commentCounts', counts({ shape, file }));
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

describe('comment badges on the canvas', () => {
  it('marks a shape with open comments, and says so in its name', async () => {
    const el = await drawn(({ shape }) => new Map([[shape, 2]]));
    const item = el.querySelector('.item-shape')!;
    expect(item.querySelector('.item-comments')?.textContent?.trim()).toBe('2');
    expect(item.getAttribute('aria-label')).toBe('Rectangle: OrderService, 2 comments');
  });

  it('marks a file with open comments', async () => {
    const el = await drawn(({ file }) => new Map([[file, 1]]));
    expect(el.querySelector('.media .media-comments')?.getAttribute('aria-label')).toBe(
      '1 comment',
    );
  });

  it('shows no badge without open comments', async () => {
    const el = await drawn(() => new Map());
    expect(el.querySelector('.item-comments, .media-comments')).toBeNull();
    expect(el.querySelector('.item-shape')!.getAttribute('aria-label')).toBe(
      'Rectangle: OrderService',
    );
  });
});
