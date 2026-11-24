import { BoardDoc } from '../board-doc';
import { diagramFrame } from './flow-board';
import { diagramLayout } from './kinds';
import { readC4 } from './c4';
import { loadDevicon, logoPacks, setLogoPack, shapeIcon, shapeIconSrc } from './shape-icons';

describe('icons on shapes', () => {
  it('reads generic icon names as Lucide icons, and logos once their pack is there', async () => {
    expect(shapeIcon('database')).toMatchObject({ kind: 'icon', icon: 'database' });
    expect(shapeIcon('credit-card')).toMatchObject({ kind: 'icon', icon: 'creditCard' });
    expect(shapeIcon('nonsense')).toBeNull();
    expect(shapeIcon('logo:Bad/Name')).toBeNull();
    await loadDevicon();
    const react = shapeIcon('logo:devicon/react', logoPacks());
    expect(react?.kind).toBe('logo');
    expect(react && react.kind === 'logo' && react.src.startsWith('data:image/svg+xml')).toBe(true);
    setLogoPack('acme', { widget: { vb: '0 0 10 10', body: '<rect width="10" height="10"/>' } });
    expect(shapeIcon('logo:acme/widget', logoPacks())?.kind).toBe('logo');
    expect(shapeIconSrc('server', '#123456')).toContain(encodeURIComponent('stroke="#123456"'));
  });

  it('keeps a shape icon, and a C4 element’s icon goes on its box and back into the model', () => {
    const board = new BoardDoc();
    const id = board.addShape(0, 0, 'rect');
    board.setShapeIcon([id], 'server');
    expect(board.items()[0]).toMatchObject({ icon: 'server' });
    board.setShapeIcon([id], null);
    expect(board.items()[0]).not.toHaveProperty('icon');
    const result = diagramLayout(JSON.stringify({ diagramType: 'c4', elements: [{ id: 'web', kind: 'system', name: 'Web', icon: 'logo:devicon/react' }], relations: [], groups: [] }));
    if ('error' in result) throw new Error(result.error);
    const diagram = board.addLayout(result.layout, 0, 0).find((x) => diagramFrame(board, x))!;
    expect(board.items().find((i) => i.part?.key === 'web')).toMatchObject({ icon: 'logo:devicon/react' });
    const web = board.items().find((i) => i.part?.key === 'web')!;
    board.setShapeIcon([web.id], 'globe');
    expect(readC4(board, diagram, false)!.elements[0].icon).toBe('globe');
    board.destroy();
  });
});
