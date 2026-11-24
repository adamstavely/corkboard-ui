import { BoardDoc } from '../board-doc';
import { bpmnText, BPMN_STARTER, isBpmnText, parseBpmn, parseXml } from './bpmn';
import { diagramFrame, tidyFlowchart } from './flow-board';
import { diagramLayout, diagramText, diagramType } from './kinds';
import type { ChildData } from './flowchart';

const TWO_POOLS = `<?xml version="1.0"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <collaboration id="c">
    <participant id="p_shop" name="Shop" processRef="shop" />
    <participant id="p_bank" name="Bank" processRef="bank" />
    <messageFlow id="m1" name="Charge" sourceRef="charge" targetRef="authorise" />
  </collaboration>
  <process id="shop">
    <startEvent id="s1" />
    <sendTask id="charge" name="Charge card" />
    <subProcess id="ship" name="Ship it">
      <startEvent id="s2" />
      <task id="pack" name="Pack" />
      <endEvent id="e2" />
      <sequenceFlow id="g1" sourceRef="s2" targetRef="pack" />
      <sequenceFlow id="g2" sourceRef="pack" targetRef="e2" />
    </subProcess>
    <dataStoreReference id="orders" name="Orders" />
    <endEvent id="e1"><terminateEventDefinition /></endEvent>
    <sequenceFlow id="f1" sourceRef="s1" targetRef="charge" />
    <sequenceFlow id="f2" sourceRef="charge" targetRef="ship" />
    <sequenceFlow id="f3" sourceRef="ship" targetRef="e1" />
    <task id="log" name="Log it"><dataOutputAssociation id="d1"><targetRef>orders</targetRef></dataOutputAssociation></task>
    <textAnnotation id="a1"><text>Cards only &amp; no cash</text></textAnnotation>
    <association id="as1" sourceRef="charge" targetRef="a1" />
  </process>
  <process id="bank">
    <receiveTask id="authorise" name="Authorise" />
  </process>
</definitions>`;

describe('BPMN processes', () => {
  it('reads XML safely: entities decoded, no DOCTYPE, badly formed refused', () => {
    expect(parseXml('<a x="1 &lt; 2"><b>&#65;&amp;</b></a>')).toEqual({
      name: 'a',
      attrs: { x: '1 < 2' },
      children: [{ name: 'b', attrs: {}, children: [], text: 'A&' }],
      text: '',
    });
    expect(parseXml('<!DOCTYPE x [<!ENTITY e "boom">]><a>&e;</a>')).toEqual({
      error: expect.stringContaining('DOCTYPE'),
    });
    expect(parseXml('<a><b></a>')).toEqual({ error: expect.any(String) });
  });

  it('reads events, tasks, gateways and lanes with their markers', () => {
    expect(isBpmnText(BPMN_STARTER)).toBe(true);
    const parsed = parseBpmn(BPMN_STARTER);
    if ('error' in parsed) throw new Error(parsed.error);
    const { data, warnings } = parsed;
    expect(warnings).toEqual([]);
    expect(data.title).toBe('Order handling');
    expect(data.lanes.map((l) => l.name)).toEqual(['Sales', 'Warehouse']);
    const byId = new Map(data.nodes.map((n) => [n.id, n]));
    expect(byId.get('received')).toMatchObject({
      type: 'start',
      laneId: 'sales',
      extra: { bpmn: 'startEvent', marker: 'message' },
    });
    expect(byId.get('paid')).toMatchObject({ type: 'decision', extra: { marker: 'exclusive' } });
    expect(byId.get('remind')).toMatchObject({ type: 'event', extra: { marker: 'timer' } });
    expect(byId.get('ship')).toMatchObject({
      type: 'task',
      laneId: 'warehouse',
      extra: { bpmn: 'serviceTask', marker: 'service' },
    });
    expect(data.edges.find((e) => e.id === 'f3')).toMatchObject({
      from: 'paid',
      to: 'pack',
      label: 'Yes',
    });
  });

  it('reads pools as named lanes, message flows, sub-processes, data and annotations, and writes them back', () => {
    const parsed = parseBpmn(TWO_POOLS);
    if ('error' in parsed) throw new Error(parsed.error);
    const { data } = parsed;
    expect(data.lanes.map((l) => [l.id, l.name])).toEqual([
      ['shop__pool', 'Shop'],
      ['bank__pool', 'Bank'],
    ]);
    expect(data.edges.find((e) => e.id === 'm1')).toMatchObject({
      from: 'charge',
      to: 'authorise',
      message: true,
    });
    expect(data.edges.find((e) => e.id === 'd1')).toMatchObject({ from: 'log', to: 'orders' });
    expect((data.children as Record<string, ChildData>)['ship'].nodes.map((n) => n.id)).toEqual([
      's2',
      'pack',
      'e2',
    ]);
    expect(data.notes).toEqual([{ id: 'a1', text: 'Cards only & no cash', nodes: ['charge'] }]);
    const xml = bpmnText(data);
    expect(xml).toContain(
      '<bpmn:messageFlow id="m1" name="Charge" sourceRef="charge" targetRef="authorise" />',
    );
    expect(xml).toContain('<bpmn:subProcess id="ship" name="Ship it">');
    expect(xml).toContain('<bpmn:terminateEventDefinition />');
    expect(xml).toContain('Cards only &amp; no cash');
    const again = parseBpmn(xml);
    if ('error' in again) throw new Error(again.error);
    const shape = (d: typeof data) =>
      d.nodes.map((n) => `${n.id}:${n.type}:${n.laneId}:${n.extra?.['marker'] ?? ''}`).sort();
    expect(shape(again.data)).toEqual(shape(data));
    expect(again.data.edges.map((e) => `${e.from}>${e.to}:${!!e.message}`).sort()).toEqual(
      data.edges.map((e) => `${e.from}>${e.to}:${!!e.message}`).sort(),
    );
  });

  it('goes on the board as an editable BPMN process that tidies and copies as BPMN with its layout', () => {
    const result = diagramLayout(BPMN_STARTER);
    if ('error' in result) throw new Error(result.error);
    expect(result.type).toBe('bpmn');
    const board = new BoardDoc();
    const id = board.addLayout(result.layout, 0, 0).find((x) => diagramFrame(board, x))!;
    expect(diagramType(board, id)).toBe('bpmn');
    const shapes = new Map(
      board
        .items()
        .flatMap((i) =>
          i.kind === 'shape' && i.part ? [[i.part.key, `${i.shape}:${i.icon ?? ''}`]] : [],
        ),
    );
    expect(shapes.get('received')).toBe('ellipse:bpmn-message');
    expect(shapes.get('check')).toBe('rounded:bpmn-user');
    expect(shapes.get('paid')).toBe('diamond:bpmn-exclusive');
    expect(tidyFlowchart(board, id)).toBe(true);
    const xml = diagramText(board, id)!;
    expect(xml).toContain('<bpmn:userTask id="check" name="Check payment">');
    expect(xml).toContain('<bpmn:lane id="warehouse" name="Warehouse">');
    expect(xml).toMatch(
      /<bpmndi:BPMNShape id="check_di" bpmnElement="check"><dc:Bounds x="\d+" y="\d+" width="\d+" height="\d+" \/>/,
    );
  });
});
