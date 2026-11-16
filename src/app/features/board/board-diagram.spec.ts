import { TestBed } from '@angular/core/testing';
import * as Y from 'yjs';
import { BoardDiagram } from './board-diagram';
import { BoardDoc } from './board-doc';

describe('the diagram panel', () => {
  function open() {
    const board = new BoardDoc();
    const id = board.addDiagram(0, 0, 'flowchart TD\n  A --> B');
    const fixture = TestBed.createComponent(BoardDiagram);
    fixture.componentRef.setInput('board', board);
    fixture.componentRef.setInput('diagramId', id);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const textarea = el.querySelector('textarea')!;
    // Someone else saving the diagram, as it arrives from the server.
    const theirs = (source: string) => {
      board.doc.transact(() => (board.doc.getMap('nodes').get(id) as Y.Map<unknown>).set('source', source), 'remote');
      fixture.detectChanges();
    };
    const type = (text: string) => {
      textarea.value = text;
      textarea.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    };
    return { board, id, fixture, el, textarea, theirs, type };
  }

  it("follows the board while it's untouched", () => {
    const { textarea, theirs, el } = open();
    theirs('flowchart TD\n  A --> C');
    expect(textarea.value).toBe('flowchart TD\n  A --> C');
    expect(el.textContent).not.toContain('Someone else changed');
  });

  it("keeps a draft with changes of its own, and says when saving would put someone else's back", () => {
    const { textarea, theirs, type, el, fixture } = open();
    type('flowchart TD\n  A --> Mine');
    theirs('flowchart TD\n  A --> Theirs');
    expect(textarea.value).toBe('flowchart TD\n  A --> Mine');
    expect(el.textContent).toContain('Someone else changed this diagram');

    (el.querySelector('.notice tc-button') as HTMLElement).click();
    fixture.detectChanges();
    expect(textarea.value).toBe('flowchart TD\n  A --> Theirs');
    expect(el.textContent).not.toContain('Someone else changed');
  });

  it('takes no more text than the server keeps', () => {
    const { textarea, board, id } = open();
    expect(textarea.maxLength).toBe(20_000);
    board.setDiagram(id, 'x'.repeat(25_000));
    expect((board.items().find((i) => i.id === id) as { source: string }).source.length).toBe(20_000);
  });
});
