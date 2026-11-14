import * as Y from 'yjs';
import { BoardDoc, NOTE_TEMPLATES } from './board-doc';
import { boardTags, findOnBoard, notePeople, NO_QUERY } from './find';

describe('finding things on the board', () => {
  it('matches words across notes, frames and items, in reading order, and narrows by tag and person', () => {
    const board = new BoardDoc();
    board.author = { id: 'u1', name: 'Ada' };
    const slow = board.addNote(100, 400, 'yellow', 'Deploys are slow');
    board.author = { id: 'u2', name: 'Grace' };
    const flaky = board.addNote(100, 100, 'yellow', 'Flaky deploy tests');
    const frame = board.addFrame(1000, 1000, [], 'Deploy plan');
    const shape = board.addShape(2000, 2000, 'rect', 'blue', 'Deploy?');
    board.addNote(500, 100, 'yellow', 'Lunch');
    board.addTag([slow, flaky], 'ops');
    board.addTag([flaky], '#Testing ');

    expect(findOnBoard(board, NO_QUERY)).toBeNull();
    expect(findOnBoard(board, { ...NO_QUERY, text: 'deploy' })).toEqual([flaky, slow, frame, shape]);
    expect(findOnBoard(board, { ...NO_QUERY, text: 'deploy', tag: 'testing' })).toEqual([flaky]);
    expect(findOnBoard(board, { ...NO_QUERY, person: 'u1' })).toEqual([slow]);
    expect(boardTags(board)).toEqual(['ops', 'testing']);
    expect(notePeople(board)).toEqual([{ id: 'u1', name: 'Ada' }, { id: 'u2', name: 'Grace' }]);
    board.removeTag([flaky], 'ops');
    expect(boardTags(board)).toEqual(['ops', 'testing']);
    board.destroy();
  });

  it('adds a note from a template with its heading in bold', () => {
    const board = new BoardDoc();
    const story = NOTE_TEMPLATES.find((t) => t.id === 'story')!;
    board.addTemplateNote(0, 0, story);
    const [note] = board.notes();
    expect(note.color).toBe('blue');
    const first = (note.text.get(0) as Y.XmlElement).get(0) as Y.XmlText;
    expect(first.toDelta()).toEqual([{ insert: 'User story', attributes: { bold: true } }]);
    board.destroy();
  });
});
