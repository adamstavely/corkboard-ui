import { BoardDoc } from './board-doc';
import {
  DIAGRAM_MENU,
  DIAGRAM_STARTERS,
  IMAGE_PLACEHOLDER,
  diagramImages,
  diagramKind,
  diagramLinks,
  diagramProblem,
  diagramTitle,
  inlineImages,
  nodeElementPattern,
  nodeLabel,
  onlyInlinePictures,
  placeHotspot,
  withoutLinks,
  type DiagramImages,
} from './diagram';
import { boardMarkdown } from './export';

const FILE = '0b6f3c9e-4a1d-4c3e-9f7a-2d5e8b1c6a40';
// The smallest PNG: one transparent pixel.
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='), (c) => c.charCodeAt(0));

describe('diagrams', () => {
  it('go on the board from their text, change as one undoable step, and are found by it', () => {
    const board = new BoardDoc();
    const id = board.addDiagram(100, 100, DIAGRAM_STARTERS.flowchart);
    expect(board.items()).toEqual([
      expect.objectContaining({
        id,
        kind: 'diagram',
        source: DIAGRAM_STARTERS.flowchart,
        w: 480,
        h: 360,
      }),
    ]);
    board.setDiagram(id, 'flowchart LR\n  a --> b');
    expect(board.items()[0]).toMatchObject({ source: 'flowchart LR\n  a --> b' });
    board.undo.undo();
    expect(board.items()[0]).toMatchObject({ source: DIAGRAM_STARTERS.flowchart });
  });

  it('are named by their title, else their first node or participant', () => {
    expect(diagramTitle(DIAGRAM_STARTERS.flowchart)).toBe('flowchart from “Idea”');
    expect(diagramTitle(DIAGRAM_STARTERS.sequence)).toBe('sequence diagram from “You”');
    expect(diagramTitle('flowchart TD')).toBe('flowchart');
    expect(diagramTitle(DIAGRAM_STARTERS.gantt)).toBe('gantt chart “Launch plan”');
    expect(diagramTitle(DIAGRAM_STARTERS.pie)).toBe('pie chart “Where the time goes”');
    expect(diagramTitle(DIAGRAM_STARTERS.mindmap)).toBe('mind map diagram from “Launch”');
    expect(diagramTitle(DIAGRAM_STARTERS.state)).toBe('state diagram');
    expect(diagramTitle('---\ntitle: Onboarding\n---\nflowchart TD\n  a[Start] --> b')).toBe('flowchart “Onboarding”');
  });

  it('know every kind they start as, and nothing Corkboard does not draw', () => {
    for (const { kind } of DIAGRAM_MENU) {
      expect(diagramKind(DIAGRAM_STARTERS[kind])).toBe(kind);
      expect(diagramProblem(DIAGRAM_STARTERS[kind])).toBeNull();
    }
    expect(DIAGRAM_MENU.slice(0, 2).map((d) => d.kind)).toEqual(['flowchart', 'sequence']);
    expect(diagramKind('graph LR\n a --> b')).toBe('flowchart');
    expect(diagramKind('stateDiagram\n [*] --> a')).toBe('state');
    expect(diagramKind('xychart-beta\n bar [1]')).toBe('xychart');
    expect(diagramKind('requirementDiagram\n')).toBe('requirement');
    expect(diagramKind('%% a note first\nsequenceDiagram\n A->>B: hi')).toBe('sequence');
    expect(diagramKind('---\ntitle: T\n---\npie\n "a" : 1')).toBe('pie');
    for (const text of ['flowchart-elk TD\n a --> b', 'architecture-beta', 'C4Context', 'zenuml', 'flowcharts', 'hello']) expect(diagramKind(text)).toBeNull();
  });

  it("refuse Mermaid's settings and anything but a title in front matter", () => {
    expect(diagramProblem("%%{init: {'securityLevel': 'loose'}}%%\nflowchart TD\n a --> b")).toMatch(/settings/);
    expect(diagramProblem("flowchart TD\n %%{init: {'theme': 'dark'}}%%\n a --> b")).toMatch(/settings/);
    expect(diagramProblem('---\ntitle: The plan\n---\nflowchart TD\n a --> b')).toBeNull();
    expect(diagramProblem('---\nconfig:\n  securityLevel: loose\n---\nflowchart TD\n a --> b')).toMatch(/Only a title/);
    expect(diagramProblem('---\ntitle: never closed\nflowchart TD')).toMatch(/Only a title/);
    expect(diagramProblem('pie')).toBeNull();
    expect(diagramProblem('')).toMatch(/Write a diagram/);
    expect(diagramProblem('hello')).toMatch(/Start with the kind/);
  });

  it('read links from click lines, web pages and emails only, and leave them out of what Mermaid draws', () => {
    const text = [
      'flowchart TD',
      '  A[Read the brief] --> B(Ask Ada)',
      '  B --> C{{Ship?}}',
      '  click A href "https://example.com/brief" "The brief" _blank',
      '  click B "mailto:ada@example.com"',
      '  click C href "https://example.com/ship";',
    ].join('\n');
    expect(diagramProblem(text)).toBeNull();
    expect(diagramLinks(text)).toEqual([
      { node: 'A', url: 'https://example.com/brief', label: 'The brief' },
      { node: 'B', url: 'mailto:ada@example.com', label: 'Ask Ada' },
      { node: 'C', url: 'https://example.com/ship', label: 'Ship?' },
    ]);
    expect(withoutLinks(text)).toBe('flowchart TD\n  A[Read the brief] --> B(Ask Ada)\n  B --> C{{Ship?}}');
    expect(diagramProblem('flowchart TD\n A --> B\n click A href "javascript:alert(1)"')).toMatch(/must start with https/);
    expect(diagramProblem('flowchart TD\n A --> B\n click A call alert(1)')).toMatch(/goes to a web address/);
    expect(diagramLinks('flowchart TD\n A --> B\n click A href "javascript:alert(1)"')).toEqual([]);
  });

  it('name a linked node by its label, however it is shaped', () => {
    const text = 'flowchart LR\n  a(["Start here"]) --> b[[Sub]]\n  b --> c>Flag]\n  c --> d((Round))\n  e@{ img: "https://x.example/e.png", label: "Logo" }\n  f --> g';
    expect(nodeLabel(text, 'a')).toBe('Start here');
    expect(nodeLabel(text, 'b')).toBe('Sub');
    expect(nodeLabel(text, 'c')).toBe('Flag');
    expect(nodeLabel(text, 'd')).toBe('Round');
    expect(nodeLabel(text, 'e')).toBe('Logo');
    expect(nodeLabel(text, 'g')).toBe('g');
  });

  it("take pictures from the board's files and https addresses only", () => {
    const text = `flowchart TD\n  A@{ img: "corkboard-file:${FILE}", label: "Logo", pos: "t", w: 60, h: 60 }\n  B@{ img: 'https://example.com/b.png' }\n  C@{ shape: rect, img: https://example.com/c.png }\n  D["img: just words"]`;
    expect(diagramImages(text)).toEqual([`corkboard-file:${FILE}`, 'https://example.com/b.png', 'https://example.com/c.png']);
    expect(diagramProblem(text)).toBeNull();
    expect(diagramProblem('flowchart TD\n A@{ img: "http://example.com/a.png" }')).toMatch(/Pictures in a diagram/);
    expect(diagramProblem('flowchart TD\n A@{ img: "data:image/png;base64,AAAA" }')).toMatch(/Pictures in a diagram/);
  });

  it('put each picture inside the text as a data URL, and a placeholder for any it can’t have', async () => {
    const asked: string[] = [];
    const images: DiagramImages = {
      boardFile: (id) => (asked.push(id), Promise.resolve(new Blob([PNG], { type: 'image/png' }))),
      webImage: (url) => (
        asked.push(url),
        Promise.resolve(url.endsWith('ok.png') ? new Blob([PNG], { type: 'image/png' }) : url.endsWith('page.png') ? new Blob(['<html>'], { type: 'text/html' }) : undefined)
      ),
    };
    const text = `flowchart TD\n  A@{ img: "corkboard-file:${FILE}", label: "A" }\n  B@{ img: "https://example.com/ok.png", w: 60 }\n  C@{ label: "C", img: https://example.com/gone.png }\n  D@{ img: "https://example.com/page.png" }\n  E@{ img: "https://example.com/ok.png" }`;
    const { text: inlined, complete } = await inlineImages(text, images);
    expect(complete).toBe(false);
    // Each picture is fetched once, however often it's shown.
    expect(asked.sort()).toEqual([FILE, 'https://example.com/gone.png', 'https://example.com/ok.png', 'https://example.com/page.png'].sort());
    const sources = diagramImages(inlined);
    expect(sources[0]).toMatch(/^data:image\/png;base64,iVBOR/);
    expect(sources[1]).toBe(sources[0]);
    expect(sources[2]).toBe(IMAGE_PLACEHOLDER);
    expect(sources[3]).toBe(IMAGE_PLACEHOLDER);
    expect(sources[4]).toBe(sources[0]);
    expect(inlined).toContain('label: "A"');
    expect(inlined).not.toContain('example.com');

    expect(await inlineImages('flowchart TD\n  a --> b', images)).toEqual({
      text: 'flowchart TD\n  a --> b',
      complete: true,
    });
    // With nowhere to get pictures from (no files), they're placeholders.
    expect(diagramImages((await inlineImages(text)).text).every((s) => s === IMAGE_PLACEHOLDER)).toBe(true);
  });

  it('keep only pictures already inside the SVG', () => {
    const svg = '<svg><image href="https://evil.example/x.png" width="1"/><image href="data:image/png;base64,AAAA"/><image xlink:href="blob:x"/></svg>';
    expect(onlyInlinePictures(svg)).toBe('<svg><image width="1"/><image href="data:image/png;base64,AAAA"/><image/></svg>');
  });

  it("find a node's group by the ids Mermaid gives it", () => {
    for (const id of ['d1-flowchart-A-0', 'd1-state-A-2', 'd1-classId-A-8', 'd1-entity-A-0', 'd1-A']) expect(nodeElementPattern('d1', 'A').test(id)).toBe(true);
    for (const id of ['d1-flowchart-AB-0', 'd10-flowchart-A-0', 'd1-flowchart-A-x', 'flowchart-A-0']) expect(nodeElementPattern('d1', 'A').test(id)).toBe(false);
    expect(nodeElementPattern('d1', 'a.b').test('d1-flowchart-a.b-3')).toBe(true);
    expect(nodeElementPattern('d1', 'a.b').test('d1-flowchart-axb-3')).toBe(false);
  });

  it('place links over their nodes, through the viewBox, in the box the image is fitted to', () => {
    const view = { x: 4, y: 4, w: 200, h: 100 };
    const image = { width: 200, height: 100 };
    // Shown at its own size: a node at (54, 24) is 50 in and 20 down.
    expect(placeHotspot({ x: 54, y: 24, w: 40, h: 20 }, view, image, { w: 200, h: 100 })).toEqual({
      left: 50,
      top: 20,
      width: 40,
      height: 20,
    });
    // Twice as wide and tall: everything doubles.
    expect(placeHotspot({ x: 54, y: 24, w: 40, h: 20 }, view, image, { w: 400, h: 200 })).toEqual({
      left: 100,
      top: 40,
      width: 80,
      height: 40,
    });
    // A tall box: the image is fitted to its width and centred down it, leaving 100 above and below.
    expect(placeHotspot({ x: 4, y: 4, w: 200, h: 100 }, view, image, { w: 200, h: 300 })).toEqual({
      left: 0,
      top: 100,
      width: 200,
      height: 100,
    });
    // A wide box: fitted to its height and centred across, 50 either side.
    expect(placeHotspot({ x: 104, y: 54, w: 10, h: 10 }, view, image, { w: 300, h: 100 })).toEqual({
      left: 150,
      top: 50,
      width: 10,
      height: 10,
    });
    // An image a little bigger than its viewBox (sizes are rounded up): the drawing sits in the middle of it.
    const odd = placeHotspot({ x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 0, w: 99, h: 100 }, { width: 100, height: 100 }, { w: 100, h: 100 });
    expect(odd.left).toBeCloseTo(0.5);
    expect(odd.top).toBe(0);
  });

  it('go into the Markdown export as mermaid blocks, with their links listed under them', () => {
    const board = new BoardDoc();
    board.addDiagram(0, 0, 'flowchart TD\n  a --> b');
    board.addDiagram(0, 0, 'flowchart TD\n  a[Docs] --> b\n  click a href "https://example.com/docs_(v2)"');
    const md = boardMarkdown(board, 'Plan');
    expect(md).toContain('## Diagrams\n\n```mermaid\nflowchart TD\n  a --> b\n```\n');
    expect(md).toContain('```mermaid\nflowchart TD\n  a[Docs] --> b\n  click a href "https://example.com/docs_(v2)"\n```\n\n- [Docs](https://example.com/docs_%28v2%29)\n');
  });
});
