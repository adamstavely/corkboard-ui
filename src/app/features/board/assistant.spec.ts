import { HttpErrorResponse } from '@angular/common/http';
import type { Api } from '../../api/generated/api';
import { AssistantSession, changesLine } from './assistant';

const result = { reply: 'Two themes.', citedNoteIds: [], framesAdded: 2, notesAdded: 0, notesChanged: 0, notesMoved: 5 };

function fakeApi(answer: (body: unknown) => Promise<unknown>) {
  const sent: unknown[] = [];
  const api = { invoke: (_fn: unknown, params: { body: unknown }) => (sent.push(params.body), answer(params.body)) } as unknown as Api;
  return { api, sent };
}

describe('the board assistant', () => {
  it('asks with the conversation so far and the selected notes, and says what it did to the board', async () => {
    const { api, sent } = fakeApi(() => Promise.resolve(result));
    const session = new AssistantSession(api, 'b1', () => 'm1', () => ['n1', 'n2']);
    await session.send('Group these');
    await session.send('And again');
    expect(sent[1]).toEqual({
      instruction: 'And again',
      modelId: 'm1',
      noteIds: ['n1', 'n2'],
      history: [
        { role: 'user', text: 'Group these' },
        { role: 'assistant', text: 'Two themes.\n\nOn the board: made 2 frames, moved 5 notes into frames. Undo it from History.' },
      ],
    });
    expect(session.messages()[0]).toMatchObject({ role: 'user', context: '2 selected notes' });
  });

  it('shows a failed answer as an error, and asks again in its place', async () => {
    let fail = true;
    const { api } = fakeApi(() => (fail ? Promise.reject(new HttpErrorResponse({ status: 502, error: { message: "Couldn't reach the model" } })) : Promise.resolve(result)));
    const session = new AssistantSession(api, 'b1', () => 'm1', () => []);
    await session.send('Hi');
    const failed = session.messages()[1];
    expect(failed).toMatchObject({ role: 'assistant', error: "Couldn't reach the model", streaming: false });
    fail = false;
    await session.regenerate(failed.id);
    expect(session.messages().map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(session.messages()[1].text).toContain('Two themes.');
  });

  it('says to connect a model when there is none', async () => {
    const session = new AssistantSession(fakeApi(() => Promise.resolve(result)).api, 'b1', () => undefined, () => []);
    await session.send('Hi');
    expect(session.messages()[1].error).toContain('Connect a model');
  });

  it('describes changes in a line, or nothing', () => {
    expect(changesLine({ ...result, framesAdded: 0, notesMoved: 0 })).toBe('');
    expect(changesLine({ ...result, framesAdded: 0, notesMoved: 0, notesAdded: 1 })).toBe('On the board: added 1 note. Undo it from History.');
  });
});
