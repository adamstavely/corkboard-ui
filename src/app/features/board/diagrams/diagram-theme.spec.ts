import { BoardDoc } from '../board-doc';
import { boardLook, diagramFill, themeFromBrand, themeVars, TRENCH_COAT } from './diagram-theme';

describe('diagram looks on the board', () => {
  it('sets no variables for Trench Coat’s look, and every slot, the text, font and corners for another', () => {
    expect(themeVars(null)).toEqual({});
    expect(themeVars(TRENCH_COAT)).toEqual({});
    const acme = themeFromBrand(['#e4002b'], { name: 'Acme', font: 'serif', radius: 4 });
    const vars = themeVars(acme);
    expect(vars['--diagram-blue']).toBe(`light-dark(${acme.light[0]}, ${acme.dark[0]})`);
    expect(vars['--diagram-gray']).toBe(`light-dark(${acme.light[5]}, ${acme.dark[5]})`);
    expect(vars['--diagram-font']).toContain('Georgia');
    expect(vars['--diagram-radius']).toBe('4px');
    // A look that fails contrast is never applied.
    expect(themeVars({ ...acme, light: ['#555555', ...acme.light.slice(1)] })).toEqual({});
    expect(diagramFill('green')).toBe('var(--diagram-green, var(--note-green))');
  });

  it('keeps a board’s choice in the board, for everyone on it', () => {
    expect(boardLook(undefined)).toEqual({ kind: 'workspace' });
    expect(boardLook('trenchcoat')).toEqual({ kind: 'trenchcoat' });
    expect(boardLook({ nonsense: true })).toEqual({ kind: 'workspace' });
    const board = new BoardDoc();
    const acme = themeFromBrand(['#e4002b'], { name: 'Acme' });
    board.setLook({ kind: 'own', theme: acme });
    expect(board.look()).toEqual({ kind: 'own', theme: acme });
    board.setLook({ kind: 'trenchcoat' });
    expect(board.look()).toEqual({ kind: 'trenchcoat' });
    board.setLook({ kind: 'workspace' });
    expect(board.look()).toEqual({ kind: 'workspace' });
  });
});
