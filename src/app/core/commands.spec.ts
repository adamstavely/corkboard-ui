import { TestBed } from '@angular/core/testing';
import { Commands, matchCommands } from './commands';

describe('commands for the ⌘K menu', () => {
  it('offers a page’s commands until it takes them back, and runs them by id', () => {
    const commands = TestBed.inject(Commands);
    let ran = 0;
    const stop = commands.offer([{ id: 'note', label: 'Add a note', run: () => ran++ }]);
    expect(commands.run('note')).toBe(true);
    expect(commands.run('nope')).toBe(false);
    expect(ran).toBe(1);
    stop();
    expect(commands.commands()).toEqual([]);
  });

  it('matches every typed word, in any order', () => {
    const list = [
      { id: 'a', label: 'Add a note', run: () => undefined },
      { id: 'b', label: 'Export as Markdown', run: () => undefined },
    ];
    expect(matchCommands(list, '').map((c) => c.id)).toEqual(['a', 'b']);
    expect(matchCommands(list, 'markdown exp').map((c) => c.id)).toEqual(['b']);
    expect(matchCommands(list, 'add image')).toEqual([]);
  });
});
