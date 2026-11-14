import { BoardDoc } from './board-doc';
import { describeBoard, describeThing } from './describe';

describe('the board read aloud', () => {
  it('says what is on the board and in each frame', () => {
    const board = new BoardDoc();
    expect(describeBoard(board)).toBe('Empty. Press N to add a note.');
    const slow = board.addNote(100, 100, 'yellow', 'Deploys are slow');
    board.addNote(400, 100, 'yellow', 'Flaky tests');
    const frame = board.addFrame(0, 0, board.notes(), 'What could be better');
    board.addNote(2000, 2000);
    const shape = board.addShape(3000, 3000, 'diamond', 'blue', 'Ship it?');
    board.addTag([slow], 'ops');
    expect(describeBoard(board)).toBe('3 notes, 1 frame, 1 other item. Frames: What could be better (2 notes).');
    expect(describeThing(board, slow)).toBe('note “Deploys are slow” in What could be better, tagged ops');
    expect(describeThing(board, frame)).toBe('frame What could be better, with 2 notes');
    expect(describeThing(board, shape)).toBe('diamond “Ship it?”');
    expect(describeThing(board, 'gone')).toBe('something no longer on the board');
    board.destroy();
  });
});
