import { TestBed } from '@angular/core/testing';
import { Api } from '../../api/generated/api';
import { integrationsControllerExport } from '../../api/generated/fn/integrations/integrations-controller-export';
import { integrationsControllerList } from '../../api/generated/fn/integrations/integrations-controller-list';
import { BoardDoc } from './board-doc';
import { BoardTasks } from './board-tasks';
import { TaskFeed } from './tasks';

describe('sending tasks to a tracker', () => {
  it('holds a task the tracker may already have, and sends it by name once asked to', async () => {
    const exports: unknown[] = [];
    let answer: unknown = { exported: [], failed: [{ taskId: 'y', taskKey: 'T-2', reason: 'No answer. It may have been created.', mayExist: true }], skipped: 0 };
    const api = {
      invoke: (fn: unknown, params: { body?: unknown }) => {
        if (fn === integrationsControllerList) return Promise.resolve([{ id: 'gh', kind: 'github', label: 'Web repo', config: {}, target: 'acme/web' }]);
        if (fn === integrationsControllerExport) {
          exports.push(params.body);
          return Promise.resolve(answer);
        }
        return Promise.resolve([]);
      },
    };
    TestBed.configureTestingModule({ providers: [{ provide: Api, useValue: api }] });
    const board = new BoardDoc();
    const feed = new TaskFeed(board.doc);
    feed.add([{ title: 'Unclear', status: 'todo', priority: 0, labels: [] }]);
    const fixture = TestBed.createComponent(BoardTasks);
    fixture.componentRef.setInput('boardId', 'b1');
    fixture.componentRef.setInput('board', board);
    fixture.componentRef.setInput('feed', feed);
    fixture.componentRef.setInput('canEdit', true);
    fixture.componentRef.setInput('orgId', 'o1');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const button = (label: string) => [...el.querySelectorAll('tc-button')].find((b) => b.getAttribute('label') === label || (b as unknown as { label?: string }).label === label) as HTMLElement | undefined;

    button('Send 1 open task')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(exports).toEqual([{ integrationId: 'gh' }]);
    expect(el.querySelector('.held')?.textContent).toContain('T-2');

    answer = { exported: [{ taskId: 'y', taskKey: 'T-2', issueKey: '#7', url: 'https://github.com/acme/web/issues/7' }], failed: [], skipped: 0 };
    button('Send again')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(exports[1]).toEqual({ integrationId: 'gh', taskIds: ['y'] });
    expect(el.querySelector('.held')).toBeNull();
    feed.destroy();
  });
});
