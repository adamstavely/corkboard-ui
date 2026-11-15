import { TestBed } from '@angular/core/testing';
import { Api } from '../../api/generated/api';
import { BoardDoc } from './board-doc';
import { BoardTasks } from './board-tasks';
import { TaskFeed } from './tasks';

describe('a card added on the task board', () => {
  it("gets a real id and the board's next key, not the task board's stand-ins", async () => {
    TestBed.configureTestingModule({ providers: [{ provide: Api, useValue: { invoke: () => Promise.resolve([]) } }] });
    const board = new BoardDoc();
    const feed = new TaskFeed(board.doc);
    feed.add([{ title: 'First', status: 'todo', priority: 0, labels: [] }]);
    const fixture = TestBed.createComponent(BoardTasks);
    fixture.componentRef.setInput('boardId', 'b1');
    fixture.componentRef.setInput('board', board);
    fixture.componentRef.setInput('feed', feed);
    fixture.componentRef.setInput('canEdit', true);
    fixture.detectChanges();
    await fixture.whenStable();

    const added = { id: 't-301', key: 'NW-301', title: 'From the board', status: 'todo', priority: 0, labels: [], created: 'Nov 15' };
    const el = (fixture.nativeElement as HTMLElement).querySelector('tc-task-board')!;
    el.dispatchEvent(new CustomEvent('tc-tasks-change', { detail: { tasks: [added], task: added, change: 'add' }, cancelable: true }));

    const made = feed.tasks().find((t) => t.title === 'From the board')!;
    expect(made.key).toBe('T-2');
    expect(made.id).not.toBe('t-301');
    expect(made.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(Number.isNaN(Date.parse(made.created))).toBe(false);
    feed.destroy();
  });
});
