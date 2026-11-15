import { TestBed } from '@angular/core/testing';
import { BoardDoc } from './board-doc';
import { Canvas, GUEST_CAPABILITIES, type CanvasCapability } from './canvas';

/** The labels of the canvas's menu items, with every menu rendered. */
async function menuLabels(capabilities?: ReadonlySet<CanvasCapability>): Promise<string[]> {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  const fixture = TestBed.createComponent(Canvas);
  fixture.componentRef.setInput('board', new BoardDoc());
  if (capabilities) fixture.componentRef.setInput('capabilities', capabilities);
  fixture.detectChanges();
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  return [...el.querySelectorAll('.app-menu-label')].map((l) => l.textContent!.trim());
}

describe('what the canvas offers', () => {
  it('offers a member page everything', async () => {
    const labels = await menuLabels();
    for (const label of ['Images and files', 'Kanban', 'Flowchart', 'Chart', 'Board templates…']) expect(labels).toContain(label);
  });

  it("leaves out what a guest's shared page can't do", async () => {
    const labels = await menuLabels(GUEST_CAPABILITIES);
    for (const label of ['Images and files', 'Kanban', 'Timeline', 'Matrix', 'Flowchart', 'Sequence diagram', 'Chart', 'Board templates…']) expect(labels).not.toContain(label);
    // Still there: what the canvas makes by itself.
    expect(labels).toContain('Mind map');
    expect(labels).toContain('Table');
  });
});
