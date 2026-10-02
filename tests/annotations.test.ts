import { describe, expect, it } from 'vitest';
import { annotationBounds, annotationsIn, dragHandle, movedFrom, newArrow, newFrame, newText } from '../src/core/circuit/annotations';
import type { Annotation, CircuitDocument } from '../src/core/model/circuit';
import { newProject, parseProject, serializeProject } from '../src/core/project/schema';
import { getNetlist } from '../src/state/derived';

const text = { ...newText('t1', { x: 10, y: 20 }), text: 'Power\nrail' };
const arrow = newArrow('a1', { x: 0, y: 0 }, { x: 100, y: 50 });
const frame = newFrame('f1', { x: 200, y: 100 }, { x: 50, y: 20 });

describe('canvas notes', () => {
  it('creates sensible defaults', () => {
    expect(newArrow('x', { x: 5, y: 5 }, { x: 6, y: 6 })).toMatchObject({ x1: 5, y1: 5, x2: 101, y2: 5 });
    expect(frame).toMatchObject({ x: 50, y: 20, w: 150, h: 80 });
    expect(newFrame('x', { x: 0, y: 0 }, { x: 2, y: 3 })).toMatchObject({ w: 192, h: 128 });
  });

  it('measures and moves notes', () => {
    expect(annotationBounds(arrow)).toEqual({ x: 0, y: 0, width: 100, height: 50 });
    expect(annotationBounds(text).height).toBeCloseTo(2 * 16 * 1.3);
    const moved = movedFrom(arrow, 10, -5);
    expect(moved).toMatchObject({ x1: 10, y1: -5, x2: 110, y2: 45 });
    expect(arrow.x1).toBe(0);
  });

  it('selects notes inside or touching a box', () => {
    const list: Annotation[] = [text, arrow, frame];
    expect(annotationsIn(list, { x: -5, y: -5, width: 110, height: 60 }, false)).toEqual(['a1']);
    expect(annotationsIn(list, { x: 40, y: 10, width: 30, height: 30 }, true).sort()).toEqual(['a1', 'f1', 't1']);
  });

  it('resizes frames without turning them inside out', () => {
    const r = dragHandle(frame, 'nw', { x: 500, y: 500 });
    expect(r.kind === 'rect' && r.w >= 24 && r.h >= 24).toBe(true);
    expect(dragHandle(arrow, 'p2', { x: 7, y: 8 })).toMatchObject({ x2: 7, y2: 8 });
  });

  it('saves and opens notes, dropping malformed ones', () => {
    const p = newProject('notes');
    p.circuit.annotations = [text, arrow, frame];
    const back = parseProject(serializeProject(p));
    expect(back.circuit.annotations).toEqual([text, arrow, frame]);

    const raw = JSON.parse(serializeProject(p));
    raw.circuit.annotations.push({ id: 'bad', kind: 'text', x: 'left' }, null, { kind: 'circle' });
    expect(parseProject(JSON.stringify(raw)).circuit.annotations).toHaveLength(3);

    delete raw.circuit.annotations;
    expect(parseProject(JSON.stringify(raw)).circuit.annotations).toBeUndefined();
  });

  it('does not rebuild the netlist when only notes change', () => {
    const circuit: CircuitDocument = { components: [], wires: [], annotations: [] };
    const a = getNetlist(circuit);
    const b = getNetlist({ ...circuit, annotations: [text] });
    expect(b).toBe(a);
  });
});
